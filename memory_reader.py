"""Read-only process memory reader for live offline Elden Ring / ERR tracking."""

import ctypes
import ctypes.wintypes as wt
import math
import os
import re
import struct
import time
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    import tomllib as _tomllib
except ImportError:
    _tomllib = None

import save_reader

_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

_PROCESS_QUERY_INFORMATION = 0x0400
_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
_PROCESS_VM_READ = 0x0010
_TH32CS_SNAPPROCESS = 0x00000002
_TH32CS_SNAPMODULE = 0x00000008
_TH32CS_SNAPMODULE32 = 0x00000010
_STILL_ACTIVE = 259

_AOB_WORLD_CHR_MAN = "48 8B 05 ?? ?? ?? ?? 48 85 C0 74 0F 48 39 88"
_AOB_GAME_DATA_MAN = "48 8B 05 ?? ?? ?? ?? 48 85 C0 74 05 48 8B 40 58 C3 C3"
_AOB_SOLO_PARAM_REPO = "48 8B 0D ?? ?? ?? ?? 48 85 C9 0F 84 ?? ?? ?? ?? 45 33 C0 BA 8E 00 00 00"
_AOB_CS_FE_MAN = (
    "48 8B 0D ?? ?? ?? ?? 8B DA 48 85 C9 75 ?? 48 8D 0D ?? ?? ?? ?? E8 ?? ?? ?? ?? "
    "4C 8B C8 4C 8D 05 ?? ?? ?? ?? BA B4 00 00 00 48 8D 0D ?? ?? ?? ?? E8 ?? ?? ?? ?? "
    "48 8B 0D ?? ?? ?? ?? 8B D3 E8 ?? ?? ?? ?? 48 8B D8"
)
_AOB_EVENT_FLAG_CANDS = (
    "48 8B 1D ?? ?? ?? ?? 48 8D 15 ?? ?? ?? ?? 48 8D 4D F0 E8 ?? ?? ?? ?? 4C 8B C0",
    "48 8B 3D ?? ?? ?? ?? 48 85 FF 74 ?? B8",
    "48 8B 0D ?? ?? ?? ?? 48 85 C9 74 ?? 48 83 79 28 00",
)
_EAC_PROCESS_NAMES = frozenset({
    "start_protected_game.exe",
    "easyanticheat_eos.exe",
    "easyanticheat.exe",
})


class _PROCESSENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("cntUsage", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("th32DefaultHeapID", ctypes.c_void_p),
        ("th32ModuleID", wt.DWORD),
        ("cntThreads", wt.DWORD),
        ("th32ParentProcessID", wt.DWORD),
        ("pcPriClassBase", wt.LONG),
        ("dwFlags", wt.DWORD),
        ("szExeFile", wt.WCHAR * 260),
    ]


class _MODULEENTRY32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", wt.DWORD),
        ("th32ModuleID", wt.DWORD),
        ("th32ProcessID", wt.DWORD),
        ("GlblcntUsage", wt.DWORD),
        ("ProccntUsage", wt.DWORD),
        ("modBaseAddr", ctypes.POINTER(ctypes.c_byte)),
        ("modBaseSize", wt.DWORD),
        ("hModule", wt.HMODULE),
        ("szModule", wt.WCHAR * 256),
        ("szExePath", wt.WCHAR * 260),
    ]


def _compile_aob(pattern: str) -> bytes:
    return b"".join(
        b"." if tok in ("?", "??") else re.escape(bytes([int(tok, 16)]))
        for tok in pattern.split()
    )


_RX_WCM = re.compile(_compile_aob(_AOB_WORLD_CHR_MAN), re.DOTALL)
_RX_GDM = re.compile(_compile_aob(_AOB_GAME_DATA_MAN), re.DOTALL)
_RX_SPR = re.compile(_compile_aob(_AOB_SOLO_PARAM_REPO), re.DOTALL)
_RX_FEM = re.compile(_compile_aob(_AOB_CS_FE_MAN), re.DOTALL)
_RX_EFM = [re.compile(_compile_aob(p), re.DOTALL) for p in _AOB_EVENT_FLAG_CANDS]


def _is_eac_running() -> bool:
    """Return True if Easy Anti-Cheat or its launcher process is active."""
    snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
    if not snap or snap == ctypes.c_void_p(-1).value:
        return False
    try:
        pe = _PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(pe)
        if not _kernel32.Process32FirstW(snap, ctypes.byref(pe)):
            return False
        while True:
            if pe.szExeFile.lower() in _EAC_PROCESS_NAMES:
                return True
            if not _kernel32.Process32NextW(snap, ctypes.byref(pe)):
                break
        return False
    finally:
        _kernel32.CloseHandle(snap)


def _find_process_pid(exe_name: str) -> Optional[int]:
    snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
    if not snap or snap == ctypes.c_void_p(-1).value:
        return None
    try:
        pe = _PROCESSENTRY32W()
        pe.dwSize = ctypes.sizeof(pe)
        if not _kernel32.Process32FirstW(snap, ctypes.byref(pe)):
            return None
        target = exe_name.lower()
        while True:
            if pe.szExeFile.lower() == target:
                return int(pe.th32ProcessID)
            if not _kernel32.Process32NextW(snap, ctypes.byref(pe)):
                break
        return None
    finally:
        _kernel32.CloseHandle(snap)


def _find_module_base(pid: int, mod_name: str) -> Optional[int]:
    snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPMODULE | _TH32CS_SNAPMODULE32, pid)
    if not snap or snap == ctypes.c_void_p(-1).value:
        return None
    try:
        me = _MODULEENTRY32W()
        me.dwSize = ctypes.sizeof(me)
        if not _kernel32.Module32FirstW(snap, ctypes.byref(me)):
            return None
        target = mod_name.lower()
        while True:
            if me.szModule.lower() == target:
                return ctypes.addressof(me.modBaseAddr.contents)
            if not _kernel32.Module32NextW(snap, ctypes.byref(me)):
                break
        return None
    finally:
        _kernel32.CloseHandle(snap)


_RESIST_SPEC = (
    (2, "bleed", "Bleed", 1),
    (4, "frost", "Frost", 2),
    (1, "rot", "Rot", 4),
    (5, "sleep", "Sleep", 8),
    (0, "poison", "Poison", 16),
    (6, "madness", "Madness", 32),
)


def _parse_resist_block(rraw: bytes, immune_mask: int = 0) -> List[Dict[str, Any]]:
    """Parse 0xA8 bytes starting at CSChrResistModule+0x10 (+0x10..+0xB7).

    Layout: cur[7] (+0x10), max[7] (+0x2C), timers/state (+0x48..+0x7F),
    additive mod[7] (+0x80), multiplicative mul[7] (+0x9C).
    Order: poison(0), rot(1), bleed(2), blight(3), frost(4), sleep(5), madness(6).
    """
    if not rraw or len(rraw) < 0xA8:
        return []
    vals = struct.unpack_from("<14i", rraw, 0x00)
    muls_f = struct.unpack_from("<7f", rraw, 0x8C)
    statuses: List[Dict[str, Any]] = []
    for idx, key, label, bit in _RESIST_SPEC:
        cur = vals[idx]
        mx = vals[7 + idx]
        mul_v = muls_f[idx]
        if mx <= 0 or mx >= 9999 or cur < 0:
            continue
        buildup = max(0, min(mx, mx - cur))
        if buildup == 0:
            if immune_mask & bit:
                continue
            if math.isfinite(mul_v) and mul_v <= 0.0:
                continue
        statuses.append({
            "key": key,
            "label": label,
            "cur": buildup,
            "max": mx,
        })
    return statuses


