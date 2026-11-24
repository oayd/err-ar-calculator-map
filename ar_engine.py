from collections import OrderedDict
import math
from typing import Dict, List, Optional, Tuple

STAT_KEYS = ("str", "dex", "int", "fai", "arc")
STATUS_KEYS = ("bleed", "poison", "rot", "frost", "sleep", "madness", "death")
# Maps spStatus indices (0:blood, 1:poison, 2:rot, 3:frost, 4:sleep, 5:madness, 6:death) -> weapon ccg status index (or None if unscaled)
STATUS_CCG_INDEX = (6, 5, None, None, 7, 8, None)

ENEMY_PRESETS = OrderedDict(
    [
        ("Raw AR (No Defense)", None),
        (
            "Early Game (103 Def, 10% Neg)",
            {"def": (103.0, 103.0, 103.0, 103.0, 103.0), "neg": (0.10, 0.10, 0.10, 0.10, 0.10)},
        ),
        (
            "Mid Game (114 Def, 20% Neg)",
            {"def": (114.0, 114.0, 114.0, 114.0, 114.0), "neg": (0.20, 0.20, 0.20, 0.20, 0.20)},
        ),
        (
            "Endgame / DLC Boss (125 Def, 35% Neg)",
            {"def": (125.0, 125.0, 125.0, 125.0, 125.0), "neg": (0.35, 0.35, 0.35, 0.35, 0.35)},
        ),
        (
            "Armored Boss (125 Def, 45% Phys / 20% Elem)",
            {"def": (125.0, 125.0, 125.0, 125.0, 125.0), "neg": (0.45, 0.20, 0.20, 0.20, 0.20)},
        ),
        (
            "Elem-Resistant Boss (125 Def, 20% Phys / 50% Elem)",
            {"def": (125.0, 125.0, 125.0, 125.0, 125.0), "neg": (0.20, 0.50, 0.50, 0.50, 0.50)},
        ),
    ]
)

DEFAULT_ENEMY_PRESET = "Endgame / DLC Boss (125 Def, 35% Neg)"


def calc_correct(stat: float, ccg_entry: List[List[float]]) -> float:
    vals, grow, adj = ccg_entry
    if stat < vals[0]:
        stat = vals[0]
    elif stat > vals[4]:
        stat = vals[4]

    stage = 3
    for i in range(4):
        if vals[i + 1] > vals[i] and stat <= vals[i + 1]:
            stage = i
            break
    span = vals[stage + 1] - vals[stage]
    if span <= 0.0:
        return grow[stage] / 100.0

    ratio = (stat - vals[stage]) / span
    a = adj[stage]
    if a > 0.0:
        growth = ratio ** a
    elif a < 0.0:
        growth = 1.0 - ((1.0 - ratio) ** (-a))
    else:
        growth = ratio

    return (grow[stage] + (grow[stage + 1] - grow[stage]) * growth) / 100.0


def calc_fromsoft_defense(atk: float, defense: float) -> float:
    """Elden Ring 5-segment piecewise ATK/DEF flat defense reduction."""
    if atk <= 0.0:
        return 0.0
    if defense <= 0.0:
        return atk

    r = atk / defense
    if r < 0.125:
        mult = 0.10
    elif r < 1.0:
        mult = 0.10 + ((r - 0.125) ** 2) * (19.2 / 49.0)
    elif r < 2.5:
        mult = 0.70 - ((2.5 - r) ** 2) * (0.4 / 3.0)
    elif r < 8.0:
        mult = 0.90 - ((8.0 - r) ** 2) * (0.8 / 121.0)
    else:
        mult = 0.90
    return atk * mult


def calc_effective_damage(elem_ar: List[float], enemy_preset: str) -> Tuple[float, List[float]]:
    """Compute effective damage per element after defense and negation for an enemy preset."""
    preset = ENEMY_PRESETS.get(enemy_preset)
    if preset is None:
        elems = list(elem_ar)
        return sum(elems), elems

    defs = preset["def"]
    negs = preset["neg"]
    dmg = [calc_fromsoft_defense(elem_ar[i], defs[i]) * (1.0 - negs[i]) for i in range(5)]
    return sum(dmg), dmg


def scaling_grade(val: float, grade_table: List[Tuple[int, str]]) -> str:
    if val <= 0.0:
        return "-"
    for threshold, letter in grade_table:
        if val >= threshold:
            return letter
    return "F"


def resolve_upgrade_level(weapon: Dict, reg_lv: int, somber_lv: int) -> int:
    max_lv = weapon["maxLv"]
    if max_lv == 25:
        lv = reg_lv
    else:
        lv = somber_lv
    if lv < 0:
        return 0
    return max_lv if lv > max_lv else lv


