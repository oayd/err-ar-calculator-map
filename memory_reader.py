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
_AOB_EVENT_FLAG_CANDS = (
    "48 8B 1D ?? ?? ?? ?? 48 8D 15 ?? ?? ?? ?? 48 8D 4D F0 E8 ?? ?? ?? ?? 4C 8B C0",
    "48 8B 3D ?? ?? ?? ?? 48 85 FF 74 ?? B8",
    "48 8B 0D ?? ?? ?? ?? 48 85 C9 74 ?? 48 83 79 28 00",
)


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
_RX_EFM = [re.compile(_compile_aob(p), re.DOTALL) for p in _AOB_EVENT_FLAG_CANDS]


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
        self._inv_off: Optional[int] = None
        self._storage_ptr_off: Optional[int] = None
        self._mp_cache: Optional[Tuple[int, int, int]] = None
        self._last_try: float = 0.0

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

    def _scan_singletons(self) -> Tuple[int, int]:
        dos = self._read_bytes(self._base, 0x1000)
        if not dos or len(dos) < 0x100 or dos[:2] != b"MZ":
            return 0, 0
        pe_off = struct.unpack_from("<I", dos, 0x3C)[0]
        if pe_off + 24 >= len(dos) or dos[pe_off : pe_off + 4] != b"PE\x00\x00":
            return 0, 0
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
            return 0, 0

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

        return resolve_rip(_RX_WCM), resolve_rip(_RX_GDM), efm

    def ensure_attached(self, min_retry_secs: float = 2.0) -> bool:
        if self._is_alive() and (self._wcm_addr or self._gdm_addr):
            return True
        if self._handle:
            self.close()
        now = time.monotonic()
        if now - self._last_try < min_retry_secs:
            return False
        self._last_try = now

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
        wcm, gdm, efm = self._scan_singletons()
        if not wcm and not gdm:
            self.close()
            return False
        self._wcm_addr = wcm
        self._gdm_addr = gdm
        self._efm_addr = efm
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