def _parse_player_sp_effects(nodes: List[Tuple[int, int, float, float, int]]) -> List[Dict[str, Any]]:
    """Filter active player SpecialEffect nodes to finite-duration buffs/debuffs only."""
    by_pair: Dict[Tuple[int, int], Tuple[float, float]] = {}
    for param_id, icon_id, rem, dur, flags in nodes:
        if (flags & 0x800C0003) != 0:
            continue
        if param_id <= 0 or icon_id <= 0:
            continue
        if not math.isfinite(dur) or dur <= 0.5 or dur >= 3600.0:
            continue
        if not math.isfinite(rem) or rem <= 0.05 or rem > dur + 1.0:
            continue
        k = (int(icon_id), int(param_id))
        prev = by_pair.get(k)
        if prev is None or rem > prev[0]:
            by_pair[k] = (float(rem), float(dur))

    seen_visual: Set[Tuple[int, int, int]] = set()
    out: List[Dict[str, Any]] = []
    for (icon_id, param_id), (rem, dur) in by_pair.items():
        vis_key = (icon_id, int(round(rem * 10)), int(round(dur * 10)))
        if vis_key in seen_visual:
            continue
        seen_visual.add(vis_key)
        out.append({
            "id": param_id,
            "iconId": icon_id,
            "rem": round(rem, 2),
            "dur": round(dur, 2),
        })
    out.sort(key=lambda item: (item["rem"], item["id"]))
    return out


def _aggregate_live_ar_speffects(
    entries: List[Tuple[int, bytes, float, float, int]],
    hp: Optional[int] = None,
    hp_max: Optional[int] = None,
) -> Dict[str, Any]:
    """Filter active player SpecialEffect nodes to genuine weapon-AR and stat buffs.

    Evaluates duration, HP thresholds, invocation condition state chains, and attack-type
    masks before aggregating global, RH, and LH AR multipliers, flats, and stat bonuses.
    """
    stat_bonus = [0, 0, 0, 0, 0]
    end_bonus = 0
    equip_weight_mult = 1.0
    g_mult = [1.0, 1.0, 1.0, 1.0, 1.0]
    g_flat = [0, 0, 0, 0, 0]
    rh_mult = [1.0, 1.0, 1.0, 1.0, 1.0]
    rh_flat = [0, 0, 0, 0, 0]
    lh_mult = [1.0, 1.0, 1.0, 1.0, 1.0]
    lh_flat = [0, 0, 0, 0, 0]
    active_cnt = 0
    contributors: List[int] = []

    rate_offs = ((72, 672), (76, 676), (80, 680), (84, 684), (480, 688))
    flat_offs = (88, 92, 96, 100, 484)
    stat_offs = (802, 803, 804, 805, 806)

    hp_pct: Optional[float] = None
    if hp_max is not None and hp_max > 0 and hp is not None:
        hp_pct = 100.0 * float(hp) / float(hp_max)

    valid_nodes: List[Tuple[int, bytes, float, float, bool]] = []
    active_state_infos: Set[int] = set()

    for param_id, sp_raw, rem, dur, flags in entries:
        if (flags & 0x800C0003) != 0 or param_id <= 0 or not sp_raw or len(sp_raw) < 816:
            continue
        is_finite = math.isfinite(dur) and dur > 0.0
        if is_finite:
            min_rem = 0.0 if dur <= 0.25 else 0.01
            if not math.isfinite(rem) or rem < min_rem or (min_rem > 0.0 and rem <= min_rem):
                continue

        cond_hp = struct.unpack_from("<f", sp_raw, 4)[0]
        cond_hp_rate = struct.unpack_from("<f", sp_raw, 496)[0]
        hp_ok = True
        need_hp = (math.isfinite(cond_hp) and cond_hp > 0.0) or (
            math.isfinite(cond_hp_rate) and cond_hp_rate > 0.0
        )
        if need_hp:
            if hp_pct is None:
                hp_ok = False
            else:
                if math.isfinite(cond_hp) and cond_hp > 0.0 and hp_pct > cond_hp + 0.5:
                    hp_ok = False
                if math.isfinite(cond_hp_rate) and cond_hp_rate > 0.0 and hp_pct < cond_hp_rate - 0.5:
                    hp_ok = False

        valid_nodes.append((int(param_id), sp_raw, float(rem), float(dur), hp_ok))

    for _ in range(4):
        added = False
        for _pid, sp_raw, _rem, _dur, hp_ok in valid_nodes:
            if not hp_ok or (sp_raw[352] & 0x02) != 0:
                continue
            inv = struct.unpack_from("<3H", sp_raw, 696)
            req_states = [v for v in inv if v > 0]
            if req_states and not any(v in active_state_infos for v in req_states):
                continue
            si = struct.unpack_from("<H", sp_raw, 342)[0]
            if si > 0 and si not in active_state_infos:
                active_state_infos.add(si)
                added = True
        if not added:
            break

    seen_params: Set[Tuple[int, int]] = set()
    for param_id, sp_raw, _rem, dur, hp_ok in valid_nodes:
        wep_change = sp_raw[344]
        sp_cat = struct.unpack_from("<H", sp_raw, 318)[0]
        pk = (param_id, wep_change)
        if sp_cat not in (0, 10):
            if pk in seen_params:
                continue
            seen_params.add(pk)

        if not hp_ok or (sp_raw[352] & 0x02) != 0:
            continue
        inv = struct.unpack_from("<3H", sp_raw, 696)
        req_states = [v for v in inv if v > 0]
        if req_states and not any(v in active_state_infos for v in req_states):
            continue

        contributed = False
        if wep_change in (0, 3):
            for i, soff in enumerate(stat_offs):
                sb = struct.unpack_from("<b", sp_raw, soff)[0]
                if -50 <= sb <= 99 and sb != 0:
                    stat_bonus[i] += sb
                    contributed = True
            eb = struct.unpack_from("<b", sp_raw, 800)[0]
            if -50 <= eb <= 99 and eb != 0:
                end_bonus += eb
                contributed = True
            ew = struct.unpack_from("<f", sp_raw, 228)[0]
            if math.isfinite(ew) and 0.05 < ew < 20.0 and abs(ew - 1.0) > 1e-4:
                equip_weight_mult *= ew
                contributed = True

        ar_eligible = wep_change in (0, 1, 2)
        if ar_eligible:
            throw_chg = (sp_raw[356] & 0x08) != 0
            msc_chg = sp_raw[314] != 0 or sp_raw[315] != 0 or sp_raw[808] != 0
            atk_attr = sp_raw[340]
            if throw_chg or msc_chg or atk_attr != 254:
                ar_eligible = False
            elif wep_change == 0:
                sp_attr = sp_raw[341]
                state_info = struct.unpack_from("<H", sp_raw, 342)[0]
                icon_id = struct.unpack_from("<i", sp_raw, 0)[0]
                is_finite = math.isfinite(dur) and dur > 0.0
                tgt_bits = sp_raw[351]
                is_player_only_passive = ((tgt_bits & 0x01) != 0) and ((tgt_bits & 0x04) == 0)
                is_scadutree = (sp_cat == 132)
                iconless_world_scaling = (
                    icon_id <= 0
                    and not is_finite
                    and not is_player_only_passive
                    and not is_scadutree
                )
                if (
                    sp_attr != 254
                    or (700 <= state_info <= 725)
                    or iconless_world_scaling
                ):
                    ar_eligible = False

        if ar_eligible:
            if wep_change == 1:
                t_mult, t_flat = rh_mult, rh_flat
            elif wep_change == 2:
                t_mult, t_flat = lh_mult, lh_flat
            else:
                t_mult, t_flat = g_mult, g_flat

            for i, (o1, o2) in enumerate(rate_offs):
                r1 = struct.unpack_from("<f", sp_raw, o1)[0]
                r2 = struct.unpack_from("<f", sp_raw, o2)[0]
                if math.isfinite(r1) and 0.05 <= r1 <= 10.0 and abs(r1 - 1.0) > 1e-6:
                    t_mult[i] *= r1
                    contributed = True
                if math.isfinite(r2) and 0.05 <= r2 <= 10.0 and abs(r2 - 1.0) > 1e-6:
                    t_mult[i] *= r2
                    contributed = True
            for i, foff in enumerate(flat_offs):
                fv = struct.unpack_from("<i", sp_raw, foff)[0]
                if fv != 0 and -2000 <= fv <= 2000:
                    t_flat[i] += fv
                    contributed = True

        if contributed:
            active_cnt += 1
            if param_id not in contributors and len(contributors) < 24:
                contributors.append(param_id)

    return {
        "statBonus": stat_bonus,
        "endBonus": int(end_bonus),
        "equipWeightMult": round(equip_weight_mult, 6),
        "globalMult": [round(x, 6) for x in g_mult],
        "globalFlat": g_flat,
        "rhMult": [round(x, 6) for x in rh_mult],
        "rhFlat": rh_flat,
        "lhMult": [round(x, 6) for x in lh_mult],
        "lhFlat": lh_flat,
        "activeCount": active_cnt,
        "contributors": contributors,
    }


