"""Pure-Python Elden Ring / ERR regulation.bin and live PARAM extractor.

Decrypts and unpacks regulation.bin (or reads pre-extracted raw .param blobs from
live game memory) without requiring Smithbox, pythonnet, or an external Python
environment. Mirrors extract_err_data.py output schema identically.
"""

import ctypes
from ctypes import byref, c_ubyte, c_uint32, c_void_p, c_wchar_p
import gzip
import json
import math
import os
import struct
import zlib
from typing import Any, Dict, List, Optional, Set, Tuple

import game_map_extractor

try:
    import zstandard as _zstd
except ImportError:
    _zstd = None


ER_REGULATION_KEY = bytes.fromhex(
    "99BFFC366A6BC8C6F5827D093602D676C42892A01C207FB024D3AF4E493FEF99"
)

REQUIRED_PARAM_NAMES: Tuple[str, ...] = (
    "equipparamweapon.param",
    "reinforceparamweapon.param",
    "calccorrectgraph.param",
    "attackelementcorrectparam.param",
    "speffectparam.param",
    "menuvaluetableparam.param",
    "equipparamprotector.param",
    "equipparamaccessory.param",
    "equipparamgoods.param",
    "behaviorparam_pc.param",
    "atkparam_pc.param",
)

AFFINITY_BY_OFFSET: Dict[int, str] = {
    0: "Standard",
    100: "Heavy",
    200: "Keen",
    300: "Quality",
    400: "Fire",
    500: "Fell",
    600: "Lightning",
    700: "Sacred",
    800: "Magic",
    900: "Cold",
    1000: "Poison",
    1100: "Bloody",
    1200: "Occult",
    1300: "Bolt",
    1400: "Soporific",
    1500: "Frenzied",
    1600: "Magma",
    1700: "Rotten",
    1800: "Cursed",
    1900: "Night",
    2000: "Gravitational",
    2100: "Blessed",
    2200: "Bestial",
    2300: "Fated",
}


def decrypt_regulation_bytes(enc: bytes) -> bytes:
    """Decrypt an AES-256-CBC Elden Ring regulation.bin using Windows BCrypt."""
    if not enc or len(enc) < 32:
        raise RuntimeError("Invalid or empty regulation.bin file.")
    if enc[:4] in (b"DCX\x00", b"BND4"):
        return enc

    iv = bytearray(enc[:16])
    ct = bytearray(enc[16:])
    pad_len = len(ct) % 16
    if pad_len != 0:
        raise RuntimeError("Encrypted regulation.bin length minus 16-byte IV is not a multiple of 16.")

    bcrypt = ctypes.WinDLL("bcrypt.dll")
    h_alg = c_void_p()
    h_key = c_void_p()
    status = bcrypt.BCryptOpenAlgorithmProvider(byref(h_alg), c_wchar_p("AES"), None, 0)
    if status != 0:
        raise RuntimeError(f"BCryptOpenAlgorithmProvider failed: 0x{status & 0xFFFFFFFF:X}")
    try:
        mode = "ChainingModeCBC\0".encode("utf-16-le")
        status = bcrypt.BCryptSetProperty(
            h_alg,
            c_wchar_p("ChainingMode"),
            ctypes.create_string_buffer(mode, len(mode)),
            len(mode),
            0,
        )
        if status != 0:
            raise RuntimeError(f"BCryptSetProperty(CBC) failed: 0x{status & 0xFFFFFFFF:X}")

        key_buf = (c_ubyte * len(ER_REGULATION_KEY))(*ER_REGULATION_KEY)
        status = bcrypt.BCryptGenerateSymmetricKey(
            h_alg, byref(h_key), None, 0, key_buf, len(ER_REGULATION_KEY), 0
        )
        if status != 0:
            raise RuntimeError(f"BCryptGenerateSymmetricKey failed: 0x{status & 0xFFFFFFFF:X}")

        iv_buf = (c_ubyte * 16).from_buffer(iv)
        ct_buf = (c_ubyte * len(ct)).from_buffer(ct)
        out_len = c_uint32()
        status = bcrypt.BCryptDecrypt(
            h_key, ct_buf, len(ct), None, iv_buf, 16, ct_buf, len(ct), byref(out_len), 0
        )
        if status != 0:
            raise RuntimeError(f"BCryptDecrypt failed: 0x{status & 0xFFFFFFFF:X}")
        return bytes(ct[: out_len.value])
    finally:
        if h_key.value:
            bcrypt.BCryptDestroyKey(h_key)
        if h_alg.value:
            bcrypt.BCryptCloseAlgorithmProvider(h_alg, 0)


