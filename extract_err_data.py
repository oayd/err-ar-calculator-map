import argparse
import gzip
import json
import math
import os
import sys

DEFAULT_OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "err_weapon_data.json.gz")
SoulsFormats = None

AFFINITY_BY_OFFSET = {
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

AEC_ELEMENTS = ("Physics", "Magic", "Fire", "Thunder", "Dark")
AEC_STATS = ("Strength", "Dexterity", "Magic", "Faith", "Luck")


def init_soulsformats(game_dir, smithbox_dir):
    global SoulsFormats
    os.environ["PATH"] = game_dir + ";" + os.environ.get("PATH", "")
    os.chdir(game_dir)

    from pythonnet import load

    load("coreclr")
    import clr

    sys.path.append(smithbox_dir)
    clr.AddReference("Andre.SoulsFormats")
    import SoulsFormats as _SF

    SoulsFormats = _SF


def load_param(reg, defs_dir, param_name, xml_name):
    pdef = SoulsFormats.PARAMDEF.XmlDeserialize(os.path.join(defs_dir, xml_name))
    for f in reg.Files:
        if os.path.basename(f.Name).lower() == param_name.lower():
            p = SoulsFormats.SoulsFile[SoulsFormats.PARAM].Read(f.Bytes)
            p.ApplyParamdef(pdef)
            return p
    raise FileNotFoundError(f"Missing param {param_name}")


def load_texts(err_mod_dir):
    msg_dir = os.path.join(err_mod_dir, "msg", "engus")
    weapon_names = {}
    arts_names = {}
    prot_names = {}
    acc_names = {}
    goods_names = {}
    menu_texts = {}
    for bnd_name in ("item.msgbnd.dcx", "item_dlc01.msgbnd.dcx", "item_dlc02.msgbnd.dcx"):
        bp = os.path.join(msg_dir, bnd_name)
        if not os.path.exists(bp):
            continue
        rdr = SoulsFormats.BND4Reader(bp)
        try:
            for fh in rdr.Files:
                fname = os.path.basename(fh.Name).lower()
                if "weaponname" in fname:
                    target = weapon_names
                elif "artsname" in fname:
                    target = arts_names
                elif "protectorname" in fname:
                    target = prot_names
                elif "accessoryname" in fname:
                    target = acc_names
                elif "goodsname" in fname:
                    target = goods_names
                else:
                    continue
                fmg = SoulsFormats.SoulsFile[SoulsFormats.FMG].Read(rdr.ReadFile(fh))
                for e in fmg.Entries:
                    if e.Text:
                        txt = e.Text.strip()
                        if txt and txt.lower() != "err dummy" and "[error]" not in txt.lower():
                            target[int(e.ID)] = txt
        finally:
            rdr.Dispose()

    for bnd_name in ("menu.msgbnd.dcx", "menu_dlc01.msgbnd.dcx", "menu_dlc02.msgbnd.dcx"):
        bp = os.path.join(msg_dir, bnd_name)
        if not os.path.exists(bp):
            continue
        rdr = SoulsFormats.BND4Reader(bp)
        try:
            for fh in rdr.Files:
                fmg = SoulsFormats.SoulsFile[SoulsFormats.FMG].Read(rdr.ReadFile(fh))
                for e in fmg.Entries:
                    if e.Text:
                        menu_texts[int(e.ID)] = e.Text
        finally:
            rdr.Dispose()

    return weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts


def _safe_rate(val, default=1.0):
    f = float(val)
    if math.isnan(f) or f <= 0.01:
        return default
    return f


def extract_sp_bonuses(sid, sp_map):
    sr = sp_map.get(sid)
    if sr is None:
        return [0, 0, 0, 0, 0], [1.0, 1.0, 1.0, 1.0, 1.0], 1.0, 0
    stats = [
        int(sr["addStrengthStatus"].Value),
        int(sr["addDexterityStatus"].Value),
        int(sr["addMagicStatus"].Value),
        int(sr["addFaithStatus"].Value),
        int(sr["addLuckStatus"].Value),
    ]
    rate_fields = (
        ("physicsAttackPowerRate", "atkEnemyDmgCorrectRate_Physics"),
        ("magicAttackPowerRate", "atkEnemyDmgCorrectRate_Magic"),
        ("fireAttackPowerRate", "atkEnemyDmgCorrectRate_Fire"),
        ("thunderAttackPowerRate", "atkEnemyDmgCorrectRate_Thunder"),
        ("darkAttackPowerRate", "atkEnemyDmgCorrectRate_Dark"),
    )
    mult = []
    for f1, f2 in rate_fields:
        m = _safe_rate(sr[f1].Value) * _safe_rate(sr[f2].Value)
        mult.append(round(m, 6))
    stance_rate = round(_safe_rate(sr["saAttackPowerRate"].Value), 6)
    cond_id = int(sr["cycleOccurrenceSpEffectId"].Value)
    return stats, mult, stance_rate, (cond_id if cond_id > 0 else 0)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract ELDEN RING Reforged weapon/armor/talisman data into err_weapon_data.json.gz"
    )
    parser.add_argument("--game", default=os.environ.get("ER_GAME_DIR", ""), help="Path to ELDEN RING/Game directory")
    parser.add_argument("--smithbox", default=os.environ.get("SMITHBOX_DIR", ""), help="Path to Smithbox directory")
    parser.add_argument("--err-mod", default=os.environ.get("ERR_MOD_DIR", ""), help="Path to ERR mod directory")
    parser.add_argument("--regulation", default=os.environ.get("ERR_REGULATION_PATH", ""), help="Optional path to regulation.bin")
    parser.add_argument("--out", default=DEFAULT_OUT_PATH, help="Output .json.gz path")
    parser.add_argument("--mod-label", default="ERR v2.3.9.1", help="Mod label stored in payload metadata")
    args = parser.parse_args()
    if not args.game or not args.smithbox or not args.err_mod:
        parser.error("Provide --game, --smithbox, and --err-mod (or set ER_GAME_DIR, SMITHBOX_DIR, ERR_MOD_DIR).")
    if not args.regulation:
        args.regulation = os.path.join(args.err_mod, "regulation.bin")
    return args


