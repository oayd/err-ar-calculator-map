import glob
import hashlib
import math
import os
import struct
from typing import Any, Dict, List, Optional, Set, Tuple

ER_APPDATA = os.path.join(os.environ.get("APPDATA", ""), "EldenRing")


def find_default_save() -> Optional[str]:
    """Return the most recently modified ER0000.err save path, or fallback to .sl2/.co2/.cnv."""
    if not os.path.isdir(ER_APPDATA):
        return None
    err_saves = glob.glob(os.path.join(ER_APPDATA, "*", "ER0000.err"))
    if err_saves:
        err_saves.sort(key=os.path.getmtime, reverse=True)
        return err_saves[0]
    other_saves = []
    for ext in ("*.err", "*.co2", "*.cnv", "*.cnvco2", "*.sl2"):
        other_saves.extend(glob.glob(os.path.join(ER_APPDATA, "*", ext)))
    if not other_saves:
        return None
    other_saves.sort(key=os.path.getmtime, reverse=True)
    return other_saves[0]


def format_playtime(secs: int) -> str:
    hrs = secs // 3600
    mins = (secs % 3600) // 60
    return f"{hrs}h {mins:02d}m"


def _parse_bnd4_entries(data: bytes) -> List[Tuple[int, int]]:
    if data[:4] != b"BND4":
        raise ValueError("Not a valid BND4 / Elden Ring save file.")
    file_count = struct.unpack_from("<i", data, 0x0C)[0]
    header_size = struct.unpack_from("<q", data, 0x10)[0]
    entry_size = struct.unpack_from("<q", data, 0x20)[0]
    if file_count < 11:
        raise ValueError(f"Expected at least 11 BND4 entries in save, got {file_count}")
    entries: List[Tuple[int, int]] = []
    for i in range(file_count):
        off = header_size + i * entry_size
        size = struct.unpack_from("<Q", data, off + 0x08)[0]
        data_off = struct.unpack_from("<I", data, off + 0x10)[0]
        entries.append((data_off, size))
    return entries


def _extract_player_pos(sdata: bytes) -> Optional[Tuple[int, Dict[str, Any]]]:
    """Locate live PlayerCoordinates struct (pos xyz, 4B mapId, rot xyz) inside slot data."""
    if len(sdata) < 0x180020:
        return None
    map_bytes = sdata[0x14:0x18]
    m0, m1, m2, m3 = struct.unpack_from("<4B", sdata, 0x14)
    if m3 == 0 and m2 == 0 and m1 == 0:
        return None
    cur = 0x180000
    n = len(sdata)
    while True:
        idx = sdata.find(map_bytes, cur)
        if idx < 0:
            break
        if idx >= 12 and idx + 16 <= n:
            x, y, z = struct.unpack_from("<3f", sdata, idx - 12)
            rx, ry, rz = struct.unpack_from("<3f", sdata, idx + 4)
            if (
                all(math.isfinite(v) for v in (x, y, z, rx, ry, rz))
                and abs(x) < 10000.0
                and abs(z) < 10000.0
                and (abs(x) > 0.01 or abs(y) > 0.01 or abs(z) > 0.01)
                and abs(rx) < 0.01
                and abs(rz) < 0.01
                and abs(ry) <= 6.5
            ):
                return (
                    idx - 12,
                    {
                        "area": m3,
                        "gridX": m2,
                        "gridZ": m1,
                        "sub": m0,
                        "x": round(x, 2),
                        "y": round(y, 2),
                        "z": round(z, 2),
                        "yaw": round(ry, 4),
                    },
                )
        cur = idx + 1
    return None