def compute_weapon(
    weapon: Dict,
    data: Dict,
    stats: Dict[str, int],
    reg_lv: int,
    somber_lv: int,
    two_hand: bool,
    override_lv: int = -1,
    enemy_preset: str = "Raw AR (No Defense)",
    buffs: Optional[Dict] = None,
) -> Dict:
    lv = max(0, min(override_lv, weapon["maxLv"])) if override_lv >= 0 else resolve_upgrade_level(weapon, reg_lv, somber_lv)
    reinf_map = data["reinforce"]
    reinf = reinf_map.get(str(weapon["rt"] + lv)) or reinf_map.get(str(weapon["rt"]))
    if reinf is None:
        reinf = [1.0] * 10 + [0, 0, 0]

    aec = data["aec"].get(str(weapon["aec"]))
    if aec is None:
        aec_f = [False] * 25
        aec_o = [-1] * 25
        aec_i = [100] * 25
    else:
        aec_f = aec["f"]
        aec_o = aec["o"]
        aec_i = aec["i"]

    stat_bonus = (buffs.get("statBonus") if buffs else None) or (0, 0, 0, 0, 0)
    b_stats = tuple(max(1, min(199, int(stats[STAT_KEYS[i]]) + int(stat_bonus[i]))) for i in range(5))
    eff_str = int(b_stats[0] * 1.5) if (two_hand and not weapon["dual"]) else b_stats[0]
    eff_stats = (eff_str, b_stats[1], b_stats[2], b_stats[3], b_stats[4])
    req = weapon["req"]
    met = [eff_stats[i] >= req[i] for i in range(5)]

    corr = weapon["corr"]
    eff_corr = [corr[i] * reinf[5 + i] for i in range(5)]
    grades = [scaling_grade(eff_corr[i], data["gradeTable"]) for i in range(5)]

    ccg_map = data["ccg"]
    base_atks = weapon["atk"]
    elem_base = [0.0, 0.0, 0.0, 0.0, 0.0]
    elem_scale = [0.0, 0.0, 0.0, 0.0, 0.0]
    elem_ar = [0.0, 0.0, 0.0, 0.0, 0.0]

    for el in range(5):
        base = base_atks[el] * reinf[el]
        if base <= 0.0:
            continue
        elem_base[el] = base
        offset = el * 5
        missing_req = False
        for si in range(5):
            if aec_f[offset + si] and not met[si]:
                missing_req = True
                break
        if missing_req:
            pen = -base * 0.4
            elem_scale[el] = pen
            elem_ar[el] = base + pen
        else:
            ccg_entry = ccg_map[str(weapon["ccg"][el])]
            scale_sum = 0.0
            for si in range(5):
                idx = offset + si
                if not aec_f[idx]:
                    continue
                ovr = aec_o[idx]
                c_val = ovr if ovr >= 0 else eff_corr[si]
                if c_val <= 0.0:
                    continue
                inf = aec_i[idx] / 100.0
                scale_sum += calc_correct(eff_stats[si], ccg_entry) * (c_val / 100.0) * inf
            sc = base * scale_sum
            elem_scale[el] = sc
            elem_ar[el] = base + sc

    spell_scaling = 0.0
    if weapon["cat"]:
        missing_req = False
        for si in range(5):
            if aec_f[5 + si] and not met[si]:
                missing_req = True
                break
        if missing_req:
            spell_scaling = 60.0
        else:
            ccg_m = ccg_map[str(weapon["ccg"][1])]
            s_sum = 0.0
            for si in range(5):
                idx = 5 + si
                if not aec_f[idx]:
                    continue
                ovr = aec_o[idx]
                c_val = ovr if ovr >= 0 else eff_corr[si]
                if c_val <= 0.0:
                    continue
                inf = aec_i[idx] / 100.0
                s_sum += calc_correct(eff_stats[si], ccg_m) * (c_val / 100.0) * inf
            spell_scaling = 100.0 * (1.0 + s_sum)

    statuses = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    sp_status = data["spStatus"]
    arc_scale_val = eff_corr[4]
    arc_met = met[4]
    for slot_i, beh_id in enumerate(weapon["spBeh"]):
        if beh_id <= 0:
            continue
        sid = str(beh_id + reinf[10 + slot_i])
        vals = sp_status.get(sid)
        if not vals:
            continue
        for k, raw_v in enumerate(vals):
            if raw_v <= 0:
                continue
            ccg_idx = STATUS_CCG_INDEX[k]
            if ccg_idx is not None and arc_scale_val > 0.0 and arc_met:
                ccg_st = ccg_map[str(weapon["ccg"][ccg_idx])]
                mult = 1.0 + calc_correct(b_stats[4], ccg_st) * (arc_scale_val / 100.0)
                statuses[k] += raw_v * mult
            else:
                statuses[k] += raw_v

    if buffs:
        grease = buffs.get("grease")
        if grease and weapon.get("buffable"):
            g_flat = grease.get("flat") or (0, 0, 0, 0, 0)
            g_rate = grease.get("rate") or (1.0, 1.0, 1.0, 1.0, 1.0)
            g_st = grease.get("status") or (0, 0, 0, 0, 0, 0, 0)
            for el in range(5):
                elem_ar[el] = elem_ar[el] * g_rate[el] + g_flat[el]
            for k in range(7):
                if g_st[k] > 0:
                    statuses[k] += g_st[k]

        elem_mult = buffs.get("elemMult")
        if elem_mult:
            for el in range(5):
                elem_ar[el] *= elem_mult[el]

    stance_mult = float(buffs.get("stanceMult", 1.0)) if buffs else 1.0
    eff_stance = weapon.get("stance", 0.0) * stance_mult

    total_ar = sum(elem_ar)
    eff_total, eff_elems = calc_effective_damage(elem_ar, enemy_preset)
    return {
        "weapon": weapon,
        "lv": lv,
        "total": total_ar,
        "eff": eff_total,
        "effElems": eff_elems,
        "ar": elem_ar,
        "base": elem_base,
        "scale": elem_scale,
        "spell": spell_scaling,
        "status": statuses,
        "grades": grades,
        "corr": eff_corr,
        "stance": eff_stance,
        "met": all(met),
        "metList": met,
    }