def decompress_dcx_auto(raw: bytes, oodle_fn=None) -> bytes:
    """Decompress DCX_ZSTD, DCX_DFLT, or DCX_KRAK bytes (or pass raw BND4/PARAM through)."""
    if raw[:4] != b"DCX\x00":
        return raw
    uncomp_sz, comp_sz = struct.unpack_from(">II", raw, 0x1C)
    comp_type = raw[0x28:0x2C]
    dca_pos = raw.find(b"DCA\x00", 0x2C, 0x90)
    if dca_pos < 0:
        raise RuntimeError("Invalid DCX container (missing DCA chunk).")
    payload = raw[dca_pos + 8 : dca_pos + 8 + comp_sz]

    if comp_type == b"ZSTD":
        if _zstd is None:
            raise RuntimeError("Missing 'zstandard' package needed to unpack DCX_ZSTD regulation.bin.")
        return _zstd.ZstdDecompressor().decompress(payload, max_output_size=uncomp_sz)
    if comp_type == b"DFLT":
        return zlib.decompress(payload)
    if comp_type == b"KRAK":
        if oodle_fn is None:
            gd = game_map_extractor.detect_elden_ring_game_dir()
            if gd:
                oodle_fn = game_map_extractor._load_oodle(gd)
        if oodle_fn is None:
            raise RuntimeError("Oodle DLL (oo2core_6_win64.dll) not found to unpack DCX_KRAK.")
        return game_map_extractor._dcx_decompress(raw, oodle_fn)
    raise RuntimeError(f"Unsupported DCX compression type: {comp_type!r}")


def unpack_regulation_params(
    reg_path: str,
    game_dir: Optional[str] = None,
    wanted_names: Optional[Set[str]] = None,
    optional_names: Optional[Set[str]] = None,
) -> Dict[str, bytes]:
    """Read, decrypt, decompress, and extract .param blobs from a regulation.bin file."""
    with open(reg_path, "rb") as fh:
        enc = fh.read()

    dec = decrypt_regulation_bytes(enc)
    oodle_fn = None
    if dec[:4] == b"DCX\x00" and dec[0x28:0x2C] == b"KRAK":
        gd = game_map_extractor.normalize_game_dir(game_dir) or game_map_extractor.detect_elden_ring_game_dir()
        if gd:
            oodle_fn = game_map_extractor._load_oodle(gd)

    bnd = decompress_dcx_auto(dec, oodle_fn=oodle_fn)
    entries = game_map_extractor._parse_bnd4_entries(bnd)
    wanted = set(wanted_names) if wanted_names is not None else set(REQUIRED_PARAM_NAMES)
    optional = (
        set(optional_names)
        if optional_names is not None
        else ({"magic.param", "npcparam.param"} if wanted_names is None else set())
    )
    all_wanted = wanted | optional

    out: Dict[str, bytes] = {}
    for name, off, comp_sz, _uncomp_sz in entries:
        bname = os.path.basename(name.replace("\\", "/")).lower()
        if bname in all_wanted:
            blob = bnd[off : off + comp_sz]
            if blob[:4] == b"DCX\x00":
                blob = decompress_dcx_auto(blob, oodle_fn=oodle_fn)
            out[bname] = blob

    missing = [w for w in wanted if w not in out]
    if missing:
        raise RuntimeError(f"Missing required params in regulation.bin: {', '.join(missing)}")
    return out


def parse_param_rows(raw: bytes, expected_row_size: int = 0) -> List[Tuple[int, bytes]]:
    """Parse an Elden Ring v1.x binary PARAM buffer into [(row_id, row_bytes), ...]."""
    if not raw or len(raw) < 0x40:
        return []
    row_cnt = struct.unpack_from("<H", raw, 0x0A)[0]
    fmt2d = raw[0x2D]
    is_64 = bool(fmt2d & 0x04)

    table_start = 0x40 if is_64 else 0x30
    entry_sz = 24 if is_64 else 12
    entry_fmt = "<qQQ" if is_64 else "<iII"

    if table_start + row_cnt * entry_sz > len(raw):
        return []

    rows_meta: List[Tuple[int, int]] = []
    offs: List[int] = []
    for i in range(row_cnt):
        rid, data_off, _str_off = struct.unpack_from(entry_fmt, raw, table_start + i * entry_sz)
        rows_meta.append((int(rid), int(data_off)))
        offs.append(int(data_off))

    row_size = expected_row_size
    if row_size <= 0:
        uniq = sorted(set(offs))
        if len(uniq) >= 2:
            row_size = min(uniq[j + 1] - uniq[j] for j in range(len(uniq) - 1))
        elif uniq:
            row_size = max(1, len(raw) - uniq[0])

    out: List[Tuple[int, bytes]] = []
    for rid, data_off in rows_meta:
        if 0 <= data_off and data_off + row_size <= len(raw):
            out.append((rid, raw[data_off : data_off + row_size]))
    return out