def read_save_characters(save_path: str, known_weapon_base_ids: Optional[Set[int]] = None) -> Dict:
    """Read character slots & last-played slot index strictly read-only from an ER save file."""
    with open(save_path, "rb") as fh:
        data = fh.read()

    entries = _parse_bnd4_entries(data)
    u10_off, u10_sz = entries[10]
    u10 = data[u10_off : u10_off + u10_sz]

    last_slot_raw = struct.unpack_from("<I", u10, 0x1344)[0]
    active_flags = list(u10[0x1964 : 0x1964 + 10])

    characters = []
    stat_offsets: Dict[str, int] = {}
    for slot in range(10):
        if not active_flags[slot]:
            continue
        po = 0x196E + slot * 0x24C
        name = u10[po : po + 34].decode("utf-16-le", errors="replace").split("\x00")[0].strip()
        if not name:
            name = f"Slot {slot + 1}"
        level, play_secs = struct.unpack_from("<II", u10, po + 0x22)

        equipped = []
        if known_weapon_base_ids:
            seen_raw = set()
            # ProfileSummary stores the 6 equipped hand-weapon slots at +0x1D6 .. +0x1EA
            for eo in range(0x1D6, 0x1EE, 4):
                raw_id = struct.unpack_from("<I", u10, po + eo)[0]
                if raw_id == 0xFFFFFFFF or raw_id in seen_raw:
                    continue
                lv = raw_id % 100
                base_w = (raw_id // 100) * 100
                if lv <= 25 and base_w in known_weapon_base_ids:
                    seen_raw.add(raw_id)
                    equipped.append({"rawId": raw_id, "weaponId": base_w, "level": lv})

        # ProfileSummary stores 4 armor slots (+0x206..+0x212) and 4 talisman slots (+0x21A..+0x226)
        armor = []
        for ao in (0x206, 0x20A, 0x20E, 0x212):
            aid = struct.unpack_from("<I", u10, po + ao)[0]
            armor.append(aid if aid not in (0, 0xFFFFFFFF) else None)

        talismans = []
        for toff in (0x21A, 0x21E, 0x222, 0x226):
            tid = struct.unpack_from("<I", u10, po + toff)[0]
            talismans.append(tid if tid not in (0, 0xFFFFFFFF) else None)

        s_off, s_sz = entries[slot]
        sdata = data[s_off : s_off + s_sz]
        pat = (name + "\x00").encode("utf-16-le")
        pos = -1
        cur = 0
        while True:
            p = sdata.find(pat, cur)
            if p < 0:
                break
            if p >= 0x60 and struct.unpack_from("<I", sdata, p - 0x34)[0] == level:
                pos = p
                break
            cur = p + 2

        if pos < 0:
            continue

        stat_offsets[str(slot)] = s_off + pos - 0x60
        pos_hit = _extract_player_pos(sdata)
        player_pos = None
        if pos_hit is not None:
            pos_rel, player_pos = pos_hit
            stat_offsets[f"pos_{slot}"] = s_off + pos_rel
        vig, mnd, end, strength, dex, intel, fai, arc = struct.unpack_from("<8I", sdata, pos - 0x60)
        characters.append(
            {
                "slot": slot,
                "name": name,
                "level": level,
                "playSecs": play_secs,
                "playTime": format_playtime(play_secs),
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
                "playerPos": player_pos,
            }
        )

    last_slot = last_slot_raw if any(c["slot"] == last_slot_raw for c in characters) else (
        characters[0]["slot"] if characters else 0
    )

    return {
        "savePath": save_path,
        "mtime": os.path.getmtime(save_path),
        "lastSlot": last_slot,
        "statOffsets": stat_offsets,
        "characters": characters,
    }


def read_save_fingerprint(save_path: str, stat_offsets: Optional[Dict[str, int]] = None) -> str:
    """Fast read-only SHA-256 fingerprint of save headers, profile summaries, and cached stat blocks."""
    h = hashlib.sha256()
    with open(save_path, "rb") as fh:
        file_size = os.fstat(fh.fileno()).st_size
        h.update(struct.pack("<Q", file_size))
        hdr = fh.read(4096)
        entries = _parse_bnd4_entries(hdr)
        for off, _ in entries[:11]:
            if off + 16 <= file_size:
                fh.seek(off)
                h.update(fh.read(16))
        u10_off, u10_sz = entries[10]
        if u10_off + 0x1348 <= file_size:
            fh.seek(u10_off + 0x1344)
            h.update(fh.read(4))
        prof_end = 0x196E + 10 * 0x24C
        if u10_sz >= prof_end and u10_off + prof_end <= file_size:
            fh.seek(u10_off + 0x1964)
            h.update(fh.read(prof_end - 0x1964))
        if stat_offsets:
            for slot_key in sorted(stat_offsets.keys()):
                abs_off = int(stat_offsets[slot_key])
                if 0 <= abs_off and abs_off + 64 <= file_size:
                    fh.seek(abs_off)
                    h.update(fh.read(64))
    return h.hexdigest()
