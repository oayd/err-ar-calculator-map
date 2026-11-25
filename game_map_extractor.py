"""
Standalone pure-Python extractor for official Elden Ring map tiles and UI icons.
Reads only the 5 required menu archives directly from ELDEN RING/Game/Data0.bhd+bdt
using the user's local oo2core_6_win64.dll (no Smithbox, UXM, or CLI tools needed).

Outputs inside <out_base_dir>:
  - map_cache/map_m00.jpg, map_cache/map_m01.jpg, map_cache/map_m10.jpg (4096x4096)
  - map_cache/tiles/{m00,m01,m10}/{0..7}_{0..7}.jpg (8x8 native L0 1312x1312 zoom tiles)
  - err_map_icons.json.gz (base64 PNG map & UI icons)
"""

import base64
import ctypes
from ctypes import POINTER, byref, c_int, c_size_t, c_ssize_t, c_ubyte, c_uint32, c_void_p, c_wchar_p
import gzip
import io
import json
import os
import re
import struct
import xml.etree.ElementTree as ET
import zlib
from collections import defaultdict
from typing import Callable, Dict, List, Optional, Tuple

from PIL import Image
import texture2ddecoder

try:
    import winreg
except ImportError:
    winreg = None


DATA0_RSA_PEM = """-----BEGIN RSA PUBLIC KEY-----
MIIBCwKCAQEA9Rju2whruXDVQZpfylVEPeNxm7XgMHcDyaaRUIpXQE0qEo+6Y36L
P0xpFvL0H0kKxHwpuISsdgrnMHJ/yj4S61MWzhO8y4BQbw/zJehhDSRCecFJmFBz
3I2JC5FCjoK+82xd9xM5XXdfsdBzRiSghuIHL4qk2WZ/0f/nK5VygeWXn/oLeYBL
jX1S8wSSASza64JXjt0bP/i6mpV2SLZqKRxo7x2bIQrR1yHNekSF2jBhZIgcbtMB
xjCywn+7p954wjcfjxB5VWaZ4hGbKhi1bhYPccht4XnGhcUTWO3NmJWslwccjQ4k
sutLq3uRjLMM0IeTkQO6Pv8/R7UNFtdCWwIERzH8IQ==
-----END RSA PUBLIC KEY-----"""

TARGET_MAP_PATHS = (
    "/menu/71_maptile.mtmskbnd.dcx",
    "/menu/71_maptile.tpfbhd",
    "/menu/71_maptile.tpfbdt",
    "/menu/hi/01_common.sblytbnd.dcx",
    "/menu/hi/01_common.tpf.dcx",
    "/menu/hi/00_solo.tpfbhd",
    "/menu/hi/00_solo.tpfbdt",
)


def is_valid_game_dir(path: Optional[str]) -> bool:
    if not path or not os.path.isdir(path):
        return False
    return (
        os.path.isfile(os.path.join(path, "Data0.bhd"))
        and os.path.isfile(os.path.join(path, "Data0.bdt"))
        and os.path.isfile(os.path.join(path, "oo2core_6_win64.dll"))
    )