def _parse_fmg(fb: bytes) -> Dict[int, str]:
    """Parse FromSoftware FMG text table (v1 or 64-bit v2)."""
    if not fb or len(fb) < 0x28:
        return {}
    ver = fb[0x02]
    is_big = bool(fb[0x01])
    endian = ">" if is_big else "<"
    out: Dict[int, str] = {}

    if ver == 2:
        gr_cnt, st_cnt = struct.unpack_from(f"{endian}II", fb, 0x0C)
        st_offs_off = struct.unpack_from(f"{endian}q", fb, 0x18)[0]
        grp_base = 0x28
        grp_stride = 16
        grp_fmt = f"{endian}iii"
        off_fmt = f"{endian}q"
        off_sz = 8
    else:
        gr_cnt, st_cnt = struct.unpack_from(f"{endian}II", fb, 0x0C)
        st_offs_off = 0x18 + gr_cnt * 12
        grp_base = 0x18
        grp_stride = 12
        grp_fmt = f"{endian}iii"
        off_fmt = f"{endian}i"
        off_sz = 4

    for gi in range(gr_cnt):
        g_off = grp_base + gi * grp_stride
        if g_off + 12 > len(fb):
            break
        s_idx, fid, lid = struct.unpack_from(grp_fmt, fb, g_off)
        if fid > lid or s_idx < 0:
            continue
        count = lid - fid + 1
        for k in range(count):
            ptr_pos = st_offs_off + (s_idx + k) * off_sz
            if ptr_pos + off_sz > len(fb) or (s_idx + k) >= st_cnt:
                break
            soff = struct.unpack_from(off_fmt, fb, ptr_pos)[0]
            if soff > 0 and soff < len(fb):
                txt = game_map_extractor._read_cstr(fb, soff, True)
                if txt:
                    out[fid + k] = txt
    return out


def load_mod_texts(mod_dir: Optional[str], game_dir: Optional[str] = None) -> Tuple[Dict[int, str], ...]:
    """Load weapon/arts/armor/talisman/goods/menu FMGs from <mod_dir>/msg/engus if present."""
    weapon_names: Dict[int, str] = {}
    arts_names: Dict[int, str] = {}
    prot_names: Dict[int, str] = {}
    acc_names: Dict[int, str] = {}
    goods_names: Dict[int, str] = {}
    menu_texts: Dict[int, str] = {}

    if not mod_dir or not os.path.isdir(mod_dir):
        return weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts

    msg_dir = os.path.join(mod_dir, "msg", "engus")
    if not os.path.isdir(msg_dir):
        return weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts

    oodle_fn = None
    gd = game_map_extractor.normalize_game_dir(game_dir) or game_map_extractor.detect_elden_ring_game_dir()
    if gd:
        try:
            oodle_fn = game_map_extractor._load_oodle(gd)
        except Exception:
            oodle_fn = None

    def read_msgbnd(fname: str, is_menu: bool) -> None:
        bp = os.path.join(msg_dir, fname)
        if not os.path.isfile(bp):
            return
        try:
            with open(bp, "rb") as fh:
                raw = fh.read()
            bnd = decompress_dcx_auto(raw, oodle_fn=oodle_fn)
            for name, off, csz, _ in game_map_extractor._parse_bnd4_entries(bnd):
                fb = bnd[off : off + csz]
                ln = os.path.basename(name.replace("\\", "/")).lower()
                if is_menu:
                    for eid, txt in _parse_fmg(fb).items():
                        if txt:
                            menu_texts[eid] = txt
                    continue
                if "weaponname" in ln:
                    target = weapon_names
                elif "artsname" in ln:
                    target = arts_names
                elif "protectorname" in ln:
                    target = prot_names
                elif "accessoryname" in ln:
                    target = acc_names
                elif "goodsname" in ln:
                    target = goods_names
                else:
                    continue
                for eid, txt in _parse_fmg(fb).items():
                    t = txt.strip()
                    if t and t.lower() != "err dummy" and "[error]" not in t.lower():
                        target[eid] = t
        except Exception:
            pass

    for bname in ("item.msgbnd.dcx", "item_dlc01.msgbnd.dcx", "item_dlc02.msgbnd.dcx"):
        read_msgbnd(bname, False)
    for bname in ("menu.msgbnd.dcx", "menu_dlc01.msgbnd.dcx", "menu_dlc02.msgbnd.dcx"):
        read_msgbnd(bname, True)

    return weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts


def _seed_fallback_names(
    fallback_data: Optional[Dict[str, Any]],
    weapon_names: Dict[int, str],
    arts_by_wep: Dict[int, str],
    prot_names: Dict[int, str],
    acc_names: Dict[int, str],
    goods_names: Dict[int, str],
    fallback_wt: Dict[int, str],
    fallback_grades: List[List[Any]],
) -> None:
    if not fallback_data:
        return
    for w in fallback_data.get("weapons", []):
        wid = int(w.get("id", 0))
        if wid and wid not in weapon_names and w.get("name"):
            weapon_names[wid] = w["name"]
        if wid and w.get("skill") and wid not in arts_by_wep:
            arts_by_wep[wid] = w["skill"]
    for k, a in (fallback_data.get("armors") or {}).items():
        if a and a.get("n"):
            prot_names.setdefault(int(k), a["n"])
    for k, t in (fallback_data.get("talismans") or {}).items():
        if t and t.get("n"):
            acc_names.setdefault(int(k), t["n"])
    for g in fallback_data.get("greases", []):
        gid = int(g.get("id", 0))
        if gid and g.get("name"):
            goods_names.setdefault(gid, g["name"])
    for k, a in (fallback_data.get("ammo") or {}).items():
        if a and a.get("n"):
            weapon_names.setdefault(int(k), a["n"])
    for k, sp in (fallback_data.get("spells") or {}).items():
        if sp and sp.get("n"):
            goods_names.setdefault(int(k), sp["n"])
    for k, v in (fallback_data.get("weaponTypes") or {}).items():
        fallback_wt.setdefault(int(k), v)
    if not fallback_grades and fallback_data.get("gradeTable"):
        for pair in fallback_data["gradeTable"]:
            fallback_grades.append(list(pair))


