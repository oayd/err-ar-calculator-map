"""
Extracts official Elden Ring UI chrome, prompt glyphs, ERR affinity icons,
weapon-type representative icons, and deduplicated item icon caches from
local Elden Ring / ModEngine mod files (read-only).

Outputs:
  1. ui/er_menu_assets.json   — bundled chrome, silhouettes, dividers, prompts,
                                 all 24 ERR affinity icons, and 44 weapon-type icons.
  2. er_ui_icons.json.gz      — local cache next to the exe mapping iconId -> WebP URI
                                 plus compact maps for baseId/armorId/talismanId/goodsId.
"""

import base64
import gzip
import io
import json
import os
import sys
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Set, Tuple

from PIL import Image

import game_map_extractor as gme
import regulation_extractor as reg_ex

DEFAULT_MOD_CANDIDATES: Tuple[str, ...] = ()

STATIC_UI_SPRITES: Dict[str, str] = {
    # Chrome & frames
    "ic_equip": "MENU_FL_Equipment.png",
    "ic_status": "MENU_FL_Status.png",
    "ic_option": "MENU_FL_Option.png",
    "ic_grace": "MENU_FL_Grace.png",
    "ic_weapon": "MENU_FL_Weapon.png",
    "ic_stat_mini": "MENU_FL_Chara.png",
    "ic_cut": "MENU_FL_Gurd.png",
    "ic_attack": "MENU_FL_Attack.png",
    "ic_guard": "MENU_FL_Gurd.png",
    "ic_corr": "MENU_FL_Correction.png",
    "ic_req": "MENU_FL_necessary.png",
    "ic_passive": "MENU_FL_AddEffect.png",
    "ic_chara": "MENU_FL_Chara.png",
    "equip_waku": "MENU_FL_Equip_waku.png",
    "equip_deco": "MENU_FL_Equip_wakuDeco.png",
    "slot_base": "MENU_SlotBase.png",
    "arts_waku": "MENU_FL_Arts_waku.png",
    "sl_cursor": "MENU_SL_Cursor.png",
    "bright_waku": "MENU_FL_BrightWaku.png",
    "cursor_wide": "MENU_FL_Cursor_Wide.png",
    "cursor_half": "MENU_FL_Cursor_Half.png",
    "cursor_top": "MENU_FL_Cursor_Top.png",
    "cond_waku": "MENU_FL_ConditionWaku.png",
    "line_h": "MENU_Line_01.png",
    "line_v": "MENU_Br_Line_01.png",
    "line_v_full": "MENU_Br_Line_00.png",
    "arrow": "MENU_Arrow.png",
    "hp_base": "MENU_FL_HP_Base.png",
    # Silhouettes
    "sl_r_wep": "MENU_SL_R_Weapon.png",
    "sl_l_wep": "MENU_SL_L_Weapon.png",
    "sl_arrow": "MENU_SL_Arrow.png",
    "sl_bolt": "MENU_SL_Bolt.png",
    "sl_head": "MENU_SL_Head.png",
    "sl_body": "MENU_SL_Body.png",
    "sl_hand": "MENU_SL_Hand.png",
    "sl_foot": "MENU_SL_Foot.png",
    "sl_leg": "MENU_SL_Foot.png",
    "sl_tal": "MENU_SL_Talisman.png",
    "sl_item": "MENU_SL_Item.png",
    "sl_arts": "MENU_SL_Arts.png",
    "sl_mem": "MENU_SL_Memory.png",
    # Xbox prompts
    "xbox_a": "KG_XboxSeries_R_D.png",
    "xbox_b": "KG_XboxSeries_R_R.png",
    "xbox_x": "KG_XboxSeries_R_L.png",
    "xbox_y": "KG_XboxSeries_R_U.png",
    "xbox_lb": "KG_XboxSeries_L1.png",
    "xbox_rb": "KG_XboxSeries_R1.png",
    "xbox_r3": "KG_XboxSeries_R3.png",
    "xbox_start": "KG_XboxSeries_Start.png",
    # PS5 prompts
    "ps5_a": "KG_PS5_R_D.png",
    "ps5_b": "KG_PS5_R_R.png",
    "ps5_x": "KG_PS5_R_L.png",
    "ps5_y": "KG_PS5_R_U.png",
    "ps5_lb": "KG_PS5_L1.png",
    "ps5_rb": "KG_PS5_R1.png",
    "ps5_r3": "KG_PS5_R3.png",
    "ps5_start": "KG_PS5_Start.png",
    # Keyboard + Mouse prompts
    "kbm_ok": "KG_Mouse_Left.png",
    "kbm_back": "KG_Key_Esc.png",
    "kbm_x": "KG_Key_R.png",
    "kbm_y": "KG_Key_F.png",
    "kbm_lb": "KG_Key_Q.png",
    "kbm_rb": "KG_Key_E.png",
    "kbm_r3": "KG_Key_Tab.png",
    "kbm_start": "KG_Key_M.png",
    # Legacy aliases preserved
    "key_q": "KG_Key_Q.png",
    "key_e": "KG_Key_E.png",
    "key_f": "KG_Key_F.png",
    "key_r": "KG_Key_R.png",
    "key_p": "KG_Key_P.png",
    "key_esc": "KG_Key_Esc.png",
    # ERR Affinity icons (SB_MainMenu_02)
    "aff_Standard": "MENU_FL_40141.png",
    "aff_Heavy": "MENU_FL_40142.png",
    "aff_Keen": "MENU_FL_40143.png",
    "aff_Quality": "MENU_FL_40144.png",
    "aff_Sacred": "MENU_FL_40145.png",
    "aff_Magic": "MENU_FL_40146.png",
    "aff_Cold": "MENU_FL_40147.png",
    "aff_Fire": "MENU_FL_40148.png",
    "aff_Lightning": "MENU_FL_40150.png",
    "aff_Occult": "MENU_FL_40151.png",
    "aff_Poison": "MENU_FL_40172.png",
    "aff_Bloody": "MENU_FL_40173.png",
    "aff_Bestial": "MENU_FL_Affinity_Bestial.png",
    "aff_Blessed": "MENU_FL_Affinity_Blessed.png",
    "aff_Bolt": "MENU_FL_Affinity_Bolt.png",
    "aff_Cursed": "MENU_FL_Affinity_Cursed.png",
    "aff_Fated": "MENU_FL_Affinity_Fated.png",
    "aff_Fell": "MENU_FL_Affinity_Fell.png",
    "aff_Frenzied": "MENU_FL_Affinity_Frenzied.png",
    "aff_Gravitational": "MENU_FL_Affinity_Gravitational.png",
    "aff_Magma": "MENU_FL_Affinity_Magma.png",
    "aff_Night": "MENU_FL_Affinity_Night.png",
    "aff_Rotten": "MENU_FL_Affinity_Rotten.png",
    "aff_Soporific": "MENU_FL_Affinity_Soporific.png",
    "aff_magma": "MENU_FL_Affinity_Magma.png",
    "aff_fell": "MENU_FL_Affinity_Fell.png",
    "aff_bolt": "MENU_FL_Affinity_Bolt.png",
    "aff_night": "MENU_FL_Affinity_Night.png",
    # Official Elden Ring Status Effect icons
    "st_poison": "MENU_RE_Poison.png",
    "st_rot": "MENU_RE_Plague.png",
    "st_bleed": "MENU_RE_bleed.png",
    "st_frost": "MENU_RE_Cold.png",
    "st_sleep": "MENU_RE_Sleep.png",
    "st_mad": "MENU_RE_Mad.png",
    "st_death": "MENU_RE_Death.png",
    # Boss / Enemy HUD & Map Chrome
    "ic_map": "MENU_FL_Map.png",
    "ic_lockon": "MENU_Lockon_02.png",
    "ic_zoom_in": "MENU_FL_ZoomIn.png",
    "ic_zoom_out": "MENU_FL_ZoomOut.png",
    "boss_bar_deco": "MENU_FL_BarDeco_Boss.png",
    "boss_bar_deco_l": "MENU_FL_BarDeco_L.png",
    "boss_bar_hp": "MENU_HP_Bar.png",
    "boss_bar_cond": "MENU_FL_Condition_Bar.png",
    "boss_name_base": "MENU_FE_NameBase.png",
    # Damage Types, Attributes, Guard & Controls
    "ap_phys": "SB_ERR_AP_Physical.png",
    "ap_mag": "SB_ERR_AP_Magic.png",
    "ap_fire": "SB_ERR_AP_Fire.png",
    "ap_ltng": "SB_ERR_AP_Lightning.png",
    "ap_holy": "SB_ERR_AP_Holy.png",
    "ap_std": "SB_ERR_AP_Standard.png",
    "ap_strike": "SB_ERR_AP_Strike.png",
    "ap_slash": "SB_ERR_AP_Slash.png",
    "ap_pierce": "SB_ERR_AP_Pierce.png",
    "attr_vig": "SB_ERR_A_Vigor.png",
    "attr_mnd": "SB_ERR_A_Mind.png",
    "attr_end": "SB_ERR_A_Endurance.png",
    "attr_str": "SB_ERR_A_Strength.png",
    "attr_dex": "SB_ERR_A_Dexterity.png",
    "attr_int": "SB_ERR_A_Intelligence.png",
    "attr_fai": "SB_ERR_A_Faith.png",
    "attr_arc": "SB_ERR_A_Arcane.png",
    "attr_poise": "SB_ERR_A_Poise.png",
    "attr_stam": "SB_ERR_A_Stamina.png",
    "guard_phys": "SB_ERR_B_Physical.png",
    "guard_mag": "SB_ERR_B_Magic.png",
    "guard_fire": "SB_ERR_B_Fire.png",
    "guard_ltng": "SB_ERR_B_Lightning.png",
    "guard_holy": "SB_ERR_B_Holy.png",
    "cb_empty": "SB_ERR_Grace_CheckboxEmpty.png",
    "cb_full": "SB_ERR_Grace_CheckboxFull.png",
    "ic_completed": "MENU_MAP_ERR_Completed.png",
    "ic_cross": "SB_ERR_Cross.png",
}


