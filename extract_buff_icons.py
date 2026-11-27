"""
Builds the offline buff & debuff icon + metadata bundle `err_buff_icons.json.gz`.

Combines:
  1. All ~146 official status effect icons fetched once from Fextralife
     (auto-cropped transparent margins and pixel-centered on an even/odd
     parity-matched 40x40 / 41x41 RGBA canvas with ZERO resampling blur).
  2. ERR v2.3.10.1 `SpEffectParam` + Smithbox Community Row Names + FMG metadata
     for every timed player buff & debuff `iconId` and notable `paramId`.

The runtime desktop app loads `err_buff_icons.json.gz` 100% offline with zero
runtime network requests.
"""

import argparse
import base64
import gzip
import io
import json
import math
import os
import re
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT_PATH = os.path.join(BASE_DIR, "err_buff_icons.json.gz")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
FEX_STATUS_URL = "https://eldenring.wiki.fextralife.com/Status_Effects"


def _http_get(url: str, timeout: float = 25.0) -> bytes:
    last_exc: Optional[Exception] = None
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:
            last_exc = exc
    raise RuntimeError(f"Failed to fetch {url}: {last_exc}")


def scrape_fextralife_status_icons() -> List[Dict[str, Any]]:
    html = _http_get(FEX_STATUS_URL).decode("utf-8", errors="replace")
    rows: List[Dict[str, Any]] = []
    seen_nums = set()
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        m_img = re.search(r'<img[^>]+src="([^"]*Status_effect_(\d+)[^"]*\.png)"[^>]*>', tr, re.I)
        if not m_img:
            continue
        url = m_img.group(1)
        fex_num = int(m_img.group(2))
        if fex_num in seen_nums:
            continue
        seen_nums.add(fex_num)
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
        clean = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()
        cells = [clean(td) for td in tds]
        effect = cells[1] if len(cells) > 1 else ""
        sources = cells[2] if len(cells) > 2 else ""
        rows.append({
            "num": fex_num,
            "key": f"fex_{fex_num}",
            "url": url,
            "effect": effect,
            "sources": sources,
        })
    rows.sort(key=lambda r: r["num"])
    return rows


def center_crop_png_b64(raw_png: bytes) -> str:
    """Crop empty padding (alpha <= 8) and center natively without resampling."""
    im = Image.open(io.BytesIO(raw_png)).convert("RGBA")
    mask = im.split()[3].point(lambda p: 255 if p > 8 else 0)
    bbox = mask.getbbox()
    cropped = im.crop(bbox) if bbox else im
    cw, ch = cropped.size
    max_dim = max(cw, ch)
    base = 41 if (max_dim % 2 == 1) else 40
    canvas_sz = max(base, cw + 2, ch + 2)
    if (canvas_sz % 2) != (max_dim % 2):
        canvas_sz += 1
    canvas = Image.new("RGBA", (canvas_sz, canvas_sz), (0, 0, 0, 0))
    ox = (canvas_sz - cw) // 2
    oy = (canvas_sz - ch) // 2
    canvas.paste(cropped, (ox, oy), cropped)
    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def download_all_icons(rows: List[Dict[str, Any]]) -> Dict[str, str]:
    icons: Dict[str, str] = {}

    def _job(row: Dict[str, Any]) -> Tuple[str, str]:
        raw = _http_get(row["url"], timeout=25.0)
        return row["key"], center_crop_png_b64(raw)

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = [pool.submit(_job, r) for r in rows]
        for fut in as_completed(futs):
            k, b64 = fut.result()
            icons[k] = b64
    return dict(sorted(icons.items(), key=lambda kv: int(kv[0].split("_")[1])))