def main():
    args = parse_args()
    defs_dir = os.path.join(args.smithbox, "Assets", "PARAM", "ER", "Defs")
    out_path = os.path.abspath(args.out)
    init_soulsformats(args.game, args.smithbox)

    print(f"Reading {args.regulation} ...")
    reg = SoulsFormats.SFUtil.DecryptERRegulation(args.regulation)
    wep_param = load_param(reg, defs_dir, "equipparamweapon.param", "EquipParamWeapon.xml")
    reinf_param = load_param(reg, defs_dir, "reinforceparamweapon.param", "ReinforceParamWeapon.xml")
    ccg_param = load_param(reg, defs_dir, "calccorrectgraph.param", "CalcCorrectGraph.xml")
    aec_param = load_param(reg, defs_dir, "attackelementcorrectparam.param", "AttackElementCorrectParam.xml")
    sp_param = load_param(reg, defs_dir, "speffectparam.param", "SpEffect.xml")
    mv_param = load_param(reg, defs_dir, "menuvaluetableparam.param", "MenuValueTableSpecParam.xml")
    prot_param = load_param(reg, defs_dir, "equipparamprotector.param", "EquipParamProtector.xml")
    acc_param = load_param(reg, defs_dir, "equipparamaccessory.param", "EquipParamAccessory.xml")
    goods_param = load_param(reg, defs_dir, "equipparamgoods.param", "EquipParamGoods.xml")
    beh_param = load_param(reg, defs_dir, "behaviorparam_pc.param", "BehaviorParam.xml")
    atk_param = load_param(reg, defs_dir, "atkparam_pc.param", "AtkParam.xml")
    weapon_names, arts_names, prot_names, acc_names, goods_names, menu_texts = load_texts(args.err_mod)

    grade_table = []
    weapon_types = {}
    for r in mv_param.Rows:
        rid = int(r.ID)
        val = int(r["value"].Value)
        tid = int(r["textId"].Value)
        txt = menu_texts.get(tid, "")
        if 100 <= rid <= 115 and txt:
            grade_table.append([val, txt])
        elif 120 <= rid <= 180 and txt and val not in (81, 83, 85, 86):
            # Skip redundant id 140 Fist or puzzle entries > 99
            if val < 100 and (val not in weapon_types):
                weapon_types[val] = txt
    grade_table.sort(key=lambda x: x[0], reverse=True)

    reinf_map = {int(r.ID): r for r in reinf_param.Rows}
    sp_map = {int(r.ID): r for r in sp_param.Rows}
    atk_map = {int(r.ID): r for r in atk_param.Rows}
    beh_by_var = {}
    for br in beh_param.Rows:
        bvar = int(br["variationId"].Value)
        jid = int(br["behaviorJudgeId"].Value)
        if jid in (0, 10, 100):
            beh_by_var[(bvar, jid)] = br

    # First pass: determine valid non-ammo weapons & infusable bases
    raw_valid = []
    valid_ids = set()
    for r in wep_param.Rows:
        rid = int(r.ID)
        if rid < 1000000:
            continue
        if int(r["disableParam_NT"].Value) != 0:
            continue
        wc = int(r["weaponCategory"].Value)
        wt = int(r["wepType"].Value)
        if wc == 13 or wt in (81, 83, 85, 86):
            continue
        nm = weapon_names.get(rid, "").strip()
        if not nm or "[ERROR]" in nm.upper():
            continue
        raw_valid.append((rid, r, nm))
        valid_ids.add(rid)

    infusable_bases = set()
    for rid, _, _ in raw_valid:
        if rid % 10000 == 0 and (rid + 100) in valid_ids:
            infusable_bases.add(rid)

    weapons = []
    used_sp_ids = set()
    used_reinf_ids = set()
    used_ccg_ids = set()
    used_aec_ids = set()

    for rid, r, nm in raw_valid:
        wt = int(r["wepType"].Value)
        wc = int(r["weaponCategory"].Value)
        off = rid % 10000
        base_candidate = (rid // 10000) * 10000
        if base_candidate in valid_ids and (off in AFFINITY_BY_OFFSET):
            base_id = base_candidate
            base_name = weapon_names.get(base_id, nm).strip()
            if off == 0:
                affinity = "Standard" if base_id in infusable_bases else "Unique"
            else:
                affinity = AFFINITY_BY_OFFSET[off]
        else:
            base_id = rid
            base_name = nm
            affinity = "Unique"

        rt = int(r["reinforceTypeId"].Value)
        max_lv = 0
        for lv in range(26):
            if (rt + lv) in reinf_map:
                max_lv = lv
                used_reinf_ids.add(rt + lv)
            else:
                break

        sp_beh = [
            int(r["spEffectBehaviorId0"].Value),
            int(r["spEffectBehaviorId1"].Value),
            int(r["spEffectBehaviorId2"].Value),
        ]
        for lv in range(max_lv + 1):
            rr = reinf_map.get(rt + lv)
            if rr is None:
                continue
            offs = (
                int(rr["spEffectId1"].Value),
                int(rr["spEffectId2"].Value),
                int(rr["spEffectId3"].Value),
            )
            for b, o in zip(sp_beh, offs):
                if b > 0:
                    used_sp_ids.add(b + o)

        ccg_list = [
            int(r["correctType_Physics"].Value),
            int(r["correctType_Magic"].Value),
            int(r["correctType_Fire"].Value),
            int(r["correctType_Thunder"].Value),
            int(r["correctType_Dark"].Value),
            int(r["correctType_Poison"].Value),
            int(r["correctType_Blood"].Value),
            int(r["correctType_Sleep"].Value),
            int(r["correctType_Madness"].Value),
        ]
        used_ccg_ids.update(ccg_list)
        aec_id = int(r["attackElementCorrectId"].Value)
        used_aec_ids.add(aec_id)

        en_mag = int(r["enableMagic"].Value) != 0
        en_sorc = int(r["enableSorcery"].Value) != 0
        en_mir = int(r["enableMiracle"].Value) != 0
        is_catalyst = wt in (27, 57, 59, 61) or en_sorc or en_mir

        if wt not in weapon_types:
            weapon_types[wt] = f"Type {wt}"

        ptypes = []
        if int(r["isNormalAttackType"].Value) != 0:
            ptypes.append("Standard")
        if int(r["isBlowAttackType"].Value) != 0:
            ptypes.append("Strike")
        if int(r["isSlashAttackType"].Value) != 0:
            ptypes.append("Slash")
        if int(r["isThrustAttackType"].Value) != 0:
            ptypes.append("Pierce")
        phys_types = "/".join(ptypes) if ptypes else "-"

        skill_id = int(r["swordArtsParamId"].Value)
        skill_name = arts_names.get(skill_id, "")
        buffable = int(r["isEnhance"].Value) != 0
        infusable = int(r["disableGemAttr"].Value) == 0
        stamina = int(r["attackBaseStamina"].Value)
        weight = round(float(r["weight"].Value), 2)

        bvar = int(r["behaviorVariationId"].Value)
        br = (
            beh_by_var.get((bvar, 0))
            or beh_by_var.get(((bvar // 100) * 100, 0))
            or beh_by_var.get((bvar, 10))
            or beh_by_var.get(((bvar // 100) * 100, 10))
        )
        r1_stam = round(int(br["stamina"].Value) * float(r["staminaConsumptionRate"].Value) / 10.0, 1) if br else 0.0
        ar_row = atk_map.get(int(br["refId"].Value)) if br else None
        sa_corr = float(ar_row["atkSuperArmorCorrection"].Value) if ar_row else 0.0
        sa_mult = (sa_corr / 100.0) if sa_corr > 0 else 1.0
        stance = round(float(r["saWeaponDamage"].Value) * sa_mult, 1)

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
                "crit": 100 + int(r["throwAtkRate"].Value),
                "dual": int(r["isDualBlade"].Value) != 0,
                "both": int(r["bothHandEquipable"].Value) != 0,
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
                "atk": [
                    int(r["attackBasePhysics"].Value),
                    int(r["attackBaseMagic"].Value),
                    int(r["attackBaseFire"].Value),
                    int(r["attackBaseThunder"].Value),
                    int(r["attackBaseDark"].Value),
                ],
                "corr": [
                    round(float(r["correctStrength"].Value), 6),
                    round(float(r["correctAgility"].Value), 6),
                    round(float(r["correctMagic"].Value), 6),
                    round(float(r["correctFaith"].Value), 6),
                    round(float(r["correctLuck"].Value), 6),
                ],
                "req": [
                    int(r["properStrength"].Value),
                    int(r["properAgility"].Value),
                    int(r["properMagic"].Value),
                    int(r["properFaith"].Value),
                    int(r["properLuck"].Value),
                ],
                "ccg": ccg_list,
                "spBeh": sp_beh,
            }
        )

    reinforce = {}
    for rid in sorted(used_reinf_ids):
        rr = reinf_map[rid]
        reinforce[str(rid)] = [
            round(float(rr["physicsAtkRate"].Value), 6),
            round(float(rr["magicAtkRate"].Value), 6),
            round(float(rr["fireAtkRate"].Value), 6),
            round(float(rr["thunderAtkRate"].Value), 6),
            round(float(rr["darkAtkRate"].Value), 6),
            round(float(rr["correctStrengthRate"].Value), 6),
            round(float(rr["correctAgilityRate"].Value), 6),
            round(float(rr["correctMagicRate"].Value), 6),
            round(float(rr["correctFaithRate"].Value), 6),
            round(float(rr["correctLuckRate"].Value), 6),
            int(rr["spEffectId1"].Value),
            int(rr["spEffectId2"].Value),
            int(rr["spEffectId3"].Value),
        ]

    ccg = {}
    for r in ccg_param.Rows:
        cid = int(r.ID)
        if cid in used_ccg_ids:
            ccg[str(cid)] = [
                [round(float(r[f"stageMaxVal{i}"].Value), 6) for i in range(5)],
                [round(float(r[f"stageMaxGrowVal{i}"].Value), 6) for i in range(5)],
                [round(float(r[f"adjPt_maxGrowVal{i}"].Value), 6) for i in range(5)],
            ]

    aec = {}
    for r in aec_param.Rows:
        aid = int(r.ID)
        if aid in used_aec_ids:
            flags = []
            ovr = []
            inf = []
            for elem in AEC_ELEMENTS:
                for st in AEC_STATS:
                    flags.append(int(r[f"is{st}Correct_by{elem}"].Value) != 0)
                    ovr.append(int(r[f"overwrite{st}CorrectRate_by{elem}"].Value))
                    inf.append(int(r[f"Influence{st}CorrectRate_by{elem}"].Value))
            aec[str(aid)] = {"f": flags, "o": ovr, "i": inf}

    sp_status = {}
    for sid in sorted(used_sp_ids):
        sr = sp_map.get(sid)
        if sr is None:
            continue
        vals = [
            int(sr["bloodAttackPower"].Value),
            int(sr["poizonAttackPower"].Value),
            int(sr["diseaseAttackPower"].Value),
            int(sr["freezeAttackPower"].Value),
            int(sr["sleepAttackPower"].Value),
            int(sr["madnessAttackPower"].Value),
            int(sr["curseAttackPower"].Value),
        ]
        if any(v > 0 for v in vals):
            sp_status[str(sid)] = vals

    armors = {}
    for r in prot_param.Rows:
        rid = int(r.ID)
        if int(r["disableParam_NT"].Value) != 0:
            continue
        nm = prot_names.get(rid, "")
        if not nm:
            continue
        if int(r["headEquip"].Value):
            slot_idx = 0
        elif int(r["bodyEquip"].Value):
            slot_idx = 1
        elif int(r["armEquip"].Value):
            slot_idx = 2
        elif int(r["legEquip"].Value):
            slot_idx = 3
        else:
            continue

        tot_st = [0, 0, 0, 0, 0]
        tot_mult = [1.0, 1.0, 1.0, 1.0, 1.0]
        tot_sa = 1.0
        for sf in ("residentSpEffectId", "residentSpEffectId2", "residentSpEffectId3"):
            sid = int(r[sf].Value)
            if sid <= 0:
                continue
            st_b, m_b, sa_b, _ = extract_sp_bonuses(sid, sp_map)
            for k in range(5):
                tot_st[k] += st_b[k]
                tot_mult[k] *= m_b[k]
            tot_sa *= sa_b

        entry = {"n": nm, "s": slot_idx}
        if any(x != 0 for x in tot_st):
            entry["st"] = tot_st
        if any(abs(m - 1.0) > 1e-4 for m in tot_mult):
            entry["m"] = [round(m, 6) for m in tot_mult]
        if abs(tot_sa - 1.0) > 1e-4:
            entry["sa"] = round(tot_sa, 6)
        armors[str(rid)] = entry

    talismans = {}
    for r in acc_param.Rows:
        rid = int(r.ID)
        if int(r["disableParam_NT"].Value) != 0:
            continue
        nm = acc_names.get(rid, "")
        if not nm:
            continue
        sid = int(r["refId"].Value)
        st_b, m_b, sa_b, cond_id = extract_sp_bonuses(sid, sp_map)
        cm = None
        if cond_id > 0:
            c_st, c_m, c_sa, _ = extract_sp_bonuses(cond_id, sp_map)
            if any(abs(m - 1.0) > 1e-4 for m in c_m):
                cm = c_m
            for k in range(5):
                st_b[k] += c_st[k]
            sa_b *= c_sa

        entry = {"n": nm}
        if any(x != 0 for x in st_b):
            entry["st"] = st_b
        if any(abs(m - 1.0) > 1e-4 for m in m_b):
            entry["m"] = m_b
        if abs(sa_b - 1.0) > 1e-4:
            entry["sa"] = round(sa_b, 6)
        if cm:
            entry["cm"] = cm
        talismans[str(rid)] = entry

    greases = []
    seen_grease_sp = set()
    for r in goods_param.Rows:
        gid = int(r.ID)
        nm = goods_names.get(gid, "")
        if not nm or "grease" not in nm.lower():
            continue
        ref_def = int(r["refId_default"].Value)
        if not (513800 <= ref_def <= 515700):
            continue
        sp_id = ref_def + 2
        sr = sp_map.get(sp_id)
        if sr is None or int(sr["wepParamChange"].Value) != 1 or sp_id in seen_grease_sp:
            continue
        seen_grease_sp.add(sp_id)
        flat = [
            int(sr["physicsAttackPower"].Value),
            int(sr["magicAttackPower"].Value),
            int(sr["fireAttackPower"].Value),
            int(sr["thunderAttackPower"].Value),
            int(sr["darkAttackPower"].Value),
        ]
        rate = [
            round(_safe_rate(sr["physicsAttackPowerRate"].Value), 6),
            round(_safe_rate(sr["magicAttackPowerRate"].Value), 6),
            round(_safe_rate(sr["fireAttackPowerRate"].Value), 6),
            round(_safe_rate(sr["thunderAttackPowerRate"].Value), 6),
            round(_safe_rate(sr["darkAttackPowerRate"].Value), 6),
        ]
        st_vals = [0, 0, 0, 0, 0, 0, 0]
        atk_sp = int(sr["atkOccurrenceSpEffectId"].Value)
        ar_sr = sp_map.get(atk_sp)
        if ar_sr is not None:
            st_vals = [
                int(ar_sr["bloodAttackPower"].Value),
                int(ar_sr["poizonAttackPower"].Value),
                int(ar_sr["diseaseAttackPower"].Value),
                int(ar_sr["freezeAttackPower"].Value),
                int(ar_sr["sleepAttackPower"].Value),
                int(ar_sr["madnessAttackPower"].Value),
                int(ar_sr["curseAttackPower"].Value),
            ]
        greases.append({"id": gid, "name": nm, "flat": flat, "rate": rate, "status": st_vals})

    payload = {
        "mod": args.mod_label,
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
    }

    with gzip.open(out_path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))

    sz = os.path.getsize(out_path)
    print(
        f"Extracted {len(weapons)} weapons ({len(infusable_bases)} infusable bases, "
        f"{len(payload['affinities'])} affinities, {len(weapon_types)} weaponTypes, "
        f"{len(armors)} armors, {len(talismans)} talismans, {len(greases)} greases, "
        f"{len(reinforce)} reinforce, {len(ccg)} ccg, {len(aec)} aec, {len(sp_status)} spStatus)"
    )
    print(f"Wrote {out_path} ({sz:,} bytes)")


if __name__ == "__main__":
    main()