def _img_to_uri(im: Image.Image, max_size: Optional[Tuple[int, int]] = None, fmt: str = "PNG") -> str:
    work = im
    if max_size:
        w, h = work.size
        mw, mh = max_size
        if w > mw or h > mh:
            work = work.copy()
            work.thumbnail((mw, mh), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if fmt.upper() == "WEBP":
        work.save(buf, format="WEBP", quality=84, method=4)
        mime = "image/webp"
    else:
        work.save(buf, format="PNG", optimize=True)
        mime = "image/png"
    return f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode('ascii')}"


def _find_menu_hi_dir(mod_dir: Optional[str], game_dir: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    gdir = gme.normalize_game_dir(game_dir) if game_dir else gme.detect_elden_ring_game_dir()
    cands: List[str] = []
    if mod_dir:
        cands.append(os.path.join(mod_dir, "menu", "hi"))
        cands.append(os.path.join(os.path.dirname(mod_dir), "mod", "menu", "hi"))
    for mc in DEFAULT_MOD_CANDIDATES:
        cands.append(os.path.join(mc, "menu", "hi"))
    for hi in cands:
        sb = os.path.join(hi, "01_common.sblytbnd.dcx")
        tpf = os.path.join(hi, "01_common.tpf.dcx")
        if os.path.isfile(sb) and os.path.isfile(tpf):
            return os.path.dirname(os.path.dirname(hi)), gdir
    return mod_dir, gdir


def _load_common_ui_blobs(mod_dir: Optional[str], game_dir: Optional[str]) -> Tuple[bytes, bytes]:
    if not game_dir or not gme.is_valid_game_dir(game_dir):
        raise FileNotFoundError("Valid ELDEN RING Game directory (oo2core_6_win64.dll) not found.")
    oodle = gme._load_oodle(game_dir)

    if mod_dir:
        sb_p = os.path.join(mod_dir, "menu", "hi", "01_common.sblytbnd.dcx")
        tpf_p = os.path.join(mod_dir, "menu", "hi", "01_common.tpf.dcx")
        if os.path.isfile(sb_p) and os.path.isfile(tpf_p):
            with open(sb_p, "rb") as fh:
                sb_raw = gme._dcx_decompress(fh.read(), oodle)
            with open(tpf_p, "rb") as fh:
                tpf_raw = gme._dcx_decompress(fh.read(), oodle)
            return sb_raw, tpf_raw

    # Fallback: read vanilla Data0.bhd / Data0.bdt
    rsa_pem = gme._extract_er_rsa_pem()
    bhd0 = os.path.join(game_dir, "Data0.bhd")
    bdt0 = os.path.join(game_dir, "Data0.bdt")
    bhd_raw = gme._decrypt_bhd5(bhd0, rsa_pem)
    want = ("/menu/hi/01_common.sblytbnd.dcx", "/menu/hi/01_common.tpf.dcx")
    entries = gme._find_bhd_entries(bhd_raw, want)
    with open(bdt0, "rb") as fh:
        sb_raw = gme._dcx_decompress(gme._read_bdt_entry(fh, entries[want[0]]), oodle)
        tpf_raw = gme._dcx_decompress(gme._read_bdt_entry(fh, entries[want[1]]), oodle)
    return sb_raw, tpf_raw


def extract_er_ui_assets(
    mod_dir: Optional[str] = None,
    game_dir: Optional[str] = None,
    reg_path: Optional[str] = None,
    weapon_data: Optional[Dict[str, Any]] = None,
    weapon_data_path: Optional[str] = None,
    out_menu_json: Optional[str] = None,
    out_icons_gz: Optional[str] = None,
) -> Dict[str, Any]:
    """Extract Elden Ring menu sprites, affinity/weapon-type icons, and item icon cache."""
    if reg_path and os.path.isfile(reg_path) and not mod_dir:
        mod_dir = os.path.dirname(os.path.abspath(reg_path))
    resolved_mod, resolved_game = _find_menu_hi_dir(mod_dir, game_dir)
    if not resolved_game:
        raise FileNotFoundError("Could not locate ELDEN RING Game directory.")

    if weapon_data is None and weapon_data_path and os.path.isfile(weapon_data_path):
        with gzip.open(weapon_data_path, "rt", encoding="utf-8") as fh:
            weapon_data = json.load(fh)

    reg_file = reg_path if (reg_path and os.path.isfile(reg_path)) else None
    if not reg_file and resolved_mod and os.path.isfile(os.path.join(resolved_mod, "regulation.bin")):
        reg_file = os.path.join(resolved_mod, "regulation.bin")
    if not reg_file:
        reg_file = os.path.join(resolved_game, "regulation.bin")

    sb_raw, tpf_raw = _load_common_ui_blobs(resolved_mod, resolved_game)
    tpf_map = gme._parse_tpf(tpf_raw)
    if resolved_mod:
        dummy_p = os.path.join(resolved_mod, "menu", "hi", "05_dummy.tpf.dcx")
        if os.path.isfile(dummy_p):
            try:
                oodle = gme._load_oodle(resolved_game)
                with open(dummy_p, "rb") as fh:
                    dummy_raw = gme._dcx_decompress(fh.read(), oodle)
                tpf_map.update(gme._parse_tpf(dummy_raw))
            except Exception:
                pass
    bnd_entries = gme._parse_bnd4_entries(sb_raw)

    # Index every subtexture in 01_common by sprite name -> (atlas_key, x, y, w, h)
    subtex_index: Dict[str, Tuple[str, int, int, int, int]] = {}
    for _ename, off, sz, _ in bnd_entries:
        try:
            root = ET.fromstring(sb_raw[off : off + sz])
        except Exception:
            continue
        atlas_key = os.path.splitext(os.path.basename(root.attrib.get("imagePath", "")))[0].lower()
        for sp in root.findall(".//SubTexture"):
            nm = sp.attrib.get("name", "")
            if nm:
                subtex_index[nm] = (
                    atlas_key,
                    int(sp.attrib["x"]),
                    int(sp.attrib["y"]),
                    int(sp.attrib["width"]),
                    int(sp.attrib["height"]),
                )

    params = reg_ex.unpack_regulation_params(reg_file, game_dir=resolved_game)
    wep_param = dict(reg_ex.parse_param_rows(params["equipparamweapon.param"], 664))
    prot_param = dict(reg_ex.parse_param_rows(params["equipparamprotector.param"], 416))
    acc_param = dict(reg_ex.parse_param_rows(params["equipparamaccessory.param"], 96))
    good_param = dict(reg_ex.parse_param_rows(params["equipparamgoods.param"], 176))

    def _find_item_sprite_name(icon_id: int) -> Optional[str]:
        if icon_id <= 0 or icon_id == 65535:
            return None
        for cand in (f"MENU_ItemIcon_{icon_id:05d}.png", f"MENU_ItemIcon_{icon_id}.png"):
            if cand in subtex_index:
                return cand
        return None

    # Resolve weapon-type icons (exact name match first, then lowest-ID pure-Physical weapon)
    wt_reverse: Dict[str, List[str]] = {}
    if weapon_data:
        by_wt: Dict[str, List[Dict[str, Any]]] = {}
        for w in weapon_data.get("weapons", []):
            if w.get("aff") in ("Standard", "Unique"):
                by_wt.setdefault(str(w["wt"]), []).append(w)
        for wt_id, wt_name in sorted(weapon_data.get("weaponTypes", {}).items(), key=lambda x: int(x[0])):
            cands = sorted(by_wt.get(wt_id, []), key=lambda x: x["id"])
            if not cands:
                continue
            exact = [w for w in cands if (w.get("baseName") or "").lower() == wt_name.lower()]
            pure_phys = [w for w in cands if w["atk"][0] > 0 and sum(w["atk"][1:]) == 0]
            any_phys = [w for w in cands if w["atk"][0] > 0]
            chosen_fn: Optional[str] = None
            for pool in (exact, pure_phys, any_phys, cands):
                for w in pool:
                    row = wep_param.get(int(w["id"]))
                    if not row:
                        continue
                    fn = _find_item_sprite_name(reg_ex._u16(row, 190))
                    if fn:
                        chosen_fn = fn
                        break
                if chosen_fn:
                    break
            if chosen_fn:
                wt_reverse.setdefault(chosen_fn, []).append(f"wt_{wt_name}")

    # Collect all item iconIds needed for weapons, armors, talismans, greases, ammo, spells
    wep_map: Dict[str, int] = {}
    arm_map: Dict[str, int] = {}
    tal_map: Dict[str, int] = {}
    good_map: Dict[str, int] = {}
    ammo_map: Dict[str, int] = {}
    spell_map: Dict[str, int] = {}
    needed_icon_ids: Set[int] = {15}  # Flask of Crimson Tears default

    if weapon_data:
        for w in weapon_data.get("weapons", []):
            bid = int(w.get("baseId", w["id"]))
            bkey = str(bid)
            if bkey in wep_map:
                continue
            row = wep_param.get(int(w["id"])) or wep_param.get(bid)
            if row:
                iid = reg_ex._u16(row, 190)
                if _find_item_sprite_name(iid):
                    wep_map[bkey] = iid
                    needed_icon_ids.add(iid)
        for ak in (weapon_data.get("ammo") or {}).keys():
            aid = int(ak)
            row = wep_param.get(aid)
            if row:
                iid = reg_ex._u16(row, 190)
                if _find_item_sprite_name(iid):
                    ammo_map[str(aid)] = iid
                    needed_icon_ids.add(iid)
        for ak in (weapon_data.get("armors") or {}).keys():
            aid = int(ak)
            row = prot_param.get(aid)
            if row:
                iid = reg_ex._u16(row, 166)
                if _find_item_sprite_name(iid):
                    arm_map[str(aid)] = iid
                    needed_icon_ids.add(iid)
        for tk in (weapon_data.get("talismans") or {}).keys():
            tid = int(tk)
            row = acc_param.get(tid)
            if row:
                iid = reg_ex._u16(row, 38)
                if _find_item_sprite_name(iid):
                    tal_map[str(tid)] = iid
                    needed_icon_ids.add(iid)
        for sk in (weapon_data.get("spells") or {}).keys():
            sid = int(sk)
            row = good_param.get(sid)
            if row:
                iid = reg_ex._u16(row, 48)
                if _find_item_sprite_name(iid):
                    spell_map[str(sid)] = iid
                    needed_icon_ids.add(iid)
        for g in weapon_data.get("greases", []):
            gid = int(g["id"])
            row = good_param.get(gid)
            if row:
                iid = reg_ex._u16(row, 48)
                if _find_item_sprite_name(iid):
                    good_map[str(gid)] = iid
                    needed_icon_ids.add(iid)

    # Batch extract per atlas so each DDS page is decoded only once
    atlas_jobs: Dict[str, List[Tuple[str, str, int, int, int, int]]] = {}

    def _queue_job(kind: str, out_key: str, sprite_name: str) -> None:
        loc = subtex_index.get(sprite_name)
        if not loc:
            return
        atlas_key, x, y, w, h = loc
        atlas_jobs.setdefault(atlas_key, []).append((kind, out_key, x, y, w, h))

    for mk, sp_name in STATIC_UI_SPRITES.items():
        _queue_job("menu", mk, sp_name)
    for sp_name, keys in wt_reverse.items():
        for wk in keys:
            _queue_job("menu", wk, sp_name)
    for iid in sorted(needed_icon_ids):
        fn = _find_item_sprite_name(iid)
        if fn:
            _queue_job("item", str(iid), fn)

    menu_assets: Dict[str, str] = {}
    if out_menu_json and os.path.isfile(out_menu_json):
        try:
            with open(out_menu_json, "r", encoding="utf-8") as fh:
                prev = json.load(fh)
            if isinstance(prev, dict):
                menu_assets.update({str(k): str(v) for k, v in prev.items() if isinstance(v, str)})
        except Exception:
            pass

    item_icons: Dict[str, str] = {}
    for atlas_key, jobs in atlas_jobs.items():
        dds = tpf_map.get(atlas_key)
        if not dds:
            continue
        atlas_im = gme._decode_dds_rgba(dds)
        if atlas_im is None:
            continue
        for kind, out_key, x, y, w, h in jobs:
            crop = atlas_im.crop((x, y, x + w, y + h))
            if kind == "item":
                item_icons[out_key] = _img_to_uri(crop, max_size=(76, 76), fmt="WEBP")
            else:
                if out_key == "equip_waku":
                    max_sz: Optional[Tuple[int, int]] = (128, 146)
                elif out_key == "slot_base":
                    max_sz = (144, 146)
                elif out_key.startswith("aff_"):
                    max_sz = (40, 40)
                elif out_key.startswith("wt_"):
                    max_sz = (40, 40)
                elif (
                    out_key.startswith(("st_", "ap_", "attr_", "guard_", "cb_"))
                    or out_key in ("ic_lockon", "ic_zoom_in", "ic_zoom_out", "ic_completed", "ic_cross")
                ):
                    max_sz = (44, 44)
                elif out_key in (
                    "cursor_wide", "cursor_half", "cursor_top", "line_h", "line_v",
                    "line_v_full", "hp_base", "cond_waku",
                    "boss_bar_deco", "boss_bar_deco_l", "boss_bar_hp", "boss_bar_cond", "boss_name_base",
                ):
                    max_sz = None
                else:
                    max_sz = (96, 96)
                menu_assets[out_key] = _img_to_uri(crop, max_size=max_sz, fmt="PNG")

    custom_icons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui", "icons")
    if os.path.isdir(custom_icons_dir):
        for fn in sorted(os.listdir(custom_icons_dir)):
            if not fn.lower().endswith(".png"):
                continue
            key = os.path.splitext(fn)[0]
            try:
                with Image.open(os.path.join(custom_icons_dir, fn)) as cim:
                    menu_assets[key] = _img_to_uri(cim.convert("RGBA"), max_size=(64, 64), fmt="PNG")
            except Exception:
                pass

    if out_menu_json:
        os.makedirs(os.path.dirname(os.path.abspath(out_menu_json)), exist_ok=True)
        with open(out_menu_json, "w", encoding="utf-8") as fh:
            json.dump(menu_assets, fh, separators=(",", ":"))

    icons_payload = {
        "version": 1,
        "count": len(item_icons),
        "icons": item_icons,
        "wep": wep_map,
        "arm": arm_map,
        "tal": tal_map,
        "good": good_map,
        "ammo": ammo_map,
        "spell": spell_map,
    }
    if out_icons_gz:
        abs_ic = os.path.abspath(out_icons_gz)
        tmp_ic = abs_ic + ".tmp"
        with gzip.open(tmp_ic, "wt", encoding="utf-8") as fh:
            json.dump(icons_payload, fh, separators=(",", ":"))
        os.replace(tmp_ic, abs_ic)

    return {
        "ok": True,
        "menuCount": len(menu_assets),
        "iconCount": len(item_icons),
        "wtCount": sum(1 for k in menu_assets if k.startswith("wt_")),
        "affCount": sum(1 for k in menu_assets if k.startswith("aff_")),
        "iconsPayload": icons_payload,
        "menuAssets": menu_assets,
    }


def main() -> None:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--mod-dir", default=None)
    ap.add_argument("--reg-path", default=None)
    args = ap.parse_args()
    base = os.path.dirname(os.path.abspath(__file__))
    res = extract_er_ui_assets(
        mod_dir=args.mod_dir,
        reg_path=args.reg_path,
        weapon_data_path=os.path.join(base, "err_weapon_data.json.gz"),
        out_menu_json=os.path.join(base, "ui", "er_menu_assets.json"),
        out_icons_gz=os.path.join(base, "er_ui_icons.json.gz"),
    )
    print(
        f"ER UI ASSETS EXTRACTED: menu={res['menuCount']} aff={res['affCount']} "
        f"wt={res['wtCount']} itemIcons={res['iconCount']}"
    )


if __name__ == "__main__":
    main()