# Curated mapping from game SpEffectParam.iconId -> (fex_num, defaultTitle, defaultDesc, isDebuff)
CURATED_ICON_MAP: Dict[int, Tuple[int, str, str, bool]] = {
    5001: (27, "Defensive Ward", "Temporarily reduces incoming damage.", False),
    5009: (54, "Attack Up", "Temporarily increases attack power.", False),
    5018: (134, "HP Regeneration", "Gradually restores HP over time.", False),
    10000: (54, "Attack Power Boost", "Temporarily increases attack power.", False),
    10011: (134, "HP Regeneration", "Gradually restores HP over time.", False),
    20006: (63, "Weapon War Cry", "Temporarily raises weapon attack power.", False),
    20007: (54, "Attack Power Up", "Temporarily boosts offensive power.", False),
    20008: (36, "Elemental Conversion", "Converts elemental damage received into HP or bolsters negation.", False),
    20010: (143, "FP / Guard Surge", "Temporarily bolsters defensive fortitude.", False),
    20011: (143, "HP Regeneration", "Gradually restores HP or triggers near-death healing.", False),
    20012: (41, "Cerulean Bubbletear", "Restores FP automatically when near death.", False),
    20064: (78, "Next Attack Empowered", "Greatly increases the damage of your next attack.", False),
    20066: (79, "Shield Defense Boost", "Temporarily increases shield guard negation and stability.", False),
    20069: (49, "Spell Power Boost", "Temporarily increases sorcery and spell damage.", False),
    20206: (54, "Attack Power Boost", "Temporarily increases attack power.", False),
    20210: (1, "Stamina Recovery Up", "Temporarily boosts stamina recovery speed.", False),
    20285: (54, "Attack Up", "Temporarily increases attack power.", False),
    20286: (54, "Attack Up", "Temporarily increases attack power.", False),
    20405: (68, "Flask Recovery Blocked", "Prevents HP recovery from the Flask of Crimson Tears.", True),
    20406: (27, "Oath & Fortification", "Increases damage negation and/or attack power.", False),
    20407: (14, "Status Resistance Boost", "Temporarily boosts status ailment resistances.", False),
    20408: (27, "Elemental Negation Up", "Temporarily increases elemental damage negation.", False),
    20409: (14, "Status Resistance Up", "Temporarily raises Immunity, Robustness, Focus, and Vitality.", False),
    20410: (1, "Stamina Recovery Up", "Temporarily increases stamina recovery speed.", False),
    20411: (134, "HP Regeneration", "Gradually restores HP over time.", False),
    20412: (121, "FP Regeneration", "Gradually restores FP over time.", False),
    20417: (27, "Hardtear Negation", "Temporarily boosts damage negation.", False),
    20420: (53, "Windy Dodge Boost", "Improves dodge rolls at the cost of lower negation.", False),
    20421: (39, "Fall Damage Negated", "Reduces or negates fall damage and cushions footsteps.", False),
    20422: (26, "Muffled Movement", "Temporarily silences footsteps and movement sound.", False),
    20423: (13, "Twiggy Protection", "Prevents rune loss on death.", False),
    20426: (120, "Message Visibility Up", "Increases summon & message signs visible from other worlds.", False),
    20427: (107, "Item Discovery Up", "Temporarily increases Item Discovery.", False),
    20428: (94, "Rune Acquisition Up", "Temporarily increases runes gained from defeated enemies.", False),
    20430: (66, "Poise Boost", "Temporarily increases poise and knockdown resistance.", False),
    20453: (38, "Charge Attack Up", "Temporarily strengthens charged heavy attacks.", False),
    20460: (12, "Destined Death (Max HP Down)", "Temporarily reduces Max HP and saps vitality.", True),
    20461: (145, "Successive Attack Boost", "Consecutive attacks temporarily raise attack power.", False),
    20462: (132, "Hit HP Restoration", "Successive hits temporarily restore HP.", False),
    20465: (93, "Stamina Guard Break Up", "Attacks temporarily deal extra stamina damage to guarding foes.", False),
    20466: (79, "Barricade Guard Up", "Greatly improves shield guard stability.", False),
    20468: (51, "Attack Power Down", "Temporarily lowers attack power.", True),
    20469: (37, "Defense Negation Down", "Temporarily lowers damage negation.", True),
    20491: (131, "Max HP Up", "Temporarily increases Maximum HP.", False),
    20492: (118, "Max FP Up", "Temporarily increases Maximum FP.", False),
    20493: (105, "Max Stamina Up", "Temporarily increases Maximum Stamina.", False),
    20494: (92, "Equip Load Up", "Greatly increases maximum equipment load.", False),
    20495: (54, "Attack Up", "Temporarily increases attack power.", False),
    20496: (64, "Unseen Form", "Temporarily conceals the user, reducing enemy detection range.", False),
    20520: (81, "Zero Stamina Consumption", "Temporarily eliminates stamina cost for actions.", False),
    20524: (36, "Deflecting Hardtear", "Spontaneous guards boost guard negation and guard counter power.", False),
    20525: (37, "Stamina Recovery Down", "Temporarily slows stamina recovery speed.", True),
    20600: (1, "Stamina Recovery Up", "Temporarily increases stamina recovery speed.", False),
    20602: (27, "Guard Damage Ward", "Temporarily reduces incoming damage.", False),
    20636: (54, "Attack Power Boost", "Temporarily raises attack power.", False),
    20637: (134, "HP Regeneration", "Gradually restores HP over time.", False),
    20638: (27, "Damage Negation Up", "Temporarily increases damage negation.", False),
    20675: (27, "Opaline Bubbletear", "Significantly reduces damage taken from the next hit.", False),
    20686: (92, "Heavy Burden", "Temporarily increases weight load.", True),
    20700: (18, "Stats & Resource Penalty", "Temporarily lowers Max HP, FP, and Stamina.", True),
    20760: (105, "Max Stamina Up", "Temporarily increases Maximum Stamina.", False),
    20780: (81, "Stamina Cost Zero", "Eliminates stamina consumption temporarily.", False),
    20786: (8, "Spirit Ash Empowered", "Temporarily strengthens summoned Spirit Ashes.", False),
    20796: (51, "Damage Output Penalty", "Temporarily weakens outgoing attack damage.", True),
    20797: (51, "Damage Output Penalty", "Temporarily reduces outgoing damage.", True),
    20808: (54, "Buff Active", "Temporary combat enchantment active.", False),
    20809: (2, "Skill Power Up", "Temporarily boosts Ash of War / Skill damage.", False),
    20811: (2, "Stance & Skill Boost", "Maintaining a stance increases skill attack power.", False),
    20813: (54, "Crusade Insignia", "Defeating an enemy temporarily boosts attack power.", False),
    20815: (27, "Dried Bouquet", "Raises attack power when Spirit Ashes fall.", False),
    20816: (124, "Blade of Mercy", "Landing a critical hit temporarily boosts attack power.", False),
    20862: (81, "Zero FP Consumption", "Temporarily eliminates all FP consumption.", False),
    20893: (50, "Hit FP Restoration", "Successive attacks temporarily restore FP.", False),
    20913: (54, "Strength Up", "Temporarily increases Strength.", False),
    20916: (54, "Dexterity Up", "Temporarily increases Dexterity.", False),
    20919: (40, "Intelligence Up", "Temporarily increases Intelligence.", False),
    20922: (40, "Faith Up", "Temporarily increases Faith.", False),
    20925: (59, "Arcane Up", "Temporarily increases Arcane.", False),
    20940: (136, "Blood Loss Attack Boost", "Nearby blood loss temporarily increases attack power.", False),
    20948: (54, "Oath of Vengeance", "Temporarily raises all attributes.", False),
    20949: (40, "Mind / Arcane Surge", "Boosts Intelligence, Faith, and Arcane temporarily.", False),
    20950: (54, "Body Surge", "Boosts Vigor, Strength, and Dexterity temporarily.", False),
    20980: (54, "Physical & Fire Attack Up", "Temporarily boosts Physical and/or Fire attack power.", False),
    20981: (63, "Roar Weapon Buff", "Temporarily increases physical damage and alters heavy attacks.", False),
    20983: (54, "Fire Attack Boost", "Temporarily increases Fire damage.", False),
    20984: (63, "Flame / Blood Weapon Buff", "Imbues weapon with fire or bloodflame damage.", False),
    20986: (40, "Magic Attack Boost", "Temporarily increases Magic damage.", False),
    20987: (63, "Magic / Frost Weapon Buff", "Imbues weapon with magic or frost damage.", False),
    20989: (54, "Lightning Attack Boost", "Temporarily increases Lightning damage.", False),
    20990: (63, "Lightning Weapon Buff", "Imbues weapon with lightning damage.", False),
    20992: (40, "Holy Attack Boost", "Temporarily increases Holy damage.", False),
    20993: (63, "Sacred Weapon Buff", "Imbues weapon with Holy damage and undead bonus.", False),
}


