"""Read-only process memory reader for live offline Elden Ring / ERR tracking."""

import ctypes
import ctypes.wintypes as wt
import math
import re
import struct
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import save_reader

_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

_PROCESS_QUERY_INFORMATION = 0x0400
_PROCESS_VM_READ = 0x0010
_TH32CS_SNAPPROCESS = 0x00000002
_TH32CS_SNAPMODULE = 0x00000008
_TH32CS_SNAPMODULE32 = 0x00000010
_STILL_ACTIVE = 259

_AOB_WORLD_CHR_MAN = "48 8B 05 ?? ?? ?? ?? 48 85 C0 74 0F 48 39 88"
_AOB_GAME_DATA_MAN = "48 8B 05 ?? ?? ?? ?? 48 85 C0 74 05 48 8B 40 58 C3 C3"
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

        equipped = []
        seen_raw = set()
        for off in range(0x398, 0x3B0, 4):
            raw_id = struct.unpack_from("<I", buf, off)[0]
            if raw_id in (0, 0xFFFFFFFF, 110000) or raw_id in seen_raw:
                continue
            lv = raw_id % 100
            base_w = (raw_id // 100) * 100
            if lv <= 25 and (not known_weapon_ids or base_w in known_weapon_ids):
                seen_raw.add(raw_id)
                equipped.append({"rawId": raw_id, "weaponId": base_w, "level": lv})

        armor = []
        for off in range(0x3C8, 0x3D8, 4):
            aid = struct.unpack_from("<I", buf, off)[0]
            if aid in (0, 0xFFFFFFFF) or (known_armor_ids and aid not in known_armor_ids):
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
            "armor": armor,
            "talismans": talismans,
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

    def _collect_live_inv_table(self, inv_ptr: int, ncap: int, kcap: int, weapons: Set[int], armor: Set[int], talismans: Set[int], goods: Set[int]) -> bool:
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
                    weapons.add((raw // 100) * 100)
                elif top == 0x10000000:
                    armor.add(raw)
                elif top == 0x20000000:
                    talismans.add(raw)
                elif top == 0x40000000:
                    goods.add(raw)
        return True

    def read_inventory(self) -> Optional[Dict[str, List[int]]]:
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

        if self._inv_off is None:
            for off in range(0x3D0, 0x520, 8):
                hdr = self._read_bytes(pgd + off + 0x0C, 24)
                if hdr and len(hdr) == 24:
                    cn, hn, ln, ck = struct.unpack_from("<IQII", hdr, 0)
                    if cn == 0xA80 and ck == 0x180 and hn >= 0x10000 and ln <= cn:
                        self._inv_off = off
                        break
        if self._inv_off is None or not self._collect_live_inv_table(pgd + self._inv_off, 0xA80, 0x180, weapons, armor, talismans, goods):
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
            if sptr < 0x10000 or not self._collect_live_inv_table(sptr, 0x780, 0x80, weapons, armor, talismans, goods):
                self._storage_ptr_off = None

        return {
            "weapons": sorted(weapons),
            "armor": sorted(armor),
            "talismans": sorted(talismans),
            "goods": sorted(goods),
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

    def read_active_bosses(self) -> Optional[List[Dict[str, Any]]]:
        """Return live boss HP, stance/poise, and status buildup from offline RAM."""
        if not self._wcm_addr or not self._fem_addr or _is_eac_running():
            return None
        wcm = self._ru64(self._wcm_addr)
        fem = self._ru64(self._fem_addr)
        if wcm < 0x10000 or fem < 0x10000:
            return None

        boss_bars = self._read_bytes(fem + 0x5BF0, 3 * 0x20)
        if not boss_bars or len(boss_bars) < 3 * 0x20:
            return None

        out: List[Dict[str, Any]] = []
        seen_chr: Set[int] = set()
        for slot in range(3):
            display_id, _, boss_handle = struct.unpack_from("<iIQ", boss_bars, slot * 0x20)
            tag_addr = fem + 0x1B90 + slot * 0x128
            tag_hdr = self._read_bytes(tag_addr, 0x28)
            tag_vis = bool(tag_hdr and tag_hdr[0])
            tag_handle = struct.unpack_from("<Q", tag_hdr, 8)[0] if tag_hdr and len(tag_hdr) >= 16 else 0

            def _valid_h(h: int) -> bool:
                return h not in (0, 0xFFFFFFFFFFFFFFFF) and (h & 0xFFFFFFFF) != 0xFFFFFFFF

            handle = boss_handle if _valid_h(boss_handle) else (tag_handle if tag_vis and _valid_h(tag_handle) else 0)
            if not handle or (display_id <= 0 and not tag_vis):
                continue

            chr_ins = self._resolve_chr_ins(wcm, handle)
            if chr_ins < 0x10000 or chr_ins in seen_chr:
                continue
            seen_chr.add(chr_ins)

            mod_bag = self._ru64(chr_ins + 0x190)
            if mod_bag < 0x10000:
                continue
            mods = self._read_bytes(mod_bag, 0x50)
            if not mods or len(mods) < 0x50:
                continue
            stat_mod, _, _, _, resist_mod, _, _, _, stagger_mod, toughness_mod = struct.unpack_from("<10Q", mods, 0)
            if stat_mod < 0x10000:
                continue

            stat_raw = self._read_bytes(stat_mod + 0x138, 0x28)
            if not stat_raw or len(stat_raw) < 0x28:
                continue
            hp, hp_max = struct.unpack_from("<2i", stat_raw, 0x00)
            stam, stam_max = struct.unpack_from("<2i", stat_raw, 0x1C)
            if hp <= 0 or hp_max <= 0 or hp_max > 10_000_000:
                continue

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

            statuses: List[Dict[str, Any]] = []
            if resist_mod >= 0x10000:
                rraw = self._read_bytes(resist_mod + 0x10, 56)
                if rraw and len(rraw) == 56:
                    vals = struct.unpack("<14i", rraw)
                    # Order in CSChrResistModule: poison(0), rot(1), bleed(2), blight(3), frost(4), sleep(5), madness(6)
                    for idx, key, label, always in (
                        (2, "bleed", "Bleed", True),
                        (4, "frost", "Frost", True),
                        (1, "rot", "Rot", True),
                        (0, "poison", "Poison", False),
                        (5, "sleep", "Sleep", False),
                        (6, "madness", "Madness", False),
                    ):
                        cur = vals[idx]
                        mx = vals[7 + idx]
                        immune = (mx <= 0 or mx >= 99999 or cur < 0)
                        buildup = 0 if immune else max(0, min(mx, mx - cur))
                        if always or (not immune and buildup > 0):
                            statuses.append({
                                "key": key,
                                "label": label,
                                "cur": buildup,
                                "max": 0 if immune else mx,
                                "immune": immune,
                            })

            name = ""
            if tag_vis or tag_handle == handle:
                name = self._read_menu_string(tag_addr + 0x28)
            if not name:
                name = f"Boss {slot + 1}"

            out.append({
                "slot": slot,
                "name": name,
                "hp": hp,
                "maxHp": hp_max,
                "stance": stance,
                "maxStance": max_stance,
                "stanceReset": stance_reset,
                "stanceBroken": stance_broken,
                "stanceKind": stance_kind,
                "statuses": statuses,
            })
        return out
