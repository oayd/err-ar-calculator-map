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


def parse_world_map_pins(mp_bytes: bytes) -> List[Dict[str, Any]]:
    """Decode CS::MENU_WORLD_MAP_SAVEDATA (5 blue beacons + 100 custom map stamps)."""
    if not mp_bytes or len(mp_bytes) < 0x7E8:
        return []
    u0, u2 = struct.unpack_from("<HH", mp_bytes, 0)
    if (u0, u2) != (1, 2):
        return []
    layer_map = {0: "m00", 1: "m01", 10: "m10"}
    pins: List[Dict[str, Any]] = []
    for idx in range(105):
        off = 0x108 + idx * 16
        t, x, y, fl = struct.unpack_from("<IffI", mp_bytes, off)
        if t == 0xFFFFFFFF:
            continue
        if not (math.isfinite(x) and math.isfinite(y) and 0.0 <= x <= 10496.0 and 0.0 <= y <= 10496.0):
            continue
        layer = layer_map.get(fl & 0xFF, "m00")
        u = round(x / 10496.0, 6)
        v = round(y / 10496.0, 6)
        if idx < 5:
            pins.append(
                {
                    "kind": "beacon",
                    "slot": idx + 1,
                    "layer": layer,
                    "u": u,
                    "v": v,
                    "order": int(t),
                }
            )
        else:
            pins.append(
                {
                    "kind": "stamp",
                    "stampType": int(t % 10),
                    "layer": layer,
                    "u": u,
                    "v": v,
                }
            )
    return pins