def _clean_crn_name(raw: str) -> str:
    if not raw:
        return ""
    s = re.sub(r"^\[[^\]]+\]\s*", "", raw).strip()
    s = re.sub(r"\s*:\s*Setup.*$", "", s, flags=re.I)
    s = re.sub(r"\s*-\s*(Damage/Defence Buff|Damage Buff|Poise Buff|Defence|HP Regen|Hardness Buff|Effect|Bullet|VFX|Icon|Setup|Buff|No FP)\b.*$", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" -:")
    return s


def _fval(row, col: str, default: float = 1.0) -> float:
    try:
        v = float(row[col].Value)
        return v if math.isfinite(v) else default
    except Exception:
        return default


def _analyze_sp_effect(row) -> Tuple[Optional[str], bool, bool, List[str]]:
    """Return (auto_desc, is_debuff, has_positive, keywords) from SpEffectParam numerical fields."""
    hints: List[str] = []
    has_positive = False
    has_negative = False

    atk_phys = _fval(row, "physicsAttackPowerRate", 1.0) * _fval(row, "atkEnemyDmgCorrectRate_Physics", 1.0)
    atk_mag = _fval(row, "magicAttackPowerRate", 1.0) * _fval(row, "atkEnemyDmgCorrectRate_Magic", 1.0)
    atk_fir = _fval(row, "fireAttackPowerRate", 1.0) * _fval(row, "atkEnemyDmgCorrectRate_Fire", 1.0)
    atk_ltg = _fval(row, "thunderAttackPowerRate", 1.0) * _fval(row, "atkEnemyDmgCorrectRate_Thunder", 1.0)
    atk_hly = _fval(row, "darkAttackPowerRate", 1.0) * _fval(row, "atkEnemyDmgCorrectRate_Dark", 1.0)
    max_atk = max(atk_phys, atk_mag, atk_fir, atk_ltg, atk_hly)
    min_atk = min(atk_phys, atk_mag, atk_fir, atk_ltg, atk_hly)
    flat_atk = max(
        _fval(row, "physicsAttackPower", 0.0),
        _fval(row, "magicAttackPower", 0.0),
        _fval(row, "fireAttackPower", 0.0),
        _fval(row, "thunderAttackPower", 0.0),
        _fval(row, "darkAttackPower", 0.0),
    )
    if max_atk > 1.02 or flat_atk > 0.5:
        hints.append("Increases attack power")
        has_positive = True
    elif 0.01 < min_atk < 0.98:
        hints.append("Reduces attack power")
        has_negative = True

    cut_p = _fval(row, "slashDamageCutRate", 1.0) * _fval(row, "defEnemyDmgCorrectRate_Physics", 1.0)
    cut_m = _fval(row, "magicDamageCutRate", 1.0) * _fval(row, "defEnemyDmgCorrectRate_Magic", 1.0)
    cut_f = _fval(row, "fireDamageCutRate", 1.0) * _fval(row, "defEnemyDmgCorrectRate_Fire", 1.0)
    cut_t = _fval(row, "thunderDamageCutRate", 1.0) * _fval(row, "defEnemyDmgCorrectRate_Thunder", 1.0)
    cut_d = _fval(row, "darkDamageCutRate", 1.0) * _fval(row, "defEnemyDmgCorrectRate_Dark", 1.0)
    min_cut = min(cut_p, cut_m, cut_f, cut_t, cut_d)
    max_cut = max(cut_p, cut_m, cut_f, cut_t, cut_d)
    if 0.0 < min_cut < 0.97:
        hints.append("increases damage negation")
        has_positive = True
    if max_cut > 1.03:
        hints.append("increases damage taken")
        has_negative = True

    hp_pt = _fval(row, "changeHpPoint", 0.0)
    hp_rt = _fval(row, "changeHpRate", 0.0)
    if hp_pt < -0.1 or hp_rt < -0.01:
        hints.append("gradually restores HP")
        has_positive = True
    elif hp_pt > 0.1 or hp_rt > 0.01:
        hints.append("drains HP over time")
        has_negative = True

    max_hp = _fval(row, "maxHpRate", 1.0)
    if max_hp > 1.02:
        hints.append("raises Max HP")
        has_positive = True
    elif 0.01 < max_hp < 0.98:
        hints.append("reduces Max HP")
        has_negative = True

    max_st = _fval(row, "maxStaminaRate", 1.0)
    if max_st > 1.02:
        hints.append("raises Max Stamina")
        has_positive = True
    elif 0.01 < max_st < 0.98:
        hints.append("reduces Max Stamina")
        has_negative = True

    st_rec = _fval(row, "staminaRecoverChangeSpeed", 0.0)
    if st_rec > 1.0:
        hints.append("boosts stamina recovery")
        has_positive = True
    elif st_rec < -1.0:
        hints.append("slows stamina recovery")
        has_negative = True

    max_mp = _fval(row, "maxMpRate", 1.0)
    if max_mp > 1.02:
        hints.append("raises Max FP")
        has_positive = True

    eq_w = _fval(row, "equipWeightChangeRate", 1.0)
    if eq_w > 1.02:
        hints.append("increases Equip Load")
        has_positive = True
    elif 0.01 < eq_w < 0.95:
        hints.append("lowers Equip Load")
        has_negative = True

    add_stats = []
    for lbl, col in (
        ("Vigor", "addLifeForceStatus"),
        ("Strength", "addStrengthStatus"),
        ("Dexterity", "addDexterityStatus"),
        ("Intelligence", "addMagicStatus"),
        ("Faith", "addFaithStatus"),
        ("Arcane", "addLuckStatus"),
    ):
        v = _fval(row, col, 0.0)
        if v >= 1:
            add_stats.append(f"+{int(v)} {lbl}")
            has_positive = True
        elif v <= -1:
            add_stats.append(f"{int(v)} {lbl}")
            has_negative = True
    if add_stats:
        hints.append("adjusts " + ", ".join(add_stats[:3]))

    sa_r = _fval(row, "saAttackPowerRate", 1.0)
    if sa_r > 1.02:
        hints.append("raises stance damage")
        has_positive = True

    soul_r = _fval(row, "soulRate", 1.0)
    if soul_r > 1.02:
        hints.append("increases runes gained")
        has_positive = True

    if int(round(_fval(row, "stateInfo", 0.0))) == 290:
        hints.append("improves dodge rolls")
        has_positive = True

    debuff = bool(has_negative and not has_positive)
    desc = None
    if hints:
        sentence = ", ".join(hints)
        desc = sentence[0].upper() + sentence[1:] + "."
    return desc, debuff, has_positive, hints


