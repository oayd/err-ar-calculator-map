"""
Extracts all ERR v2.3.9.1 map markers (Graces, Weapons, Talismans, Armor, Bosses,
Merchants, Landmarks) and optionally stitches the 4096x4096 real in-game map tiles
into map_cache/.

Outputs:
  - err_map_data.json.gz
  - map_cache/map_m00.jpg, map_cache/map_m01.jpg, map_cache/map_m10.jpg (with --maps)
"""

import argparse
import base64
import ctypes
import glob
import gzip
import io
import json
import math
import os
import re
import struct
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from ctypes import POINTER, byref, c_int32, c_size_t, c_void_p

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GAME = ""
SB = ""
ERR_MOD = ""
REG_PATH = ""
DEFS_DIR = ""
CRN_DIR = ""
MAPSTUDIO_DIR = ""
WEAPON_DATA_PATH = os.path.join(BASE_DIR, "err_weapon_data.json.gz")
OUT_PATH = os.path.join(BASE_DIR, "err_map_data.json.gz")
ICONS_OUT_PATH = os.path.join(BASE_DIR, "err_map_icons.json.gz")
MAP_CACHE_DIR = os.path.join(BASE_DIR, "map_cache")

Game = None
ArchiveBinderVirtualFileSystem = None
BND4Reader = FMG = MSBE = PARAM = PARAMDEF = SFUtil = SoulsFile = None


def init_soulsformats(game_dir: str, smithbox_dir: str):
    global Game, ArchiveBinderVirtualFileSystem, BND4Reader, FMG, MSBE, PARAM, PARAMDEF, SFUtil, SoulsFile
    os.environ["PATH"] = game_dir + ";" + smithbox_dir + ";" + os.environ.get("PATH", "")
    os.chdir(smithbox_dir)

    from pythonnet import load

    load("coreclr")
    import clr

    sys.path.append(smithbox_dir)
    clr.AddReference("Andre.SoulsFormats")
    clr.AddReference("Andre.Core")
    clr.AddReference("Andre.IO")
    clr.AddReference("System.Drawing.Common")

    from Andre.Core import Game as _Game
    from Andre.IO.VFS import ArchiveBinderVirtualFileSystem as _VFS
    from SoulsFormats import (
        BND4Reader as _BND4Reader,
        FMG as _FMG,
        MSBE as _MSBE,
        PARAM as _PARAM,
        PARAMDEF as _PARAMDEF,
        SFUtil as _SFUtil,
        SoulsFile as _SoulsFile,
    )

    Game = _Game
    ArchiveBinderVirtualFileSystem = _VFS
    BND4Reader = _BND4Reader
    FMG = _FMG
    MSBE = _MSBE
    PARAM = _PARAM
    PARAMDEF = _PARAMDEF
    SFUtil = _SFUtil
    SoulsFile = _SoulsFile

TAG_RE = re.compile(r"<[^>]+>")

# Exact engine calibrations for native 41x41 L0 (10496x10496) canvas & 8x8 tile pyramid:
#   Each L0 256x256 tile (tx, tz) renders overworld block (tx + 28, tz + 24) at exact 1 px/m.
#   West edge (tx=0): (28 - 0.5) * 256 = 7040.0
#   North edge (tz=40): (24 + 40 + 0.5) * 256 = 16512.0
#   Span (41 tiles): 41 * 256 = 10496.0
CALIBRATIONS = {
    "m00": {"ox": 7040.0, "oz": 16512.0, "span": 10496.0, "title": "The Lands Between"},
    "m01": {"ox": 7040.0, "oz": 16512.0, "span": 10496.0, "title": "Underground"},
    "m10": {"ox": 7040.0, "oz": 16512.0, "span": 10496.0, "title": "Realm of Shadow (DLC)"},
}

# Known merchant/vendor aliases matching Community Row Names ShopLineupParam "[Vendor]" blocks
KNOWN_VENDOR_MODELS = {"c3200", "c3210", "c3220"}
VENDOR_REGEX = re.compile(
    r"\b("
    r"merchant|kalé|kale|patches|gostoc|sellen|bernahl|boggart|gowry|"
    r"rogier|iji|seluvis|pidia|corhyn|miriel|twin maiden|enia|"
    r"d,\s*hunter|d\s+hunter|thops|gideon|thiollier|moore|lifesteal|blacksmith|hew"
    r")\b",
    re.IGNORECASE,
)

BAD_VENDOR_KEYWORDS = (
    "ash of war",
    "spell",
    "miracle",
    "incantation",
    "sorcery",
    "dragon communion",
)


def is_dummy_name(text: str) -> bool:
    if not text:
        return True
    tl = text.strip().lower()
    if not tl:
        return True
    if any(tok in tl for tok in ("dlc dummy", "[error]", "unused", "placeholder", "???")) or tl == "dummy":
        return True
    return False


def safe_int(row, col: str, default: int = 0) -> int:
    try:
        return int(row[col].Value)
    except Exception:
        return default


def clean_text(text: str) -> str:
    if not text:
        return ""
    s = TAG_RE.sub("", str(text))
    s = s.replace("\r", " ").replace("\n", " ").strip()
    s = re.sub(r"\s{2,}", " ", s)
    return "" if is_dummy_name(s) else s


def load_param(reg, pname: str, xml_name: str = None):
    xml_name = xml_name or pname
    pdef = PARAMDEF.XmlDeserialize(os.path.join(DEFS_DIR, xml_name + ".xml"))
    for f in reg.Files:
        if os.path.basename(f.Name).lower() == (pname + ".param").lower():
            p = SoulsFile[PARAM].Read(f.Bytes)
            p.ApplyParamdef(pdef)
            return p
    raise FileNotFoundError(f"Missing param {pname}")