def _u8(row: bytes, off: int) -> int:
    return row[off]


def _s8(row: bytes, off: int) -> int:
    return struct.unpack_from("<b", row, off)[0]


def _u16(row: bytes, off: int) -> int:
    return struct.unpack_from("<H", row, off)[0]


def _s16(row: bytes, off: int) -> int:
    return struct.unpack_from("<h", row, off)[0]


def _s32(row: bytes, off: int) -> int:
    return struct.unpack_from("<i", row, off)[0]


def _f32(row: bytes, off: int) -> float:
    return struct.unpack_from("<f", row, off)[0]


def _bit(row: bytes, off: int, bit_pos: int) -> int:
    return (row[off] >> bit_pos) & 1


def _safe_rate(val: float, default: float = 1.0) -> float:
    f = float(val)
    if math.isnan(f) or f <= 0.01:
        return default
    return f


def _extract_sp_bonuses(sid: int, sp_map: Dict[int, bytes]) -> Tuple[List[int], List[float], float, int]:
    sr = sp_map.get(sid)
    if sr is None:
        return [0, 0, 0, 0, 0], [1.0, 1.0, 1.0, 1.0, 1.0], 1.0, 0
    stats = [_s8(sr, 802), _s8(sr, 803), _s8(sr, 804), _s8(sr, 805), _s8(sr, 806)]
    rate_offs = ((72, 672), (76, 676), (80, 680), (84, 684), (480, 688))
    mult = [round(_safe_rate(_f32(sr, o1)) * _safe_rate(_f32(sr, o2)), 6) for o1, o2 in rate_offs]
    stance_rate = round(_safe_rate(_f32(sr, 820)), 6)
    cond_id = _s32(sr, 296)
    return stats, mult, stance_rate, (cond_id if cond_id > 0 else 0)


def _extract_sp_equip_load(sid: int, sp_map: Dict[int, bytes]) -> Tuple[int, float]:
    sr = sp_map.get(sid)
    if sr is None:
        return 0, 1.0
    end_b = _s8(sr, 800)
    ew_raw = _f32(sr, 228)
    ew = ew_raw if (math.isfinite(ew_raw) and 0.05 < ew_raw < 20.0) else 1.0
    return int(end_b), float(ew)


def _load_npc_meta_for_extractor() -> Tuple[Dict[int, str], Set[str]]:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(base_dir, "err_map_data.json.gz"),
        os.path.join(os.path.dirname(base_dir), "err_map_data.json.gz"),
    ):
        if os.path.isfile(cand):
            try:
                with gzip.open(cand, "rt", encoding="utf-8") as fh:
                    md = json.load(fh)
                npc_meta = {
                    int(k): str(v[0] or "").strip()
                    for k, v in (md.get("npcMeta") or {}).items()
                    if isinstance(v, (list, tuple)) and v and v[0]
                }
                boss_names = {
                    str(m.get("name") or "").strip().lower()
                    for m in (md.get("markers") or [])
                    if m.get("cat") == "boss" and m.get("name")
                }
                return npc_meta, boss_names
            except Exception:
                pass
    return {}, set()


def _detect_mod_label(mod_dir: Optional[str], fallback_data: Optional[Dict[str, Any]], explicit_label: Optional[str]) -> str:
    if explicit_label:
        return explicit_label
    if mod_dir:
        pj = os.path.join(mod_dir, "project.json")
        if os.path.isfile(pj):
            try:
                with open(pj, "r", encoding="utf-8") as fh:
                    pname = (json.load(fh).get("ProjectName") or "").strip()
                if pname:
                    return pname
            except Exception:
                pass
    if fallback_data and fallback_data.get("mod"):
        return str(fallback_data["mod"])
    return "Custom regulation.bin"