def _pick_fex_num_for_icon(icon_id: int, crn_names: List[str], hints: List[str], is_debuff: bool) -> int:
    if icon_id in CURATED_ICON_MAP:
        return CURATED_ICON_MAP[icon_id][0]
    joined = (" ".join(crn_names) + " " + " ".join(hints)).lower()
    if "no flask" in joined or "prevent" in joined and "flask" in joined:
        return 68
    if "reduces max hp" in joined or "max hp debuff" in joined or "destined death" in joined:
        return 12
    if "increases damage taken" in joined or "defence down" in joined or "negation down" in joined:
        return 52 if is_debuff else 37
    if "reduces attack" in joined or "attack down" in joined:
        return 51
    if "slows stamina" in joined:
        return 37
    if "drains hp" in joined or is_debuff:
        return 43
    if "stamina recovery" in joined:
        return 1
    if "restores hp" in joined or "hp regen" in joined:
        return 134
    if "raises max hp" in joined:
        return 131
    if "raises max fp" in joined:
        return 118
    if "raises max stamina" in joined:
        return 105
    if "equip load" in joined:
        return 92
    if "discovery" in joined:
        return 107
    if "runes" in joined:
        return 94
    if "poise" in joined or "stance" in joined:
        return 66
    if "negation" in joined or "shield" in joined or "guard" in joined:
        return 27
    if "magic" in joined or "intelligence" in joined or "faith" in joined or "spell" in joined:
        return 40
    if "weapon buff" in joined or "roar" in joined:
        return 63
    return 54