def load_crn(filename: str) -> dict:
    p = os.path.join(CRN_DIR, filename)
    if not os.path.exists(p):
        return {}
    with open(p, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    out = {}
    for e in data.get("Entries", []):
        entries = e.get("Entries") or []
        if entries and entries[0]:
            out[int(e["ID"])] = str(entries[0]).strip()
    return out


def load_merged_fmgs(vfs) -> dict:
    fmgs = {}

    def ingest_reader(rdr):
        try:
            for fh in rdr.Files:
                fn = os.path.basename(fh.Name)
                if fn.endswith(".fmg"):
                    obj = SoulsFile[FMG].Read(rdr.ReadFile(fh))
                    bucket = fmgs.setdefault(fn, {})
                    for ent in obj.Entries:
                        if ent.Text:
                            txt = clean_text(ent.Text)
                            if txt:
                                bucket[int(ent.ID)] = txt
        finally:
            rdr.Dispose()

    bundles = (
        "item.msgbnd.dcx",
        "menu.msgbnd.dcx",
        "item_dlc01.msgbnd.dcx",
        "menu_dlc01.msgbnd.dcx",
        "item_dlc02.msgbnd.dcx",
        "menu_dlc02.msgbnd.dcx",
    )
    for bname in bundles:
        vp = f"/msg/engus/{bname}"
        if vfs.FileExists(vp):
            ingest_reader(BND4Reader(vfs.ReadFile(vp)))
    for bname in bundles:
        ep = os.path.join(ERR_MOD, "msg", "engus", bname)
        if os.path.exists(ep):
            ingest_reader(BND4Reader(ep))
    return fmgs


def fmg_lookup(fmgs: dict, keys, text_id: int) -> str:
    if text_id is None or text_id <= 0:
        return ""
    for k in keys:
        d = fmgs.get(k)
        if d and text_id in d:
            val = d[text_id]
            if val and not is_dummy_name(val):
                return val
    return ""


def build_legacy_converter(conv_param):
    """Build deterministic 3-pass WorldMapLegacyConvParam graph solver + overworld tile resolver."""
    direct_edges = defaultdict(list)
    hop_edges = defaultdict(list)
    rev_edges = defaultdict(list)

    for r in conv_param.Rows:
        if int(r["disableParam_NT"].Value) != 0:
            continue
        rid = int(r.ID)
        sa = int(r["srcAreaNo"].Value)
        sx = int(r["srcGridXNo"].Value)
        sz = int(r["srcGridZNo"].Value)
        da = int(r["dstAreaNo"].Value)
        dx = int(r["dstGridXNo"].Value)
        dz = int(r["dstGridZNo"].Value)
        if (sa, sx, sz) == (da, dx, dz) or da == 70:
            continue
        sx0 = float(r["srcPosX"].Value)
        sy0 = float(r["srcPosY"].Value)
        sz0 = float(r["srcPosZ"].Value)
        dx0 = float(r["dstPosX"].Value)
        dy0 = float(r["dstPosY"].Value)
        dz0 = float(r["dstPosZ"].Value)
        bp = int(r["isBasePoint"].Value)
        edge = (rid, bp, sx0, sy0, sz0, da, dx, dz, dx0, dy0, dz0)
        if da in (60, 61):
            direct_edges[(sa, sx, sz)].append(edge)
        else:
            hop_edges[(sa, sx, sz)].append(edge)
            rev_edges[(da, dx, dz)].append((rid, bp, dx0, dy0, dz0, sa, sx, sz, sx0, sy0, sz0))

    legacy_offset = {}

    # Pass 1: Direct connections into overworld 60/61 (prefer base point, then lowest row ID)
    for src, rows in direct_edges.items():
        rows.sort(key=lambda e: (0 if e[1] else 1, e[0]))
        rid, bp, sx0, sy0, sz0, da, dx, dz, dx0, dy0, dz0 = rows[0]
        legacy_offset[src] = (da, dx * 256.0 + dx0 - sx0, dy0 - sy0, dz * 256.0 + dz0 - sz0)

    # Pass 2: Forward BFS hops through connected dungeons
    changed = True
    while changed:
        changed = False
        for src, rows in hop_edges.items():
            if src in legacy_offset:
                continue
            for rid, bp, sx0, sy0, sz0, da, dx, dz, dx0, dy0, dz0 in sorted(rows, key=lambda e: (0 if e[1] else 1, e[0])):
                if (da, dx, dz) in legacy_offset:
                    fda, ox, oy, oz = legacy_offset[(da, dx, dz)]
                    legacy_offset[src] = (fda, ox + dx0 - sx0, oy + dy0 - sy0, oz + dz0 - sz0)
                    changed = True
                    break

    # Pass 3: Reverse hops for leaf maps only referenced as destinations
    changed = True
    while changed:
        changed = False
        for node, rows in rev_edges.items():
            if node in legacy_offset:
                continue
            for rid, bp, nx0, ny0, nz0, pa, px, pz, px0, py0, pz0 in sorted(rows, key=lambda e: (0 if e[1] else 1, e[0])):
                if (pa, px, pz) in legacy_offset:
                    fda, ox, oy, oz = legacy_offset[(pa, px, pz)]
                    legacy_offset[node] = (fda, ox + px0 - nx0, oy + py0 - ny0, oz + pz0 - nz0)
                    changed = True
                    break

    legacy_offsets_export = {
        f"{a}_{gx}_{gz}": [da, round(ox, 2), round(oz, 2)]
        for (a, gx, gz), (da, ox, oy, oz) in sorted(legacy_offset.items())
    }

    def resolve(
        area: int,
        gx: int,
        gz: int,
        px: float,
        py: float,
        pz: float,
        prefer_layer: str = None,
        sub_map: int = 0,
        is_msb: bool = False,
    ):
        if area in (60, 61):
            if sub_map == 99:
                return None
            tier = sub_map % 10
            if tier not in (0, 1, 2):
                return None
            tile_scale = 1 << tier
            wx = (gx * tile_scale + (tile_scale - 1) * 0.5) * 256.0 + px
            wz = (gz * tile_scale + (tile_scale - 1) * 0.5) * 256.0 + pz
            wy = py
            dst_area = area
        else:
            entry = legacy_offset.get((area, gx, gz))
            if entry is None:
                return None
            dst_area, off_x, off_y, off_z = entry
            if is_msb and area == 11 and gx == 10:
                if abs(px) > 500 or abs(pz) > 500:
                    return None
                px -= 2500.0
                pz -= 650.0
            wx = off_x + px
            wy = off_y + py
            wz = off_z + pz

        if dst_area == 61:
            layer = "m10"
        elif prefer_layer in ("m00", "m01"):
            layer = prefer_layer
        elif area == 12:
            layer = "m01"
        else:
            layer = "m00"

        cal = CALIBRATIONS[layer]
        u = (wx - cal["ox"]) / cal["span"]
        v = (cal["oz"] - wz) / cal["span"]
        if not (-0.08 <= u <= 1.08 and -0.08 <= v <= 1.08):
            return None
        return {
            "layer": layer,
            "u": round(u, 6),
            "v": round(v, 6),
            "wx": round(wx, 1),
            "wy": round(wy, 1),
            "wz": round(wz, 1),
        }

    return resolve, legacy_offsets_export


def _init_dx():
    dx = ctypes.CDLL(os.path.join(SB, "DirectXTex.dll"))
    dx.CreateScratchImage.restype = c_void_p
    dx.ScratchImageRelease.argtypes = [c_void_p]
    dx.LoadFromDDSMemory.argtypes = [c_void_p, c_size_t, c_int32, c_void_p, POINTER(c_void_p)]
    dx.LoadFromDDSMemory.restype = c_int32
    dx.GetImage.argtypes = [c_void_p, c_size_t, c_size_t, c_size_t]
    dx.GetImage.restype = c_void_p
    dx.Decompress.argtypes = [c_void_p, c_int32, POINTER(c_void_p)]
    dx.Decompress.restype = c_int32
    dx.GetPixels.argtypes = [c_void_p]
    dx.GetPixels.restype = c_void_p
    dx.GetPixelsSize.argtypes = [c_void_p]
    dx.GetPixelsSize.restype = c_size_t
    return dx


def _dds_to_bgra(dx, dds_bytes):
    if not isinstance(dds_bytes, (bytes, bytearray)):
        dds_bytes = bytes(dds_bytes)
    img = c_void_p(dx.CreateScratchImage())
    meta = ctypes.create_string_buffer(64)
    if dx.LoadFromDDSMemory(dds_bytes, len(dds_bytes), 0, meta, byref(img)) < 0:
        dx.ScratchImageRelease(img)
        return None
    w, h = struct.unpack_from("<QQ", meta.raw, 0)
    fmt = struct.unpack_from("<I", meta.raw, 48)[0]
    im_ptr = dx.GetImage(img, 0, 0, 0)
    if fmt == 87:
        raw = ctypes.string_at(dx.GetPixels(img), dx.GetPixelsSize(img))
        dx.ScratchImageRelease(img)
        return int(w), int(h), raw
    decomp = c_void_p(dx.CreateScratchImage())
    if dx.Decompress(im_ptr, 87, byref(decomp)) < 0:
        dx.ScratchImageRelease(decomp)
        dx.ScratchImageRelease(img)
        return None
    raw = ctypes.string_at(dx.GetPixels(decomp), dx.GetPixelsSize(decomp))
    dx.ScratchImageRelease(decomp)
    dx.ScratchImageRelease(img)
    return int(w), int(h), raw


def stitch_map_tiles(vfs):
    os.makedirs(MAP_CACHE_DIR, exist_ok=True)
    dx = _init_dx()

    from SoulsFormats import BXF4, TPF
    import System.Drawing as SD
    import System.Drawing.Imaging as SDI

    bhd_bytes = vfs.ReadFile("/menu/71_maptile.tpfbhd")
    bdt_bytes = vfs.ReadFile("/menu/71_maptile.tpfbdt")
    bxf = BXF4.Read(bhd_bytes, bdt_bytes)

    l0_tiles = defaultdict(dict)  # (layer, tx, tz) -> {mask_int: bxf_file}
    for f in bxf.Files:
        bn = os.path.basename(f.Name).lower().replace(".tpf.dcx", "").replace(".tpf", "")
        parts = bn.split("_")
        if len(parts) >= 7 and parts[0] == "menu" and parts[1] == "maptile" and parts[3] == "l0":
            try:
                layer = parts[2]
                tx = int(parts[4])
                tz = int(parts[5])
                mask = int(parts[6], 16)
                l0_tiles[(layer, tx, tz)][mask] = f
            except ValueError:
                continue

    mtm_bytes = vfs.ReadFile("/menu/71_maptile.mtmskbnd.dcx")
    mtm_bnd = BND4Reader(mtm_bytes)
    mtm_masks = defaultdict(dict)
    for fh in mtm_bnd.Files:
        bn = os.path.basename(fh.Name).lower()
        if bn.startswith("menu_maptile_m") and bn.endswith(".mtmsk"):
            layer = bn.split("_")[2].split(".")[0]
            root = ET.fromstring(bytes(mtm_bnd.ReadFile(fh).ToArray()).decode("utf-8"))
            for el in root.findall("MapTileMask"):
                if el.attrib.get("exists") == "1":
                    mid = int(el.attrib["id"])
                    if mid // 10000 == 0:  # L0
                        tx = (mid % 10000) // 100
                        tz = mid % 100
                        mtm_masks[layer][(tx, tz)] = int(el.attrib["mask"])
    mtm_bnd.Dispose()

    jpeg_enc = next(c for c in SDI.ImageCodecInfo.GetImageEncoders() if c.MimeType == "image/jpeg")
    ep90 = SDI.EncoderParameters(1)
    ep90.Param[0] = SDI.EncoderParameter(SDI.Encoder.Quality, 90)

    grid_n = 41
    full_px = grid_n * 256  # 10496
    tile_grid = 8
    tile_px = full_px // tile_grid  # 1312

    for layer in ("m00", "m01", "m10"):
        print(f"Stitching native L0 ({full_px}x{full_px}) + {tile_grid}x{tile_grid} tiles for {layer}...")
        master = SD.Bitmap(full_px, full_px, SDI.PixelFormat.Format24bppRgb)
        mg = SD.Graphics.FromImage(master)
        mg.Clear(SD.Color.FromArgb(14, 18, 22))
        mg.Dispose()

        # Draw each 256x256 L0 tile directly using LockBits or temp opaque Format32bppRgb
        lmasks = mtm_masks.get(layer, {})
        for tx in range(grid_n):
            for tz in range(grid_n):
                fmap = l0_tiles.get((layer, tx, tz))
                if not fmap:
                    continue
                wanted_mask = lmasks.get((tx, tz), 0)
                fh = fmap.get(wanted_mask) or fmap.get(0) or next(iter(fmap.values()))
                tpf = SoulsFile[TPF].Read(fh.Bytes)
                if tpf.Textures.Count == 0:
                    continue
                decoded = _dds_to_bgra(dx, tpf.Textures[0].Bytes)
                if not decoded:
                    continue
                w, h, raw = decoded
                if w != 256 or h != 256:
                    continue
                px_x = tx * 256
                px_y = (grid_n - 1 - tz) * 256
                rect = SD.Rectangle(px_x, px_y, 256, 256)
                tbmp = SD.Bitmap(256, 256, SDI.PixelFormat.Format32bppRgb)
                tbd = tbmp.LockBits(SD.Rectangle(0, 0, 256, 256), SDI.ImageLockMode.WriteOnly, SDI.PixelFormat.Format32bppRgb)
                ctypes.memmove(int(tbd.Scan0.ToInt64()), raw, 256 * 256 * 4)
                tbmp.UnlockBits(tbd)
                tg = SD.Graphics.FromImage(master)
                tg.DrawImageUnscaled(tbmp, px_x, px_y)
                tg.Dispose()
                tbmp.Dispose()

        # 1) Save 4096x4096 overview
        out_jpg = os.path.join(MAP_CACHE_DIR, f"map_{layer}.jpg")
        ov = SD.Bitmap(4096, 4096, SDI.PixelFormat.Format24bppRgb)
        og = SD.Graphics.FromImage(ov)
        og.InterpolationMode = SD.Drawing2D.InterpolationMode.HighQualityBicubic
        og.DrawImage(master, 0, 0, 4096, 4096)
        og.Dispose()
        ov.Save(out_jpg, jpeg_enc, ep90)
        ov.Dispose()

        # 2) Slice native L0 master into 8x8 high-res tiles (1312x1312 each)
        tiles_dir = os.path.join(MAP_CACHE_DIR, "tiles", layer)
        os.makedirs(tiles_dir, exist_ok=True)
        for cy in range(tile_grid):
            for cx in range(tile_grid):
                tile_bmp = SD.Bitmap(tile_px, tile_px, SDI.PixelFormat.Format24bppRgb)
                tg = SD.Graphics.FromImage(tile_bmp)
                tg.DrawImage(
                    master,
                    SD.Rectangle(0, 0, tile_px, tile_px),
                    SD.Rectangle(cx * tile_px, cy * tile_px, tile_px, tile_px),
                    SD.GraphicsUnit.Pixel,
                )
                tg.Dispose()
                tile_bmp.Save(os.path.join(tiles_dir, f"{cx}_{cy}.jpg"), jpeg_enc, ep90)
                tile_bmp.Dispose()

        master.Dispose()
        print(f"  map_{layer}.jpg -> {os.path.getsize(out_jpg):,} B + {tile_grid*tile_grid} L0 tiles")


def extract_game_icons(vfs=None, needed_good_icons=None):
    """Extract official Elden Ring UI, map cursor, & item sprites into err_map_icons.json.gz."""
    dx = _init_dx()
    from SoulsFormats import BXF4, TPF
    import System.Drawing as SD
    import System.Drawing.Imaging as SDI
    import System.IO as SIO

    tpf = SoulsFile[TPF].Read(os.path.join(ERR_MOD, "menu", "hi", "01_common.tpf.dcx"))
    tex_by_name = {t.Name.lower(): t for t in tpf.Textures}
    err_cursor_tpf = os.path.join(ERR_MOD, "menu", "deploy", "projects", "ELDENRINGReforged", "common", "SB_MapCursor_ERR.tpf.dcx")
    if os.path.exists(err_cursor_tpf):
        t2 = SoulsFile[TPF].Read(err_cursor_tpf)
        for t in t2.Textures:
            tex_by_name[t.Name.lower()] = t

    rdr = BND4Reader(os.path.join(ERR_MOD, "menu", "hi", "01_common.sblytbnd.dcx"))
    wanted_layouts = {
        "SB_MapCursor.layout",
        "SB_MapCursor_02.layout",
        "SB_MapCursor_03_dlc.layout",
        "SB_MapCursor_ERR.layout",
        "SB_Tab.layout",
        "SB_Title_01.layout",
    }
    sprites = {}  # filename -> (tkey, x, y, w, h)
    sheets = {}
    try:
        for fh in rdr.Files:
            fn = os.path.basename(fh.Name)
            if fn not in wanted_layouts:
                continue
            root = ET.fromstring(bytes(rdr.ReadFile(fh).ToArray()).decode("utf-8"))
            img_path = root.attrib.get("imagePath", "")
            tkey = os.path.splitext(os.path.basename(img_path))[0].lower()
            if tkey not in tex_by_name:
                continue
            if tkey not in sheets:
                decoded = _dds_to_bgra(dx, tex_by_name[tkey].Bytes)
                if not decoded:
                    continue
                sw, sh, raw = decoded
                sbmp = SD.Bitmap(sw, sh, SDI.PixelFormat.Format32bppArgb)
                sbd = sbmp.LockBits(SD.Rectangle(0, 0, sw, sh), SDI.ImageLockMode.WriteOnly, SDI.PixelFormat.Format32bppArgb)
                ctypes.memmove(int(sbd.Scan0.ToInt64()), raw, sw * sh * 4)
                sbmp.UnlockBits(sbd)
                sheets[tkey] = sbmp
            for st in root.findall(".//SubTexture"):
                nm = st.attrib.get("name", "")
                if nm:
                    sprites[nm] = (tkey, int(st.attrib["x"]), int(st.attrib["y"]), int(st.attrib["width"]), int(st.attrib["height"]))
    finally:
        rdr.Dispose()

    def bitmap_to_data_url(raw_bgra: bytes, sw: int, sh: int, max_dim: int = 56, tint=None) -> str:
        sbmp = SD.Bitmap(sw, sh, SDI.PixelFormat.Format32bppArgb)
        sbd = sbmp.LockBits(SD.Rectangle(0, 0, sw, sh), SDI.ImageLockMode.WriteOnly, SDI.PixelFormat.Format32bppArgb)
        ctypes.memmove(int(sbd.Scan0.ToInt64()), raw_bgra, sw * sh * 4)
        sbmp.UnlockBits(sbd)
        scale = min(1.0, float(max_dim) / max(sw, sh))
        dw = max(1, int(round(sw * scale)))
        dh = max(1, int(round(sh * scale)))
        out = SD.Bitmap(dw, dh, SDI.PixelFormat.Format32bppArgb)
        g = SD.Graphics.FromImage(out)
        g.InterpolationMode = SD.Drawing2D.InterpolationMode.HighQualityBicubic
        g.Clear(SD.Color.Transparent)
        if tint is not None:
            ia = SDI.ImageAttributes()
            r_t, g_t, b_t = tint
            cm = SDI.ColorMatrix([[r_t, 0, 0, 0, 0], [0, g_t, 0, 0, 0], [0, 0, b_t, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]])
            ia.SetColorMatrix(cm)
            g.DrawImage(sbmp, SD.Rectangle(0, 0, dw, dh), 0, 0, sw, sh, SD.GraphicsUnit.Pixel, ia)
            ia.Dispose()
        else:
            g.DrawImage(sbmp, SD.Rectangle(0, 0, dw, dh), SD.Rectangle(0, 0, sw, sh), SD.GraphicsUnit.Pixel)
        g.Dispose()
        sbmp.Dispose()
        ms = SIO.MemoryStream()
        out.Save(ms, SDI.ImageFormat.Png)
        b64 = base64.b64encode(bytes(ms.ToArray())).decode("ascii")
        ms.Dispose()
        out.Dispose()
        return f"data:image/png;base64,{b64}"

    def sprite_to_data_url(sprite_name: str, max_dim: int = 56, tint=None) -> str:
        info = sprites.get(sprite_name)
        if not info:
            return ""
        tkey, sx, sy, sw, sh = info
        src = sheets.get(tkey)
        if not src or sw <= 0 or sh <= 0:
            return ""
        scale = min(1.0, float(max_dim) / max(sw, sh))
        dw = max(1, int(round(sw * scale)))
        dh = max(1, int(round(sh * scale)))
        out = SD.Bitmap(dw, dh, SDI.PixelFormat.Format32bppArgb)
        g = SD.Graphics.FromImage(out)
        g.InterpolationMode = SD.Drawing2D.InterpolationMode.HighQualityBicubic
        g.Clear(SD.Color.Transparent)
        if tint is not None:
            ia = SDI.ImageAttributes()
            r_t, g_t, b_t = tint
            cm = SDI.ColorMatrix([[r_t, 0, 0, 0, 0], [0, g_t, 0, 0, 0], [0, 0, b_t, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]])
            ia.SetColorMatrix(cm)
            g.DrawImage(src, SD.Rectangle(0, 0, dw, dh), sx, sy, sw, sh, SD.GraphicsUnit.Pixel, ia)
            ia.Dispose()
        else:
            g.DrawImage(src, SD.Rectangle(0, 0, dw, dh), SD.Rectangle(sx, sy, sw, sh), SD.GraphicsUnit.Pixel)
        g.Dispose()
        ms = SIO.MemoryStream()
        out.Save(ms, SDI.ImageFormat.Png)
        b64 = base64.b64encode(bytes(ms.ToArray())).decode("ascii")
        ms.Dispose()
        out.Dispose()
        return f"data:image/png;base64,{b64}"

    icons = {}
    CATEGORY_MAP = [
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
        CATEGORY_MAP.append((f"memo_{idx}", f"MENU_MAP_memo_{20 + idx}.png", None))
    for key, sp_name, tint in CATEGORY_MAP:
        url = sprite_to_data_url(sp_name, max_dim=56, tint=tint)
        if url:
            icons[key] = url

    # Also extract specific WorldMapPointParam landmark icons (MENU_MAP_<N>.png, Church, ERR icons)
    for sp_name in sorted(sprites.keys()):
        m = re.match(r"^MENU_MAP_(\d+)\.png$", sp_name)
        if m:
            iid = int(m.group(1))
            if iid in (1, 80, 83, 84, 86, 87, 88):
                continue
            url = sprite_to_data_url(sp_name, max_dim=56)
            if url:
                icons[f"wmp_{iid}"] = url
    for key, sp_name in (
        ("wmp_3", "MENU_MAP_Church.png"),
        ("wmp_41", "MENU_MAP_ERR_Boss.png"),
        ("wmp_42", "MENU_MAP_ERR_Camp.png"),
    ):
        url = sprite_to_data_url(sp_name, max_dim=56)
        if url:
            icons[key] = url

    for sbmp in sheets.values():
        sbmp.Dispose()

    # Extract individual Goods collectible icons (Bell Bearings, Golden Seeds, Tears, Whetblades, etc.)
    want_icons = set(needed_good_icons or ()) | {383, 384, 400, 553, 3020, 3142, 3816, 3817}
    if want_icons:
        import game_map_extractor as gme

        oodle_fn = gme._load_oodle(GAME)

        def _ingest_solo(bhd_raw: bytes, bdt_reader, bdt_base: int = 0):
            for entry_name, d_off, c_sz, _u_sz in gme._parse_bnd4_entries(bhd_raw):
                m = re.search(r"MENU_Knowledge_(\d+)", entry_name, re.I)
                if not m:
                    continue
                iid = int(m.group(1))
                gkey = f"good_{iid}"
                if iid not in want_icons or gkey in icons:
                    continue
                blob = bdt_reader(bdt_base + d_off, c_sz)
                if blob[:4] == b"DCX\x00":
                    blob = gme._dcx_decompress(blob, oodle_fn)
                tpf_texs = gme._parse_tpf(blob)
                if not tpf_texs:
                    continue
                decoded = _dds_to_bgra(dx, next(iter(tpf_texs.values())))
                if decoded:
                    sw, sh, raw = decoded
                    icons[gkey] = bitmap_to_data_url(raw, sw, sh, max_dim=48)

        err_bhd = os.path.join(ERR_MOD, "menu", "hi", "00_Solo.tpfbhd")
        err_bdt = os.path.join(ERR_MOD, "menu", "hi", "00_Solo.tpfbdt")
        if os.path.exists(err_bhd) and os.path.exists(err_bdt):
            eb = open(err_bhd, "rb").read()
            if eb[:4] == b"DCX\x00":
                eb = gme._dcx_decompress(eb, oodle_fn)
            with open(err_bdt, "rb") as bf:
                def _read_err(off, sz):
                    bf.seek(off)
                    return bf.read(sz)
                _ingest_solo(eb, _read_err, 0)

        # Fill any missing icons directly from base Data0 00_solo
        if any(f"good_{iid}" not in icons for iid in want_icons):
            bhd_raw = gme._decrypt_bhd5(os.path.join(GAME, "Data0.bhd"), gme.DATA0_RSA_PEM)
            d_ents = gme._find_bhd_entries(bhd_raw, ("/menu/hi/00_solo.tpfbhd", "/menu/hi/00_solo.tpfbdt"))
            if len(d_ents) == 2:
                with open(os.path.join(GAME, "Data0.bdt"), "rb") as dbf:
                    sbhd = gme._read_bdt_entry(dbf, d_ents["/menu/hi/00_solo.tpfbhd"])
                    bbase = d_ents["/menu/hi/00_solo.tpfbdt"]["offset"]
                    def _read_base(off, sz):
                        dbf.seek(off)
                        return dbf.read(sz)
                    _ingest_solo(sbhd, _read_base, bbase)

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

    with gzip.open(ICONS_OUT_PATH, "wt", encoding="utf-8", compresslevel=6) as fh:
        json.dump(icons, fh, separators=(",", ":"))
    print(f"Extracted {len(icons)} game icons -> {ICONS_OUT_PATH} ({os.path.getsize(ICONS_OUT_PATH):,} bytes)")
    return set(icons.keys())


def main():
    global GAME, SB, ERR_MOD, REG_PATH, DEFS_DIR, CRN_DIR, MAPSTUDIO_DIR, WEAPON_DATA_PATH, OUT_PATH, ICONS_OUT_PATH, MAP_CACHE_DIR
    parser = argparse.ArgumentParser(description="Extract ERR v2.3.9.1 map markers and optional game map tiles/icons.")
    parser.add_argument("--game", required=True, help="Path to ELDEN RING/Game directory")
    parser.add_argument("--smithbox", required=True, help="Path to Smithbox directory (for SoulsFormats & PARAM defs)")
    parser.add_argument("--err-mod", required=True, help="Path to Elden Ring Reforged mod/ directory")
    parser.add_argument("--regulation", default="", help="Optional override path to regulation.bin")
    parser.add_argument("--out", default=OUT_PATH, help="Output path for err_map_data.json.gz")
    parser.add_argument("--icons-out", default=ICONS_OUT_PATH, help="Output path for err_map_icons.json.gz")
    parser.add_argument("--icons", action="store_true", help="Extract in-game UI map icons to err_map_icons.json.gz")
    parser.add_argument("--maps", action="store_true", help="Also stitch 4096x4096 JPEGs & L0 tiles into map_cache/ and extract icons")
    args = parser.parse_args()

    GAME = os.path.abspath(args.game)
    SB = os.path.abspath(args.smithbox)
    ERR_MOD = os.path.abspath(args.err_mod)
    REG_PATH = os.path.abspath(args.regulation) if args.regulation else os.path.join(ERR_MOD, "regulation.bin")
    DEFS_DIR = os.path.join(SB, "Assets", "PARAM", "ER", "Defs")
    CRN_DIR = os.path.join(SB, "Assets", "PARAM", "ER", "Community Row Names")
    MAPSTUDIO_DIR = os.path.join(ERR_MOD, "map", "mapstudio")
    OUT_PATH = os.path.abspath(args.out)
    ICONS_OUT_PATH = os.path.abspath(args.icons_out)
    MAP_CACHE_DIR = os.path.join(os.path.dirname(OUT_PATH), "map_cache")

    def collect_event_flag(fid: int):
        if isinstance(fid, int) and fid > 0:
            return fid
        return 0

    def _fetch_cached_text(fname: str, url: str) -> str:
        cdir = os.path.join(tempfile.gettempdir(), "err_calc_cache")
        os.makedirs(cdir, exist_ok=True)
        cp = os.path.join(cdir, fname)
        if os.path.exists(cp):
            return open(cp, "r", encoding="utf-8", errors="replace").read()
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        txt = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", errors="replace")
        with open(cp, "w", encoding="utf-8") as fh:
            fh.write(txt)
        return txt

    print("Initializing VFS & ERR regulation...")
    init_soulsformats(GAME, SB)
    vfs = ArchiveBinderVirtualFileSystem.FromGameFolder(GAME, Game.ER)
    if args.maps:
        stitch_map_tiles(vfs)

    reg = SFUtil.DecryptERRegulation(REG_PATH)
    fmgs = load_merged_fmgs(vfs)

    # Load calculator weapons so every weapon map pin links to exact weapon baseId / id
    calc_weps_by_id = {}
    calc_weps_by_base = {}
    if os.path.exists(WEAPON_DATA_PATH):
        with gzip.open(WEAPON_DATA_PATH, "rt", encoding="utf-8") as fh:
            wdata = json.load(fh)
        for w in wdata.get("weapons", []):
            wid = int(w["id"])
            bid = int(w["baseId"])
            calc_weps_by_id[wid] = w
            if wid == bid or bid not in calc_weps_by_base:
                calc_weps_by_base[bid] = w

    wep_param = load_param(reg, "EquipParamWeapon")
    pro_param = load_param(reg, "EquipParamProtector")
    acc_param = load_param(reg, "EquipParamAccessory")
    gds_param = load_param(reg, "EquipParamGoods")
    cstm_param = load_param(reg, "EquipParamCustomWeapon")
    il_map = load_param(reg, "ItemLotParam_map", "ItemLotParam")
    il_enemy = load_param(reg, "ItemLotParam_enemy", "ItemLotParam")
    shop_param = load_param(reg, "ShopLineupParam")
    npc_param = load_param(reg, "NpcParam")
    bonfire_param = load_param(reg, "BonfireWarpParam")
    bonfire_sub = load_param(reg, "BonfireWarpSubCategoryParam")
    bonfire_tab = load_param(reg, "BonfireWarpTabParam")
    wmp_param = load_param(reg, "WorldMapPointParam")
    conv_param = load_param(reg, "WorldMapLegacyConvParam")

    crn_npc = load_crn("NpcParam.json")
    crn_shop = load_crn("ShopLineupParam.json")

    resolve_coords, legacy_offsets_export = build_legacy_converter(conv_param)

    PLACE_KEYS = ("PlaceName.fmg", "PlaceName_dlc01.fmg", "PlaceName_dlc02.fmg")
    WEP_KEYS = ("WeaponName.fmg", "WeaponName_dlc01.fmg", "WeaponName_dlc02.fmg")
    PRO_KEYS = ("ProtectorName.fmg", "ProtectorName_dlc01.fmg", "ProtectorName_dlc02.fmg")
    ACC_KEYS = ("AccessoryName.fmg", "AccessoryName_dlc01.fmg", "AccessoryName_dlc02.fmg")
    GDS_KEYS = ("GoodsName.fmg", "GoodsName_dlc01.fmg", "GoodsName_dlc02.fmg")
    GEM_KEYS = ("GemName.fmg", "GemName_dlc01.fmg", "GemName_dlc02.fmg")
    NPC_KEYS = ("NpcName.fmg", "NpcName_dlc01.fmg", "NpcName_dlc02.fmg")

    wep_rows = {int(r.ID): r for r in wep_param.Rows}
    pro_rows = {int(r.ID): r for r in pro_param.Rows}
    acc_rows = {int(r.ID): r for r in acc_param.Rows}
    gds_rows = {int(r.ID): r for r in gds_param.Rows}
    cstm_rows = {int(r.ID): r for r in cstm_param.Rows}
    npc_rows = {int(r.ID): r for r in npc_param.Rows}

    GOOD_CATS = ("bell_bearing", "golden_seed", "sacred_tear", "scadutree", "revered_ash", "crystal_tear", "memory_stone", "whetblade")
    good_cache = {}
    needed_good_icons = set()
    for gid, gr in gds_rows.items():
        gname = fmg_lookup(fmgs, GDS_KEYS, gid)
        if not gname or "[ERROR]" in gname:
            continue
        nl = gname.lower()
        gt = safe_int(gr, "goodsType", -1)
        gcat = None
        if "bell bearing" in nl:
            gcat = "bell_bearing"
        elif nl == "golden seed":
            gcat = "golden_seed"
        elif nl == "sacred tear":
            gcat = "sacred_tear"
        elif nl == "scadutree fragment":
            gcat = "scadutree"
        elif nl == "revered spirit ash":
            gcat = "revered_ash"
        elif gt == 10:
            gcat = "crystal_tear"
        elif nl == "memory stone":
            gcat = "memory_stone"
        elif "whetblade" in nl or nl == "whetstone knife":
            gcat = "whetblade"
        if gcat:
            gicon = safe_int(gr, "iconId", 0)
            if gicon > 0:
                needed_good_icons.add(gicon)
            good_cache[gid] = {"cat": gcat, "id": gid, "goodId": gid, "goodIcon": gicon, "name": gname}

    available_icons = extract_game_icons(vfs, needed_good_icons) if (args.maps or args.icons) else set()
    if not available_icons and os.path.exists(ICONS_OUT_PATH):
        try:
            with gzip.open(ICONS_OUT_PATH, "rt", encoding="utf-8") as fh:
                available_icons = set(json.load(fh).keys())
        except Exception:
            pass

    def resolve_weapon_info(raw_id: int, is_custom: bool = False):
        wid = raw_id
        extra = ""
        if is_custom:
            cr = cstm_rows.get(raw_id)
            if cr is not None:
                wid = int(cr["baseWepId"].Value)
                gem_id = int(cr["gemId"].Value)
                gname = fmg_lookup(fmgs, GEM_KEYS, gem_id)
                if gname:
                    extra = gname
        base_id = (wid // 100) * 100
        cw = calc_weps_by_id.get(wid) or calc_weps_by_base.get(base_id)
        name = fmg_lookup(fmgs, WEP_KEYS, wid) or fmg_lookup(fmgs, WEP_KEYS, base_id)
        if not name and cw:
            name = cw["baseName"]
        if not name or "[ERROR]" in name or name == "Head":
            return None
        if extra and extra not in name:
            disp = f"{name} ({extra})"
        else:
            disp = name
        return {
            "cat": "weapon",
            "id": wid,
            "baseId": base_id,
            "calcId": int(cw["id"]) if cw else None,
            "name": disp,
            "baseName": cw["baseName"] if cw else name,
        }

    def resolve_armor_info(raw_id: int):
        if raw_id not in pro_rows:
            return None
        name = fmg_lookup(fmgs, PRO_KEYS, raw_id)
        if not name or "[ERROR]" in name or name in ("Head", "Body", "Arms", "Legs"):
            return None
        return {"cat": "armor", "id": raw_id, "name": name}

    def resolve_talisman_info(raw_id: int):
        if raw_id not in acc_rows:
            return None
        name = fmg_lookup(fmgs, ACC_KEYS, raw_id)
        if not name or "[ERROR]" in name:
            return None
        return {"cat": "talisman", "id": raw_id, "name": name}

    def resolve_good_info(raw_id: int):
        g = good_cache.get(raw_id)
        return dict(g) if g else None

    def extract_lot_items(row) -> list:
        out = []
        seen = set()
        lot_flag = safe_int(row, "getItemFlagId", 0)
        for slot in range(1, 9):
            cat = int(row[f"lotItemCategory0{slot}"].Value)
            iid = int(row[f"lotItemId0{slot}"].Value)
            if iid <= 0 or (cat, iid) in seen:
                continue
            seen.add((cat, iid))
            info = None
            if cat == 1:
                info = resolve_good_info(iid)
            elif cat == 2:
                info = resolve_weapon_info(iid, False)
            elif cat == 6:
                info = resolve_weapon_info(iid, True)
            elif cat == 3:
                info = resolve_armor_info(iid)
            elif cat == 4:
                info = resolve_talisman_info(iid)
            if info:
                sf = safe_int(row, f"getItemFlagId0{slot}", 0)
                ef = sf if sf > 0 else (lot_flag if lot_flag > 0 else 0)
                if ef > 0:
                    info["eventFlag"] = ef
                out.append(info)
        return out

    # Load upstream boss defeat flags & EventFlag BST lookup table
    bst_txt = _fetch_cached_text(
        "eventflag-bst.txt",
        "https://raw.githubusercontent.com/EthanShoeDev/elden-ring-compass/main/packages/vendored-data/assets/eventflag-bst.txt",
    )
    event_flag_bst = {}
    for ln in bst_txt.splitlines():
        if "," in ln:
            k_s, v_s = ln.strip().split(",", 1)
            event_flag_bst[int(k_s)] = int(v_s)

    boss_ts_txt = _fetch_cached_text(
        "bosses.ts",
        "https://raw.githubusercontent.com/EthanShoeDev/elden-ring-compass/main/packages/data/src/generated/bosses.ts",
    )
    upstream_bosses = []
    for ln in boss_ts_txt.splitlines():
        ls = ln.strip().rstrip(",")
        if ls.startswith("{") and ls.endswith("}"):
            try:
                bobj = json.loads(ls)
                mm = re.match(r"m(\d+)_(\d+)_(\d+)_(\d+)", bobj.get("mapId", ""))
                if mm and bobj.get("defeatFlagId"):
                    ba, bgx, bgz, bsub = map(int, mm.groups())
                    bp = resolve_coords(ba, bgx, bgz, float(bobj["x"]), float(bobj["y"]), float(bobj["z"]), sub_map=bsub, is_msb=True)
                    if bp:
                        upstream_bosses.append({
                            "flag": int(bobj["defeatFlagId"]),
                            "name": (bobj.get("name") or "").lower(),
                            "layer": bp["layer"],
                            "u": bp["u"],
                            "v": bp["v"],
                        })
            except Exception:
                pass

    def find_matching_boss_flags(layer: str, u: float, v: float, name: str, extra_flags=None):
        flags = []
        if extra_flags:
            for f in extra_flags:
                if f and f > 0 and f not in flags:
                    flags.append(f)
        nl = (name or "").lower()
        for ub in upstream_bosses:
            if ub["layer"] != layer:
                continue
            dist_m = math.hypot(ub["u"] - u, ub["v"] - v) * 10496.0
            if dist_m <= 130.0 and (not ub["name"] or ub["name"] in nl or nl in ub["name"] or dist_m <= 45.0):
                if ub["flag"] not in flags:
                    flags.append(ub["flag"])
        return flags

    il_map_rows = {int(r.ID): r for r in il_map.Rows}
    il_enemy_rows = {int(r.ID): r for r in il_enemy.Rows}

    markers = []
    map_layers = {}

    # ------------------------------------------------------------------
    # 1. GRACES (BonfireWarpParam)
    # ------------------------------------------------------------------
    sub_to_tab = {}
    for r in bonfire_sub.Rows:
        sub_to_tab[int(r.ID)] = {
            "tabId": int(r["tabId"].Value),
            "subName": fmg_lookup(fmgs, ("GR_MenuText.fmg", *PLACE_KEYS), int(r["textId"].Value)),
        }
    tab_names = {}
    for r in bonfire_tab.Rows:
        tab_names[int(r.ID)] = fmg_lookup(fmgs, ("GR_MenuText.fmg", *PLACE_KEYS), int(r["textId"].Value))

    grace_coords = []
    for r in bonfire_param.Rows:
        if int(r["disableParam_NT"].Value) != 0:
            continue
        tid = int(r["textId1"].Value)
        name = fmg_lookup(fmgs, PLACE_KEYS, tid)
        if not name or "[ERROR]" in name or "test" in name.lower():
            continue
        area = int(r["areaNo"].Value)
        gx = int(r["gridXNo"].Value)
        gz = int(r["gridZNo"].Value)
        px = float(r["posX"].Value)
        py = float(r["posY"].Value)
        pz = float(r["posZ"].Value)
        d0 = safe_int(r, "dispMask00", 0)
        d1 = safe_int(r, "dispMask01", 0)
        d2 = safe_int(r, "dispMask02", 0)
        prefer = None
        if area == 61 or d2 == 1:
            prefer = "m10"
        elif d1 == 1 and d0 == 0:
            prefer = "m01"
        elif d0 == 1:
            prefer = "m00"
        pos = resolve_coords(area, gx, gz, px, py, pz, prefer_layer=prefer)
        if not pos:
            continue
        sub_id = int(r["bonfireSubCategoryId"].Value)
        sub_info = sub_to_tab.get(sub_id, {})
        region = sub_info.get("subName") or tab_names.get(sub_info.get("tabId"), "") or ""
        map_layers.setdefault(f"{area}_{gx}_{gz}", pos["layer"])
        grace_coords.append((pos["layer"], pos["u"], pos["v"], name.lower()))
        efid = safe_int(r, "eventflagId", 0)
        gm = {
            "id": f"grace:{int(r.ID)}",
            "cat": "grace",
            "name": name,
            "layer": pos["layer"],
            "u": pos["u"],
            "v": pos["v"],
            "sub": region,
            "mapId": f"m{area:02d}_{gx:02d}_{gz:02d}",
            "wx": pos["wx"],
            "wy": pos["wy"],
            "wz": pos["wz"],
        }
        if efid > 0:
            gm["eventFlag"] = efid
        markers.append(gm)

    # ------------------------------------------------------------------
    # 2. LANDMARKS / DUNGEONS (WorldMapPointParam)
    # ------------------------------------------------------------------
    ICON_LABEL = {
        0: "Landmark",
        3: "Church of Marika",
        4: "Catacombs",
        5: "Ruins",
        6: "Shack",
        8: "Tower",
        9: "Evergaol / Challenge",
        10: "Landmark",
        11: "Bridge / Gate",
        13: "Cave",
        14: "Tunnel",
        15: "Underground Well",
        16: "Hero's Grave",
        17: "Sorcerer's Rise",
        18: "Fort",
        19: "Village",
        20: "Cathedral",
        21: "Lift",
        22: "Divine Tower",
        23: "Divine Tower",
        24: "Colosseum",
        25: "Legacy Dungeon",
        26: "Legacy Dungeon",
        27: "Legacy Dungeon",
        28: "Legacy Dungeon",
        29: "Castle / Keep",
        30: "Minor Erdtree",
        31: "Ruins",
        32: "Ruins",
        33: "Town",
        34: "Liturgical Town",
        35: "Village",
        42: "Camp / Landmark",
        46: "Landmark",
        47: "Sanctum / Ruin",
        50: "Minor Ruins",
        51: "Tower",
        55: "Tree / Altar",
        56: "Camp / Outpost",
        58: "Lava Ruins",
        59: "Forge / Ruin",
        65: "Forge",
        66: "Evergaol",
        67: "Cave / Catacombs",
        68: "Ruins",
        70: "Church",
        71: "Legacy Dungeon",
        72: "Scadutree Avatar / Altar",
        73: "Keep / Fortress",
        74: "Ruins / Temple",
        78: "Shack / Camp",
        208: "Miquella's Cross",
        210: "Town / Settlement",
        211: "Legacy Dungeon",
        213: "Fortress",
        217: "Cerulean Ruin",
        218: "Bridge / Crossing",
        247: "Church",
        256: "Ruined Forge",
        259: "Shack / Camp",
    }

    seen_wmp = set()
    for r in wmp_param.Rows:
        if int(r["disableParam_NT"].Value) != 0:
            continue
        tid = int(r["textId1"].Value)
        name = fmg_lookup(fmgs, PLACE_KEYS, tid)
        if not name or "[ERROR]" in name or "test" in name.lower():
            continue
        icon_id = int(r["iconId"].Value)
        area = int(r["areaNo"].Value)
        gx = int(r["gridXNo"].Value)
        gz = int(r["gridZNo"].Value)
        px = float(r["posX"].Value)
        py = float(r["posY"].Value)
        pz = float(r["posZ"].Value)
        d0 = safe_int(r, "dispMask00", 0)
        d1 = safe_int(r, "dispMask01", 0)
        d2 = safe_int(r, "dispMask02", 0)
        prefer = "m10" if (area == 61 or d2 == 1) else ("m01" if (d1 == 1 and d0 == 0) else ("m00" if d0 == 1 else None))
        pos = resolve_coords(area, gx, gz, px, py, pz, prefer_layer=prefer)
        if not pos:
            continue
        # Skip exact duplicate Site-of-Grace pins in WMP
        if any(gl == pos["layer"] and gn == name.lower() and abs(gu - pos["u"]) < 0.006 and abs(gv - pos["v"]) < 0.006 for gl, gu, gv, gn in grace_coords):
            continue
        is_wmp_boss = icon_id == 41
        cat = "boss" if is_wmp_boss else "poi"
        sub = "Field Boss" if is_wmp_boss else ICON_LABEL.get(icon_id, f"Landmark ({icon_id})")
        dk = (pos["layer"], cat, name.lower(), round(pos["u"], 3), round(pos["v"], 3))
        if dk in seen_wmp:
            continue
        seen_wmp.add(dk)
        wmp_icon_key = f"wmp_{icon_id}"
        m_poi = {
            "id": f"poi:{int(r.ID)}",
            "cat": cat,
            "name": name,
            "layer": pos["layer"],
            "u": pos["u"],
            "v": pos["v"],
            "sub": sub,
            "mapId": f"m{area:02d}_{gx:02d}_{gz:02d}",
            "wx": pos["wx"],
            "wy": pos["wy"],
            "wz": pos["wz"],
        }
        if not is_wmp_boss and wmp_icon_key in available_icons:
            m_poi["icon"] = wmp_icon_key
        if is_wmp_boss:
            wev = safe_int(r, "eventFlagId", 0)
            bflags = find_matching_boss_flags(pos["layer"], pos["u"], pos["v"], name, [wev] if wev > 0 else None)
            if bflags:
                m_poi["eventFlag"] = bflags[0]
                if len(bflags) > 1:
                    m_poi["eventFlags"] = bflags
        else:
            map_layers.setdefault(f"{area}_{gx}_{gz}", pos["layer"])
        markers.append(m_poi)

    # ------------------------------------------------------------------
    # 3. BUILD MERCHANT SHOP INVENTORIES FROM ShopLineupParam + CRN
    # ------------------------------------------------------------------
    vendor_shops = defaultdict(list)
    for r in shop_param.Rows:
        sid = int(r.ID)
        if not (100000 <= sid < 200000):
            continue
        crn_name = crn_shop.get(sid, "")
        m = re.match(r"^\[([^\]]+)\]", crn_name)
        if not m:
            continue
        vtag = m.group(1).split(" - ")[0].strip()
        et = int(r["equipType"].Value)
        eid = int(r["equipId"].Value)
        cost = int(r["value"].Value)
        if eid <= 0:
            continue
        item = None
        if et == 0:
            item = resolve_weapon_info(eid, False)
        elif et == 5:
            item = resolve_weapon_info(eid, True)
        elif et == 1:
            item = resolve_armor_info(eid)
        elif et == 2:
            item = resolve_talisman_info(eid)
        if item:
            item["cost"] = cost
            vendor_shops[vtag.lower()].append(item)

    def match_vendor_shop(npc_name: str, crn_npc_name: str) -> list:
        out = []
        seen_items = set()
        for candidate in (npc_name, crn_npc_name):
            if not candidate:
                continue
            cl = candidate.lower().strip()
            for vkey, items in vendor_shops.items():
                if vkey == cl or (len(vkey) >= 5 and (vkey in cl or cl in vkey)):
                    for it in items:
                        k = (it["cat"], it["id"])
                        if k not in seen_items:
                            seen_items.add(k)
                            out.append(it)
        return out

    # ------------------------------------------------------------------
    # 4. SCAN ALL MSBE FILES (TREASURES, BOSSES, MERCHANTS, GUARANTEED DROPS)
    # ------------------------------------------------------------------
    msb_files = sorted(glob.glob(os.path.join(MAPSTUDIO_DIR, "m*.msb.dcx")))
    print(f"Scanning {len(msb_files)} MSBE files...")

    seen_boss = set()
    seen_merch = set()
    treasure_items_count = defaultdict(int)

    for mp in msb_files:
        bn = os.path.basename(mp)
        m = re.match(r"m(\d+)_(\d+)_(\d+)_(\d+)\.msb\.dcx", bn)
        if not m:
            continue
        area, gx, gz, sub_map = map(int, m.groups())
        # Skip duplicate sub-versions if _00 exists? No, scan _00 and unique maps, deduplicate pins carefully.
        map_code = f"m{area:02d}_{gx:02d}_{gz:02d}_{sub_map:02d}"
        msb = SoulsFile[MSBE].Read(mp)

        parts_by_name = {}
        for plist in (msb.Parts.Assets, msb.Parts.Enemies, msb.Parts.DummyAssets, msb.Parts.DummyEnemies):
            for p in plist:
                parts_by_name[p.Name] = p

        # A. MSBE Treasures (chests, corpses, pickups) -> Weapons, Armor, Talismans
        grouped_treasures = defaultdict(list)  # (u, v, layer, cat) -> list of item dicts
        for t in msb.Events.Treasures:
            lot_id = int(t.ItemLotID)
            if lot_id <= 0:
                continue
            lot_row = il_map_rows.get(lot_id) or il_enemy_rows.get(lot_id)
            if not lot_row:
                continue
            items = extract_lot_items(lot_row)
            if not items:
                continue
            part = parts_by_name.get(t.TreasurePartName)
            if not part:
                continue
            pos = resolve_coords(area, gx, gz, float(part.Position.X), float(part.Position.Y), float(part.Position.Z), sub_map=sub_map, is_msb=True)
            if not pos:
                continue
            src_kind = "Chest / Object" if "AEG" in (t.TreasurePartName or "") and not any(x in (t.Name or "") for x in ("死体", "Corpse")) else "Treasure / Corpse"
            for it in items:
                it_copy = dict(it)
                it_copy["source"] = src_kind
                it_copy["lotId"] = lot_id
                grouped_treasures[(pos["layer"], pos["u"], pos["v"], pos["wx"], pos["wy"], pos["wz"], it["cat"])].append(it_copy)

        for (layer, u, v, wx, wy, wz, cat), items in grouped_treasures.items():
            # Deduplicate identical IDs at exact same spot
            uniq = []
            seen_u = set()
            for it in items:
                if it["id"] not in seen_u:
                    seen_u.add(it["id"])
                    uniq.append(it)
            if not uniq:
                continue
            if cat == "armor" and len(uniq) > 1:
                title = f"{uniq[0]['name']} (+{len(uniq) - 1} more)"
                sub = "Armor Set / Chest: " + ", ".join(x["name"] for x in uniq[:4])
                if len(uniq) > 4:
                    sub += f" (+{len(uniq) - 4})"
            else:
                # Multiple weapons/talismans in one spot -> create individual markers slightly offset ONLY if >1, else single
                pass
            if cat == "armor":
                treasure_items_count["armor"] += 1
                am = {
                    "id": f"tr:{map_code}:{cat}:{uniq[0]['id']}",
                    "cat": "armor",
                    "name": title if len(uniq) > 1 else uniq[0]["name"],
                    "layer": layer,
                    "u": u,
                    "v": v,
                    "sub": sub if len(uniq) > 1 else uniq[0]["source"],
                    "items": [x["name"] for x in uniq],
                    "itemIds": [int(x["id"]) for x in uniq],
                    "itemId": int(uniq[0]["id"]),
                    "mapId": map_code,
                    "wx": wx,
                    "wy": wy,
                    "wz": wz,
                }
                if uniq[0].get("eventFlag"):
                    am["eventFlag"] = int(uniq[0]["eventFlag"])
                markers.append(am)
            else:
                for it in uniq:
                    treasure_items_count[cat] += 1
                    m_obj = {
                        "id": f"tr:{map_code}:{cat}:{it['id']}:{round(u,4)}",
                        "cat": cat,
                        "name": it["name"],
                        "layer": layer,
                        "u": u,
                        "v": v,
                        "sub": it["source"],
                        "mapId": map_code,
                        "wx": wx,
                        "wy": wy,
                        "wz": wz,
                    }
                    if it.get("calcId") is not None:
                        m_obj["calcId"] = it["calcId"]
                        m_obj["baseName"] = it["baseName"]
                    if it.get("baseId") is not None:
                        m_obj["itemId"] = int(it["baseId"])
                    elif cat in ("talisman",):
                        m_obj["itemId"] = int(it["id"])
                    if it.get("goodId") is not None:
                        m_obj["goodId"] = int(it["goodId"])
                    if it.get("goodIcon"):
                        m_obj["goodIcon"] = int(it["goodIcon"])
                        m_obj["icon"] = f"good_{int(it['goodIcon'])}"
                    if it.get("eventFlag"):
                        m_obj["eventFlag"] = int(it["eventFlag"])
                    markers.append(m_obj)

        # B. MSBE Enemies -> Bosses, Merchants, Guaranteed NPC/Scarab drops
        for e in msb.Parts.Enemies:
            npc_id = int(e.NPCParamID)
            if npc_id <= 0 or npc_id == 10000300 or e.ModelName == "c1000":
                continue
            nr = npc_rows.get(npc_id)
            if not nr:
                continue
            nid = int(nr["nameId"].Value)
            fmg_name = fmg_lookup(fmgs, NPC_KEYS, nid)
            crn_raw = (
                crn_npc.get(npc_id)
                or crn_npc.get((npc_id // 100) * 100)
                or crn_npc.get((npc_id // 10000) * 10000)
                or ""
            )
            crn_name = "" if is_dummy_name(crn_raw) else clean_text(crn_raw)
            disp_name = fmg_name or crn_name
            hp = int(nr["hp"].Value)
            get_soul = int(nr["getSoul"].Value)
            is_boss_flag = int(nr["isSoulGetByBoss"].Value) == 1
            talk_id = int(e.TalkID)

            pos = resolve_coords(area, gx, gz, float(e.Position.X), float(e.Position.Y), float(e.Position.Z), sub_map=sub_map, is_msb=True)
            if not pos:
                continue

            # 1) Guaranteed drops on NpcParam (map lot or one-time enemy lot)
            drop_items = []
            for lot_col, lot_dict, is_guaranteed_col in (
                ("itemLotId_map", il_map_rows, True),
                ("itemLotId_enemy", il_enemy_rows, False),
            ):
                lid = int(nr[lot_col].Value)
                if lid <= 0:
                    continue
                lrow = lot_dict.get(lid) or il_map_rows.get(lid) or il_enemy_rows.get(lid)
                if not lrow:
                    continue
                if not is_guaranteed_col and int(lrow["getItemFlagId"].Value) <= 0:
                    continue
                for it in extract_lot_items(lrow):
                    it["source"] = f"Drop — {disp_name or e.ModelName}"
                    drop_items.append(it)

            if drop_items:
                armor_drops = [it for it in drop_items if it["cat"] == "armor"]
                if armor_drops:
                    treasure_items_count["armor"] += 1
                    dm = {
                        "id": f"drop:{map_code}:{npc_id}:armor:{armor_drops[0]['id']}",
                        "cat": "armor",
                        "name": f"{armor_drops[0]['name']} (+{len(armor_drops)-1})" if len(armor_drops) > 1 else armor_drops[0]["name"],
                        "layer": pos["layer"],
                        "u": pos["u"],
                        "v": pos["v"],
                        "sub": f"Drop — {disp_name or 'Enemy'}" if len(armor_drops) == 1 else f"Drop ({disp_name or 'Enemy'}): " + ", ".join(x["name"] for x in armor_drops[:4]),
                        "items": [x["name"] for x in armor_drops],
                        "itemIds": [int(x["id"]) for x in armor_drops],
                        "itemId": int(armor_drops[0]["id"]),
                        "mapId": map_code,
                        "wx": pos["wx"],
                        "wy": pos["wy"],
                        "wz": pos["wz"],
                    }
                    if armor_drops[0].get("eventFlag"):
                        dm["eventFlag"] = int(armor_drops[0]["eventFlag"])
                    markers.append(dm)
                for it in drop_items:
                    if it["cat"] in ("weapon", "talisman") or it["cat"] in GOOD_CATS:
                        treasure_items_count[it["cat"]] += 1
                        m_obj = {
                            "id": f"drop:{map_code}:{npc_id}:{it['cat']}:{it['id']}",
                            "cat": it["cat"],
                            "name": it["name"],
                            "layer": pos["layer"],
                            "u": pos["u"],
                            "v": pos["v"],
                            "sub": it["source"],
                            "mapId": map_code,
                            "wx": pos["wx"],
                            "wy": pos["wy"],
                            "wz": pos["wz"],
                        }
                        if it.get("calcId") is not None:
                            m_obj["calcId"] = it["calcId"]
                            m_obj["baseName"] = it["baseName"]
                        if it.get("baseId") is not None:
                            m_obj["itemId"] = int(it["baseId"])
                        elif it["cat"] == "talisman":
                            m_obj["itemId"] = int(it["id"])
                        if it.get("goodId") is not None:
                            m_obj["goodId"] = int(it["goodId"])
                        if it.get("goodIcon"):
                            m_obj["goodIcon"] = int(it["goodIcon"])
                            m_obj["icon"] = f"good_{int(it['goodIcon'])}"
                        if it.get("eventFlag"):
                            m_obj["eventFlag"] = int(it["eventFlag"])
                        markers.append(m_obj)

            # 2) Merchant detection (strictly exclude bosses / whole-word match so 'Malenia' never matches 'enia')
            lower_all = f"{fmg_name} {crn_name}".lower()
            is_merchant = False
            if not is_boss_flag:
                if 180000 <= nid <= 180999 or e.ModelName in KNOWN_VENDOR_MODELS:
                    is_merchant = True
                elif talk_id > 0 and VENDOR_REGEX.search(lower_all) and not any(bk in lower_all for bk in BAD_VENDOR_KEYWORDS):
                    is_merchant = True

            if is_merchant and disp_name:
                mk = (pos["layer"], disp_name.lower(), round(pos["u"], 3), round(pos["v"], 3))
                if mk not in seen_merch:
                    seen_merch.add(mk)
                    shop_items = match_vendor_shop(fmg_name, crn_name)
                    markers.append(
                        {
                            "id": f"merch:{map_code}:{npc_id}:{round(pos['u'],4)}",
                            "cat": "merchant",
                            "name": disp_name,
                            "layer": pos["layer"],
                            "u": pos["u"],
                            "v": pos["v"],
                            "sub": f"Merchant ({len(shop_items)} equip items)" if shop_items else "Merchant / Vendor",
                            "items": [f"{x['name']} ({x['cost']} Runes)" if x.get("cost") else x["name"] for x in shop_items],
                            "mapId": map_code,
                            "wx": pos["wx"],
                            "wy": pos["wy"],
                            "wz": pos["wz"],
                        }
                    )
                    # Also index shop-sold weapons/talismans/armor as searchable items at merchant spot
                    for sit in shop_items:
                        if sit["cat"] in ("weapon", "talisman", "armor"):
                            treasure_items_count[sit["cat"]] += 1
                            sm = {
                                "id": f"shop:{npc_id}:{sit['cat']}:{sit['id']}",
                                "cat": sit["cat"],
                                "name": sit["name"],
                                "layer": pos["layer"],
                                "u": pos["u"],
                                "v": pos["v"],
                                "sub": f"Sold by {disp_name}" + (f" · {sit['cost']} Runes" if sit.get("cost") else ""),
                                "mapId": map_code,
                                "wx": pos["wx"],
                                "wy": pos["wy"],
                                "wz": pos["wz"],
                            }
                            if sit.get("calcId") is not None:
                                sm["calcId"] = sit["calcId"]
                                sm["baseName"] = sit["baseName"]
                            if sit.get("baseId") is not None:
                                sm["itemId"] = int(sit["baseId"])
                            elif sit["cat"] in ("armor", "talisman"):
                                sm["itemId"] = int(sit["id"])
                            markers.append(sm)
                continue

            # 3) Boss detection (isSoulGetByBoss, FMG healthbar nid>=900M, or named boss in CRN with high HP/drops)
            is_named_boss = is_boss_flag or (nid >= 900000000 and hp >= 1200)
            if not is_named_boss and crn_name and hp >= 2500 and talk_id == 0:
                if any(tok in crn_name.lower() for tok in ("boss", "avatar", "sentinel", "dragon", "knights", "margit", "godrick", "rennala", "radahn", "malenia", "mohg", "morgott", "godfrey", "radagon", "maliketh", "placidu", "messmer", "bayle", "rellana", "midra", "romina", "gaius", "scadutree", "putrescent", "night's cavalry", "death rite", "bell bearing", "crucible knight", "ulcerated", "black blade", "tibia", "troll", "wyrm", "demi-human queen", "cemetery shade", "misbegotten", "cleanrot", "watchdog", "duelist", "stonedigger", "mad pumpkin")):
                    is_named_boss = True

            if is_named_boss:
                bname = fmg_name or crn_name
                if not bname or is_dummy_name(bname):
                    continue
                bk = (pos["layer"], bname.lower(), round(pos["u"], 2), round(pos["v"], 2))
                if bk not in seen_boss:
                    seen_boss.add(bk)
                    drop_names = [x["name"] for x in drop_items[:6]]
                    drop_flags = [int(x["eventFlag"]) for x in drop_items if x.get("eventFlag")]
                    bflags = find_matching_boss_flags(pos["layer"], pos["u"], pos["v"], bname, drop_flags)
                    bm = {
                        "id": f"boss:{map_code}:{npc_id}:{round(pos['u'],4)}",
                        "cat": "boss",
                        "name": bname,
                        "layer": pos["layer"],
                        "u": pos["u"],
                        "v": pos["v"],
                        "sub": f"HP {hp:,}" + (f" · {get_soul:,} Runes" if get_soul > 0 else ""),
                        "items": drop_names,
                        "mapId": map_code,
                        "wx": pos["wx"],
                        "wy": pos["wy"],
                        "wz": pos["wz"],
                    }
                    if bflags:
                        bm["eventFlag"] = bflags[0]
                        if len(bflags) > 1:
                            bm["eventFlags"] = bflags
                    markers.append(bm)

    # Deduplicate overlapping identical items placed twice by alternate map layers (_00 vs _01/_02)
    final_markers = []
    seen_global = set()
    for m in markers:
        key = (m["cat"], m["layer"], m["name"].lower(), round(m["u"], 3), round(m["v"], 3))
        if key in seen_global:
            continue
        seen_global.add(key)
        final_markers.append(m)

    # Merge eventFlags from nearby overlapping boss pins so WMP bosses & MSBE bosses share defeat flags
    wmp_bosses = [m for m in final_markers if m["cat"] == "boss" and m["id"].startswith("poi:")]
    for m in final_markers:
        if m["cat"] != "boss" or m["id"].startswith("poi:"):
            continue
        for wb in wmp_bosses:
            if wb["layer"] != m["layer"]:
                continue
            if math.hypot(wb["u"] - m["u"], wb["v"] - m["v"]) * 10496.0 <= 120.0:
                merged = []
                for src in (m, wb):
                    if src.get("eventFlag"):
                        merged.append(src["eventFlag"])
                    for f in src.get("eventFlags", []):
                        merged.append(f)
                uniq_f = list(dict.fromkeys(x for x in merged if x > 0))
                if uniq_f:
                    m["eventFlag"] = uniq_f[0]
                    if len(uniq_f) > 1:
                        m["eventFlags"] = uniq_f

    counts = defaultdict(int)
    flag_bst_used = {}
    for m in final_markers:
        counts[m["cat"]] += 1
        fids = []
        if m.get("eventFlag"):
            fids.append(int(m["eventFlag"]))
        for f in m.get("eventFlags", []):
            fids.append(int(f))
        for fid in fids:
            blk = fid // 1000
            if blk in event_flag_bst:
                flag_bst_used[str(blk)] = event_flag_bst[blk]

    legacy_conv = []
    for r in conv_param.Rows:
        if safe_int(r, "disableParam_NT", 0) != 0:
            continue
        sa = int(r["srcAreaNo"].Value)
        sx = int(r["srcGridXNo"].Value)
        sz = int(r["srcGridZNo"].Value)
        da = int(r["dstAreaNo"].Value)
        dx = int(r["dstGridXNo"].Value)
        dz = int(r["dstGridZNo"].Value)
        if sa == da and sx == dx and sz == dz:
            continue
        legacy_conv.append(
            [
                sa,
                sx,
                sz,
                round(float(r["srcPosX"].Value), 2),
                round(float(r["srcPosY"].Value), 2),
                round(float(r["srcPosZ"].Value), 2),
                da,
                dx,
                dz,
                round(float(r["dstPosX"].Value), 2),
                round(float(r["dstPosY"].Value), 2),
                round(float(r["dstPosZ"].Value), 2),
                int(r["isBasePoint"].Value),
            ]
        )

    payload = {
        "version": 3,
        "mod": "ELDEN RING Reforged v2.3.9.1",
        "tileGrid": 8,
        "layers": CALIBRATIONS,
        "mapLayers": map_layers,
        "flagBst": flag_bst_used,
        "legacyConv": legacy_conv,
        "legacyOffsets": legacy_offsets_export,
        "counts": dict(counts),
        "markers": final_markers,
    }
    with gzip.open(OUT_PATH, "wt", encoding="utf-8", compresslevel=6) as fh:
        json.dump(payload, fh, separators=(",", ":"))

    print(f"Wrote {OUT_PATH} ({os.path.getsize(OUT_PATH):,} bytes)")
    print("Category counts:", dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