class EldenRingMemoryReader:
    """Strictly read-only Win32 RPM reader for live offline eldenring.exe state."""

    def __init__(self):
        self._handle: Optional[int] = None
        self._pid: Optional[int] = None
        self._base: int = 0
        self._wcm_addr: int = 0
        self._gdm_addr: int = 0
        self._efm_addr: int = 0
        self._fem_addr: int = 0
        self._spr_addr: int = 0
        self._inv_off: Optional[int] = None
        self._storage_ptr_off: Optional[int] = None
        self._mp_cache: Optional[Tuple[int, int, int]] = None
        self._last_try: float = 0.0
        self._last_eac_check: float = 0.0

    def close(self):
        if self._handle:
            try:
                _kernel32.CloseHandle(self._handle)
            except Exception:
                pass
        self._handle = None
        self._pid = None
        self._base = 0
        self._wcm_addr = 0
        self._gdm_addr = 0
        self._efm_addr = 0
        self._fem_addr = 0
        self._spr_addr = 0
        self._inv_off = None
        self._storage_ptr_off = None
        self._mp_cache = None

    def _is_alive(self) -> bool:
        if not self._handle:
            return False
        code = wt.DWORD(0)
        if not _kernel32.GetExitCodeProcess(self._handle, ctypes.byref(code)):
            return False
        return code.value == _STILL_ACTIVE

    def _read_bytes(self, addr: int, size: int) -> Optional[bytes]:
        if not self._handle or addr < 0x10000 or size <= 0:
            return None
        buf = ctypes.create_string_buffer(size)
        read_n = ctypes.c_size_t(0)
        ok = _kernel32.ReadProcessMemory(
            self._handle,
            ctypes.c_void_p(addr),
            buf,
            size,
            ctypes.byref(read_n),
        )
        if not ok or read_n.value != size:
            return None
        return buf.raw

    def _ru64(self, addr: int) -> int:
        raw = self._read_bytes(addr, 8)
        return struct.unpack("<Q", raw)[0] if raw else 0

    def _ru32(self, addr: int) -> int:
        raw = self._read_bytes(addr, 4)
        return struct.unpack("<I", raw)[0] if raw else 0

    def _read_menu_string(self, addr: int) -> str:
        raw = self._read_bytes(addr, 0x38)
        if not raw or len(raw) < 0x38:
            return ""
        static_ptr = struct.unpack_from("<Q", raw, 0x00)[0]
        dl_size, dl_cap = struct.unpack_from("<QQ", raw, 0x20)
        if 0 < dl_size <= 128 and dl_size <= dl_cap <= 1024:
            if dl_cap < 8:
                return raw[0x10 : 0x10 + dl_size * 2].decode("utf-16-le", errors="replace").split("\x00")[0].strip()
            heap_ptr = struct.unpack_from("<Q", raw, 0x10)[0]
            if heap_ptr >= 0x10000:
                sbuf = self._read_bytes(heap_ptr, dl_size * 2)
                if sbuf:
                    return sbuf.decode("utf-16-le", errors="replace").split("\x00")[0].strip()
        if static_ptr >= 0x10000:
            sbuf = self._read_bytes(static_ptr, 160)
            if sbuf:
                return sbuf.decode("utf-16-le", errors="replace").split("\x00")[0].strip()
        return ""

    def _scan_singletons(self) -> Tuple[int, int, int, int]:
        dos = self._read_bytes(self._base, 0x1000)
        if not dos or len(dos) < 0x100 or dos[:2] != b"MZ":
            return 0, 0, 0, 0
        pe_off = struct.unpack_from("<I", dos, 0x3C)[0]
        if pe_off + 24 >= len(dos) or dos[pe_off : pe_off + 4] != b"PE\x00\x00":
            return 0, 0, 0, 0
        num_sec = struct.unpack_from("<H", dos, pe_off + 6)[0]
        opt_sz = struct.unpack_from("<H", dos, pe_off + 20)[0]
        sec_off = pe_off + 24 + opt_sz

        text_va = text_sz = 0
        for i in range(num_sec):
            off = sec_off + i * 40
            if off + 40 > len(dos):
                break
            sec = dos[off : off + 40]
            name = sec[:8].rstrip(b"\x00").decode("ascii", errors="ignore")
            vsz, va = struct.unpack_from("<II", sec, 8)
            if name == ".text" and text_va == 0:
                text_va, text_sz = va, vsz
                break
        if not text_va or not text_sz or text_sz > 0x6000000:
            return 0, 0, 0, 0

        buf = bytearray()
        chunk = 1024 * 1024
        for off in range(0, text_sz, chunk):
            n = min(chunk, text_sz - off)
            part = self._read_bytes(self._base + text_va + off, n)
            buf.extend(part if part else b"\x00" * n)
        text = bytes(buf)

        def resolve_rip(rx: re.Pattern) -> int:
            m = rx.search(text)
            if not m:
                return 0
            idx = m.start()
            disp = struct.unpack_from("<i", text, idx + 3)[0]
            return self._base + text_va + idx + 7 + disp

        efm = 0
        for rx in _RX_EFM:
            for m in rx.finditer(text):
                idx = m.start()
                disp = struct.unpack_from("<i", text, idx + 3)[0]
                cand = self._base + text_va + idx + 7 + disp
                ptr = self._ru64(cand)
                if ptr >= 0x10000:
                    hdr = self._read_bytes(ptr + 0x1C, 12)
                    if hdr and len(hdr) == 12:
                        div, hsz, cnt = struct.unpack("<III", hdr)
                        if div == 1000 and hsz == 125 and 500 <= cnt <= 20000:
                            efm = cand
                            break
            if efm:
                break

        return resolve_rip(_RX_WCM), resolve_rip(_RX_GDM), efm, resolve_rip(_RX_FEM)

    def ensure_attached(self, min_retry_secs: float = 2.0) -> bool:
        now = time.monotonic()
        if self._is_alive() and (self._wcm_addr or self._gdm_addr):
            if now - self._last_eac_check >= 2.0:
                self._last_eac_check = now
                if _is_eac_running():
                    self.close()
                    return False
            return True
        if self._handle:
            self.close()
        if now - self._last_try < min_retry_secs:
            return False
        self._last_try = now
        self._last_eac_check = now
        if _is_eac_running():
            return False

        pid = _find_process_pid("eldenring.exe")
        if not pid:
            return False
        base = _find_module_base(pid, "eldenring.exe")
        if not base:
            return False
        handle = _kernel32.OpenProcess(_PROCESS_VM_READ | _PROCESS_QUERY_INFORMATION, False, pid)
        if not handle:
            return False

        self._handle = handle
        self._pid = pid
        self._base = base
        wcm, gdm, efm, fem = self._scan_singletons()
        if not wcm and not gdm:
            self.close()
            return False
        self._wcm_addr = wcm
        self._gdm_addr = gdm
        self._efm_addr = efm
        self._fem_addr = fem
        return True

    def _ensure_spr_addr(self) -> int:
        if self._spr_addr:
            return self._spr_addr
        if not self._handle or not self._base:
            return 0
        dos = self._read_bytes(self._base, 0x1000)
        if not dos or len(dos) < 0x100 or dos[:2] != b"MZ":
            return 0
        pe_off = struct.unpack_from("<I", dos, 0x3C)[0]
        if pe_off + 24 >= len(dos) or dos[pe_off : pe_off + 4] != b"PE\x00\x00":
            return 0
        num_sec = struct.unpack_from("<H", dos, pe_off + 6)[0]
        opt_sz = struct.unpack_from("<H", dos, pe_off + 20)[0]
        sec_off = pe_off + 24 + opt_sz
        text_va = text_sz = 0
        for i in range(num_sec):
            off = sec_off + i * 40
            if off + 40 > len(dos):
                break
            sec = dos[off : off + 40]
            if sec[:8].rstrip(b"\x00").decode("ascii", errors="ignore") == ".text":
                vsz, va = struct.unpack_from("<II", sec, 8)
                text_va, text_sz = va, vsz
                break
        if not text_va or not text_sz or text_sz > 0x6000000:
            return 0
        buf = bytearray()
        chunk = 1024 * 1024
        for off in range(0, text_sz, chunk):
            n = min(chunk, text_sz - off)
            part = self._read_bytes(self._base + text_va + off, n)
            buf.extend(part if part else b"\x00" * n)
        m = _RX_SPR.search(bytes(buf))
        if m:
            idx = m.start()
            disp = struct.unpack_from("<i", buf, idx + 3)[0]
            self._spr_addr = self._base + text_va + idx + 7 + disp
        return self._spr_addr

    def _read_param_res_name(self, addr: int) -> str:
        name = self._read_menu_string(addr)
        if name:
            return name
        raw = self._read_bytes(addr, 0x20)
        if not raw or len(raw) < 0x20:
            return ""
        sz, cap = struct.unpack_from("<QQ", raw, 0x10)
        if 0 < sz <= 128 and sz <= cap <= 1024:
            if cap < 8:
                return raw[: sz * 2].decode("utf-16-le", errors="replace").split("\x00")[0].strip()
            ptr = struct.unpack_from("<Q", raw, 0x00)[0]
            if ptr >= 0x10000:
                sbuf = self._read_bytes(ptr, sz * 2)
                if sbuf:
                    return sbuf.decode("utf-16-le", errors="replace").split("\x00")[0].strip()
        return ""

    def read_live_params(
        self,
        wanted_names: Set[str],
        optional_names: Optional[Set[str]] = None,
    ) -> Optional[Dict[str, bytes]]:
        """Read raw binary PARAM buffers directly from SoloParamRepositoryImp in offline RAM."""
        if _is_eac_running() or not self.ensure_attached(min_retry_secs=0.2):
            return None
        spr_addr = self._ensure_spr_addr()
        if not spr_addr:
            return None
        repo = self._ru64(spr_addr)
        if repo < 0x10000:
            return None

        wanted = {w.lower() for w in wanted_names}
        opt = {w.lower() for w in (optional_names or ())}
        all_wanted = wanted | opt
        out: Dict[str, bytes] = {}
        for i in range(256):
            cap = self._ru64(repo + 0x88 + i * 0x48)
            if cap < 0x10000:
                continue
            pname = self._read_param_res_name(cap + 0x18)
            if not pname:
                continue
            key = pname.lower() + ".param"
            if key not in all_wanted or key in out:
                continue
            p_hdr = self._ru64(cap + 0x80)
            if p_hdr < 0x10000:
                continue
            p_data = self._ru64(p_hdr + 0x80)
            if p_data < 0x10000:
                p_data = p_hdr
            hdr_bytes = self._read_bytes(p_data, 0x48)
            if not hdr_bytes or len(hdr_bytes) < 0x48:
                continue
            row_cnt = struct.unpack_from("<H", hdr_bytes, 0x0A)[0]
            fmt2d = hdr_bytes[0x2D]
            if not (1 <= row_cnt <= 200000) or not (fmt2d & 0x04):
                continue
            tbl_hdr = self._read_bytes(p_data + 0x40, min(row_cnt, 4) * 24)
            if not tbl_hdr or len(tbl_hdr) < 24:
                continue
            last_entry = self._read_bytes(p_data + 0x40 + (row_cnt - 1) * 24, 24)
            if not last_entry:
                continue
            first_off = struct.unpack_from("<q", tbl_hdr, 8)[0]
            last_off = struct.unpack_from("<q", last_entry, 8)[0]
            if first_off < 0x40 or last_off < first_off:
                continue
            stride = 1024
            if row_cnt >= 2:
                second_off = struct.unpack_from("<q", tbl_hdr, 32)[0]
                if second_off > first_off:
                    stride = second_off - first_off
            total_sz = last_off + max(stride, 1024)
            if total_sz > 32 * 1024 * 1024:
                continue
            raw_param = self._read_bytes(p_data, total_sz)
            if raw_param:
                out[key] = raw_param
                if len(out) == len(all_wanted):
                    return out
        return out if all(w in out for w in wanted) else None

    def _get_player_ins(self) -> int:
        if not self._wcm_addr:
            return 0
        wcm = self._ru64(self._wcm_addr)
        if wcm < 0x10000:
            return 0
        pin = self._ru64(wcm + 0x1E508)
        if pin >= 0x10000:
            return pin
        ptr = self._ru64(wcm + 0x10EF8)
        return self._ru64(ptr) if ptr >= 0x10000 else 0

    def read_player_pos(self) -> Optional[Dict[str, Any]]:
        pin = self._get_player_ins()
        if pin < 0x10000:
            return None
        raw = self._read_bytes(pin + 0x6C0, 20)
        if not raw:
            return None
        x, y, z, yaw = struct.unpack_from("<4f", raw, 0)
        sub, gz, gx, area = struct.unpack_from("<4B", raw, 16)
        if not (
            all(math.isfinite(v) for v in (x, y, z, yaw))
            and abs(x) < 20000.0
            and abs(z) < 20000.0
            and abs(yaw) <= 7.0
            and 10 <= area <= 65
        ):
            return None
        return {
            "area": area,
            "gridX": gx,
            "gridZ": gz,
            "sub": sub,
            "x": round(x, 2),
            "y": round(y, 2),
            "z": round(z, 2),
            "yaw": round(yaw, 4),
            "source": "ram",
        }

    def read_live_slot_ar(self) -> Optional[Dict[str, List[int]]]:
        """Read Elden Ring's exact in-game per-slot Attack Power (L1..L3, R1..R3)."""
        if not self._gdm_addr or _is_eac_running():
            return None
        gdm = self._ru64(self._gdm_addr)
        if gdm < 0x10000:
            return None
        pgd = self._ru64(gdm + 0x8)
        if pgd < 0x10000:
            return None
        raw = self._read_bytes(pgd + 0x968, 24)
        if not raw or len(raw) < 24:
            return None
        l1, r1, l2, r2, l3, r3 = struct.unpack_from("<6i", raw, 0)
        vals = (l1, r1, l2, r2, l3, r3)
        if not all(0 <= v <= 99999 for v in vals) or not any(v > 0 for v in vals):
            return None
        return {"lh": [int(l1), int(l2), int(l3)], "rh": [int(r1), int(r2), int(r3)]}

    def read_character_state(
        self,
        known_weapon_ids: Optional[Set[int]] = None,
        known_armor_ids: Optional[Set[int]] = None,
        known_talisman_ids: Optional[Set[int]] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self._gdm_addr:
            return None
        gdm = self._ru64(self._gdm_addr)
        if gdm < 0x10000:
            return None
        pgd = self._ru64(gdm + 0x8)
        if pgd < 0x10000:
            return None
        buf = self._read_bytes(pgd, 0x400)
        if not buf:
            return None

        vig, mnd, end, strength, dex, intel, fai, arc = struct.unpack_from("<8I", buf, 0x3C)
        level = struct.unpack_from("<I", buf, 0x68)[0]
        if not (1 <= level <= 713 and all(1 <= s <= 199 for s in (vig, mnd, end, strength, dex, intel, fai, arc))):
            return None

        name = buf[0x9C : 0x9C + 34].decode("utf-16-le", errors="replace").split("\x00")[0].strip()
        if not name:
            return None

        def _decode_hand_slot(raw_id: int) -> Optional[Dict[str, int]]:
            if raw_id in (0, 0xFFFFFFFF, 110000):
                return None
            lv = raw_id % 100
            base_w = (raw_id // 100) * 100
            if lv <= 25 and (not known_weapon_ids or base_w in known_weapon_ids):
                return {"rawId": raw_id, "weaponId": base_w, "level": lv}
            return None

        # ChrAsm inside PlayerGameData stores armStyle, lhSlot, rhSlot at +0x324..+0x32C
        arm_style_raw, lh_slot_raw, rh_slot_raw = struct.unpack_from("<3I", buf, 0x324)
        arm_style = arm_style_raw if arm_style_raw in (0, 1, 2, 3) else 1
        lh_slot = lh_slot_raw if lh_slot_raw in (0, 1, 2) else 0
        rh_slot = rh_slot_raw if rh_slot_raw in (0, 1, 2) else 0
        # Prefer live CSChrAsm (PlayerIns + 0x638 -> +0x08) for frame-accurate 1H/2H grip detection
        pin = self._get_player_ins()
        if pin >= 0x10000:
            chr_asm = self._ru64(pin + 0x638)
            if chr_asm >= 0x10000:
                asm_hdr = self._read_bytes(chr_asm + 0x08, 12)
                if asm_hdr and len(asm_hdr) == 12:
                    la, ll, lr = struct.unpack_from("<3I", asm_hdr, 0)
                    if la in (0, 1, 2, 3) and ll in (0, 1, 2) and lr in (0, 1, 2):
                        arm_style, lh_slot, rh_slot = la, ll, lr

        # ChrAsm stores the 6 hand-weapon slots interleaved (L1,R1,L2,R2,L3,R3) at +0x398..+0x3AC
        left_hand = [
            _decode_hand_slot(struct.unpack_from("<I", buf, off)[0])
            for off in (0x398, 0x3A0, 0x3A8)
        ]
        right_hand = [
            _decode_hand_slot(struct.unpack_from("<I", buf, off)[0])
            for off in (0x39C, 0x3A4, 0x3AC)
        ]
        equipped = []
        seen_raw = set()
        for ent in right_hand + left_hand:
            if ent and ent["rawId"] not in seen_raw:
                seen_raw.add(ent["rawId"])
                equipped.append(ent)

        armor = []
        for off in range(0x3C8, 0x3D8, 4):
            aid = struct.unpack_from("<I", buf, off)[0]
            if aid in (0, 0xFFFFFFFF) or aid <= 10300 or (known_armor_ids and aid not in known_armor_ids):
                armor.append(None)
            else:
                armor.append(aid)

        talismans = []
        for off in range(0x3DC, 0x3EC, 4):
            tid = struct.unpack_from("<I", buf, off)[0]
            if tid in (0, 0xFFFFFFFF) or (known_talisman_ids and tid not in known_talisman_ids):
                talismans.append(None)
            else:
                talismans.append(tid)

        arrows = []
        for off in (0x3B0, 0x3B8):
            aid = struct.unpack_from("<I", buf, off)[0]
            arrows.append(aid if aid not in (0, 0xFFFFFFFF) else None)

        bolts = []
        for off in (0x3B4, 0x3BC):
            bid = struct.unpack_from("<I", buf, off)[0]
            bolts.append(bid if bid not in (0, 0xFFFFFFFF) else None)

        return {
            "name": name,
            "level": level,
            "stats": {
                "vig": vig,
                "mnd": mnd,
                "end": end,
                "str": strength,
                "dex": dex,
                "int": intel,
                "fai": fai,
                "arc": arc,
            },
            "equipped": equipped,
            "rightHand": right_hand,
            "leftHand": left_hand,
            "armStyle": arm_style,
            "activeRhSlot": rh_slot,
            "activeLhSlot": lh_slot,
            "arrows": arrows,
            "bolts": bolts,
            "armor": armor,
            "talismans": talismans,
            "slotAr": self.read_live_slot_ar(),
            "source": "ram",
        }

    def read_event_flags(self, flag_bst: Optional[Dict[int, int]], wanted_flags: Optional[Set[int]]) -> Optional[List[int]]:
        if not self._efm_addr or not flag_bst or not wanted_flags:
            return None
        efm = self._ru64(self._efm_addr)
        if efm < 0x10000:
            return None
        hdr = self._read_bytes(efm + 0x1C, 20)
        if not hdr or len(hdr) < 20:
            return None
        div, hsz, cnt = struct.unpack_from("<III", hdr, 0)
        blocks_ptr = struct.unpack_from("<Q", hdr, 12)[0]
        if div != 1000 or hsz != 125 or cnt < 500 or blocks_ptr < 0x10000:
            return None
        buf = self._read_bytes(blocks_ptr, min(cnt * 125, 0x200000))
        if not buf:
            return None
        return save_reader.decode_event_flags(buf, flag_bst, wanted_flags)

    def _collect_live_inv_table(
        self,
        inv_ptr: int,
        ncap: int,
        kcap: int,
        weapons: Set[int],
        armor: Set[int],
        talismans: Set[int],
        goods: Set[int],
        weapon_levels: Optional[Dict[int, int]] = None,
    ) -> bool:
        hdr = self._read_bytes(inv_ptr + 0x0C, 36)
        if not hdr or len(hdr) < 36:
            return False
        cap_n, head_n, len_n, cap_k, head_k, len_k = struct.unpack_from("<IQIIQI", hdr, 0)
        if cap_n != ncap or cap_k != kcap or len_n > cap_n or len_k > cap_k:
            return False
        for head_ptr, count in ((head_n, len_n), (head_k, len_k)):
            if head_ptr < 0x10000 or count == 0:
                continue
            blob = self._read_bytes(head_ptr, count * 0x18)
            if not blob:
                continue
            for i in range(count):
                gh, item_id, qty = struct.unpack_from("<III", blob, i * 0x18)
                if gh == 0 or qty == 0 or item_id in (0, 0xFFFFFFFF):
                    continue
                top = item_id & 0xF0000000
                raw = item_id & 0x0FFFFFFF
                if top == 0x00000000:
                    base_w = (raw // 100) * 100
                    weapons.add(base_w)
                    if weapon_levels is not None:
                        lv = raw % 100
                        if 0 <= lv <= 25:
                            if lv > weapon_levels.get(base_w, -1):
                                weapon_levels[base_w] = lv
                            base_root = (raw // 10000) * 10000
                            if base_root > 0 and lv > weapon_levels.get(base_root, -1):
                                weapon_levels[base_root] = lv
                elif top == 0x10000000:
                    armor.add(raw)
                elif top == 0x20000000:
                    talismans.add(raw)
                elif top == 0x40000000:
                    goods.add(raw)
        return True

    def read_inventory(self) -> Optional[Dict[str, Any]]:
        if not self._gdm_addr:
            return None
        gdm = self._ru64(self._gdm_addr)
        if gdm < 0x10000:
            return None
        pgd = self._ru64(gdm + 0x8)
        if pgd < 0x10000:
            return None

        weapons: Set[int] = set()
        armor: Set[int] = set()
        talismans: Set[int] = set()
        goods: Set[int] = set()
        weapon_levels: Dict[int, int] = {}

        if self._inv_off is None:
            for off in range(0x3D0, 0x520, 8):
                hdr = self._read_bytes(pgd + off + 0x0C, 24)
                if hdr and len(hdr) == 24:
                    cn, hn, ln, ck = struct.unpack_from("<IQII", hdr, 0)
                    if cn == 0xA80 and ck == 0x180 and hn >= 0x10000 and ln <= cn:
                        self._inv_off = off
                        break
        if self._inv_off is None or not self._collect_live_inv_table(pgd + self._inv_off, 0xA80, 0x180, weapons, armor, talismans, goods, weapon_levels):
            self._inv_off = None
            return None

        if self._storage_ptr_off is None:
            for off in range(0x820, 0x940, 8):
                ptr = self._ru64(pgd + off)
                if ptr >= 0x10000:
                    hdr = self._read_bytes(ptr + 0x0C, 24)
                    if hdr and len(hdr) == 24:
                        cn, hn, ln, ck = struct.unpack_from("<IQII", hdr, 0)
                        if cn == 0x780 and ck == 0x80 and hn >= 0x10000 and ln <= cn:
                            self._storage_ptr_off = off
                            break
        if self._storage_ptr_off is not None:
            sptr = self._ru64(pgd + self._storage_ptr_off)
            if sptr < 0x10000 or not self._collect_live_inv_table(sptr, 0x780, 0x80, weapons, armor, talismans, goods, weapon_levels):
                self._storage_ptr_off = None

        return {
            "weapons": sorted(weapons),
            "armor": sorted(armor),
            "talismans": sorted(talismans),
            "goods": sorted(goods),
            "weaponLevels": {str(k): v for k, v in weapon_levels.items()},
        }

    def read_world_map_pins(self) -> Optional[List[Dict[str, Any]]]:
        if not self._gdm_addr:
            return None
        gdm = self._ru64(self._gdm_addr)
        if gdm < 0x10000:
            return None
        sig = b"\x01\x00\x02\x00\xdc\x0f\x00\x00"
        if self._mp_cache is not None:
            off, deref, inner = self._mp_cache
            base = self._ru64(gdm + off)
            if base >= 0x10000:
                if deref:
                    base = self._ru64(base + inner)
                    blob = self._read_bytes(base, 0x1008) if base >= 0x10000 else None
                else:
                    blob = self._read_bytes(base + inner, 0x1008)
                if blob and blob[:8] == sig:
                    return save_reader.parse_world_map_pins(blob[8:])
            self._mp_cache = None

        for off in range(0x40, 0xB8, 8):
            ptr = self._ru64(gdm + off)
            if ptr < 0x10000:
                continue
            blk = self._read_bytes(ptr, 0x60)
            if not blk:
                continue
            idx = blk.find(sig)
            if idx >= 0:
                blob = self._read_bytes(ptr + idx, 0x1008)
                if blob and blob[:8] == sig:
                    self._mp_cache = (off, 0, idx)
                    return save_reader.parse_world_map_pins(blob[8:])
            for inner in (0x08, 0x10, 0x18, 0x20):
                p2 = struct.unpack_from("<Q", blk, inner)[0]
                if p2 >= 0x10000:
                    head = self._read_bytes(p2, 8)
                    if head == sig:
                        blob = self._read_bytes(p2, 0x1008)
                        if blob:
                            self._mp_cache = (off, 1, inner)
                            return save_reader.parse_world_map_pins(blob[8:])
        return None

    def _resolve_chr_ins(self, wcm: int, handle: int) -> int:
        if handle in (0, 0xFFFFFFFFFFFFFFFF):
            return 0
        selector = handle & 0xFFFFFFFF
        if selector == 0xFFFFFFFF or ((selector >> 28) & 0xF) != 1:
            return 0
        container = (selector >> 20) & 0xFF
        index = selector & 0xFFFFF
        if container < 196:
            chr_set = self._ru64(wcm + 0x1DED8 + container * 8)
            if chr_set >= 0x10000:
                cap = self._ru32(chr_set + 0x10)
                entries = self._ru64(chr_set + 0x18)
                if entries >= 0x10000 and index < cap:
                    cand = self._ru64(entries + index * 0x10)
                    if cand >= 0x10000 and self._ru64(cand + 0x08) == handle:
                        return cand

        vec = self._read_bytes(wcm + 0x1F1E0, 0x20)
        if vec and len(vec) >= 0x18:
            first, last = struct.unpack_from("<QQ", vec, 0x08)
            if first >= 0x10000 and last > first:
                cnt = min((last - first) // 16, 512)
                blob = self._read_bytes(first, cnt * 16)
                if blob:
                    for i in range(cnt):
                        cand = struct.unpack_from("<Q", blob, i * 16)[0]
                        if cand >= 0x10000 and self._ru64(cand + 0x08) == handle:
                            return cand
        return 0

    def _read_chr_telemetry(
        self,
        chr_ins: int,
        slot: int,
        fallback_name: str,
        menu_name: str = "",
        npc_meta: Optional[Dict[int, Tuple[str, int]]] = None,
        npc_def: Optional[Dict[str, List[int]]] = None,
    ) -> Optional[Dict[str, Any]]:
        hdr = self._read_bytes(chr_ins + 0x60, 4)
        npc_param_id = struct.unpack("<i", hdr)[0] if hdr and len(hdr) == 4 else -1
        mod_bag = self._ru64(chr_ins + 0x190)
        if mod_bag < 0x10000:
            return None
        mods = self._read_bytes(mod_bag, 0x50)
        if not mods or len(mods) < 0x50:
            return None
        stat_mod, _, _, _, resist_mod, _, _, _, stagger_mod, toughness_mod = struct.unpack_from("<10Q", mods, 0)
        if stat_mod < 0x10000:
            return None

        stat_raw = self._read_bytes(stat_mod + 0x138, 0x28)
        if not stat_raw or len(stat_raw) < 0x28:
            return None
        hp, hp_max = struct.unpack_from("<2i", stat_raw, 0x00)
        stam, stam_max = struct.unpack_from("<2i", stat_raw, 0x1C)
        if hp <= 0 or hp_max <= 0 or hp_max > 10_000_000:
            return None

        stance = 0.0
        max_stance = 0.0
        stance_reset = 0.0
        stance_broken = False
        stance_kind = "none"

        if stagger_mod >= 0x10000:
            sraw = self._read_bytes(stagger_mod + 0x10, 16)
            if sraw and len(sraw) == 16:
                stagger, stagger_max, _, reset_timer = struct.unpack("<ffIf", sraw)
                if math.isfinite(stagger) and math.isfinite(stagger_max) and 0.0 < stagger_max < 100000.0:
                    stance = round(max(0.0, min(stagger, stagger_max)), 1)
                    max_stance = round(stagger_max, 1)
                    stance_reset = round(reset_timer, 1) if (math.isfinite(reset_timer) and 0.0 <= reset_timer <= 60.0) else 0.0
                    stance_broken = stagger <= 0.0
                    stance_kind = "stance"

        if stance_kind == "none" and toughness_mod >= 0x10000:
            traw = self._read_bytes(toughness_mod + 0x10, 16)
            if traw and len(traw) == 16:
                tough, _, tough_max, t_rec = struct.unpack("<ffff", traw)
                if math.isfinite(tough) and math.isfinite(tough_max) and 0.0 < tough_max < 100000.0:
                    stance = round(max(0.0, min(tough, tough_max)), 1)
                    max_stance = round(tough_max, 1)
                    stance_reset = round(t_rec, 1) if (math.isfinite(t_rec) and 0.0 <= t_rec <= 60.0) else 0.0
                    stance_broken = tough <= 0.0
                    stance_kind = "poise"

        if stance_kind == "none" and stam_max > 0:
            stance = float(max(0, min(stam, stam_max)))
            max_stance = float(stam_max)
            stance_broken = stam <= 0
            stance_kind = "guard"

        meta_name = ""
        immune_mask = 0
        if npc_meta and npc_param_id in npc_meta:
            meta_name, immune_mask = npc_meta[npc_param_id]

        statuses: List[Dict[str, Any]] = []
        if resist_mod >= 0x10000:
            rraw = self._read_bytes(resist_mod + 0x10, 0xA8)
            if rraw and len(rraw) == 0xA8:
                statuses = _parse_resist_block(rraw, immune_mask)

        name = menu_name or meta_name or fallback_name
        res: Dict[str, Any] = {
            "slot": slot,
            "name": name,
            "npcParamId": int(npc_param_id),
            "hp": hp,
            "maxHp": hp_max,
            "stance": stance,
            "maxStance": max_stance,
            "stanceReset": stance_reset,
            "stanceBroken": stance_broken,
            "stanceKind": stance_kind,
            "statuses": statuses,
        }
        if npc_def and npc_param_id >= 0:
            row = npc_def.get(str(npc_param_id))
            if row and len(row) >= 13:
                res["def"] = row[:5]
                res["neg"] = row[5:13]
        return res

    def read_active_bosses(
        self,
        npc_meta: Optional[Dict[int, Tuple[str, int]]] = None,
        npc_def: Optional[Dict[str, List[int]]] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        """Return live boss HP/stance/status, or locked-on enemy if no boss bar is active."""
        if not self._wcm_addr or not self._fem_addr or _is_eac_running():
            return None
        wcm = self._ru64(self._wcm_addr)
        fem = self._ru64(self._fem_addr)
        if wcm < 0x10000 or fem < 0x10000:
            return None

        boss_bars = self._read_bytes(fem + 0x5BF0, 3 * 0x20)
        if not boss_bars or len(boss_bars) < 3 * 0x20:
            return None

        def _valid_h(h: int) -> bool:
            return h not in (0, 0xFFFFFFFFFFFFFFFF) and (h & 0xFFFFFFFF) != 0xFFFFFFFF

        out: List[Dict[str, Any]] = []
        seen_chr: Set[int] = set()
        for slot in range(3):
            display_id, _, boss_handle = struct.unpack_from("<iIQ", boss_bars, slot * 0x20)
            tag_addr = fem + 0x1B90 + slot * 0x128
            tag_hdr = self._read_bytes(tag_addr, 0x28)
            tag_vis = bool(tag_hdr and tag_hdr[0])
            tag_handle = struct.unpack_from("<Q", tag_hdr, 8)[0] if tag_hdr and len(tag_hdr) >= 16 else 0

            handle = boss_handle if _valid_h(boss_handle) else (tag_handle if tag_vis and _valid_h(tag_handle) else 0)
            if not handle or (display_id <= 0 and not tag_vis):
                continue

            chr_ins = self._resolve_chr_ins(wcm, handle)
            if chr_ins < 0x10000 or chr_ins in seen_chr:
                continue
            seen_chr.add(chr_ins)

            mname = self._read_menu_string(tag_addr + 0x28) if (tag_vis or tag_handle == handle) else ""
            entry = self._read_chr_telemetry(chr_ins, slot, f"Boss {slot + 1}", mname, npc_meta, npc_def)
            if entry:
                out.append(entry)

        if out:
            return out

        # No boss bar active: check player's locked-on enemy only
        pin = self._get_player_ins()
        if pin >= 0x10000:
            locked_b = self._read_bytes(pin + 0xC9, 1)
            if locked_b and locked_b[0] != 0:
                th = self._ru64(pin + 0x6B0)
                if not _valid_h(th):
                    th = self._ru64(pin + 0x6A0)
                if _valid_h(th):
                    chr_ins = self._resolve_chr_ins(wcm, th)
                    if chr_ins >= 0x10000 and chr_ins != pin:
                        mname = ""
                        for ti in range(8):
                            ea = fem + 0x1250 + ti * 0x128
                            ehdr = self._read_bytes(ea, 0x10)
                            if ehdr and len(ehdr) >= 16:
                                th_cand = struct.unpack_from("<Q", ehdr, 8)[0]
                                if th_cand == th:
                                    mname = self._read_menu_string(ea + 0x28)
                                    if mname:
                                        break
                        entry = self._read_chr_telemetry(chr_ins, 0, "Enemy", mname, npc_meta, npc_def)
                        if entry:
                            return [entry]
        return out

    def read_player_buffs(self) -> Optional[List[Dict[str, Any]]]:
        """Return strictly finite active player SpecialEffect timers from offline RAM."""
        if not self._wcm_addr or _is_eac_running():
            return None
        pin = self._get_player_ins()
        if pin < 0x10000:
            return None
        sp_mgr = self._ru64(pin + 0x178)
        if sp_mgr < 0x10000:
            return []
        node = self._ru64(sp_mgr + 0x08)
        if node < 0x10000:
            return []

        nodes: List[Tuple[int, int, float, float, int]] = []
        seen: Set[int] = set()
        for _ in range(160):
            if node < 0x10000 or node in seen:
                break
            seen.add(node)
            raw = self._read_bytes(node, 0x68)
            if not raw or len(raw) < 0x64:
                break
            pdata = struct.unpack_from("<Q", raw, 0x00)[0]
            param_id = struct.unpack_from("<i", raw, 0x08)[0]
            nxt = struct.unpack_from("<Q", raw, 0x30)[0]
            rem = struct.unpack_from("<f", raw, 0x40)[0]
            dur = struct.unpack_from("<f", raw, 0x48)[0]
            flags = struct.unpack_from("<I", raw, 0x60)[0]

            if (
                (flags & 0x800C0003) == 0
                and param_id > 0
                and pdata >= 0x10000
                and math.isfinite(dur)
                and 0.5 < dur < 3600.0
                and math.isfinite(rem)
                and 0.05 < rem <= dur + 1.0
            ):
                raw_ic = self._read_bytes(pdata, 4)
                if raw_ic and len(raw_ic) == 4:
                    icon_id = struct.unpack("<i", raw_ic)[0]
                    if icon_id > 0:
                        nodes.append((param_id, icon_id, rem, dur, flags))
            node = nxt

        return _parse_player_sp_effects(nodes)

    def read_player_live_ar_buffs(self) -> Optional[Dict[str, Any]]:
        """Read all active player SpecialEffects in RAM and aggregate stat/AR modifiers.

        Separates global buffs/talismans (wepParamChange == 0) from Right-Hand weapon
        enchants/greases (1) and Left-Hand buffs (2) using verified SpEffectParam offsets.
        """
        if not self._wcm_addr or _is_eac_running():
            return None
        pin = self._get_player_ins()
        if pin < 0x10000:
            return None
        sp_mgr = self._ru64(pin + 0x178)
        if sp_mgr < 0x10000:
            return None
        node = self._ru64(sp_mgr + 0x08)
        if node < 0x10000:
            res = _aggregate_live_ar_speffects([])
            res["slotAr"] = self.read_live_slot_ar()
            return res

        hp: Optional[int] = None
        hp_max: Optional[int] = None
        mod_bag = self._ru64(pin + 0x190)
        if mod_bag >= 0x10000:
            stat_mod = self._ru64(mod_bag)
            if stat_mod >= 0x10000:
                hp_raw = self._read_bytes(stat_mod + 0x138, 8)
                if hp_raw and len(hp_raw) == 8:
                    hp, hp_max = struct.unpack("<2i", hp_raw)

        entries: List[Tuple[int, bytes, float, float, int]] = []
        seen_nodes: Set[int] = set()
        sp_cache: Dict[int, Optional[bytes]] = {}
        for _ in range(160):
            if node < 0x10000 or node in seen_nodes:
                break
            seen_nodes.add(node)
            raw = self._read_bytes(node, 0x68)
            if not raw or len(raw) < 0x64:
                break
            pdata = struct.unpack_from("<Q", raw, 0x00)[0]
            param_id = struct.unpack_from("<i", raw, 0x08)[0]
            nxt = struct.unpack_from("<Q", raw, 0x30)[0]
            rem = struct.unpack_from("<f", raw, 0x40)[0]
            dur = struct.unpack_from("<f", raw, 0x48)[0]
            flags = struct.unpack_from("<I", raw, 0x60)[0]

            if (flags & 0x800C0003) == 0 and param_id > 0 and pdata >= 0x10000:
                sp_raw = sp_cache.get(pdata)
                if pdata not in sp_cache:
                    sp_raw = self._read_bytes(pdata, 816)
                    sp_cache[pdata] = sp_raw
                if sp_raw and len(sp_raw) >= 816:
                    entries.append((param_id, sp_raw, rem, dur, flags))
            node = nxt

        res = _aggregate_live_ar_speffects(entries, hp=hp, hp_max=hp_max)
        res["slotAr"] = self.read_live_slot_ar()
        return res


def _get_process_image_path(pid: int) -> Optional[str]:
    h = _kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
    if not h:
        return None
    try:
        buf = ctypes.create_unicode_buffer(1024)
        sz = wt.DWORD(1024)
        if _kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(sz)):
            return buf.value
        return None
    finally:
        _kernel32.CloseHandle(h)


def _find_mod_loader_dlls(pid: int, game_dir: Optional[str]) -> List[str]:
    snap = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPMODULE | _TH32CS_SNAPMODULE32, int(pid))
    if not snap or snap == ctypes.c_void_p(-1).value:
        return []
    win_dir = os.path.normcase(os.path.abspath(os.environ.get("SystemRoot") or r"C:\Windows"))
    gdir_norm = os.path.normcase(os.path.abspath(game_dir)) if game_dir else ""
    hits: List[Tuple[int, str]] = []
    try:
        me = _MODULEENTRY32W()
        me.dwSize = ctypes.sizeof(me)
        if not _kernel32.Module32FirstW(snap, ctypes.byref(me)):
            return []
        while True:
            mod_l = me.szModule.lower()
            exe_p = me.szExePath or ""
            exe_norm = os.path.normcase(os.path.abspath(exe_p)) if exe_p else ""
            if exe_p and mod_l.endswith(".dll"):
                if "modengine2" in mod_l:
                    hits.append((0, exe_p))
                elif "me3" in mod_l:
                    hits.append((1, exe_p))
                elif any(k in mod_l for k in ("reforged", "convergence", "ersc", "ertransmogrify")):
                    hits.append((2, exe_p))
                elif not exe_norm.startswith(win_dir + os.sep) and (
                    not gdir_norm or os.path.dirname(exe_norm) != gdir_norm
                ):
                    hits.append((3, exe_p))
            if not _kernel32.Module32NextW(snap, ctypes.byref(me)):
                break
    finally:
        _kernel32.CloseHandle(snap)
    hits.sort(key=lambda x: x[0])
    out: List[str] = []
    seen: Set[str] = set()
    for _, p in hits:
        np = os.path.normcase(os.path.abspath(p))
        if np not in seen:
            seen.add(np)
            out.append(p)
    return out


def _parse_me2_config_mods(toml_path: str) -> List[str]:
    try:
        with open(toml_path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return []
    paths: List[str] = []
    if _tomllib is not None:
        try:
            doc = _tomllib.loads(raw.decode("utf-8", errors="ignore"))
            me2 = doc.get("extension", {}).get("mod_loader", {})
            for m in me2.get("mods", []) or []:
                if isinstance(m, dict) and m.get("enabled", False) and m.get("path"):
                    paths.append(str(m["path"]))
            return paths
        except Exception:
            pass
    txt = raw.decode("utf-8", errors="ignore")
    for m in re.finditer(r'enabled\s*=\s*true[^}]*?path\s*=\s*["\']([^"\']+)["\']', txt, re.DOTALL | re.IGNORECASE):
        paths.append(m.group(1))
    return paths


def _parse_me3_config_mods(me3_path: str) -> List[str]:
    try:
        with open(me3_path, "rb") as fh:
            raw = fh.read()
    except OSError:
        return []
    paths: List[str] = []
    if _tomllib is not None:
        try:
            doc = _tomllib.loads(raw.decode("utf-8", errors="ignore"))
            for pkg in doc.get("packages", []) or []:
                if isinstance(pkg, dict) and pkg.get("path"):
                    paths.append(str(pkg["path"]))
            return paths
        except Exception:
            pass
    txt = raw.decode("utf-8", errors="ignore")
    for m in re.finditer(r'\[\[packages\]\][^\[]*?path\s*=\s*["\']([^"\']+)["\']', txt, re.DOTALL | re.IGNORECASE):
        paths.append(m.group(1))
    return paths


def detect_running_game_regulation() -> Dict[str, Any]:
    """Inspect running eldenring.exe + ModEngine2/ModEngine3/mod DLLs to locate active regulation.bin."""
    pid = _find_process_pid("eldenring.exe")
    if not pid:
        return {"running": False, "eac": _is_eac_running()}

    eac = _is_eac_running()
    exe_path = _get_process_image_path(pid)
    game_dir = os.path.dirname(exe_path) if exe_path else None
    mod_dlls = _find_mod_loader_dlls(pid, game_dir)
    mod_dir = None
    reg_path = None
    source = "vanilla"

    for dll_path in mod_dlls:
        dll_name = os.path.basename(dll_path).lower()
        loader_tag = (
            "modengine3"
            if "me3" in dll_name
            else ("modengine2" if "modengine2" in dll_name else "modloader")
        )
        search_roots: List[str] = []
        cur = os.path.dirname(dll_path)
        for _ in range(5):
            if cur and cur not in search_roots:
                search_roots.append(cur)
            parent = os.path.dirname(cur)
            if not parent or parent == cur:
                break
            cur = parent
        if loader_tag == "modengine3":
            local_app = os.environ.get("LOCALAPPDATA", "")
            me3_prof_root = os.path.join(local_app, "garyttierney", "me3", "profiles")
            if os.path.isdir(me3_prof_root):
                search_roots.append(me3_prof_root)

        for root in search_roots:
            try:
                files = os.listdir(root)
            except OSError:
                files = []
            me3s = sorted(
                [os.path.join(root, fn) for fn in files if fn.lower().endswith(".me3")],
                key=lambda p: (0 if "offline" in os.path.basename(p).lower() else 1, p),
            )
            for mp_file in me3s:
                for mp in _parse_me3_config_mods(mp_file):
                    cand_dir = mp if os.path.isabs(mp) else os.path.abspath(os.path.join(root, mp))
                    cand_reg = os.path.join(cand_dir, "regulation.bin")
                    if os.path.isfile(cand_reg):
                        mod_dir = cand_dir
                        reg_path = cand_reg
                        source = "modengine3"
                        break
                if reg_path:
                    break
            if reg_path:
                break

            tomls = sorted(
                [os.path.join(root, fn) for fn in files if fn.lower().endswith(".toml")],
                key=lambda p: (0 if "config_eldenring" in os.path.basename(p).lower() else 1, p),
            )
            for tp in tomls:
                for mp in _parse_me2_config_mods(tp):
                    cand_dir = mp if os.path.isabs(mp) else os.path.abspath(os.path.join(root, mp))
                    cand_reg = os.path.join(cand_dir, "regulation.bin")
                    if os.path.isfile(cand_reg):
                        mod_dir = cand_dir
                        reg_path = cand_reg
                        source = "modengine2"
                        break
                if reg_path:
                    break
            if reg_path:
                break

            cand_mod = os.path.join(root, "mod")
            cand_reg = os.path.join(cand_mod, "regulation.bin")
            if os.path.isfile(cand_reg):
                mod_dir = cand_mod
                reg_path = cand_reg
                source = loader_tag
                break
        if reg_path:
            break

    if not reg_path and game_dir:
        vanilla_reg = os.path.join(game_dir, "regulation.bin")
        if os.path.isfile(vanilla_reg):
            reg_path = vanilla_reg
            mod_dir = game_dir
            source = "vanilla"

    return {
        "running": True,
        "pid": pid,
        "eac": eac,
        "gameDir": game_dir,
        "modDir": mod_dir,
        "regulationPath": reg_path,
        "source": source,
    }