def build_bundle(
    game_dir: str,
    smithbox_dir: str,
    err_mod_dir: str,
    regulation_path: str = "",
    reuse_icons_path: str = "",
) -> Dict[str, Any]:
    if reuse_icons_path and os.path.exists(reuse_icons_path):
        print(f"Reusing existing icons from {reuse_icons_path}...")
        with gzip.open(reuse_icons_path, "rt", encoding="utf-8") as fh:
            icons = dict(json.load(fh).get("icons") or {})
        fex_by_num: Dict[int, Dict[str, Any]] = {}
    else:
        print("Fetching Fextralife Status_Effects list...")
        fex_rows = scrape_fextralife_status_icons()
        print(f"Found {len(fex_rows)} Fextralife status icons; downloading & centering cleanly...")
        icons = download_all_icons(fex_rows)
        fex_by_num = {r["num"]: r for r in fex_rows}

    sys.path.insert(0, BASE_DIR)
    import extract_err_data as ed

    defs_dir = os.path.join(smithbox_dir, "Assets", "PARAM", "ER", "Defs")
    crn_path = os.path.join(smithbox_dir, "Assets", "PARAM", "ER", "Community Row Names", "SpEffectParam.json")
    id_to_crn: Dict[int, str] = {}
    if os.path.exists(crn_path):
        with open(crn_path, "r", encoding="utf-8") as fh:
            crn = json.load(fh)
        for e in crn.get("Entries") or []:
            eid = int(e.get("ID", -1))
            el = e.get("Entries") or []
            if el and eid >= 0:
                id_to_crn[eid] = str(el[0]).strip()

    print("Loading ERR regulation.bin SpEffectParam & FMGs...")
    ed.init_soulsformats(game_dir, smithbox_dir)
    reg_file = os.path.abspath(regulation_path) if regulation_path else os.path.join(err_mod_dir, "regulation.bin")
    reg = ed.SoulsFormats.SFUtil.DecryptERRegulation(reg_file)
    sp_param = ed.load_param(reg, defs_dir, "speffectparam.param", "SpEffect.xml")
    goods_param = ed.load_param(reg, defs_dir, "equipparamgoods.param", "EquipParamGoods.xml")
    magic_param = ed.load_param(reg, defs_dir, "magic.param", "MagicParam.xml")
    acc_param = ed.load_param(reg, defs_dir, "equipparamaccessory.param", "EquipParamAccessory.xml")

    msg_dir = os.path.join(err_mod_dir, "msg", "engus")
    fmg_names: Dict[str, Dict[int, str]] = {"goods": {}, "magic": {}, "acc": {}}
    for bnd in ("item.msgbnd.dcx", "item_dlc01.msgbnd.dcx", "item_dlc02.msgbnd.dcx"):
        bp = os.path.join(msg_dir, bnd)
        if not os.path.exists(bp):
            continue
        rdr = ed.SoulsFormats.BND4Reader(bp)
        try:
            for fh in rdr.Files:
                fn = os.path.basename(fh.Name).lower()
                tgt = None
                if "goodsname" in fn:
                    tgt = fmg_names["goods"]
                elif "magicname" in fn:
                    tgt = fmg_names["magic"]
                elif "accessoryname" in fn:
                    tgt = fmg_names["acc"]
                if tgt is None:
                    continue
                fmg = ed.SoulsFormats.SoulsFile[ed.SoulsFormats.FMG].Read(rdr.ReadFile(fh))
                for e in fmg.Entries:
                    if e.Text:
                        txt = e.Text.strip()
                        if txt and txt.lower() != "err dummy" and "[error]" not in txt.lower():
                            tgt[int(e.ID)] = txt
        finally:
            rdr.Dispose()

    sp_sources: Dict[int, List[str]] = defaultdict(list)
    for r in magic_param.Rows:
        nm = fmg_names["magic"].get(int(r.ID))
        if not nm:
            continue
        for col in ("refId1", "refId2", "refId3", "refId4", "refId5", "refId6", "refId7", "refId8", "refId9", "refId10"):
            try:
                v = int(r[col].Value)
                if v > 0 and nm not in sp_sources[v]:
                    sp_sources[v].append(nm)
            except Exception:
                pass
    for r in goods_param.Rows:
        nm = fmg_names["goods"].get(int(r.ID))
        if not nm:
            continue
        for col in ("refId_default", "refId_1"):
            try:
                v = int(r[col].Value)
                if v > 0 and nm not in sp_sources[v]:
                    sp_sources[v].append(nm)
            except Exception:
                pass
    for r in acc_param.Rows:
        nm = fmg_names["acc"].get(int(r.ID))
        if not nm:
            continue
        try:
            v = int(r["refId"].Value)
            if v > 0 and nm not in sp_sources[v]:
                sp_sources[v].append(nm)
        except Exception:
            pass

    icon_rows: Dict[int, List[Tuple[int, Any, str]]] = defaultdict(list)
    sp_meta: Dict[str, List[Any]] = {}

    for r in sp_param.Rows:
        pid = int(r.ID)
        ic = int(r["iconId"].Value)
        dur = float(r["effectEndurance"].Value)
        if ic <= 0 or not (0.5 < dur < 3600.0):
            continue
        crn_raw = id_to_crn.get(pid, "")
        clean_crn = _clean_crn_name(crn_raw)
        srcs = sp_sources.get(pid, [])
        best_name = srcs[0] if srcs else (clean_crn or "")
        auto_desc, is_debuff, has_positive, hints = _analyze_sp_effect(r)
        if ic in CURATED_ICON_MAP and CURATED_ICON_MAP[ic][3] and not has_positive:
            is_debuff = True
        if best_name or auto_desc:
            cur_entry = CURATED_ICON_MAP.get(ic)
            if best_name:
                meta_title = best_name
            elif is_debuff and (not cur_entry or not cur_entry[3]):
                joined_h = " ".join(hints).lower()
                if "drains hp" in joined_h:
                    meta_title = "HP Drain"
                elif "increases damage taken" in joined_h:
                    meta_title = "Defense Negation Down"
                elif "reduces attack power" in joined_h:
                    meta_title = "Attack Power Down"
                elif "reduces max hp" in joined_h:
                    meta_title = "Max HP Down"
                else:
                    meta_title = f"Effect #{pid}"
            else:
                meta_title = cur_entry[1] if cur_entry else f"Effect #{pid}"
            if auto_desc:
                meta_desc = auto_desc
            elif is_debuff and (not cur_entry or not cur_entry[3]):
                meta_desc = "Temporary debuff active."
            else:
                meta_desc = cur_entry[2] if cur_entry else "Temporary active status effect."
            sp_meta[str(pid)] = [
                meta_title,
                meta_desc,
                bool(is_debuff),
            ]
        icon_rows[ic].append((pid, r, best_name))

    icon_map: Dict[str, List[Any]] = {}
    for ic in sorted(set(icon_rows.keys()) | set(CURATED_ICON_MAP.keys())):
        rows_for_ic = icon_rows.get(ic, [])
        sample_names = [nm for _, _, nm in rows_for_ic if nm]
        all_hints: List[str] = []
        deb_votes = 0
        buff_votes = 0
        first_desc = ""
        for _, r, _ in rows_for_ic[:25]:
            d, deb, _hp, hs = _analyze_sp_effect(r)
            if d and not first_desc:
                first_desc = d
            all_hints.extend(hs)
            if deb:
                deb_votes += 1
            else:
                buff_votes += 1
        majority_debuff = bool(deb_votes > 0 and deb_votes > buff_votes)

        if ic in CURATED_ICON_MAP:
            fex_num, cur_title, cur_desc, cur_deb = CURATED_ICON_MAP[ic]
            fex_key = f"fex_{fex_num}" if f"fex_{fex_num}" in icons else "fex_54"
            title = cur_title
            desc = cur_desc
            debuff = bool(cur_deb)
        else:
            fex_num = _pick_fex_num_for_icon(ic, sample_names, all_hints, majority_debuff)
            fex_key = f"fex_{fex_num}" if f"fex_{fex_num}" in icons else "fex_54"
            fex_info = fex_by_num.get(fex_num, {})
            title = sample_names[0] if sample_names else f"Active Effect ({ic})"
            desc = first_desc or (fex_info.get("effect") or "Temporary status effect active on player.")
            debuff = majority_debuff

        icon_map[str(ic)] = [fex_key, title, desc, debuff]

    return {
        "version": "1.8.2",
        "source": "Fextralife Elden Ring Status_Effects + ERR v2.3.10.1 SpEffectParam",
        "icons": icons,
        "iconMap": icon_map,
        "spMeta": sp_meta,
    }