def build_weapon_payload_from_params(
    params: Dict[str, bytes],
    mod_dir: Optional[str] = None,
    game_dir: Optional[str] = None,
    fallback_data: Optional[Dict[str, Any]] = None,
    mod_label: Optional[str] = None,
) -> Dict[str, Any]:
    """Construct full err_weapon_data JSON payload from binary .param blobs."""
    wep_rows = parse_param_rows(params["equipparamweapon.param"], 664)
    reinf_rows = parse_param_rows(params["reinforceparamweapon.param"], 128)
    ccg_rows = parse_param_rows(params["calccorrectgraph.param"], 80)
    aec_rows = parse_param_rows(params["attackelementcorrectparam.param"], 128)
    sp_rows = parse_param_rows(params["speffectparam.param"], 912)
    mv_rows = parse_param_rows(params["menuvaluetableparam.param"], 12)
    prot_rows = parse_param_rows(params["equipparamprotector.param"], 416)
    acc_rows = parse_param_rows(params["equipparamaccessory.param"], 96)
    goods_rows = parse_param_rows(params["equipparamgoods.param"], 176)
    beh_rows = parse_param_rows(params["behaviorparam_pc.param"], 32)
    atk_rows = parse_param_rows(params["atkparam_pc.param"], 456)
    magic_rows = parse_param_rows(params["magic.param"], 168) if "magic.param" in params else []

    weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts = load_mod_texts(
        mod_dir, game_dir=game_dir
    )
    arts_by_wep: Dict[int, str] = {}
    fallback_wt: Dict[int, str] = {}
    fallback_grades: List[List[Any]] = []
    _seed_fallback_names(
        fallback_data,
        weapon_names,
        arts_by_wep,
        prot_names,
        acc_names,
        goods_names,
        fallback_wt,
        fallback_grades,
    )

    grade_table: List[List[Any]] = []
    weapon_types: Dict[int, str] = {}
    for rid, r in mv_rows:
        val = _s32(r, 0)
        tid = _s32(r, 4)
        txt = menu_texts.get(tid, "")
        if 100 <= rid <= 115 and txt:
            grade_table.append([val, txt])
        elif 120 <= rid <= 180 and txt and val not in (81, 83, 85, 86):
            if val < 100 and val not in weapon_types:
                weapon_types[val] = txt
    if grade_table:
        grade_table.sort(key=lambda x: x[0], reverse=True)
    elif fallback_grades:
        grade_table = fallback_grades
    else:
        grade_table = [[175, "S"], [140, "A"], [90, "B"], [60, "C"], [25, "D"], [1, "E"]]

    if not weapon_types and fallback_wt:
        weapon_types = dict(fallback_wt)

    reinf_map: Dict[int, bytes] = dict(reinf_rows)
    sp_map: Dict[int, bytes] = dict(sp_rows)
    atk_map: Dict[int, bytes] = dict(atk_rows)
    beh_by_var: Dict[Tuple[int, int], bytes] = {}
    for _brid, br in beh_rows:
        bvar = _s32(br, 0)
        jid = _s32(br, 4)
        if jid in (0, 10, 100):
            beh_by_var[(bvar, jid)] = br

    raw_valid: List[Tuple[int, bytes, str]] = []
    valid_ids: Set[int] = set()
    ammo: Dict[str, Dict[str, Any]] = {}
    for rid, r in wep_rows:
        if rid < 1000000:
            continue
        wc = _u8(r, 230)
        wt = _u16(r, 422)
        if wt in (81, 83, 85, 86):
            anm = weapon_names.get(rid, "").strip()
            if anm and "[ERROR]" not in anm.upper():
                ammo[str(rid)] = {
                    "n": anm,
                    "wt": wt,
                    "atk": [_u16(r, 200), _u16(r, 202), _u16(r, 204), _u16(r, 206), _u16(r, 396)],
                }
            continue
        if wc == 13:
            continue
        nm = weapon_names.get(rid, "").strip()
        if not nm or "[ERROR]" in nm.upper():
            continue
        raw_valid.append((rid, r, nm))
        valid_ids.add(rid)

    infusable_bases = {rid for rid, _, _ in raw_valid if rid % 10000 == 0 and (rid + 100) in valid_ids}

    weapons: List[Dict[str, Any]] = []
    used_sp_ids: Set[int] = set()
    used_reinf_ids: Set[int] = set()
    used_ccg_ids: Set[int] = {220}
    used_aec_ids: Set[int] = set()

    for rid, r, nm in raw_valid:
        wt = _u16(r, 422)
        wc = _u8(r, 230)
        off = rid % 10000
        base_candidate = (rid // 10000) * 10000
        if base_candidate in valid_ids and off in AFFINITY_BY_OFFSET:
            base_id = base_candidate
            base_name = weapon_names.get(base_id, nm).strip()
            affinity = ("Standard" if base_id in infusable_bases else "Unique") if off == 0 else AFFINITY_BY_OFFSET[off]
        else:
            base_id = rid
            base_name = nm
            affinity = "Unique"

        rt = _s16(r, 218)
        max_lv = 0
        for lv in range(26):
            if (rt + lv) in reinf_map:
                max_lv = lv
                used_reinf_ids.add(rt + lv)
            else:
                break

        sp_beh = [_s32(r, 68), _s32(r, 72), _s32(r, 76)]
        for lv in range(max_lv + 1):
            rr = reinf_map.get(rt + lv)
            if rr is None:
                continue
            for b, o in zip(sp_beh, (_u8(rr, 80), _u8(rr, 81), _u8(rr, 82))):
                if b > 0:
                    used_sp_ids.add(b + o)

        ccg_list = [
            _u8(r, 236),
            _u8(r, 381),
            _u8(r, 382),
            _u8(r, 383),
            _u8(r, 398),
            _u8(r, 399),
            _u8(r, 404),
            _u8(r, 574),
            _u8(r, 575),
        ]
        used_ccg_ids.update(ccg_list)
        aec_id = _s32(r, 556)
        used_aec_ids.add(aec_id)

        en_mag = _bit(r, 261, 7) != 0
        en_sorc = _bit(r, 262, 0) != 0
        en_mir = _bit(r, 262, 1) != 0
        is_catalyst = wt in (27, 57, 59, 61) or en_sorc or en_mir
        if wt not in weapon_types:
            weapon_types[wt] = f"Type {wt}"

        ptypes = []
        if _bit(r, 262, 3) != 0:
            ptypes.append("Standard")
        if _bit(r, 262, 4) != 0:
            ptypes.append("Strike")
        if _bit(r, 262, 5) != 0:
            ptypes.append("Slash")
        if _bit(r, 262, 6) != 0:
            ptypes.append("Pierce")
        phys_types = "/".join(ptypes) if ptypes else "-"

        skill_id = _s32(r, 408)
        skill_name = arts_names.get(skill_id) or arts_by_wep.get(rid, "")
        buffable = _bit(r, 262, 7) != 0
        infusable = _bit(r, 265, 7) == 0
        stamina = _u16(r, 208)
        weight = round(_f32(r, 16), 2)

        bvar = _s32(r, 4)
        br = (
            beh_by_var.get((bvar, 0))
            or beh_by_var.get(((bvar // 100) * 100, 0))
            or beh_by_var.get((bvar, 10))
            or beh_by_var.get(((bvar // 100) * 100, 10))
        )
        r1_stam = round(_s32(br, 20) * _f32(r, 500) / 10.0, 1) if br else 0.0
        ar_row = atk_map.get(_s32(br, 12)) if br else None
        sa_corr = _f32(ar_row, 432) if ar_row else 0.0
        sa_mult = (sa_corr / 100.0) if sa_corr > 0 else 1.0
        stance = round(_f32(r, 184) * sa_mult, 1)

        weapons.append(
            {
                "id": rid,
                "baseId": base_id,
                "name": nm,
                "baseName": base_name,
                "aff": affinity,
                "wt": wt,
                "wc": wc,
                "maxLv": max_lv,
                "rt": rt,
                "aec": aec_id,
                "crit": 100 + _s16(r, 224),
                "dual": _bit(r, 380, 1) != 0,
                "both": _bit(r, 261, 2) != 0,
                "cat": 1 if is_catalyst else 0,
                "enMag": en_mag or en_sorc,
                "enMir": en_mir,
                "skill": skill_name,
                "physTypes": phys_types,
                "buffable": buffable,
                "infusable": infusable,
                "stamina": stamina,
                "r1Stam": r1_stam,
                "stance": stance,
                "weight": weight,
                "atk": [_u16(r, 200), _u16(r, 202), _u16(r, 204), _u16(r, 206), _u16(r, 396)],
                "corr": [
                    round(_f32(r, 36), 6),
                    round(_f32(r, 40), 6),
                    round(_f32(r, 44), 6),
                    round(_f32(r, 48), 6),
                    round(_f32(r, 412), 6),
                ],
                "req": [_u8(r, 242), _u8(r, 243), _u8(r, 244), _u8(r, 245), _u8(r, 405)],
                "ccg": ccg_list,
                "spBeh": sp_beh,
                "guard": [
                    round(_f32(r, 52), 1),
                    round(_f32(r, 56), 1),
                    round(_f32(r, 60), 1),
                    round(_f32(r, 64), 1),
                    round(_f32(r, 392), 1),
                    int(_s16(r, 216)),
                ],
            }
        )

    reinforce: Dict[str, List[Any]] = {}
    for rid in sorted(used_reinf_ids):
        rr = reinf_map[rid]
        reinforce[str(rid)] = [
            round(_f32(rr, 0), 6),
            round(_f32(rr, 4), 6),
            round(_f32(rr, 8), 6),
            round(_f32(rr, 12), 6),
            round(_f32(rr, 88), 6),
            round(_f32(rr, 28), 6),
            round(_f32(rr, 32), 6),
            round(_f32(rr, 36), 6),
            round(_f32(rr, 40), 6),
            round(_f32(rr, 96), 6),
            _u8(rr, 80),
            _u8(rr, 81),
            _u8(rr, 82),
            round(_f32(rr, 44), 6),
            round(_f32(rr, 48), 6),
            round(_f32(rr, 52), 6),
            round(_f32(rr, 56), 6),
            round(_f32(rr, 92), 6),
            round(_f32(rr, 76), 6),
        ]

    ccg: Dict[str, List[List[float]]] = {}
    for cid, r in ccg_rows:
        if cid in used_ccg_ids:
            ccg[str(cid)] = [
                [round(_f32(r, i * 4), 6) for i in range(5)],
                [round(_f32(r, 20 + i * 4), 6) for i in range(5)],
                [round(_f32(r, 40 + i * 4), 6) for i in range(5)],
            ]

    aec: Dict[str, Dict[str, List[Any]]] = {}
    for aid, r in aec_rows:
        if aid in used_aec_ids:
            flags = [_bit(r, k // 8, k % 8) != 0 for k in range(25)]
            ovr = [_s16(r, 4 + k * 2) for k in range(25)]
            inf = [_s16(r, 54 + k * 2) for k in range(25)]
            aec[str(aid)] = {"f": flags, "o": ovr, "i": inf}

    sp_status: Dict[str, List[int]] = {}
    for sid in sorted(used_sp_ids):
        sr = sp_map.get(sid)
        if sr is None:
            continue
        vals = [
            _s32(sr, 212),
            _s32(sr, 204),
            _s32(sr, 208),
            _s32(sr, 424),
            _s32(sr, 824),
            _s32(sr, 828),
            _s32(sr, 216),
        ]
        if any(v > 0 for v in vals):
            sp_status[str(sid)] = vals

    armors: Dict[str, Dict[str, Any]] = {}
    for rid, r in prot_rows:
        nm = prot_names.get(rid, "")
        if not nm:
            continue
        if _bit(r, 220, 1):
            slot_idx = 0
        elif _bit(r, 220, 2):
            slot_idx = 1
        elif _bit(r, 220, 3):
            slot_idx = 2
        elif _bit(r, 220, 4):
            slot_idx = 3
        else:
            continue

        tot_st = [0, 0, 0, 0, 0]
        tot_mult = [1.0, 1.0, 1.0, 1.0, 1.0]
        tot_sa = 1.0
        tot_end = 0
        tot_ew = 1.0
        for off in (40, 44, 48):
            sid = _s32(r, off)
            if sid <= 0:
                continue
            st_b, m_b, sa_b, _ = _extract_sp_bonuses(sid, sp_map)
            for k in range(5):
                tot_st[k] += st_b[k]
                tot_mult[k] *= m_b[k]
            tot_sa *= sa_b
            eb, ewr = _extract_sp_equip_load(sid, sp_map)
            tot_end += eb
            tot_ew *= ewr

        w_val = round(_f32(r, 36), 2)
        entry: Dict[str, Any] = {"n": nm, "s": slot_idx}
        if math.isfinite(w_val) and w_val > 0.0:
            entry["w"] = w_val
        if any(x != 0 for x in tot_st):
            entry["st"] = tot_st
        if any(abs(m - 1.0) > 1e-4 for m in tot_mult):
            entry["m"] = [round(m, 6) for m in tot_mult]
        if abs(tot_sa - 1.0) > 1e-4:
            entry["sa"] = round(tot_sa, 6)
        if tot_end != 0:
            entry["end"] = tot_end
        if abs(tot_ew - 1.0) > 1e-4:
            entry["ew"] = round(tot_ew, 4)
        armors[str(rid)] = entry

    talismans: Dict[str, Dict[str, Any]] = {}
    for rid, r in acc_rows:
        nm = acc_names.get(rid, "")
        if not nm:
            continue
        sid = _s32(r, 4)
        st_b, m_b, sa_b, cond_id = _extract_sp_bonuses(sid, sp_map)
        end_b, ew_r = _extract_sp_equip_load(sid, sp_map)
        cm = None
        if cond_id > 0:
            c_st, c_m, c_sa, _ = _extract_sp_bonuses(cond_id, sp_map)
            if any(abs(m - 1.0) > 1e-4 for m in c_m):
                cm = c_m
            for k in range(5):
                st_b[k] += c_st[k]
            sa_b *= c_sa

        w_val = round(_f32(r, 12), 2)
        entry = {"n": nm}
        if math.isfinite(w_val) and w_val > 0.0:
            entry["w"] = w_val
        if any(x != 0 for x in st_b):
            entry["st"] = st_b
        if any(abs(m - 1.0) > 1e-4 for m in m_b):
            entry["m"] = m_b
        if abs(sa_b - 1.0) > 1e-4:
            entry["sa"] = round(sa_b, 6)
        if end_b != 0:
            entry["end"] = end_b
        if abs(ew_r - 1.0) > 1e-4:
            entry["ew"] = round(ew_r, 4)
        if cm:
            entry["cm"] = cm
        talismans[str(rid)] = entry

    greases: List[Dict[str, Any]] = []
    seen_grease_sp: Set[int] = set()
    for gid, r in goods_rows:
        nm = goods_names.get(gid, "")
        if not nm or "grease" not in nm.lower():
            continue
        ref_def = _s32(r, 4)
        if not (513800 <= ref_def <= 515700):
            continue
        sp_id = ref_def + 2
        sr = sp_map.get(sp_id)
        if sr is None or _u8(sr, 344) != 1 or sp_id in seen_grease_sp:
            continue
        seen_grease_sp.add(sp_id)
        flat = [_s32(sr, 88), _s32(sr, 92), _s32(sr, 96), _s32(sr, 100), _s32(sr, 484)]
        rate = [
            round(_safe_rate(_f32(sr, 72)), 6),
            round(_safe_rate(_f32(sr, 76)), 6),
            round(_safe_rate(_f32(sr, 80)), 6),
            round(_safe_rate(_f32(sr, 84)), 6),
            round(_safe_rate(_f32(sr, 480)), 6),
        ]
        st_vals = [0, 0, 0, 0, 0, 0, 0]
        atk_sp = _s32(sr, 300)
        ar_sr = sp_map.get(atk_sp)
        if ar_sr is not None:
            st_vals = [
                _s32(ar_sr, 212),
                _s32(ar_sr, 204),
                _s32(ar_sr, 208),
                _s32(ar_sr, 424),
                _s32(ar_sr, 824),
                _s32(ar_sr, 828),
                _s32(ar_sr, 216),
            ]
        greases.append({"id": gid, "name": nm, "flat": flat, "rate": rate, "status": st_vals})

    magic_ids: Set[int] = {int(mid) for mid, _mr in magic_rows} if magic_rows else set()
    spells: Dict[str, Dict[str, Any]] = {}
    for gid, gr in goods_rows:
        if magic_ids:
            if gid not in magic_ids:
                continue
        elif not (4000 <= gid <= 9999):
            continue
        snm = goods_names.get(gid, "").strip()
        if not snm or "[ERROR]" in snm.upper():
            continue
        spells[str(gid)] = {"n": snm, "ic": _u16(gr, 48)}

    npc_def: Dict[str, List[int]] = {}
    boss_presets: List[Dict[str, Any]] = []
    if "npcparam.param" in params:
        npc_rows = parse_param_rows(params["npcparam.param"], 736)
        npc_map_meta, boss_marker_names = _load_npc_meta_for_extractor()
        bad_terms = ("dummy", "buddystone", "human", "test")
        by_clean_name: Dict[str, Tuple[int, int, List[int], List[int]]] = {}
        for nid, nr in npc_rows:
            defs = [_u16(nr, o) for o in (364, 368, 370, 372, 374)]
            negs: List[int] = []
            for o in (420, 424, 428, 432, 436, 440, 444, 448):
                cut = _f32(nr, o)
                pct = int(round((1.0 - cut) * 100.0)) if math.isfinite(cut) else 0
                negs.append(max(-200, min(100, pct)))
            npc_def[str(nid)] = defs + negs

            nm = npc_map_meta.get(nid, "")
            if not nm or len(nm) < 3:
                continue
            nl = nm.lower()
            if any(bt in nl for bt in bad_terms):
                continue
            is_boss = 1 if (nl in boss_marker_names or "(boss)" in nl) else 0
            # Prefer boss-tagged or higher-defense variant when multiple NPC rows share a display name
            score = (is_boss * 10000) + sum(defs)
            prev = by_clean_name.get(nm)
            if prev is None or score > prev[0]:
                by_clean_name[nm] = (score, nid, defs, negs)

        for nm, (score, nid, defs, negs) in sorted(
            by_clean_name.items(),
            key=lambda kv: (0 if kv[1][0] >= 10000 else 1, kv[0].lower()),
        ):
            boss_presets.append({
                "id": nid,
                "n": nm,
                "b": 1 if score >= 10000 else 0,
                "d": defs,
                "g": negs,
            })
    elif fallback_data:
        npc_def = dict(fallback_data.get("npcDef") or {})
        boss_presets = list(fallback_data.get("bossPresets") or [])

    return {
        "mod": _detect_mod_label(mod_dir, fallback_data, mod_label),
        "weaponTypes": {str(k): v for k, v in sorted(weapon_types.items())},
        "affinities": ["Unique"] + list(AFFINITY_BY_OFFSET.values()),
        "gradeTable": grade_table,
        "weapons": weapons,
        "reinforce": reinforce,
        "ccg": ccg,
        "aec": aec,
        "spStatus": sp_status,
        "armors": armors,
        "talismans": talismans,
        "greases": greases,
        "ammo": ammo,
        "spells": spells,
        "npcDef": npc_def,
        "bossPresets": boss_presets,
    }


def write_weapon_payload(payload: Dict[str, Any], out_path: str) -> str:
    """Atomically write err_weapon_data.json.gz to out_path."""
    out_abs = os.path.abspath(out_path)
    tmp = out_abs + ".tmp"
    with gzip.open(tmp, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    os.replace(tmp, out_abs)
    return out_abs


def extract_from_regulation(
    reg_path: str,
    out_path: str,
    fallback_data: Optional[Dict[str, Any]] = None,
    game_dir: Optional[str] = None,
    mod_label: Optional[str] = None,
) -> Dict[str, Any]:
    """Decrypt regulation.bin, build payload, write err_weapon_data.json.gz, and return it."""
    reg_abs = os.path.abspath(reg_path)
    mod_dir = os.path.dirname(reg_abs)
    params = unpack_regulation_params(reg_abs, game_dir=game_dir)
    payload = build_weapon_payload_from_params(
        params,
        mod_dir=mod_dir,
        game_dir=game_dir,
        fallback_data=fallback_data,
        mod_label=mod_label,
    )
    write_weapon_payload(payload, out_path)
    return payload