def decode_event_flags(ef_bytes: bytes, flag_bst: Optional[Dict[int, int]], wanted_flags: Optional[Set[int]]) -> List[int]:
    if not ef_bytes or not flag_bst or not wanted_flags:
        return []
    out: List[int] = []
    nbytes = len(ef_bytes)
    for fid in sorted(wanted_flags):
        mult = flag_bst.get(fid // 1000)
        if mult is None:
            continue
        idx = fid % 1000
        boff = mult * 125 + (idx >> 3)
        if 0 <= boff < nbytes and (ef_bytes[boff] & (1 << (7 - (idx & 7)))):
            out.append(fid)
    return out


def _collect_inv_block(
    sdata: bytes,
    off: int,
    cap: int,
    gmap: Dict[int, int],
    weapons: Set[int],
    armor: Set[int],
    talismans: Set[int],
    goods: Set[int],
):
    for i in range(cap):
        gh, qty, _idx = struct.unpack_from("<III", sdata, off + i * 12)
        if gh == 0 or qty == 0:
            continue
        nib = gh & 0xF0000000
        if nib == 0x80000000:
            iid = gmap.get(gh)
            if iid:
                weapons.add(((iid & 0x0FFFFFFF) // 100) * 100)
        elif nib == 0x90000000:
            iid = gmap.get(gh)
            if iid:
                armor.add(iid & 0x0FFFFFFF)
        elif nib == 0xA0000000:
            talismans.add(gh & 0x0FFFFFFF)
        elif nib == 0xB0000000:
            goods.add(gh & 0x0FFFFFFF)


def _parse_slot_extras(
    sdata: bytes,
    flag_bst: Optional[Dict[int, int]] = None,
    wanted_flags: Optional[Set[int]] = None,
) -> Optional[Dict[str, Any]]:
    """Walk slot binary using SL2.bt layout to extract inventory, map pins, and event flags."""
    if len(sdata) < 0x45000:
        return None
    ver = struct.unpack_from("<I", sdata, 0x10)[0]
    if ver == 0:
        return None
    pos = 0x30
    gcount = 0x1400 if ver > 81 else 0x13FE
    gmap: Dict[int, int] = {}
    for _ in range(gcount):
        gh, iid = struct.unpack_from("<II", sdata, pos)
        pos += 8
        if gh != 0:
            gmap[gh] = iid
            nib = gh & 0xF0000000
            if nib == 0x80000000:
                pos += 13
            elif nib == 0x90000000:
                pos += 8

    # PlayerGameData (0x1B0) + SPEffects (0xD0) + ChrAsmEquipment*3 + ArmStyle (0x58 + 0x1C + 0x58 + 0x58)
    pos += 0x1B0 + 0xD0 + 0x58 + 0x1C + 0x58 + 0x58

    weapons: Set[int] = set()
    armor: Set[int] = set()
    talismans: Set[int] = set()
    goods: Set[int] = set()

    # InventoryHeld(0xA80 common, 0x180 key)
    _collect_inv_block(sdata, pos + 4, 0xA80, gmap, weapons, armor, talismans, goods)
    _collect_inv_block(sdata, pos + 4 + 0xA80 * 12 + 4, 0x180, gmap, weapons, armor, talismans, goods)
    pos += 4 + 0xA80 * 12 + 4 + 0x180 * 12 + 8

    # EquipMagicData + EquipItemData + GestureEquipData
    pos += (14 * 8 + 4) + (10 * 8 + 4 + 6 * 8 + 8) + 24
    proj_cnt = struct.unpack_from("<I", sdata, pos)[0]
    if proj_cnt > 0x1000:
        return None
    pos += 4 + proj_cnt * 8
    # EquippedArmamentsAndItems (0x9C) + Physic (0xC) + FaceData (0x12F)
    pos += 0x9C + 0xC + 0x12F

    # InventoryStorageBox(0x780 common, 0x80 key)
    _collect_inv_block(sdata, pos + 4, 0x780, gmap, weapons, armor, talismans, goods)
    _collect_inv_block(sdata, pos + 4 + 0x780 * 12 + 4, 0x80, gmap, weapons, armor, talismans, goods)
    pos += 4 + 0x780 * 12 + 4 + 0x80 * 12 + 8

    # Gestures (0x100) + Regions + Horse (0x28) + control_byte (1) + BloodStainData (0x44) + unk_gdm (8)
    pos += 0x100
    reg_cnt = struct.unpack_from("<I", sdata, pos)[0]
    if reg_cnt > 0x4000:
        return None
    pos += 4 + reg_cnt * 4
    pos += 0x28 + 1 + 0x44 + 8

    mp_off = pos
    if mp_off + 0x1008 > len(sdata):
        return None
    mp_bytes = sdata[mp_off + 8 : mp_off + 8 + 4096]
    map_pins = parse_world_map_pins(mp_bytes)

    ef_off = mp_off + 0x1008 + 0x34 + (8 + 0x1B58 * 16) + 0x408 + 3 + 4 + 4 + 1 + 4 + 4 + 1 + 4 + 4
    if ef_off + 0x1BF9A0 > len(sdata) or sdata[ef_off + 0x1BF99F] != 0:
        return None
    set_flags = decode_event_flags(sdata[ef_off : ef_off + 0x1BF99F], flag_bst, wanted_flags)

    return {
        "owned": {
            "weapons": sorted(weapons),
            "armor": sorted(armor),
            "talismans": sorted(talismans),
            "goods": sorted(goods),
        },
        "setFlags": set_flags,
        "mapPins": map_pins,
        "mpRelOff": mp_off + 8,
    }


def read_save_characters(
    save_path: str,
    known_weapon_base_ids: Optional[Set[int]] = None,
    flag_bst: Optional[Dict[int, int]] = None,
    wanted_flags: Optional[Set[int]] = None,
) -> Dict:
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
        extras = None
        try:
            extras = _parse_slot_extras(sdata, flag_bst=flag_bst, wanted_flags=wanted_flags)
        except Exception:
            extras = None
        if extras and extras.get("mpRelOff"):
            stat_offsets[f"mp_{slot}"] = s_off + int(extras["mpRelOff"])
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
                "owned": extras["owned"] if extras else {"weapons": [], "armor": [], "talismans": [], "goods": []},
                "setFlags": extras["setFlags"] if extras else [],
                "mapPins": extras["mapPins"] if extras else [],
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
                read_sz = 0x750 if slot_key.startswith("mp_") else 64
                if 0 <= abs_off and abs_off + read_sz <= file_size:
                    fh.seek(abs_off)
                    h.update(fh.read(read_sz))
    return h.hexdigest()