def main():
    parser = argparse.ArgumentParser(description="Build offline err_buff_icons.json.gz")
    parser.add_argument("--game", default=r"E:\Program Files (x86)\Steam\steamapps\common\ELDEN RING\Game")
    parser.add_argument("--smithbox", default=r"C:\Users\kenne\Desktop\Smithbox_2_1_2_2016_02_16_a")
    parser.add_argument("--err-mod", default=r"C:\Elden Ring Modded\Convergence\2\EldenRingReforgedv2.3.9.1\ERR_v2.3.10.1\mod")
    parser.add_argument("--regulation", default="", help="Optional override path to regulation.bin")
    parser.add_argument("--reuse-icons", default="", help="Reuse scraped icons from an existing err_buff_icons.json.gz")
    parser.add_argument("--out", default=DEFAULT_OUT_PATH)
    args = parser.parse_args()

    payload = build_bundle(args.game, args.smithbox, args.err_mod, args.regulation, args.reuse_icons)
    out_path = os.path.abspath(args.out)
    with gzip.open(out_path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    kb = os.path.getsize(out_path) / 1024.0
    print(
        f"Wrote {out_path} ({kb:.1f} KB): "
        f"{len(payload['icons'])} icons, {len(payload['iconMap'])} iconMap entries, {len(payload['spMeta'])} spMeta entries."
    )


if __name__ == "__main__":
    main()