def normalize_game_dir(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    p = os.path.abspath(path)
    if is_valid_game_dir(p):
        return p
    sub = os.path.join(p, "Game")
    if is_valid_game_dir(sub):
        return sub
    return None


def detect_elden_ring_game_dir() -> Optional[str]:
    steam_roots: List[str] = []
    if winreg is not None:
        reg_queries = (
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
            (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        )
        for hive, subkey, valname in reg_queries:
            try:
                with winreg.OpenKey(hive, subkey) as k:
                    val, _ = winreg.QueryValueEx(k, valname)
                    if isinstance(val, str) and os.path.isdir(val):
                        steam_roots.append(os.path.abspath(val))
            except OSError:
                pass

    lib_roots: List[str] = []
    seen = set()

    def add_lib(p: str):
        if not p:
            return
        ap = os.path.abspath(p.replace("\\\\", "\\"))
        k = ap.lower()
        if k not in seen:
            seen.add(k)
            lib_roots.append(ap)

    for sr in steam_roots:
        add_lib(sr)
        vdf = os.path.join(sr, "steamapps", "libraryfolders.vdf")
        if os.path.isfile(vdf):
            try:
                with open(vdf, "r", encoding="utf-8", errors="ignore") as fh:
                    txt = fh.read()
                for m in re.finditer(r'"path"\s+"([^"]+)"', txt):
                    add_lib(m.group(1))
            except OSError:
                pass

    for drive in ("C", "D", "E", "F", "G", "H"):
        add_lib(rf"{drive}:\Program Files (x86)\Steam")
        add_lib(rf"{drive}:\Program Files\Steam")
        add_lib(rf"{drive}:\SteamLibrary")
        add_lib(rf"{drive}:\Steam")

    for lr in lib_roots:
        cand = os.path.join(lr, "steamapps", "common", "ELDEN RING", "Game")
        if is_valid_game_dir(cand):
            return cand
    return None


def _hash64(path: str) -> int:
    h = 0
    for c in path.lower().replace("\\", "/"):
        h = (h * 133 + ord(c)) & 0xFFFFFFFFFFFFFFFF
    return h


def _parse_rsa_public_pem(pem: str) -> Tuple[int, int]:
    b64 = "".join(ln.strip() for ln in pem.splitlines() if ln.strip() and not ln.strip().startswith("-----"))
    der = base64.b64decode(b64)

    def read_len(pos: int) -> Tuple[int, int]:
        b = der[pos]
        pos += 1
        if b < 0x80:
            return b, pos
        nbytes = b & 0x7F
        val = int.from_bytes(der[pos : pos + nbytes], "big")
        return val, pos + nbytes

    assert der[0] == 0x30
    _, pos = read_len(1)
    assert der[pos] == 0x02
    n_len, pos = read_len(pos + 1)
    n = int.from_bytes(der[pos : pos + n_len], "big")
    pos += n_len
    assert der[pos] == 0x02
    e_len, pos = read_len(pos + 1)
    e = int.from_bytes(der[pos : pos + e_len], "big")
    return n, e


def _decrypt_bhd5(bhd_path: str, pem: str) -> bytes:
    with open(bhd_path, "rb") as fh:
        enc = fh.read()
    if enc[:4] == b"BHD5":
        return enc
    n, e = _parse_rsa_public_pem(pem)
    block_in = (n.bit_length() + 7) // 8
    out = bytearray()
    for off in range(0, len(enc), block_in):
        chunk = enc[off : off + block_in]
        if len(chunk) < block_in:
            break
        m = pow(int.from_bytes(chunk, "big"), e, n)
        out.extend(m.to_bytes(block_in, "big")[1:])
    if out[:4] != b"BHD5":
        raise RuntimeError("Failed to decrypt Data0.bhd (unexpected header).")
    return bytes(out)


def _aes_ecb_decrypt_ranges(data: bytes, key: bytes, ranges: List[Tuple[int, int]]) -> bytes:
    valid = [(max(0, s), min(len(data), e)) for s, e in ranges if s >= 0 and e > s]
    if not valid:
        return data

    bcrypt = ctypes.WinDLL("bcrypt.dll")
    h_alg = c_void_p()
    h_key = c_void_p()
    status = bcrypt.BCryptOpenAlgorithmProvider(byref(h_alg), c_wchar_p("AES"), None, 0)
    if status != 0:
        raise RuntimeError(f"BCryptOpenAlgorithmProvider failed: 0x{status & 0xFFFFFFFF:X}")
    buf = bytearray(data)
    try:
        mode = "ChainingModeECB\0".encode("utf-16-le")
        status = bcrypt.BCryptSetProperty(
            h_alg, c_wchar_p("ChainingMode"), ctypes.create_string_buffer(mode, len(mode)), len(mode), 0
        )
        if status != 0:
            raise RuntimeError(f"BCryptSetProperty failed: 0x{status & 0xFFFFFFFF:X}")
        key_buf = (c_ubyte * len(key))(*key)
        status = bcrypt.BCryptGenerateSymmetricKey(h_alg, byref(h_key), None, 0, key_buf, len(key), 0)
        if status != 0:
            raise RuntimeError(f"BCryptGenerateSymmetricKey failed: 0x{status & 0xFFFFFFFF:X}")

        out_len = c_uint32()
        for start, end in valid:
            n = ((end - start) // 16) * 16
            if n <= 0:
                continue
            chunk = (c_ubyte * n).from_buffer_copy(buf, start)
            status = bcrypt.BCryptDecrypt(h_key, chunk, n, None, None, 0, chunk, n, byref(out_len), 0)
            if status != 0:
                raise RuntimeError(f"BCryptDecrypt failed: 0x{status & 0xFFFFFFFF:X}")
            buf[start : start + n] = bytes(chunk)
    finally:
        if h_key.value:
            bcrypt.BCryptDestroyKey(h_key)
        if h_alg.value:
            bcrypt.BCryptCloseAlgorithmProvider(h_alg, 0)
    return bytes(buf)


def _find_bhd_entries(bhd_raw: bytes, paths: Tuple[str, ...]) -> Dict[str, dict]:
    wanted = {_hash64(p): p for p in paths}
    bucket_count, buckets_offset = struct.unpack_from("<II", bhd_raw, 16)
    found: Dict[str, dict] = {}
    for bi in range(bucket_count):
        cnt, entries_off = struct.unpack_from("<II", bhd_raw, buckets_offset + bi * 8)
        for i in range(cnt):
            eoff = entries_off + i * 40
            fhash, padded_sz, unpadded_sz, file_off, _sha_off, aes_off = struct.unpack_from("<QIIQQQ", bhd_raw, eoff)
            if fhash in wanted:
                p = wanted[fhash]
                key = b""
                ranges: List[Tuple[int, int]] = []
                if aes_off > 0:
                    key = bhd_raw[aes_off : aes_off + 16]
                    rcnt = struct.unpack_from("<i", bhd_raw, aes_off + 16)[0]
                    for ri in range(max(0, rcnt)):
                        s, e = struct.unpack_from("<qq", bhd_raw, aes_off + 20 + ri * 16)
                        ranges.append((s, e))
                found[p] = {
                    "offset": file_off,
                    "padded": padded_sz,
                    "unpadded": unpadded_sz,
                    "key": key,
                    "ranges": ranges,
                }
    return found


def _load_oodle(game_dir: str):
    dll_path = os.path.join(game_dir, "oo2core_6_win64.dll")
    lib = ctypes.WinDLL(dll_path)
    decomp = lib.OodleLZ_Decompress
    decomp.argtypes = [
        c_void_p,
        c_ssize_t,
        c_void_p,
        c_ssize_t,
        c_int,
        c_int,
        c_int,
        c_void_p,
        c_ssize_t,
        c_void_p,
        c_void_p,
        c_void_p,
        c_ssize_t,
        c_int,
    ]
    decomp.restype = c_ssize_t
    return decomp


def _dcx_decompress(raw: bytes, oodle_fn) -> bytes:
    if raw[:4] != b"DCX\x00":
        return raw
    uncomp_sz, comp_sz = struct.unpack_from(">II", raw, 0x1C)
    comp_type = raw[0x28:0x2C]
    dca_pos = raw.find(b"DCA\x00", 0x2C, 0x90)
    if dca_pos < 0:
        raise RuntimeError("Invalid DCX container (missing DCA chunk).")
    payload_off = dca_pos + 8
    payload = raw[payload_off : payload_off + comp_sz]
    if comp_type == b"KRAK":
        src = (c_ubyte * len(payload)).from_buffer_copy(payload)
        dst = (c_ubyte * uncomp_sz)()
        res = oodle_fn(src, len(payload), dst, uncomp_sz, 0, 0, 0, None, 0, None, None, None, 0, 3)
        if res != uncomp_sz:
            raise RuntimeError(f"OodleLZ_Decompress returned {res}, expected {uncomp_sz}")
        return bytes(dst)
    if comp_type == b"DFLT":
        return zlib.decompress(payload)
    raise RuntimeError(f"Unsupported DCX compression type: {comp_type!r}")


def _read_cstr(data: bytes, off: int, unicode: bool) -> str:
    if off < 0 or off >= len(data):
        return ""
    if unicode:
        end = off
        while end + 1 < len(data):
            if data[end] == 0 and data[end + 1] == 0:
                break
            end += 2
        return data[off:end].decode("utf-16-le", errors="ignore")
    end = data.find(b"\x00", off)
    if end < 0:
        end = len(data)
    return data[off:end].decode("shift_jis", errors="ignore")


def _parse_bnd4_entries(data: bytes) -> List[Tuple[str, int, int, int]]:
    magic = data[:4]
    if magic not in (b"BND4", b"BHF4"):
        raise RuntimeError(f"Expected BND4/BHF4 header, got {magic!r}")
    file_count = struct.unpack_from("<I", data, 12)[0]
    hdr_size = struct.unpack_from("<q", data, 16)[0]
    entry_size = struct.unpack_from("<q", data, 32)[0]
    is_unicode = data[49] != 0
    out: List[Tuple[str, int, int, int]] = []
    for i in range(file_count):
        off = hdr_size + i * entry_size
        if entry_size >= 40:
            _flags, _pad, comp_sz, uncomp_sz, data_off, _id, name_off = struct.unpack_from("<IiQQQiI", data, off)
        else:
            _flags, _pad, comp_sz, uncomp_sz, data_off, _id, name_off = struct.unpack_from("<IiQQIiI", data, off)
        name = _read_cstr(data, name_off, is_unicode)
        out.append((name, data_off, comp_sz, uncomp_sz))
    return out


def _parse_tpf(data: bytes) -> Dict[str, bytes]:
    if data[:4] != b"TPF\x00":
        raise RuntimeError(f"Expected TPF header, got {data[:4]!r}")
    tex_count = struct.unpack_from("<I", data, 8)[0]
    encoding = data[14]
    is_unicode = encoding == 1
    pos = 16
    textures: Dict[str, bytes] = {}
    for _ in range(tex_count):
        d_off, d_sz, _fmt, _ttype, _mips, _f1, name_off, f2 = struct.unpack_from("<IIBBBBII", data, pos)
        pos += 20
        if f2 == 1:
            pos += 8
        name = _read_cstr(data, name_off, is_unicode)
        if name:
            textures[name.lower()] = data[d_off : d_off + d_sz]
    return textures


def _decode_dds_rgba(dds: bytes) -> Optional[Image.Image]:
    if dds[:4] != b"DDS ":
        return None
    h, w = struct.unpack_from("<II", dds, 12)
    fourcc = dds[84:88]
    if fourcc == b"DX10":
        dxgi = struct.unpack_from("<I", dds, 128)[0]
        pix = dds[148:]
        if dxgi in (98, 99):  # BC7_UNORM / SRGB
            raw = texture2ddecoder.decode_bc7(pix, w, h)
            return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA")
        if dxgi in (71, 72):  # BC1
            raw = texture2ddecoder.decode_bc1(pix, w, h)
            return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA")
        if dxgi in (77, 78):  # BC3
            raw = texture2ddecoder.decode_bc3(pix, w, h)
            return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA")
        if dxgi in (87, 91):  # BGRA8
            return Image.frombytes("RGBA", (w, h), pix[: w * h * 4], "raw", "BGRA")
    elif fourcc == b"DXT1":
        raw = texture2ddecoder.decode_bc1(dds[128:], w, h)
        return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA")
    elif fourcc == b"DXT5":
        raw = texture2ddecoder.decode_bc3(dds[128:], w, h)
        return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA")
    try:
        return Image.open(io.BytesIO(dds)).convert("RGBA")
    except Exception:
        return None


def _read_bdt_entry(bdt_fh, entry: dict) -> bytes:
    bdt_fh.seek(entry["offset"])
    buf = bdt_fh.read(entry["padded"])
    if entry["key"]:
        buf = _aes_ecb_decrypt_ranges(buf, entry["key"], entry["ranges"])
    if entry["unpadded"] > 0 and entry["unpadded"] < len(buf):
        buf = buf[: entry["unpadded"]]
    return buf


def _tint_rgba(im: Image.Image, tint: Optional[Tuple[float, float, float]]) -> Image.Image:
    if tint is None:
        return im
    r_t, g_t, b_t = tint
    r, g, b, a = im.split()
    r = r.point(lambda v: min(255, max(0, int(round(v * r_t)))))
    g = g.point(lambda v: min(255, max(0, int(round(v * g_t)))))
    b = b.point(lambda v: min(255, max(0, int(round(v * b_t)))))
    return Image.merge("RGBA", (r, g, b, a))


def extract_maps_and_icons(
    game_dir: str,
    out_base_dir: str,
    progress_cb: Optional[Callable[[int, str], None]] = None,
) -> dict:
    def report(pct: int, msg: str):
        if progress_cb is not None:
            progress_cb(max(0, min(100, int(pct))), msg)

    game_dir = normalize_game_dir(game_dir) or ""
    if not is_valid_game_dir(game_dir):
        raise FileNotFoundError("Selected folder does not contain Data0.bhd, Data0.bdt, and oo2core_6_win64.dll.")

    report(2, "Reading Elden Ring Data0 archive index...")
    bhd_raw = _decrypt_bhd5(os.path.join(game_dir, "Data0.bhd"), DATA0_RSA_PEM)
    entries = _find_bhd_entries(bhd_raw, TARGET_MAP_PATHS)
    missing = [p for p in TARGET_MAP_PATHS if p not in entries]
    if missing:
        raise FileNotFoundError(f"Missing expected files in Data0.bhd: {', '.join(missing)}")

    oodle_fn = _load_oodle(game_dir)
    map_cache_dir = os.path.join(out_base_dir, "map_cache")
    os.makedirs(map_cache_dir, exist_ok=True)
    icons_out_path = os.path.join(out_base_dir, "err_map_icons.json.gz")

    bdt_path = os.path.join(game_dir, "Data0.bdt")
    with open(bdt_path, "rb") as bdt:
        report(8, "Reading map tile masks & headers...")
        mtm_raw = _dcx_decompress(_read_bdt_entry(bdt, entries["/menu/71_maptile.mtmskbnd.dcx"]), oodle_fn)
        mtm_masks = defaultdict(dict)
        for name, data_off, comp_sz, _uncomp in _parse_bnd4_entries(mtm_raw):
            bn = os.path.basename(name).lower()
            if bn.startswith("menu_maptile_m") and bn.endswith(".mtmsk"):
                layer = bn.split("_")[2].split(".")[0]
                xml_bytes = mtm_raw[data_off : data_off + comp_sz]
                root = ET.fromstring(xml_bytes.decode("utf-8"))
                for el in root.findall("MapTileMask"):
                    if el.attrib.get("exists") == "1":
                        mid = int(el.attrib["id"])
                        if mid // 10000 == 0:
                            tx = (mid % 10000) // 100
                            tz = mid % 100
                            mtm_masks[layer][(tx, tz)] = int(el.attrib["mask"])

        tpfbhd_raw = _read_bdt_entry(bdt, entries["/menu/71_maptile.tpfbhd"])
        l0_tiles = defaultdict(dict)
        for name, data_off, comp_sz, _uncomp in _parse_bnd4_entries(tpfbhd_raw):
            bn = os.path.basename(name).lower().replace(".tpf.dcx", "").replace(".tpf", "")
            parts = bn.split("_")
            if len(parts) >= 7 and parts[0] == "menu" and parts[1] == "maptile" and parts[3] == "l0":
                try:
                    layer = parts[2]
                    tx = int(parts[4])
                    tz = int(parts[5])
                    mask = int(parts[6], 16)
                    l0_tiles[(layer, tx, tz)][mask] = (data_off, comp_sz)
                except ValueError:
                    continue

        tpfbdt_base = entries["/menu/71_maptile.tpfbdt"]["offset"]
        grid_n = 41
        full_px = grid_n * 256  # 10496
        tile_grid = 8
        tile_px = full_px // tile_grid  # 1312

        layers = (("m00", "The Lands Between", 12, 36), ("m01", "Underground", 36, 56), ("m10", "Realm of Shadow (DLC)", 56, 78))
        for layer, title, p_start, p_end in layers:
            report(p_start, f"Stitching {title} ({layer}) L0 tiles...")
            master = Image.new("RGB", (full_px, full_px), (14, 18, 22))
            lmasks = mtm_masks.get(layer, {})
            for tx in range(grid_n):
                pct = p_start + ((p_end - p_start) * 0.72 * (tx / grid_n))
                if tx % 4 == 0:
                    report(int(pct), f"Decoding {title} ({layer}) tiles... {tx}/{grid_n}")
                for tz in range(grid_n):
                    fmap = l0_tiles.get((layer, tx, tz))
                    if not fmap:
                        continue
                    wanted_mask = lmasks.get((tx, tz), 0)
                    loc = fmap.get(wanted_mask) or fmap.get(0) or next(iter(fmap.values()))
                    d_off, d_sz = loc
                    bdt.seek(tpfbdt_base + d_off)
                    tile_blob = bdt.read(d_sz)
                    if tile_blob[:4] == b"DCX\x00":
                        tile_blob = _dcx_decompress(tile_blob, oodle_fn)
                    tpf_texs = _parse_tpf(tile_blob)
                    if not tpf_texs:
                        continue
                    dds_bytes = next(iter(tpf_texs.values()))
                    im = _decode_dds_rgba(dds_bytes)
                    if im is None or im.size != (256, 256):
                        continue
                    px_x = tx * 256
                    px_y = (grid_n - 1 - tz) * 256
                    master.paste(im.convert("RGB"), (px_x, px_y))

            ov_pct = int(p_start + (p_end - p_start) * 0.78)
            report(ov_pct, f"Saving {title} 4096px overview & 64 high-res zoom tiles...")
            ov = master.resize((4096, 4096), Image.Resampling.LANCZOS)
            ov.save(os.path.join(map_cache_dir, f"map_{layer}.jpg"), "JPEG", quality=90, subsampling=0)
            ov.close()

            tiles_dir = os.path.join(map_cache_dir, "tiles", layer)
            os.makedirs(tiles_dir, exist_ok=True)
            for cy in range(tile_grid):
                for cx in range(tile_grid):
                    crop = master.crop((cx * tile_px, cy * tile_px, (cx + 1) * tile_px, (cy + 1) * tile_px))
                    crop.save(os.path.join(tiles_dir, f"{cx}_{cy}.jpg"), "JPEG", quality=90, subsampling=0)
                    crop.close()
            master.close()

        report(80, "Extracting official map & UI icons from 01_common...")
        sbl_raw = _dcx_decompress(_read_bdt_entry(bdt, entries["/menu/hi/01_common.sblytbnd.dcx"]), oodle_fn)
        tpf_raw = _dcx_decompress(_read_bdt_entry(bdt, entries["/menu/hi/01_common.tpf.dcx"]), oodle_fn)

    tex_by_name = _parse_tpf(tpf_raw)
    wanted_layouts = {
        "SB_MapCursor.layout",
        "SB_MapCursor_02.layout",
        "SB_MapCursor_03_dlc.layout",
        "SB_Tab.layout",
        "SB_Title_01.layout",
    }
    sprites: Dict[str, Tuple[str, int, int, int, int]] = {}
    sheets: Dict[str, Image.Image] = {}
    for name, data_off, comp_sz, _uncomp in _parse_bnd4_entries(sbl_raw):
        fn = os.path.basename(name)
        if fn not in wanted_layouts:
            continue
        root = ET.fromstring(sbl_raw[data_off : data_off + comp_sz].decode("utf-8"))
        img_path = root.attrib.get("imagePath", "")
        tkey = os.path.splitext(os.path.basename(img_path))[0].lower()
        if tkey not in tex_by_name:
            continue
        if tkey not in sheets:
            sheet_im = _decode_dds_rgba(tex_by_name[tkey])
            if sheet_im is None:
                continue
            sheets[tkey] = sheet_im
        for st in root.findall(".//SubTexture"):
            nm = st.attrib.get("name", "")
            if nm:
                sprites[nm] = (
                    tkey,
                    int(st.attrib["x"]),
                    int(st.attrib["y"]),
                    int(st.attrib["width"]),
                    int(st.attrib["height"]),
                )

    def sprite_to_data_url(sprite_name: str, max_dim: int = 56, tint=None) -> str:
        info = sprites.get(sprite_name)
        if not info:
            return ""
        tkey, sx, sy, sw, sh = info
        src = sheets.get(tkey)
        if src is None or sw <= 0 or sh <= 0:
            return ""
        crop = src.crop((sx, sy, sx + sw, sy + sh))
        scale = min(1.0, float(max_dim) / max(sw, sh))
        dw = max(1, int(round(sw * scale)))
        dh = max(1, int(round(sh * scale)))
        if (dw, dh) != (sw, sh):
            crop = crop.resize((dw, dh), Image.Resampling.LANCZOS)
        crop = _tint_rgba(crop, tint)
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        crop.close()
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    icons: Dict[str, str] = {}
    category_map = [
        ("grace", "MENU_MAP_01_Bonfire.png", None),
        ("boss", "MENU_MAP_memo_20.png", (1.25, 0.42, 0.45)),
        ("weapon", "MENU_Tab_Weapon.png", (1.15, 0.95, 0.85)),
        ("talisman", "MENU_40366_Talisman.png", (0.75, 1.25, 0.85)),
        ("armor", "MENU_Tab_Armor.png", (0.78, 1.02, 1.25)),
        ("merchant", "MENU_MAP_80.png", None),
        ("player", "MENU_MAP_Player_02.png", None),
        ("player_arrow", "MENU_MAP_Player_01.png", None),
        ("poi", "MENU_MAP_05.png", None),
        ("beacon", "MENU_MAP_Marker.png", None),
    ]
    for idx in range(10):
        category_map.append((f"memo_{idx}", f"MENU_MAP_memo_{20 + idx}.png", None))
    for key, sp_name, tint in category_map:
        url = sprite_to_data_url(sp_name, max_dim=56, tint=tint)
        if url:
            icons[key] = url

    for sp_name in sorted(sprites.keys()):
        m = re.match(r"^MENU_MAP_(\d+)\.png$", sp_name)
        if m:
            iid = int(m.group(1))
            if iid in (1, 80, 83, 84, 86, 87, 88):
                continue
            url = sprite_to_data_url(sp_name, max_dim=56)
            if url:
                icons[f"wmp_{iid}"] = url

    church_url = sprite_to_data_url("MENU_MAP_Church.png", max_dim=56)
    if church_url:
        icons["wmp_3"] = church_url

    for sbmp in sheets.values():
        sbmp.close()

    report(90, "Extracting collectible & bell bearing icons from 00_solo...")
    want_good_icons = {383, 384, 400, 553, 3020, 3021, 3022, 3023, 3090, 3142, 3143, 3144, 3146, 3816, 3817} | set(range(400, 446))
    for cand_base in (out_base_dir, os.path.dirname(os.path.abspath(__file__))):
        mp_json = os.path.join(cand_base, "err_map_data.json.gz")
        if os.path.isfile(mp_json):
            try:
                with gzip.open(mp_json, "rt", encoding="utf-8") as fh:
                    mj = json.load(fh)
                for mk in mj.get("markers", []):
                    gi = mk.get("goodIcon")
                    if isinstance(gi, int) and gi > 0:
                        want_good_icons.add(gi)
            except Exception:
                pass

    with open(bdt_path, "rb") as bdt:
        solo_bhd_raw = _read_bdt_entry(bdt, entries["/menu/hi/00_solo.tpfbhd"])
        solo_bdt_base = entries["/menu/hi/00_solo.tpfbdt"]["offset"]
        for name, d_off, c_sz, _u_sz in _parse_bnd4_entries(solo_bhd_raw):
            m = re.search(r"MENU_Knowledge_(\d+)", name, re.I)
            if not m:
                continue
            iid = int(m.group(1))
            if iid not in want_good_icons or f"good_{iid}" in icons:
                continue
            bdt.seek(solo_bdt_base + d_off)
            blob = bdt.read(c_sz)
            if blob[:4] == b"DCX\x00":
                blob = _dcx_decompress(blob, oodle_fn)
            tpf_texs = _parse_tpf(blob)
            if not tpf_texs:
                continue
            im = _decode_dds_rgba(next(iter(tpf_texs.values())))
            if im is None:
                continue
            scale = min(1.0, 48.0 / max(im.width, im.height))
            dw, dh = max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))
            if (dw, dh) != im.size:
                resized = im.resize((dw, dh), Image.Resampling.LANCZOS)
                im.close()
                im = resized
            buf = io.BytesIO()
            im.save(buf, format="PNG")
            im.close()
            icons[f"good_{iid}"] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    for cat_key, default_id in (
        ("bell_bearing", 3142),
        ("golden_seed", 383),
        ("sacred_tear", 384),
        ("scadutree", 3816),
        ("revered_ash", 3817),
        ("crystal_tear", 400),
        ("memory_stone", 553),
        ("whetblade", 3020),
    ):
        gkey = f"good_{default_id}"
        if gkey in icons and cat_key not in icons:
            icons[cat_key] = icons[gkey]

    with gzip.open(icons_out_path, "wt", encoding="utf-8", compresslevel=6) as fh:
        json.dump(icons, fh, separators=(",", ":"))

    report(100, f"Extracted 3 map layers & {len(icons)} game icons!")
    return {
        "ok": True,
        "layers": ["m00", "m01", "m10"],
        "iconCount": len(icons),
        "gameDir": game_dir,
    }