def compute_next_stat_gains(
    weapon: Dict,
    data: Dict,
    stats: Dict[str, int],
    reg_lv: int,
    somber_lv: int,
    two_hand: bool,
    delta: int = 5,
    override_lv: int = -1,
    enemy_preset: str = "Raw AR (No Defense)",
    buffs: Optional[Dict] = None,
) -> Dict[str, Tuple[float, float, float]]:
    base_res = compute_weapon(
        weapon,
        data,
        stats,
        reg_lv,
        somber_lv,
        two_hand,
        override_lv=override_lv,
        enemy_preset=enemy_preset,
        buffs=buffs,
    )
    gains = {}
    for k in STAT_KEYS:
        mod_stats = dict(stats)
        mod_stats[k] = mod_stats[k] + delta
        new_res = compute_weapon(
            weapon,
            data,
            mod_stats,
            reg_lv,
            somber_lv,
            two_hand,
            override_lv=override_lv,
            enemy_preset=enemy_preset,
            buffs=buffs,
        )
        gains[k] = (
            new_res["total"] - base_res["total"],
            new_res["spell"] - base_res["spell"],
            new_res["eff"] - base_res["eff"],
        )
    return gains


def _active_scaling_indices(weapon: Dict, data: Dict, aec_f: List[bool], aec_o: List[int]) -> List[int]:
    corr = weapon["corr"]
    base_atks = weapon["atk"]
    active = []
    for si in range(5):
        if corr[si] > 0.0:
            active.append(si)
            continue
        has_ovr = False
        for el in range(5):
            if base_atks[el] <= 0 and not (weapon["cat"] and el == 1):
                continue
            idx = el * 5 + si
            if aec_f[idx] and aec_o[idx] > 0:
                has_ovr = True
                break
        if has_ovr:
            active.append(si)
    return active if active else [0, 1, 2, 3, 4]


def _metric_pair(res: Dict, metric: str) -> Tuple[float, float, float]:
    if metric == "spell":
        return (res["spell"], res["eff"], res["total"])
    if metric == "eff":
        return (res["eff"], res["total"], res["spell"])
    return (res["total"], res["eff"], res["spell"])


def optimize_stats_for_weapon(
    variants: List[Dict],
    data: Dict,
    current_stats: Dict[str, int],
    reg_lv: int,
    somber_lv: int,
    two_hand: bool,
    extra_points: int = 0,
    floor_mode: str = "respec",
    min_stat: int = 8,
    metric: str = "total",
    enemy_preset: str = "Raw AR (No Defense)",
    override_lv: int = -1,
    buffs: Optional[Dict] = None,
) -> List[Dict]:
    """Find optimal (STR, DEX, INT, FAI, ARC) allocation across weapon variants for the given point budget."""
    budget = sum(max(1, int(current_stats[k])) for k in STAT_KEYS) + extra_points
    if floor_mode == "keep":
        base_floor = [max(1, int(current_stats[k])) for k in STAT_KEYS]
    else:
        base_floor = [min(min_stat, max(1, int(current_stats[k]))) for k in STAT_KEYS]
    stat_bonus = (buffs.get("statBonus") if buffs else None) or (0, 0, 0, 0, 0)

    results = []
    for w in variants:
        lv = max(0, min(override_lv, w["maxLv"])) if override_lv >= 0 else resolve_upgrade_level(w, reg_lv, somber_lv)
        base_res = compute_weapon(
            w, data, current_stats, reg_lv, somber_lv, two_hand, override_lv=lv, enemy_preset=enemy_preset, buffs=buffs
        )

        req = w["req"]
        use_2h_str = two_hand and not w["dual"]
        req_min = [
            max(1, math.ceil(req[0] / 1.5) - int(stat_bonus[0])) if use_2h_str else max(1, req[0] - int(stat_bonus[0])),
            max(1, req[1] - int(stat_bonus[1])),
            max(1, req[2] - int(stat_bonus[2])),
            max(1, req[3] - int(stat_bonus[3])),
            max(1, req[4] - int(stat_bonus[4])),
        ]
        req_floor = [max(base_floor[i], req_min[i]) for i in range(5)]

        if sum(req_floor) <= budget:
            cur = list(req_floor)
            rem = budget - sum(cur)
        else:
            cur = list(base_floor)
            rem = max(0, budget - sum(cur))
            # Greedily satisfy lowest-cost unmet requirements first when budget cannot cover all
            deficits = sorted(
                ((req_floor[i] - cur[i], i) for i in range(5) if cur[i] < req_floor[i]),
                key=lambda x: x[0],
            )
            for deficit, si in deficits:
                if rem <= 0:
                    break
                add = min(rem, deficit, max(0, 99 - cur[si]))
                cur[si] += add
                rem -= add

        aec = data["aec"].get(str(w["aec"]))
        aec_f = aec["f"] if aec else [False] * 25
        aec_o = aec["o"] if aec else [-1] * 25
        active_indices = _active_scaling_indices(w, data, aec_f, aec_o)

        def eval_vec(vec: List[int]) -> Dict:
            st = {STAT_KEYS[i]: vec[i] for i in range(5)}
            return compute_weapon(
                w, data, st, reg_lv, somber_lv, two_hand, override_lv=lv, enemy_preset=enemy_preset, buffs=buffs
            )

        cur_res = eval_vec(cur)
        cur_score = _metric_pair(cur_res, metric)

        while rem > 0:
            best_step = None
            best_gain_per_pt = (0.0, 0.0, 0.0)
            best_new_vec = None
            best_new_res = None
            best_new_score = cur_score

            # Test +1 on each active scaling stat
            for si in active_indices:
                if cur[si] >= 99:
                    continue
                cand = list(cur)
                cand[si] += 1
                cand_res = eval_vec(cand)
                cand_score = _metric_pair(cand_res, metric)
                gain = (
                    cand_score[0] - cur_score[0],
                    cand_score[1] - cur_score[1],
                    cand_score[2] - cur_score[2],
                )
                if gain > best_gain_per_pt:
                    best_gain_per_pt = gain
                    best_step = 1
                    best_new_vec = cand
                    best_new_res = cand_res
                    best_new_score = cand_score

            # Test +2 STR normalized per point when 2H STR floors skip an odd increment
            if rem >= 2 and use_2h_str and 0 in active_indices and cur[0] <= 97:
                cand2 = list(cur)
                cand2[0] += 2
                cand2_res = eval_vec(cand2)
                cand2_score = _metric_pair(cand2_res, metric)
                gain2 = (
                    (cand2_score[0] - cur_score[0]) * 0.5,
                    (cand2_score[1] - cur_score[1]) * 0.5,
                    (cand2_score[2] - cur_score[2]) * 0.5,
                )
                if gain2 > best_gain_per_pt:
                    best_gain_per_pt = gain2
                    best_step = 2
                    best_new_vec = cand2
                    best_new_res = cand2_res
                    best_new_score = cand2_score

            if best_step is None or (best_gain_per_pt[0] <= 1e-6 and best_gain_per_pt[1] <= 1e-6):
                break

            cur = best_new_vec
            cur_res = best_new_res
            cur_score = best_new_score
            rem -= best_step

        best_stats = {STAT_KEYS[i]: cur[i] for i in range(5)}
        results.append(
            {
                "weapon": w,
                "stats": best_stats,
                "res": cur_res,
                "base_res": base_res,
                "unspent": rem,
                "met": cur_res["met"],
            }
        )

    results.sort(
        key=lambda e: (e["met"],) + _metric_pair(e["res"], metric),
        reverse=True,
    )
    return results
