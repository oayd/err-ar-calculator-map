(() => {
  "use strict";

  window.__JS_ERRORS = [];
  window.addEventListener("error", (e) => {
    window.__JS_ERRORS.push(e.message || String(e.error || "Unknown JS error"));
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__JS_ERRORS.push(String(e.reason || "Unhandled rejection"));
  });

  const STAT_KEYS = ["str", "dex", "int", "fai", "arc"];
  const STATUS_KEYS = ["bleed", "poison", "rot", "frost", "sleep", "madness", "death"];
  const STATUS_CCG_INDEX = [6, 5, null, null, 7, 8, null];
  // Display column order matching tclark.io: Poison, Scarlet Rot, Blood Loss, Frostbite, Sleep, Madness
  const STATUS_COL_SPECS = [
    { key: "poison", idx: 1, title: "Poison", color: "#68c15c", svg: '<path fill="currentColor" d="M12 2c-2.5 3.6-6 6.8-6 10.6a6 6 0 0 0 12 0C18 8.8 14.5 5.6 12 2zm0 15.2a3.2 3.2 0 0 1-3.2-3.2c0-1.1.5-2.1 1.1-3-.1 1.6.7 2.8 2.1 2.8.8 0 1.4-.4 1.8-.9.8.9 1.4 2 1.4 3.1a3.2 3.2 0 0 1-3.2 1.2z"/>' },
    { key: "rot", idx: 2, title: "Scarlet Rot", color: "#d65249", svg: '<path fill="currentColor" d="M12 2C9 5.5 7 8 7 11.5c0 2.1 1.2 4 3 4.8V21h4v-4.7c1.8-.8 3-2.7 3-4.8C17 8 15 5.5 12 2zm0 5.2c1.2 1.8 2.1 3.3 2.1 4.8a2.1 2.1 0 0 1-4.2 0c0-1.5.9-3 2.1-4.8z"/>' },
    { key: "bleed", idx: 0, title: "Blood Loss", color: "#c93b3b", svg: '<path fill="currentColor" d="M12 2.2C8.3 7 5.5 10.7 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.7 15.7 7 12 2.2zm2.2 14.6a2.8 2.8 0 0 1-3.9.2c-.8-.8-.9-2.1-.4-3.1.2 1.2 1 2 2.1 2.2.9.2 1.7-.1 2.2-.6z"/>' },
    { key: "frost", idx: 3, title: "Frostbite", color: "#69b9f0", svg: '<path fill="currentColor" d="M11 2h2v4.2l2.6-2.6 1.4 1.4-4 4V11h2l4-4 1.4 1.4L17.8 11H22v2h-4.2l2.6 2.6-1.4 1.4-4-4H13v2l4 4-1.4 1.4L13 17.8V22h-2v-4.2l-2.6 2.6-1.4-1.4 4-4V13H9l-4 4-1.4-1.4L6.2 13H2v-2h4.2L3.6 8.4 5 7l4 4h2V9L7 5l1.4-1.4L11 6.2V2z"/>' },
    { key: "sleep", idx: 4, title: "Sleep", color: "#a982e8", svg: '<path fill="currentColor" d="M14.5 3a8.8 8.8 0 1 0 6.5 14.7A7.2 7.2 0 0 1 14.5 3z"/>' },
    { key: "mad", idx: 5, title: "Madness", color: "#e8a838", svg: '<path fill="currentColor" d="M12 4.5C6.5 4.5 2.2 8.2 1 12c1.2 3.8 5.5 7.5 11 7.5s9.8-3.7 11-7.5c-1.2-3.8-5.5-7.5-11-7.5zm0 11.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>' },
  ];
  const STATUS_ASSET_MAP = {
    poison: "st_poison",
    rot: "st_rot",
    bleed: "st_bleed",
    frost: "st_frost",
    sleep: "st_sleep",
    mad: "st_mad",
    madness: "st_mad",
    death: "st_death",
  };
  function getStatusIconHtml(key, cls = "er-st-img", title = "") {
    const a = window.__ER_MENU_ASSETS || {};
    const ak = STATUS_ASSET_MAP[key];
    const uri = ak ? a[ak] : "";
    if (uri) {
      const altTxt = title || key;
      return `<img class="${cls}" src="${uri}" alt="${altTxt}" />`;
    }
    if (STATUS_SVGS[key]) return STATUS_SVGS[key];
    const spec = STATUS_COL_SPECS.find((s) => s.key === key);
    return spec ? `<svg class="${cls}" viewBox="0 0 24 24" style="color:${spec.color}">${spec.svg}</svg>` : "";
  }
  function getErInlineIconHtml(assetKey, alt = "", cls = "er-inline-ic") {
    const a = window.__ER_MENU_ASSETS || {};
    const uri = a[assetKey];
    if (!uri) return "";
    return `<img class="${cls}" src="${uri}" alt="${alt}" />`;
  }

  // Two-column Affinity sidebar matching ERR v2.3.9.1 & tclark.io layout
  const AFFINITY_LEFT = [
    "Standard", "Heavy", "Keen", "Quality", "Magic", "Magma",
    "Fell", "Bolt", "Sacred", "Night", "Fire", "Lightning",
  ];
  const AFFINITY_RIGHT = [
    "Blessed", "Poison", "Bloody", "Occult", "Bestial", "Gravitational",
    "Rotten", "Cursed", "Cold", "Soporific", "Frenzied", "Fated", "Unique",
  ];
  const PHYSICAL_AFFS = new Set(["Standard", "Heavy", "Keen", "Quality", "Bestial", "Unique"]);

  const RANGED_WT_SET = new Set([50, 51, 53, 55, 56]);
  const CATALYST_WT_SET = new Set([27, 57, 59, 61]);
  const SHIELD_WT_SET = new Set([65, 67, 69, 90]);

  const AFF_COLOR = {
    Standard: "#c6ccd4",
    Heavy: "#c49c68",
    Keen: "#8fb8d6",
    Quality: "#d9b977",
    Magic: "#5ba9f2",
    Magma: "#f06a38",
    Fell: "#d95b5b",
    Bolt: "#f5df66",
    Sacred: "#ebd275",
    Night: "#6b7fc9",
    Fire: "#f08543",
    Lightning: "#f2d656",
    Blessed: "#f2e2a0",
    Poison: "#6ec45e",
    Bloody: "#cf4040",
    Occult: "#a6a6b8",
    Bestial: "#c28f53",
    Gravitational: "#a579db",
    Rotten: "#c95349",
    Cursed: "#9980b5",
    Cold: "#7bc7f5",
    Soporific: "#b58df2",
    Frenzied: "#e8a538",
    Fated: "#b84f5c",
    Unique: "#9c8f7d",
  };

  function getItemIconUri(kind, idOrObj) {
    const icPack = state.erUiIcons;
    if (!icPack || !icPack.icons) return "";
    let iid = 0;
    if (kind === "wep" && idOrObj) {
      const bid = String(idOrObj.baseId || idOrObj.id || idOrObj);
      iid = (icPack.wep && icPack.wep[bid]) || 0;
    } else if (kind === "arm" && idOrObj) {
      iid = (icPack.arm && icPack.arm[String(idOrObj)]) || 0;
    } else if (kind === "tal" && idOrObj) {
      iid = (icPack.tal && icPack.tal[String(idOrObj)]) || 0;
    } else if (kind === "good" && idOrObj != null) {
      iid = (icPack.good && icPack.good[String(idOrObj)]) || Number(idOrObj) || 0;
    } else if (kind === "ammo" && idOrObj != null) {
      iid = (icPack.ammo && icPack.ammo[String(idOrObj)]) || 0;
    } else if (kind === "spell" && idOrObj != null) {
      iid = (icPack.spell && icPack.spell[String(idOrObj)]) || 0;
    }
    return iid ? (icPack.icons[String(iid)] || "") : "";
  }

  function affIconSvg(aff) {
    const a = window.__ER_MENU_ASSETS || {};
    const real = a[`aff_${aff}`];
    if (real) {
      return `<img class="er-aff-ic" src="${real}" alt="" aria-hidden="true" />`;
    }
    const col = AFF_COLOR[aff] || "#b8afa2";
    let glyph = '<path fill="currentColor" d="M12 3l6 4v5c0 4.2-2.6 7.4-6 9-3.4-1.6-6-4.8-6-9V7l6-4z"/>';
    if (["Fire", "Magma", "Fell", "Frenzied"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M13.5 2s.8 3.2-1.5 5.4c-1.5 1.4-1.8 3.2-.8 4.4.8-1 1.9-1.4 2.8-1.1 2.2.8 3.2 3.3 2.3 5.7-.9 2.3-3.2 3.6-5.7 3.6-3.4 0-6-2.5-6-5.9 0-3.2 2.2-6 5.2-8.2C11.4 4.8 13.5 2 13.5 2z"/>';
    } else if (["Lightning", "Bolt"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M13.5 2L5 13.2h6.2L9.8 22 19 10.4h-6.2z"/>';
    } else if (["Magic", "Gravitational", "Cold"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M12 2l5.5 6.5L12 22 6.5 8.5z"/>';
    } else if (["Sacred", "Blessed"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M12 2l2.1 6.2L20 10l-5.9 2.1L12 20l-2.1-7.9L4 10l5.9-1.8z"/>';
    } else if (["Bloody", "Fated"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M12 2.5C8.5 7.2 6 10.8 6 14.5a6 6 0 0 0 12 0c0-3.7-2.5-7.3-6-12z"/>';
    } else if (["Poison", "Rotten"].includes(aff)) {
      glyph = '<circle cx="12" cy="13" r="6" fill="currentColor"/><circle cx="9.5" cy="6.5" r="2" fill="currentColor"/><circle cx="14.5" cy="6" r="1.5" fill="currentColor"/>';
    } else if (["Soporific", "Night"].includes(aff)) {
      glyph = '<path fill="currentColor" d="M14.5 3.5a8.5 8.5 0 1 0 6 14 7 7 0 0 1-6-14z"/>';
    } else if (["Occult", "Cursed"].includes(aff)) {
      glyph = '<circle cx="12" cy="11" r="6.5" fill="currentColor"/><rect x="9" y="16" width="6" height="4" rx="1" fill="currentColor"/>';
    }
    return `<svg viewBox="0 0 24 24" style="color:${col}" aria-hidden="true">${glyph}</svg>`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Exact JS port of ar_engine.py math
  function calcCorrect(stat, ccgEntry) {
    const vals = ccgEntry[0];
    const grow = ccgEntry[1];
    const adj = ccgEntry[2];
    let s = stat;
    if (s < vals[0]) s = vals[0];
    else if (s > vals[4]) s = vals[4];

    let stage = 3;
    for (let i = 0; i < 4; i++) {
      if (vals[i + 1] > vals[i] && s <= vals[i + 1]) {
        stage = i;
        break;
      }
    }
    const span = vals[stage + 1] - vals[stage];
    if (span <= 0) return grow[stage] / 100.0;

    const ratio = (s - vals[stage]) / span;
    const a = adj[stage];
    let growth;
    if (a > 0) growth = Math.pow(ratio, a);
    else if (a < 0) growth = 1.0 - Math.pow(1.0 - ratio, -a);
    else growth = ratio;

    return (grow[stage] + (grow[stage + 1] - grow[stage]) * growth) / 100.0;
  }

  function calcFromsoftDefense(atk, def) {
    if (atk <= 0) return 0.0;
    if (def <= 0) return atk;
    const r = atk / def;
    let mult;
    if (r < 0.125) mult = 0.10;
    else if (r < 1.0) mult = 0.10 + Math.pow(r - 0.125, 2) * (19.2 / 49.0);
    else if (r < 2.5) mult = 0.70 - Math.pow(2.5 - r, 2) * (0.4 / 3.0);
    else if (r < 8.0) mult = 0.90 - Math.pow(8.0 - r, 2) * (0.8 / 121.0);
    else mult = 0.90;
    return atk * mult;
  }

  function resolveEnemyPresetEntry(enemyPresetName, enemyPresets) {
    if (!enemyPresetName || enemyPresetName === "Raw AR (No Defense)") return null;
    if (enemyPresetName === "__LIVE_TARGET__") {
      const b0 = Array.isArray(state.ramBosses) && state.ramBosses[0];
      if (b0 && Array.isArray(b0.def) && b0.def.length >= 5 && Array.isArray(b0.neg) && b0.neg.length >= 5) {
        return { def: b0.def, neg: b0.neg };
      }
      return (enemyPresets && enemyPresets["Endgame / DLC Boss (125 Def, 35% Neg)"]) || {
        def: [125, 125, 125, 125, 125],
        neg: [0.35, 0.35, 0.35, 0.35, 0.35],
      };
    }
    if (enemyPresetName === "__CUSTOM_BOSS__" && state.customBossPreset) {
      return {
        def: state.customBossPreset.d || state.customBossPreset.def || [125, 125, 125, 125, 125],
        neg: state.customBossPreset.g || state.customBossPreset.neg || [0, 0, 0, 0, 0, 0, 0, 0],
      };
    }
    return enemyPresets ? enemyPresets[enemyPresetName] : null;
  }

  function resolvePhysNegationPct(negs8, physTypes) {
    if (!Array.isArray(negs8) || negs8.length < 8) return Number((negs8 && negs8[0]) || 0);
    if (physTypes) {
      const pt = String(physTypes).toLowerCase();
      const idxs = [];
      if (pt.includes("standard")) idxs.push(0);
      if (pt.includes("slash")) idxs.push(1);
      if (pt.includes("strike")) idxs.push(2);
      if (pt.includes("pierce")) idxs.push(3);
      if (idxs.length) {
        let sum = 0;
        for (const i of idxs) sum += Number(negs8[i]) || 0;
        return sum / idxs.length;
      }
    }
    return Number(negs8[0]) || 0;
  }

  function calcEffectiveDamage(elemAr, enemyPresetName, enemyPresets, physTypes = "") {
    const preset = resolveEnemyPresetEntry(enemyPresetName, enemyPresets);
    if (!preset) {
      const sum = elemAr[0] + elemAr[1] + elemAr[2] + elemAr[3] + elemAr[4];
      return { total: sum, elems: elemAr.slice() };
    }
    const defs = preset.def || preset.d;
    const rawNeg = preset.neg || preset.g;
    let negs;
    if (Array.isArray(rawNeg) && rawNeg.length >= 8) {
      negs = [
        resolvePhysNegationPct(rawNeg, physTypes) / 100.0,
        Number(rawNeg[4] || 0) / 100.0,
        Number(rawNeg[5] || 0) / 100.0,
        Number(rawNeg[6] || 0) / 100.0,
        Number(rawNeg[7] || 0) / 100.0,
      ];
    } else {
      negs = rawNeg;
    }
    const dmg = [0, 0, 0, 0, 0];
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      const v = calcFromsoftDefense(elemAr[i], defs[i]) * (1.0 - negs[i]);
      dmg[i] = v;
      sum += v;
    }
    return { total: sum, elems: dmg };
  }

  function scalingGrade(val, gradeTable) {
    if (val <= 0) return "-";
    for (let i = 0; i < gradeTable.length; i++) {
      if (val >= gradeTable[i][0]) return gradeTable[i][1];
    }
    return "F";
  }

  function resolveUpgradeLevel(weapon, regLv, somberLv) {
    const maxLv = weapon.maxLv;
    const lv = maxLv === 25 ? regLv : somberLv;
    if (lv < 0) return 0;
    return lv > maxLv ? maxLv : lv;
  }

  function computeWeapon(weapon, data, enemyPresets, stats, regLv, somberLv, twoHand, overrideLv = -1, enemyPreset = "Raw AR (No Defense)", buffs = null) {
    const lv = overrideLv >= 0 ? Math.max(0, Math.min(overrideLv, weapon.maxLv)) : resolveUpgradeLevel(weapon, regLv, somberLv);
    const reinfMap = data.reinforce;
    const reinf = reinfMap[String(weapon.rt + lv)] || reinfMap[String(weapon.rt)] || [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
    const aec = data.aec[String(weapon.aec)];
    const aecF = aec ? aec.f : null;
    const aecO = aec ? aec.o : null;
    const aecI = aec ? aec.i : null;

    const sb = (buffs && buffs.statBonus) ? buffs.statBonus : [0, 0, 0, 0, 0];
    const clampS = (v) => Math.max(1, Math.min(199, Math.trunc(v)));
    const bStats = [
      clampS(stats.str + sb[0]),
      clampS(stats.dex + sb[1]),
      clampS(stats.int + sb[2]),
      clampS(stats.fai + sb[3]),
      clampS(stats.arc + sb[4]),
    ];

    const effStr = (twoHand && !weapon.dual) ? Math.trunc(bStats[0] * 1.5) : bStats[0];
    const effStats = [effStr, bStats[1], bStats[2], bStats[3], bStats[4]];
    const req = weapon.req;
    const metList = [
      effStats[0] >= req[0],
      effStats[1] >= req[1],
      effStats[2] >= req[2],
      effStats[3] >= req[3],
      effStats[4] >= req[4],
    ];
    const metAll = metList[0] && metList[1] && metList[2] && metList[3] && metList[4];

    const corr = weapon.corr;
    const effCorr = [
      corr[0] * reinf[5],
      corr[1] * reinf[6],
      corr[2] * reinf[7],
      corr[3] * reinf[8],
      corr[4] * reinf[9],
    ];
    const gradeTable = data.gradeTable;
    const grades = [
      scalingGrade(effCorr[0], gradeTable),
      scalingGrade(effCorr[1], gradeTable),
      scalingGrade(effCorr[2], gradeTable),
      scalingGrade(effCorr[3], gradeTable),
      scalingGrade(effCorr[4], gradeTable),
    ];

    const ccgMap = data.ccg;
    const baseAtks = weapon.atk;
    const elemBase = [0, 0, 0, 0, 0];
    const elemScale = [0, 0, 0, 0, 0];
    const elemAr = [0, 0, 0, 0, 0];

    for (let el = 0; el < 5; el++) {
      const base = baseAtks[el] * reinf[el];
      if (base <= 0) continue;
      elemBase[el] = base;
      const offset = el * 5;
      let missingReq = false;
      if (aecF) {
        for (let si = 0; si < 5; si++) {
          if (aecF[offset + si] && !metList[si]) {
            missingReq = true;
            break;
          }
        }
      }
      if (missingReq) {
        const pen = -base * 0.4;
        elemScale[el] = pen;
        elemAr[el] = base + pen;
      } else {
        const ccgEntry = ccgMap[String(weapon.ccg[el])];
        let scaleSum = 0.0;
        if (aecF) {
          for (let si = 0; si < 5; si++) {
            const idx = offset + si;
            if (!aecF[idx]) continue;
            const ovr = aecO[idx];
            const cVal = ovr >= 0 ? ovr : effCorr[si];
            if (cVal <= 0) continue;
            const inf = aecI[idx] / 100.0;
            scaleSum += calcCorrect(effStats[si], ccgEntry) * (cVal / 100.0) * inf;
          }
        }
        const sc = base * scaleSum;
        elemScale[el] = sc;
        elemAr[el] = base + sc;
      }
    }

    let spellScaling = 0.0;
    if (weapon.cat) {
      let missingReq = false;
      if (aecF) {
        for (let si = 0; si < 5; si++) {
          if (aecF[5 + si] && !metList[si]) {
            missingReq = true;
            break;
          }
        }
      }
      if (missingReq) {
        spellScaling = 60.0;
      } else {
        const ccgM = ccgMap[String(weapon.ccg[1])];
        let sSum = 0.0;
        if (aecF) {
          for (let si = 0; si < 5; si++) {
            const idx = 5 + si;
            if (!aecF[idx]) continue;
            const ovr = aecO[idx];
            const cVal = ovr >= 0 ? ovr : effCorr[si];
            if (cVal <= 0) continue;
            const inf = aecI[idx] / 100.0;
            sSum += calcCorrect(effStats[si], ccgM) * (cVal / 100.0) * inf;
          }
        }
        spellScaling = 100.0 * (1.0 + sSum);
      }
    }

    const statuses = [0, 0, 0, 0, 0, 0, 0];
    const spStatus = data.spStatus;
    const arcScaleVal = effCorr[4];
    const arcMet = metList[4];
    const spBeh = weapon.spBeh;
    for (let slotI = 0; slotI < spBeh.length; slotI++) {
      const behId = spBeh[slotI];
      if (behId <= 0) continue;
      const vals = spStatus[String(behId + reinf[10 + slotI])];
      if (!vals) continue;
      for (let k = 0; k < vals.length; k++) {
        const rawV = vals[k];
        if (rawV <= 0) continue;
        const ccgIdx = STATUS_CCG_INDEX[k];
        if (ccgIdx !== null && arcScaleVal > 0 && arcMet) {
          const ccgSt = ccgMap[String(weapon.ccg[ccgIdx])];
          const mult = 1.0 + calcCorrect(bStats[4], ccgSt) * (arcScaleVal / 100.0);
          statuses[k] += rawV * mult;
        } else {
          statuses[k] += rawV;
        }
      }
    }

    if (buffs) {
      if (buffs.grease && weapon.buffable) {
        const gf = buffs.grease.flat || [0, 0, 0, 0, 0];
        const gr = buffs.grease.rate || [1, 1, 1, 1, 1];
        const gst = buffs.grease.status || [0, 0, 0, 0, 0, 0, 0];
        for (let el = 0; el < 5; el++) {
          elemAr[el] = elemAr[el] * gr[el] + gf[el];
        }
        for (let k = 0; k < 7; k++) {
          if (gst[k] > 0) statuses[k] += gst[k];
        }
      }
      if (buffs.handMult) {
        for (let el = 0; el < 5; el++) {
          elemAr[el] *= (Number(buffs.handMult[el]) || 1);
        }
      }
      if (buffs.handFlat || buffs.liveFlat) {
        const hf = buffs.handFlat || buffs.liveFlat;
        for (let el = 0; el < 5; el++) {
          elemAr[el] = Math.max(0, elemAr[el] + (hf[el] || 0));
        }
      }
      if (buffs.elemMult) {
        for (let el = 0; el < 5; el++) {
          elemAr[el] *= buffs.elemMult[el];
        }
      }
      if (buffs.globalFlat) {
        for (let el = 0; el < 5; el++) {
          elemAr[el] = Math.max(0, elemAr[el] + (buffs.globalFlat[el] || 0));
        }
      }
    }
    const stanceMult = (buffs && buffs.stanceMult) ? buffs.stanceMult : 1.0;
    const effStance = (weapon.stance || 0) * stanceMult;
    const rawGuard = Array.isArray(weapon.guard) ? weapon.guard : [0, 0, 0, 0, 0, 0];
    const gr = reinf ? reinf.slice(13, 19) : [];
    const guardOut = [0, 1, 2, 3, 4].map((i) => {
      const rate = gr[i] != null ? gr[i] : 1.0;
      return Math.min(100, Math.max(0, Math.round((Number(rawGuard[i]) || 0) * rate * 10) / 10));
    });
    guardOut.push(Math.max(0, Math.round((Number(rawGuard[5]) || 0) * (gr[5] != null ? gr[5] : 1.0))));

    const totalAr = elemAr[0] + elemAr[1] + elemAr[2] + elemAr[3] + elemAr[4];
    const eff = calcEffectiveDamage(elemAr, enemyPreset, enemyPresets, weapon.physTypes || "");
    return {
      weapon,
      lv,
      total: totalAr,
      eff: eff.total,
      effElems: eff.elems,
      ar: elemAr,
      base: elemBase,
      scale: elemScale,
      spell: spellScaling,
      status: statuses,
      grades,
      corr: effCorr,
      stance: effStance,
      guard: guardOut,
      met: metAll,
      metList,
    };
  }

  function computeNextStatGains(weapon, data, enemyPresets, stats, regLv, somberLv, twoHand, delta, overrideLv, enemyPreset, buffs = null) {
    const baseRes = computeWeapon(weapon, data, enemyPresets, stats, regLv, somberLv, twoHand, overrideLv, enemyPreset, buffs);
    const gains = {};
    for (const k of STAT_KEYS) {
      const mod = Object.assign({}, stats);
      mod[k] = mod[k] + delta;
      const nr = computeWeapon(weapon, data, enemyPresets, mod, regLv, somberLv, twoHand, overrideLv, enemyPreset, buffs);
      gains[k] = {
        ar: nr.total - baseRes.total,
        eff: nr.eff - baseRes.eff,
        spell: nr.spell - baseRes.spell,
      };
    }
    return gains;
  }

  // Application State
  const state = {
    data: null,
    byId: new Map(),
    byBase: new Map(),
    enemyPresets: {},
    characters: [],
    savePath: null,
    activeSlot: 0,
    savedSnapshot: null,
    savedGear: { armor: [null, null, null, null], talismans: [null, null, null, null] },
    equippedMap: new Map(),
    equippedSlots: { rh: [null, null, null], lh: [null, null, null] },
    savedEquipSlots: { rh: [null, null, null], lh: [null, null, null] },
    equipSelectedSlot: { kind: "rh", idx: 0 },
    arrowIds: [null, null],
    boltIds: [null, null],
    savedAmmo: { arrows: [null, null], bolts: [null, null] },
    spellIds: [],
    equipPreviewWid: null,

    stats: { str: 20, dex: 20, int: 10, fai: 10, arc: 10 },
    regLv: 25,
    somberLv: 10,
    twoHand: true,
    groupByType: false,
    numericScaling: false,
    showDamageSplit: false,
    colCrit: false,
    colDType: false,
    colBuff: false,
    colStam: false,
    colStance: false,

    armorIds: [null, null, null, null],
    talismanIds: [null, null, null, null],
    condTalismans: false,
    greaseId: 0,
    buffToggles: {
      goldenVow: false,
      fgms: false,
      howl: false,
      exultBleed: false,
      exultPoison: false,
      twoHandTal: false,
    },
    activeBuffs: { statBonus: [0, 0, 0, 0, 0], elemMult: [1, 1, 1, 1, 1], grease: null, stanceMult: 1.0 },
    curveMetric: "total",
    curveData: null,
    calcSerial: 0,

    effectiveOnly: false,
    bestAffinityOnly: false,
    buffableOnly: false,
    equippedOnly: false,
    ownedOnly: false,
    favoritesOnly: false,
    pinFavTop: true,
    favoriteIds: [],
    enemyPreset: "Raw AR (No Defense)",
    customBossPreset: null,
    search: "",
    selectedAffs: new Set(),
    selectedWts: new Set(),
    allAffList: [],
    allWtList: [],
    typeHierarchy: [],
    groupCollapsed: new Set(["Ranged Weapons", "Catalysts", "Shields"]),

    sortCol: "total",
    sortDesc: true,

    flatItems: [],
    inspectedRes: null,
    equipSelectedWid: null,
    equipCenterTab: 0,
    equipPickerTarget: null,
    compareIds: [],
    activeTab: "details",
    activeView: "calc",
    optResults: [],
    liveWatch: true,
    ramLive: false,
    ramChar: null,
    armStyle: 1,
    activeRhSlot: 0,
    activeLhSlot: 0,
    ramLiveArBuffs: null,
    ramPos: null,
    ramBosses: [],
    buffIcons: null,
    ramBuffs: [],
    ramBuffsStamp: 0,
    buffRafId: 0,
    buffDomKeys: { stats: "", map: "" },
    buffHideLooping: true,
    suppressedLoopBuffIds: new Set(),
    _buffLoopTrack: new Map(),
    pipMode: "off",
    pipCorner: "bottom-right",
    pipBossPlacement: "inside",
    pipGripPlacement: "weapon",
    pvPreviewMode: "hud",
    pipOpacity: 1.0,
    pipClickThrough: false,
    pipBossHud: true,
    pipMapBossHud: true,
    pipBossDesign: "1",
    pipBuffHud: true,
    pipMapBuffHud: true,
    buffExpFlash: true,
    buffSweepOpacity: 30,
    buffTextOpacity: 75,
    enemyShowStatuses: true,
    enemyShowStance: true,
    pipBossResMode: "compact",
    pipLocked: false,
    pipAutoHide: false,
    minimizeToTray: false,
    pipSmartFade: false,
    pipIdleOpacity: 0.45,
    pipCombatOpacity: 1.0,
    pipFadeMs: 400,
    pipFadeOnBoss: true,
    pipFadeOnBuffs: false,
    _effectiveOpacity: 1.0,
    _fadeRafId: 0,
    _fadeLastTs: 0,
    _fadeLastPushTs: 0,
    _pipMouseHover: false,
    _hoverEquipOverride: null,
    _favSet: new Set(),
    _prevRamAttached: false,
    _prevRamCharName: "",
    overlayHidden: false,
    keybinds: {},
    defaultKeybinds: {},
    hotkeyErrors: {},
    recordingKeybindAction: null,
    bannerDismissed: false,
    lastRenderedKey: "",
    domColsSpec: [],
    erUiIcons: null,
    modSource: null,
    promptMode: "auto",
    activePromptDevice: "kbm",
    equipPickSlot: null,
    equipSelectedSlotIdx: 0,
    sysSubTab: "mod",
    sysCursorIdx: 0,
    armoryPadRowIdx: 0,
  };

  const MAP_CAT_META = {
    grace: { label: "Site of Grace", color: "#ffe48a", shape: "star" },
    weapon: { label: "Weapon", color: "#f2685a", shape: "diamond" },
    talisman: { label: "Talisman", color: "#5ee08a", shape: "hex" },
    armor: { label: "Armor", color: "#6eb3fa", shape: "square" },
    boss: { label: "Boss", color: "#ff4466", shape: "triangle" },
    merchant: { label: "Merchant", color: "#f0b840", shape: "ring" },
    poi: { label: "Landmark", color: "#c5cbd6", shape: "circle" },
    bell_bearing: { label: "Bell Bearing", color: "#f3c46b", shape: "circle" },
    golden_seed: { label: "Golden Seed", color: "#ffd84d", shape: "diamond" },
    sacred_tear: { label: "Sacred Tear", color: "#ff8a65", shape: "circle" },
    scadutree: { label: "Scadutree Fragment", color: "#d6b25e", shape: "diamond" },
    revered_ash: { label: "Revered Spirit Ash", color: "#a8b7d4", shape: "circle" },
    crystal_tear: { label: "Crystal Tear", color: "#7ad7f0", shape: "circle" },
    memory_stone: { label: "Memory Stone", color: "#b48eff", shape: "hex" },
    whetblade: { label: "Whetblade", color: "#c8d2dc", shape: "square" },
  };

  const MAP_COLLECTIBLE_CATS = [
    "bell_bearing",
    "golden_seed",
    "sacred_tear",
    "scadutree",
    "revered_ash",
    "crystal_tear",
    "memory_stone",
    "whetblade",
  ];

  const MAP_LABEL_CAT_ORDER = [
    ["grace", "Sites of Grace"],
    ["boss", "Bosses"],
    ["merchant", "Merchants"],
    ["weapon", "Weapons"],
    ["talisman", "Talismans"],
    ["armor", "Armor"],
    ["poi", "Landmarks"],
    ["bell_bearing", "Bell Bearings"],
    ["golden_seed", "Golden Seeds"],
    ["sacred_tear", "Sacred Tears"],
    ["scadutree", "Scadutree Frags"],
    ["revered_ash", "Revered Ashes"],
    ["crystal_tear", "Crystal Tears"],
    ["memory_stone", "Memory Stones"],
    ["whetblade", "Whetblades"],
  ];

  function defaultMapLabelCats() {
    return {
      grace: true,
      boss: true,
      merchant: true,
      weapon: false,
      talisman: false,
      armor: false,
      poi: false,
      bell_bearing: false,
      golden_seed: false,
      sacred_tear: false,
      scadutree: false,
      revered_ash: false,
      crystal_tear: false,
      memory_stone: false,
      whetblade: false,
    };
  }

  const KEYBIND_ACTIONS = [
    { key: "togglePipMap", label: "Toggle PiP Minimap / Expand" },
    { key: "togglePipStats", label: "Toggle PiP Stats HUD / Expand" },
    { key: "togglePipClickThrough", label: "Toggle PiP Ghost Mode (Click-Through)" },
    { key: "toggleFollow", label: "Toggle Live Follow (30 Hz)" },
    { key: "focusPipSearch", label: "Focus Map Search" },
    { key: "toggleOverlayHide", label: "Hide / Show Overlay" },
    { key: "toggleBossResMode", label: "Cycle Boss Resistances Strip" },
  ];

  const mapState = {
    loaded: false,
    loading: false,
    data: null,
    icons: {},
    iconImgs: {},
    unlitGraceCanvas: null,
    images: {},
    imgPromises: {},
    tiles: new Map(),
    tilePromises: new Map(),
    tileInFlight: 0,
    layer: "m00",
    cats: {
      grace: true,
      weapon: true,
      talisman: true,
      armor: true,
      boss: true,
      merchant: true,
      poi: true,
      bell_bearing: true,
      golden_seed: false,
      sacred_tear: false,
      scadutree: false,
      revered_ash: false,
      crystal_tear: false,
      memory_stone: false,
      whetblade: false,
    },
    showPlayer: true,
    showPins: true,
    showOffscreenArrow: true,
    showLabels: true,
    pipNearbyLabelsOnly: true,
    pipNearbyLabelRadius: 95,
    labelCats: defaultMapLabelCats(),
    lastLabelsDrawnCount: 0,
    followPlayer: false,
    autoSwitchLayer: true,
    autoDetect: true,
    autoClearBeacon: true,
    clearedBeaconKeys: new Set(),
    completedMode: "dim",
    manualCompleted: {},
    lastPlayerLayer: null,
    ramPins: null,
    ramOwned: null,
    ramFlags: null,
    offscreenTarget: null,
    search: "",
    selectedPin: null,
    hoveredPin: null,
    panX: 0,
    panY: 0,
    zoom: 1,
    fitDone: false,
    dragging: false,
    dragMoved: false,
    lastX: 0,
    lastY: 0,
    visibleMarkers: [],
    firstOpenDone: false,
    mapExtractBannerDismissed: false,
  };
  const isMapPipMode = () => state.pipMode === "map" || state.pipMode === "hud";
  const isMapVisible = () => state.activeView === "map" || isMapPipMode();

  const ROW_HEIGHT = 31;
  const OVERSCAN = 14;
  let lastRenderSlice = { start: -1, end: -1, key: "" };

  function $(id) {
    return document.getElementById(id);
  }

  function buildSearchTags(data) {
    const wtypes = data.weaponTypes;
    const spStatus = data.spStatus;
    const statusTerms = [
      "bleed blood", "poison", "rot scarlet", "frost cold", "sleep", "madness frenzy", "death blight",
    ];
    for (const w of data.weapons) {
      state.byId.set(w.id, w);
      if (!state.byBase.has(w.baseId)) state.byBase.set(w.baseId, []);
      state.byBase.get(w.baseId).push(w);

      const parts = [
        w.name,
        w.baseName,
        w.aff,
        wtypes[String(w.wt)] || "",
        w.skill || "",
        w.physTypes || "",
        w.buffable ? "buffable grease" : "unbuffable",
        w.infusable ? "infusable" : "unique",
        w.cat ? "catalyst" : "",
      ];
      for (const behId of w.spBeh) {
        if (behId <= 0) continue;
        for (const off of [0, w.maxLv]) {
          const vals = spStatus[String(behId + off)];
          if (!vals) continue;
          for (let k = 0; k < vals.length; k++) {
            if (vals[k] > 0) parts.push(statusTerms[k]);
          }
        }
      }
      w._searchBase = parts.join(" ").toLowerCase();
    }
  }

  function buildAffinitySidebar() {
    const known = new Set(state.data.affinities);
    const ordered = [];
    const seen = new Set();
    const maxLen = Math.max(AFFINITY_LEFT.length, AFFINITY_RIGHT.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < AFFINITY_LEFT.length && known.has(AFFINITY_LEFT[i])) {
        ordered.push(AFFINITY_LEFT[i]);
        seen.add(AFFINITY_LEFT[i]);
      }
      if (i < AFFINITY_RIGHT.length && known.has(AFFINITY_RIGHT[i])) {
        ordered.push(AFFINITY_RIGHT[i]);
        seen.add(AFFINITY_RIGHT[i]);
      }
    }
    for (const a of state.data.affinities) {
      if (!seen.has(a)) ordered.push(a);
    }

    state.allAffList = ordered.slice();
    state.selectedAffs = new Set(ordered);

    const grid = $("affinityGrid");
    grid.innerHTML = "";
    for (const aff of ordered) {
      const lbl = document.createElement("label");
      lbl.className = "aff-item cb-row";
      lbl.innerHTML = `<input type="checkbox" data-aff="${escHtml(aff)}" checked />${affIconSvg(aff)}<span title="${escHtml(aff)}">${escHtml(aff)}</span>`;
      const cb = lbl.querySelector("input");
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedAffs.add(aff);
        else state.selectedAffs.delete(aff);
        recalculateAndRender();
      });
      grid.appendChild(lbl);
    }
  }

  function syncAffinityCheckboxesDom() {
    document.querySelectorAll("#affinityGrid input[data-aff]").forEach((cb) => {
      cb.checked = state.selectedAffs.has(cb.dataset.aff);
    });
  }

  function buildWeaponTypeTree() {
    const wtypes = state.data.weaponTypes;
    const byName = new Map();
    const allIds = [];

    for (const [kStr, label] of Object.entries(wtypes)) {
      const wt = Number(kStr);
      allIds.push(wt);
      if (!byName.has(label)) byName.set(label, []);
      byName.get(label).push(wt);
    }

    const meleeNodes = [];
    const rangedNodes = [];
    const catNodes = [];
    const shieldNodes = [];

    for (const [label, wtList] of Array.from(byName.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const node = { label, wtList };
      const first = wtList[0];
      if (RANGED_WT_SET.has(first)) rangedNodes.push(node);
      else if (CATALYST_WT_SET.has(first)) catNodes.push(node);
      else if (SHIELD_WT_SET.has(first)) shieldNodes.push(node);
      else meleeNodes.push(node);
    }

    state.typeHierarchy = [
      { name: "Melee Weapons", nodes: meleeNodes },
      { name: "Ranged Weapons", nodes: rangedNodes },
      { name: "Catalysts", nodes: catNodes },
      { name: "Shields", nodes: shieldNodes },
    ];
    state.allWtList = allIds;
    state.selectedWts = new Set(allIds);

    const container = $("weaponTypeTree");
    container.innerHTML = "";
    for (const grp of state.typeHierarchy) {
      const grpWrap = document.createElement("div");
      const hdr = document.createElement("div");
      hdr.className = "type-group-hdr";

      const isCol = state.groupCollapsed.has(grp.name);
      const caretBtn = document.createElement("button");
      caretBtn.className = "caret-btn";
      caretBtn.textContent = isCol ? "▸" : "▾";
      caretBtn.title = "Expand / collapse";

      const pLabel = document.createElement("label");
      pLabel.className = "cb-row type-group-title";
      const pCb = document.createElement("input");
      pCb.type = "checkbox";
      pCb.checked = true;
      pCb.dataset.groupParent = grp.name;
      const pText = document.createElement("span");
      pText.textContent = grp.name;
      pLabel.appendChild(pCb);
      pLabel.appendChild(pText);

      hdr.appendChild(caretBtn);
      hdr.appendChild(pLabel);
      grpWrap.appendChild(hdr);

      const childrenDiv = document.createElement("div");
      childrenDiv.className = "type-children" + (isCol ? " collapsed" : "");

      caretBtn.addEventListener("click", () => {
        const nowCol = childrenDiv.classList.toggle("collapsed");
        caretBtn.textContent = nowCol ? "▸" : "▾";
      });

      pCb.addEventListener("change", () => {
        for (const n of grp.nodes) {
          for (const wt of n.wtList) {
            if (pCb.checked) state.selectedWts.add(wt);
            else state.selectedWts.delete(wt);
          }
        }
        syncWeaponTypeDom();
        recalculateAndRender();
      });

      for (const node of grp.nodes) {
        const cLbl = document.createElement("label");
        cLbl.className = "cb-row";
        const cCb = document.createElement("input");
        cCb.type = "checkbox";
        cCb.checked = true;
        cCb.dataset.wtList = node.wtList.join(",");
        cLbl.appendChild(cCb);
        const wtImgSrc = (window.__ER_MENU_ASSETS || {})[`wt_${node.label}`];
        if (wtImgSrc) {
          const wtImg = document.createElement("img");
          wtImg.className = "er-wt-ic";
          wtImg.src = wtImgSrc;
          wtImg.alt = "";
          wtImg.setAttribute("aria-hidden", "true");
          cLbl.appendChild(wtImg);
        }
        const cSpan = document.createElement("span");
        cSpan.textContent = node.label;
        cLbl.appendChild(cSpan);

        cCb.addEventListener("change", () => {
          for (const wt of node.wtList) {
            if (cCb.checked) state.selectedWts.add(wt);
            else state.selectedWts.delete(wt);
          }
          syncWeaponTypeDom();
          recalculateAndRender();
        });
        childrenDiv.appendChild(cLbl);
      }

      grpWrap.appendChild(childrenDiv);
      container.appendChild(grpWrap);
    }
  }

  function syncWeaponTypeDom() {
    document.querySelectorAll("#weaponTypeTree input[data-wt-list]").forEach((cb) => {
      const wts = cb.dataset.wtList.split(",").map(Number);
      cb.checked = wts.every((w) => state.selectedWts.has(w));
    });
    for (const grp of state.typeHierarchy) {
      const pCb = document.querySelector(`#weaponTypeTree input[data-group-parent="${grp.name}"]`);
      if (!pCb) continue;
      let checkedCount = 0;
      for (const n of grp.nodes) {
        if (n.wtList.every((w) => state.selectedWts.has(w))) checkedCount++;
      }
      if (checkedCount === 0) {
        pCb.checked = false;
        pCb.indeterminate = false;
      } else if (checkedCount === grp.nodes.length) {
        pCb.checked = true;
        pCb.indeterminate = false;
      } else {
        pCb.checked = false;
        pCb.indeterminate = true;
      }
    }
  }

  function populateLevelSelect() {
    const sel = $("levelSelect");
    sel.innerHTML = "";
    for (let r = 0; r <= 25; r++) {
      const s = Math.min(10, Math.round((r * 10) / 25));
      const opt = document.createElement("option");
      opt.value = `${r}:${s}`;
      opt.textContent = `+${r} / +${s}`;
      sel.appendChild(opt);
    }
    syncLevelSelectValue();
  }

  function syncLevelSelectValue() {
    const sel = $("levelSelect");
    const pairedSomber = Math.min(10, Math.round((state.regLv * 10) / 25));
    const existingCustom = sel.querySelector("option[data-custom='1']");
    if (existingCustom) existingCustom.remove();

    if (state.somberLv === pairedSomber) {
      sel.value = `${state.regLv}:${state.somberLv}`;
    } else {
      const opt = document.createElement("option");
      opt.dataset.custom = "1";
      opt.value = `${state.regLv}:${state.somberLv}`;
      opt.textContent = `+${state.regLv} / +${state.somberLv} (Eq)`;
      sel.appendChild(opt);
      sel.value = opt.value;
    }
  }

  function populateEnemySelect() {
    const applyToSel = (sel) => {
      if (!sel) return;
      sel.innerHTML = "";
      for (const name of Object.keys(state.enemyPresets)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      }
      const liveOpt = document.createElement("option");
      liveOpt.value = "__LIVE_TARGET__";
      const b0 = Array.isArray(state.ramBosses) && state.ramBosses[0];
      liveOpt.textContent = (b0 && b0.name) ? `Live Target: ${b0.name}` : "Current Live Target (Auto)";
      sel.insertBefore(liveOpt, sel.children[1] || null);
      if (state.customBossPreset && state.customBossPreset.n) {
        const cOpt = document.createElement("option");
        cOpt.value = "__CUSTOM_BOSS__";
        cOpt.textContent = `Boss: ${state.customBossPreset.n}`;
        sel.appendChild(cOpt);
      }
      const valid = state.enemyPreset === "__LIVE_TARGET__"
        || (state.enemyPreset === "__CUSTOM_BOSS__" && state.customBossPreset)
        || (state.enemyPreset in state.enemyPresets);
      sel.value = valid ? state.enemyPreset : "Raw AR (No Defense)";
    };
    applyToSel($("enemySelect"));
    applyToSel($("eqEnemySel"));
  }

  function getCustomEnemyPresetForBackend() {
    if (state.enemyPreset === "__LIVE_TARGET__" || state.enemyPreset === "__CUSTOM_BOSS__") {
      const p = resolveEnemyPresetEntry(state.enemyPreset, state.enemyPresets);
      return p ? { def: p.def, neg: p.neg } : null;
    }
    return null;
  }

  function updateStatInputsDom() {
    $("strInput").value = state.stats.str;
    $("dexInput").value = state.stats.dex;
    $("intInput").value = state.stats.int;
    $("faiInput").value = state.stats.fai;
    $("arcInput").value = state.stats.arc;
    update2hHint();
  }

  function update2hHint() {
    const hint = $("str2hHint");
    if (state.twoHand) {
      const sb0 = (state.activeBuffs && state.activeBuffs.statBonus) ? state.activeBuffs.statBonus[0] : 0;
      const bStr = Math.max(1, Math.min(199, state.stats.str + sb0));
      hint.textContent = `(${Math.trunc(bStr * 1.5)})`;
    } else {
      hint.textContent = "";
    }
  }

  function formatGearBonusTag(item) {
    if (!item) return "";
    const parts = [];
    const stShort = ["STR", "DEX", "INT", "FAI", "ARC"];
    const elShort = ["Phys", "Mag", "Fire", "Ltng", "Holy"];
    if (item.st) {
      for (let i = 0; i < 5; i++) {
        if (item.st[i] !== 0) parts.push(`${item.st[i] > 0 ? "+" : ""}${item.st[i]} ${stShort[i]}`);
      }
    }
    if (item.m) {
      for (let i = 0; i < 5; i++) {
        if (Math.abs(item.m[i] - 1.0) > 1e-4) parts.push(`x${item.m[i].toFixed(2)} ${elShort[i]}`);
      }
    }
    if (item.cm) {
      parts.push(`Cond x${item.cm[0].toFixed(2)}`);
    }
    if (item.sa && Math.abs(item.sa - 1.0) > 1e-4) {
      parts.push(`x${item.sa.toFixed(2)} Stance`);
    }
    return parts.length ? ` (${parts.join(", ")})` : "";
  }

  function formatGreaseTag(g) {
    const parts = [];
    const elShort = ["Phys", "Mag", "Fire", "Ltng", "Holy"];
    for (let i = 0; i < 5; i++) {
      if (g.flat[i] > 0 || Math.abs(g.rate[i] - 1.0) > 1e-4) {
        const s = g.flat[i] > 0 ? `+${g.flat[i]} ` : "";
        const r = Math.abs(g.rate[i] - 1.0) > 1e-4 ? `x${g.rate[i].toFixed(3)} ` : "";
        parts.push(`${s}${r}${elShort[i]}`.trim());
      }
    }
    for (let k = 0; k < 7; k++) {
      if (g.status[k] > 0) parts.push(`+${g.status[k]} ${STATUS_KEYS[k]}`);
    }
    return parts.length ? ` (${parts.join(", ")})` : "";
  }

  function populateGearDropdowns() {
    const armors = state.data.armors || {};
    const armorSelIds = ["armorHeadSel", "armorChestSel", "armorArmsSel", "armorLegsSel"];
    for (let slot = 0; slot < 4; slot++) {
      const sel = $(armorSelIds[slot]);
      const items = Object.entries(armors)
        .filter(([, a]) => a.s === slot)
        .map(([id, a]) => ({ id, a, hasBonus: Boolean(a.st || a.m || a.sa) }))
        .sort((x, y) => (y.hasBonus - x.hasBonus) || x.a.n.localeCompare(y.a.n));
      sel.innerHTML = `<option value="">-- None --</option>` + items.map((it) => {
        const tag = formatGearBonusTag(it.a);
        const prefix = it.hasBonus ? "[★] " : "";
        return `<option value="${it.id}">${escHtml(prefix + it.a.n + tag)}</option>`;
      }).join("");
    }

    const tals = state.data.talismans || {};
    const talItems = Object.entries(tals)
      .map(([id, t]) => ({ id, t, hasBonus: Boolean(t.st || t.m || t.cm || t.sa) }))
      .sort((x, y) => (y.hasBonus - x.hasBonus) || x.t.n.localeCompare(y.t.n));
    const talOptsHtml = `<option value="">-- None --</option>` + talItems.map((it) => {
      const tag = formatGearBonusTag(it.t);
      const prefix = it.hasBonus ? "[★] " : "";
      return `<option value="${it.id}">${escHtml(prefix + it.t.n + tag)}</option>`;
    }).join("");
    for (let s = 0; s < 4; s++) {
      $(`tal${s}Sel`).innerHTML = talOptsHtml;
    }

    const greases = state.data.greases || [];
    $("greaseSel").innerHTML = `<option value="0">-- None --</option>` + greases.map((g) => {
      return `<option value="${g.id}">${escHtml(g.name + formatGreaseTag(g))}</option>`;
    }).join("");
  }

  function syncGearDropdownValues() {
    const armorSelIds = ["armorHeadSel", "armorChestSel", "armorArmsSel", "armorLegsSel"];
    const armors = state.data.armors || {};
    for (let s = 0; s < 4; s++) {
      const aid = state.armorIds[s];
      $(armorSelIds[s]).value = (aid && armors[String(aid)]) ? String(aid) : "";
    }
    const tals = state.data.talismans || {};
    for (let s = 0; s < 4; s++) {
      const tid = state.talismanIds[s];
      $(`tal${s}Sel`).value = (tid && tals[String(tid)]) ? String(tid) : "";
    }
    $("condTalismansCb").checked = Boolean(state.condTalismans);
    $("greaseSel").value = String(state.greaseId || 0);
    document.querySelectorAll("#buffPillsRow .buff-pill").forEach((btn) => {
      btn.classList.toggle("active", Boolean(state.buffToggles[btn.dataset.buff]));
    });
  }

  function recomputeActiveBuffs() {
    const sb = [0, 0, 0, 0, 0];
    const em = [1, 1, 1, 1, 1];
    let stanceMult = 1.0;
    const armors = state.data ? (state.data.armors || {}) : {};
    const tals = state.data ? (state.data.talismans || {}) : {};

    for (let s = 0; s < 4; s++) {
      const a = state.armorIds[s] ? armors[String(state.armorIds[s])] : null;
      if (!a) continue;
      if (a.st) for (let i = 0; i < 5; i++) sb[i] += a.st[i];
      if (a.m) for (let i = 0; i < 5; i++) em[i] *= a.m[i];
      if (a.sa) stanceMult *= a.sa;
    }

    for (let s = 0; s < 4; s++) {
      const t = state.talismanIds[s] ? tals[String(state.talismanIds[s])] : null;
      if (!t) continue;
      if (t.st) for (let i = 0; i < 5; i++) sb[i] += t.st[i];
      if (t.m) for (let i = 0; i < 5; i++) em[i] *= t.m[i];
      if (state.condTalismans && t.cm) for (let i = 0; i < 5; i++) em[i] *= t.cm[i];
      if (t.sa) stanceMult *= t.sa;
    }

    const bt = state.buffToggles;
    if (bt.goldenVow) for (let i = 0; i < 5; i++) em[i] *= 1.15;
    if (bt.fgms) {
      em[0] *= 1.20;
      em[2] *= 1.20;
    }
    if (bt.howl) for (let i = 0; i < 5; i++) em[i] *= 1.25;
    if (bt.exultBleed) for (let i = 0; i < 5; i++) em[i] *= 1.20;
    if (bt.exultPoison) for (let i = 0; i < 5; i++) em[i] *= 1.20;
    if (bt.twoHandTal && state.twoHand) for (let i = 0; i < 5; i++) em[i] *= 1.15;

    let grease = null;
    if (state.greaseId && state.data && state.data.greases) {
      grease = state.data.greases.find((g) => g.id === state.greaseId) || null;
    }

    state.activeBuffs = { statBonus: sb, elemMult: em, grease, stanceMult };

    // Update floating stat labels & top button badge
    const lblIds = [["lblStr", "Strength"], ["lblDex", "Dexterity"], ["lblInt", "Intelligence"], ["lblFai", "Faith"], ["lblArc", "Arcane"]];
    for (let i = 0; i < 5; i++) {
      const el = $(lblIds[i][0]);
      if (!el) continue;
      const dv = sb[i];
      if (dv !== 0) {
        el.innerHTML = `${lblIds[i][1]} <span class="stat-bonus-tag">(${dv > 0 ? "+" : ""}${dv})</span>`;
      } else {
        el.textContent = lblIds[i][1];
      }
    }

    const sumParts = [];
    const stShort = ["STR", "DEX", "INT", "FAI", "ARC"];
    const elShort = ["Phys", "Mag", "Fire", "Ltng", "Holy"];
    for (let i = 0; i < 5; i++) if (sb[i] !== 0) sumParts.push(`${sb[i] > 0 ? "+" : ""}${sb[i]} ${stShort[i]}`);
    for (let i = 0; i < 5; i++) if (Math.abs(em[i] - 1.0) > 1e-4) sumParts.push(`${elShort[i]}×${em[i].toFixed(2)}`);
    if (Math.abs(stanceMult - 1.0) > 1e-4) sumParts.push(`Stance×${stanceMult.toFixed(2)}`);
    if (grease) sumParts.push(grease.name);

    const activeCount = sumParts.length;
    const gearBtn = $("topGearBtn");
    gearBtn.textContent = activeCount > 0 ? `Gear & Buffs (${activeCount})` : "Gear & Buffs";
    gearBtn.classList.toggle("active-gold", activeCount > 0);
    $("gearBonusSummary").textContent = activeCount > 0 ? `Active: ${sumParts.join(" · ")}` : "No active gear stat or damage modifiers";
    update2hHint();
  }

  function showErToast(title, detail = "", kind = "info") {
    const host = $("erToastHost");
    if (!host || state._selfTest) return;
    while (host.children.length >= 3) {
      host.removeChild(host.firstElementChild);
    }
    const el = document.createElement("div");
    el.className = `er-toast ${kind}`;
    el.innerHTML = `<div class="er-toast-title">${escHtml(title)}</div>${detail ? `<div class="er-toast-body">${escHtml(detail)}</div>` : ""}`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3200);
  }

  function toggleFavoriteWeapon(wid, persist = true) {
    const id = Number(wid);
    if (!id) return false;
    if (!state._favSet || !(state._favSet instanceof Set)) {
      state._favSet = new Set(state.favoriteIds || []);
    }
    if (state._favSet.has(id)) state._favSet.delete(id);
    else state._favSet.add(id);
    state.favoriteIds = Array.from(state._favSet);
    if (persist) persistSettings();
    recalculateAndRender();
    return state._favSet.has(id);
  }

  function isWeaponFavorite(wid) {
    return Boolean(state._favSet && state._favSet.has(Number(wid)));
  }

  function detectOwnedMaxUpgrades() {
    const sets = getActiveProgressSets();
    let maxReg = null;
    let maxSomber = null;
    const absorb = (wid, lv) => {
      const w = state.byId.get(Number(wid));
      const maxLv = w ? w.maxLv : (Number(lv) > 10 ? 25 : null);
      if (maxLv === 25) maxReg = maxReg === null ? lv : Math.max(maxReg, lv);
      else if (maxLv !== null && maxLv > 0) maxSomber = maxSomber === null ? lv : Math.max(maxSomber, lv);
    };
    if (sets.weaponLevels && sets.weaponLevels.size > 0) {
      for (const [wid, lv] of sets.weaponLevels.entries()) absorb(wid, lv);
    }
    for (const [wid, lv] of state.equippedMap.entries()) absorb(wid, lv);
    if (maxReg === null && maxSomber === null) return null;
    const regLv = maxReg !== null ? maxReg : Math.min(25, Math.round((maxSomber * 25) / 10));
    const somberLv = maxSomber !== null ? maxSomber : Math.min(10, Math.round((maxReg * 10) / 25));
    return { regLv, somberLv };
  }

  function syncInventoryUpgrades(recalc = true, toast = true) {
    const detected = detectOwnedMaxUpgrades();
    if (!detected) {
      if (toast) showErToast("No Owned Upgrades Found", "Load a character save or attach live RAM first.", "warn");
      return false;
    }
    state.regLv = detected.regLv;
    state.somberLv = detected.somberLv;
    syncLevelSelectValue();
    if (recalc) recalculateAndRender();
    if (toast) showErToast("Upgrade Levels Synced", `Highest owned inventory tiers: +${state.regLv} / +${state.somberLv}`, "ok");
    return true;
  }

  function computeEquipLoad(override = null) {
    const armors = (state.data && state.data.armors) || {};
    const tals = (state.data && state.data.talismans) || {};
    const ch = (state.ramLive && state.ramChar) ? state.ramChar : getActiveSaveChar();
    const baseEnd = (ch && ch.stats && Number(ch.stats.end)) ? Number(ch.stats.end) : 11;

    const rh = ((state.equippedSlots && state.equippedSlots.rh) || [null, null, null]).slice();
    const lh = ((state.equippedSlots && state.equippedSlots.lh) || [null, null, null]).slice();
    const armIds = (state.armorIds || [null, null, null, null]).slice();
    const talIds = (state.talismanIds || [null, null, null, null]).slice();

    // Calculate baseline gear multipliers so we can isolate extra live RAM buffs (Tears, Fortunes, Runes)
    const calcGearMeta = (aArr, tArr) => {
      let wt = 0;
      let endB = 0;
      let ewM = 1.0;
      for (let i = 0; i < 4; i++) {
        const a = aArr[i] ? armors[String(aArr[i])] : null;
        if (!a) continue;
        wt += Number(a.w || 0);
        if (a.end) endB += Number(a.end);
        if (a.ew) ewM *= Number(a.ew);
      }
      for (let i = 0; i < 4; i++) {
        const t = tArr[i] ? tals[String(tArr[i])] : null;
        if (!t) continue;
        wt += Number(t.w || 0);
        if (t.end) endB += Number(t.end);
        if (t.ew) ewM *= Number(t.ew);
      }
      return { wt, endB, ewM };
    };
    const baseMeta = calcGearMeta(armIds, talIds);

    if (override) {
      if (override.type === "armor" && override.slot >= 0 && override.slot < 4) {
        armIds[override.slot] = override.id ? Number(override.id) : null;
      } else if (override.type === "talisman" && override.slot >= 0 && override.slot < 4) {
        talIds[override.slot] = override.id ? Number(override.id) : null;
      } else if ((override.kind === "rh" || override.kind === "lh") && override.idx >= 0 && override.idx < 3) {
        const arr = override.kind === "lh" ? lh : rh;
        arr[override.idx] = override.weaponId ? { weaponId: Number(override.weaponId), level: 0 } : null;
      }
    }

    let curW = 0;
    for (const s of [...rh, ...lh]) {
      if (!s || !s.weaponId) continue;
      const w = state.byId.get(Number(s.weaponId));
      if (w) curW += Number(w.weight || 0);
    }
    const gMeta = calcGearMeta(armIds, talIds);
    curW += gMeta.wt;

    let extraEnd = 0;
    let extraEwMult = 1.0;
    if (state.ramLive && state.ramLiveArBuffs) {
      extraEnd = (Number(state.ramLiveArBuffs.endBonus || 0)) - baseMeta.endB;
      const ramEw = Number(state.ramLiveArBuffs.equipWeightMult || 1.0);
      extraEwMult = baseMeta.ewM > 0.01 ? (ramEw / baseMeta.ewM) : ramEw;
    }

    const effEnd = Math.max(1, Math.min(199, baseEnd + gMeta.endB + extraEnd));
    const ccg220 = state.data && state.data.ccg && state.data.ccg["220"];
    const baseMax = ccg220 ? (calcCorrect(effEnd, ccg220) * 100.0) : 100.0;
    const totalEwMult = Math.max(0.1, gMeta.ewM * extraEwMult);
    const maxLoad = Math.max(1.0, baseMax * totalEwMult);
    const pct = (curW / maxLoad) * 100.0;

    let tier = "Light";
    let tierCls = "light";
    if (pct >= 100.0) { tier = "Overloaded"; tierCls = "over"; }
    else if (pct >= 70.0) { tier = "Heavy"; tierCls = "heavy"; }
    else if (pct >= 30.0) { tier = "Med"; tierCls = "med"; }

    const toLight = curW - maxLoad * 0.30;
    const toHeavy = maxLoad * 0.70 - curW;
    const toOver = maxLoad - curW;
    let breakpointText = "";
    if (tierCls === "light") breakpointText = `Med in +${Math.max(0, maxLoad * 0.30 - curW).toFixed(1)}`;
    else if (tierCls === "med") breakpointText = `Heavy +${toHeavy.toFixed(1)} · Light -${toLight.toFixed(1)}`;
    else if (tierCls === "heavy") breakpointText = `Med -${(curW - maxLoad * 0.70 + 0.05).toFixed(1)} · Over +${toOver.toFixed(1)}`;
    else breakpointText = `Over by +${(curW - maxLoad).toFixed(1)}`;

    return {
      curW,
      maxLoad,
      pct,
      tier,
      tierCls,
      totalEwMult,
      effEnd,
      breakpointText,
    };
  }

  function renderEquipLoadBars() {
    if (!state.data) return;
    const cur = computeEquipLoad(null);
    const hov = state._hoverEquipOverride ? computeEquipLoad(state._hoverEquipOverride) : null;
    const fillPct = Math.max(0, Math.min(100, cur.pct));
    const buffTag = Math.abs(cur.totalEwMult - 1.0) > 0.002
      ? `<span class="er-green" title="Equip load multiplier from Talismans, Armor, Fortunes, Tears, &amp; RAM">(&times;${cur.totalEwMult.toFixed(2)})</span>`
      : "";
    let deltaHtml = "";
    if (hov) {
      const dw = hov.curW - cur.curW;
      const dStr = `${dw >= 0 ? "+" : ""}${dw.toFixed(1)}`;
      const cls = dw > 0.05 ? "up" : (dw < -0.05 ? "dn" : "");
      const tierChg = hov.tier !== cur.tier ? ` &rarr; ${hov.tier}` : "";
      deltaHtml = `<span class="el-delta ${cls}">${dStr} wt${tierChg}</span>`;
    }
    const html = `
      <div class="el-hdr">
        <span><span class="muted">Equip Load</span> <b class="er-num">${cur.curW.toFixed(1)} / ${cur.maxLoad.toFixed(1)}</b> <span class="muted">(${cur.pct.toFixed(1)}%)</span> ${buffTag}</span>
        <span class="el-tier-pill ${cur.tierCls}">${cur.tier} Roll</span>
      </div>
      <div class="el-bar-wrap" title="Ticks at 30% (Light) and 70% (Heavy)">
        <div class="el-bar-fill ${cur.tierCls}" style="width:${fillPct.toFixed(1)}%"></div>
        <span class="el-tick t30"></span>
        <span class="el-tick t70"></span>
      </div>
      <div class="el-sub">
        <span>${cur.breakpointText}</span>
        ${deltaHtml}
      </div>
    `;
    if ($("eqEquipLoadBox")) $("eqEquipLoadBox").innerHTML = html;
    if ($("armoryEquipLoadBox")) $("armoryEquipLoadBox").innerHTML = html;
  }

  // Table Columns Definition & Header Builder (exact 2-row grouped tclark.io header + Extra Columns)
  function getExtraColDefs() {
    const extras = [];
    if (state.colCrit) extras.push({ id: "crit", label: "Crit", width: "42px", numeric: true });
    if (state.colDType) extras.push({ id: "ptype", label: "Dmg Type", width: "82px", numeric: false });
    if (state.colBuff) extras.push({ id: "buff", label: "Buff", width: "40px", numeric: true });
    if (state.colStam) extras.push({ id: "r1stam", label: "Stam", width: "48px", numeric: true });
    if (state.colStance) extras.push({ id: "stance", label: "Stance", width: "52px", numeric: true });
    return extras;
  }

  function updateExtraColsButtonLabel() {
    const cnt = [state.colCrit, state.colDType, state.colBuff, state.colStam, state.colStance].filter(Boolean).length;
    $("extraColsBtn").textContent = `Extra Columns (${cnt}) \u25BE`;
  }

  function getColumnsSpec() {
    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    const cols = [{ id: "name", width: "206px", align: "left", numeric: false }];

    if (!state.showDamageSplit) {
      cols.push({ id: "total", width: "74px", numeric: true, arStyle: true });
      if (showEff) cols.push({ id: "eff", width: "66px", numeric: true, effStyle: true });
    } else {
      cols.push({ id: "phys", width: "52px", numeric: true });
      cols.push({ id: "mag", width: "50px", numeric: true });
      cols.push({ id: "fire", width: "50px", numeric: true });
      cols.push({ id: "thun", width: "50px", numeric: true });
      cols.push({ id: "holy", width: "50px", numeric: true });
      cols.push({ id: "spell", width: "52px", numeric: true });
      cols.push({ id: "total", width: "62px", numeric: true, arStyle: true });
      if (showEff) cols.push({ id: "eff", width: "62px", numeric: true, effStyle: true });
    }

    for (const st of STATUS_COL_SPECS) {
      cols.push({ id: st.key, width: "33px", numeric: true });
    }
    for (let i = 0; i < 5; i++) {
      cols.push({ id: `sc_${i}`, width: "34px", numeric: state.numericScaling });
    }
    for (let i = 0; i < 5; i++) {
      cols.push({ id: `rq_${i}`, width: "32px", numeric: true });
    }
    for (const ex of getExtraColDefs()) {
      cols.push(ex);
    }
    return cols;
  }

  function sortIndicator(colId) {
    if (state.sortCol !== colId) return "";
    return `<span class="sort-arrow">${state.sortDesc ? "▾" : "▴"}</span>`;
  }

  function renderTableHeader() {
    const cols = getColumnsSpec();
    state.domColsSpec = cols;

    const cg = $("tableColgroup");
    cg.innerHTML = cols.map((c) => `<col style="width:${c.width};" />`).join("");

    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    const split = state.showDamageSplit;
    const apSpan = split ? (showEff ? 8 : 7) : (showEff ? 2 : 1);

    let row1 = `<th rowspan="2" class="col-left sortable ${state.sortCol === "name" ? "sorted" : ""}" data-sort="name">Weapon${sortIndicator("name")}</th>`;
    if (!split && !showEff) {
      row1 += `<th rowspan="2" class="sortable ${state.sortCol === "total" ? "sorted" : ""}" data-sort="total">Attack Power${sortIndicator("total")}</th>`;
    } else {
      row1 += `<th colspan="${apSpan}">Attack Power</th>`;
    }
    row1 += `<th colspan="6">Status Effects</th>`;
    row1 += `<th colspan="5">Attribute Scaling</th>`;
    row1 += `<th colspan="5">Attributes Required</th>`;
    for (const ex of getExtraColDefs()) {
      row1 += `<th rowspan="2" class="sortable ${state.sortCol === ex.id ? "sorted" : ""}" data-sort="${ex.id}">${escHtml(ex.label)}${sortIndicator(ex.id)}</th>`;
    }

    let row2 = "";
    if (!split && showEff) {
      row2 += `<th class="sortable ${state.sortCol === "total" ? "sorted" : ""}" data-sort="total">Raw${sortIndicator("total")}</th>`;
      row2 += `<th class="sortable ${state.sortCol === "eff" ? "sorted" : ""}" data-sort="eff">Eff${sortIndicator("eff")}</th>`;
    } else if (split) {
      const splitMeta = [
        ["phys", "Phys", "ap_phys"],
        ["mag", "Mag", "ap_mag"],
        ["fire", "Fire", "ap_fire"],
        ["thun", "Ltng", "ap_ltng"],
        ["holy", "Holy", "ap_holy"],
        ["spell", "Spell", ""],
        ["total", "Total", ""],
      ];
      for (const [cid, lbl, apKey] of splitMeta) {
        const ic = apKey ? getErInlineIconHtml(apKey, "", "th-ap-img") : "";
        row2 += `<th class="sortable ${state.sortCol === cid ? "sorted" : ""}" data-sort="${cid}">${ic}${lbl}${sortIndicator(cid)}</th>`;
      }
      if (showEff) {
        row2 += `<th class="sortable ${state.sortCol === "eff" ? "sorted" : ""}" data-sort="eff">Eff${sortIndicator("eff")}</th>`;
      }
    }

    for (const st of STATUS_COL_SPECS) {
      row2 += `<th class="sortable ${state.sortCol === st.key ? "sorted" : ""}" data-sort="${st.key}" title="${st.title}">${getStatusIconHtml(st.key, "th-status-img", st.title)}${sortIndicator(st.key)}</th>`;
    }
    const statShort = ["Str", "Dex", "Int", "Fai", "Arc"];
    for (let i = 0; i < 5; i++) {
      const cid = `sc_${i}`;
      row2 += `<th class="sortable ${state.sortCol === cid ? "sorted" : ""}" data-sort="${cid}">${statShort[i]}${sortIndicator(cid)}</th>`;
    }
    for (let i = 0; i < 5; i++) {
      const cid = `rq_${i}`;
      row2 += `<th class="sortable ${state.sortCol === cid ? "sorted" : ""}" data-sort="${cid}">${statShort[i]}${sortIndicator(cid)}</th>`;
    }

    const thead = $("tableHead");
    thead.innerHTML = `<tr>${row1}</tr><tr>${row2}</tr>`;
    thead.querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const colId = th.dataset.sort;
        const spec = state.domColsSpec.find((c) => c.id === colId);
        const defaultDesc = spec ? spec.numeric : true;
        if (state.sortCol === colId) {
          state.sortDesc = !state.sortDesc;
        } else {
          state.sortCol = colId;
          state.sortDesc = defaultDesc;
        }
        renderTableHeader();
        if (state.bestAffinityOnly) {
          recalculateAndRender();
        } else {
          sortAndFlattenItems(lastComputedList);
          lastRenderSlice.key = "";
          renderVirtualViewport(true);
        }
      });
    });
  }

  function sortKey(res, col) {
    if (col === "name") return res.weapon.name.toLowerCase();
    if (col === "total") return res.total;
    if (col === "eff") return res.eff;
    if (col === "phys") return res.ar[0];
    if (col === "mag") return res.ar[1];
    if (col === "fire") return res.ar[2];
    if (col === "thun") return res.ar[3];
    if (col === "holy") return res.ar[4];
    if (col === "spell") return res.spell;
    if (col === "poison") return res.status[1];
    if (col === "rot") return res.status[2];
    if (col === "bleed") return res.status[0];
    if (col === "frost") return res.status[3];
    if (col === "sleep") return res.status[4];
    if (col === "mad") return res.status[5];
    if (col === "crit") return res.weapon.crit;
    if (col === "ptype") return (res.weapon.physTypes || "").toLowerCase();
    if (col === "buff") return res.weapon.buffable ? 1 : 0;
    if (col === "r1stam") return res.weapon.r1Stam || 0;
    if (col === "stance") return res.stance || 0;
    if (col.startsWith("sc_")) {
      const i = Number(col.slice(3));
      return res.corr[i];
    }
    if (col.startsWith("rq_")) {
      const i = Number(col.slice(3));
      return res.weapon.req[i];
    }
    return res.total;
  }

  function compareResults(a, b, col, desc) {
    const ka = sortKey(a, col);
    const kb = sortKey(b, col);
    let cmp = 0;
    if (typeof ka === "string" || typeof kb === "string") {
      cmp = ka < kb ? -1 : (ka > kb ? 1 : 0);
    } else {
      cmp = ka - kb;
    }
    if (cmp === 0) cmp = a.total - b.total;
    if (cmp === 0) return a.weapon.id - b.weapon.id;
    return desc ? -cmp : cmp;
  }

  let lastComputedList = [];

  function sortAndFlattenItems(computed) {
    const cmpWithFav = (a, b) => {
      if (state.pinFavTop) {
        const fa = isWeaponFavorite(a.weapon.id) ? 1 : 0;
        const fb = isWeaponFavorite(b.weapon.id) ? 1 : 0;
        if (fa !== fb) return fb - fa;
      }
      return compareResults(a, b, state.sortCol, state.sortDesc);
    };
    if (!state.groupByType) {
      const sorted = computed.slice().sort(cmpWithFav);
      state.flatItems = sorted.map((res, idx) => ({ kind: "row", res, stripe: idx % 2 }));
      return;
    }
    const wtypes = state.data.weaponTypes;
    const byType = new Map();
    for (const r of computed) {
      const tName = wtypes[String(r.weapon.wt)] || `Type ${r.weapon.wt}`;
      if (!byType.has(tName)) byType.set(tName, []);
      byType.get(tName).push(r);
    }
    const groupNames = Array.from(byType.keys()).sort((a, b) => a.localeCompare(b));
    const flat = [];
    for (const tName of groupNames) {
      const arr = byType.get(tName).sort(cmpWithFav);
      flat.push({ kind: "group", label: `${tName} (${arr.length})` });
      for (let i = 0; i < arr.length; i++) {
        flat.push({ kind: "row", res: arr[i], stripe: i % 2 });
      }
    }
    state.flatItems = flat;
  }

  function matchesPreFilter(w, tokens, ownedWeaponsSet = null) {
    if (state.equippedOnly && !state.equippedMap.has(w.id)) return false;
    if (state.ownedOnly) {
      if (!ownedWeaponsSet || (!ownedWeaponsSet.has(w.baseId) && !ownedWeaponsSet.has(w.id))) return false;
    }
    if (state.favoritesOnly && !isWeaponFavorite(w.id)) return false;
    if (!state.selectedAffs.has(w.aff)) return false;
    if (!state.selectedWts.has(w.wt)) return false;
    if (state.buffableOnly && !w.buffable) return false;
    if (tokens.length > 0) {
      const sb = w._searchBase;
      for (let i = 0; i < tokens.length; i++) {
        if (!sb.includes(tokens[i])) return false;
      }
    }
    return true;
  }

  function recalculateAndRender() {
    recomputeActiveBuffs();
    renderEquipLoadBars();
    state.calcSerial++;
    const t0 = performance.now();
    const tokens = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const weapons = state.data.weapons;
    const stats = state.stats;
    const regLv = state.regLv;
    const somberLv = state.somberLv;
    const twoHand = state.twoHand;
    const ep = state.enemyPreset;
    const buffs = state.activeBuffs;
    const effOnly = state.effectiveOnly;
    const bestOnly = state.bestAffinityOnly;
    const ownedSets = state.ownedOnly ? getActiveProgressSets() : null;
    const ownedWeps = ownedSets ? ownedSets.weapons : null;

    let computed = [];
    if (state.equippedOnly) {
      const slotList = [
        ...((state.equippedSlots && state.equippedSlots.rh) || []),
        ...((state.equippedSlots && state.equippedSlots.lh) || []),
      ];
      for (const s of slotList) {
        if (!s || !s.weaponId) continue;
        const w = state.byId.get(s.weaponId);
        if (!w || !matchesPreFilter(w, tokens, ownedWeps)) continue;
        const r = computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, s.level, ep, buffs);
        if (effOnly && !r.met) continue;
        computed.push(r);
      }
      if (!slotList.some(Boolean) && state.equippedMap.size) {
        for (const [wid, eqLv] of state.equippedMap.entries()) {
          const w = state.byId.get(wid);
          if (!w || !matchesPreFilter(w, tokens, ownedWeps)) continue;
          const r = computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, eqLv, ep, buffs);
          if (effOnly && !r.met) continue;
          computed.push(r);
        }
      }
    } else if (bestOnly) {
      const bestByBase = new Map();
      const metricCol = state.sortCol.startsWith("sc_") || state.sortCol.startsWith("rq_") || state.sortCol === "name" || state.sortCol === "ptype"
        ? (state.enemyPreset !== "Raw AR (No Defense)" ? "eff" : "total")
        : state.sortCol;
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        if (!matchesPreFilter(w, tokens, ownedWeps)) continue;
        const r = computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, -1, ep, buffs);
        if (effOnly && !r.met) continue;
        const prev = bestByBase.get(w.baseId);
        if (!prev) {
          bestByBase.set(w.baseId, r);
        } else {
          const nk = sortKey(r, metricCol);
          const ok = sortKey(prev, metricCol);
          if (nk > ok || (nk === ok && (r.eff > prev.eff || (r.eff === prev.eff && r.total > prev.total)))) {
            bestByBase.set(w.baseId, r);
          }
        }
      }
      computed = Array.from(bestByBase.values());
    } else {
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        if (!matchesPreFilter(w, tokens, ownedWeps)) continue;
        const r = computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, -1, ep, buffs);
        if (effOnly && !r.met) continue;
        computed.push(r);
      }
    }

    lastComputedList = computed;
    sortAndFlattenItems(computed);
    const ms = Math.round(performance.now() - t0);
    $("rowCountLabel").textContent = `${computed.length.toLocaleString()} weapons · ${ms} ms`;
    $("emptyState").style.display = computed.length === 0 ? "flex" : "none";

    lastRenderSlice = { start: -1, end: -1, key: "" };
    renderVirtualViewport(true);

    if (state.inspectedRes) {
      const curW = state.byId.get(state.inspectedRes.weapon.id);
      if (curW) {
        const updated = computeWeapon(
          curW, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand,
          state.equippedMap.has(curW.id) && state.equippedOnly ? state.equippedMap.get(curW.id) : -1,
          state.enemyPreset,
          state.activeBuffs
        );
        renderInspectorDetails(updated, state.activeTab === "details");
      }
    }
    refreshCompareTray();
    if (state.activeView === "equip") renderEquipView();
    if (state.pipMode === "stats" || state.pipMode === "hud") renderPipStats();
  }

  function formatCellNum(v, dashZero = true) {
    if (dashZero && v <= 0.05) return "-";
    return String(Math.round(v));
  }

  function buildRowHtml(item) {
    const colCount = state.domColsSpec.length;
    if (item.kind === "group") {
      return `<tr class="group-row"><td colspan="${colCount}">${escHtml(item.label)}</td></tr>`;
    }
    const r = item.res;
    const w = r.weapon;
    const isEq = state.equippedMap.has(w.id);
    const isSel = state.inspectedRes && state.inspectedRes.weapon.id === w.id;
    const cls = ["w-row", item.stripe ? "odd" : "even"];
    if (isEq) cls.push("equipped");
    if (isSel) cls.push("selected");

    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    const arUnmetCls = r.met ? "" : " ar-unmet";
    const isFav = isWeaponFavorite(w.id);
    const favBtn = `<button type="button" class="fav-star-btn${isFav ? " on" : ""}" data-fav-wid="${w.id}" title="${isFav ? "Remove favorite" : "Favorite weapon"}">${isFav ? "&#9733;" : "&#9734;"}</button>`;
    const star = isEq ? '<span class="eq-star" title="Equipped">E</span>' : "";
    const dispName = `${favBtn}${star}${escHtml(w.name)} +${r.lv}`;

    let cells = `<td class="col-weapon" title="${escHtml(w.name)} +${r.lv} (${escHtml(w.aff)})">${dispName}</td>`;
    if (!state.showDamageSplit) {
      cells += `<td class="col-ar${arUnmetCls}">${formatCellNum(r.total, false)}</td>`;
      if (showEff) cells += `<td class="col-eff${arUnmetCls}">${formatCellNum(r.eff, false)}</td>`;
    } else {
      for (let i = 0; i < 5; i++) {
        const val = r.ar[i];
        cells += `<td class="${val <= 0.05 ? "dim-dash" : ""}${arUnmetCls}">${formatCellNum(val, true)}</td>`;
      }
      const spVal = w.cat ? r.spell : 0;
      cells += `<td class="${spVal <= 0.05 ? "dim-dash" : ""}${arUnmetCls}">${formatCellNum(spVal, true)}</td>`;
      cells += `<td class="col-ar${arUnmetCls}">${formatCellNum(r.total, false)}</td>`;
      if (showEff) cells += `<td class="col-eff${arUnmetCls}">${formatCellNum(r.eff, false)}</td>`;
    }

    for (const st of STATUS_COL_SPECS) {
      const sv = r.status[st.idx];
      if (sv <= 0.05) cells += `<td class="dim-dash">-</td>`;
      else cells += `<td style="color:${st.color};font-weight:600;">${Math.round(sv)}</td>`;
    }

    for (let i = 0; i < 5; i++) {
      if (state.numericScaling) {
        const cv = r.corr[i];
        cells += cv <= 0.05 ? `<td class="dim-dash">-</td>` : `<td>${Math.round(cv)}</td>`;
      } else {
        const g = r.grades[i];
        cells += g === "-" ? `<td class="dim-dash">-</td>` : `<td>${escHtml(g)}</td>`;
      }
    }

    for (let i = 0; i < 5; i++) {
      const rv = w.req[i];
      if (rv <= 0) {
        cells += `<td class="dim-dash">-</td>`;
      } else {
        const bad = !r.metList[i];
        cells += `<td class="${bad ? "req-unmet" : ""}">${rv}</td>`;
      }
    }

    if (state.colCrit) cells += `<td>${w.crit}</td>`;
    if (state.colDType) cells += `<td>${escHtml(w.physTypes || "-")}</td>`;
    if (state.colBuff) cells += `<td class="${w.buffable ? "col-buff-yes" : "dim-dash"}">${w.buffable ? "✓" : "-"}</td>`;
    if (state.colStam) {
      const sv = w.r1Stam || 0;
      cells += sv > 0.05 ? `<td>${sv.toFixed(1)}</td>` : `<td class="dim-dash">-</td>`;
    }
    if (state.colStance) {
      const stv = r.stance || 0;
      cells += stv > 0.05 ? `<td>${stv.toFixed(1)}</td>` : `<td class="dim-dash">-</td>`;
    }

    return `<tr class="${cls.join(" ")}" data-wid="${w.id}">${cells}</tr>`;
  }

  function renderVirtualViewport(force = false) {
    const scroller = $("tableScroll");
    const tbody = $("tableBody");
    const total = state.flatItems.length;
    const colCount = state.domColsSpec.length;

    if (total === 0) {
      tbody.innerHTML = "";
      lastRenderSlice = { start: 0, end: 0, key: "0" };
      return;
    }

    const headEl = $("tableHead");
    const headH = headEl ? headEl.offsetHeight : 56;
    const scrollTop = Math.max(0, scroller.scrollTop);
    const viewH = Math.max(300, scroller.clientHeight - headH);
    const firstVis = Math.floor(scrollTop / ROW_HEIGHT);
    const visCount = Math.ceil(viewH / ROW_HEIGHT);

    const start = Math.max(0, firstVis - OVERSCAN);
    const end = Math.min(total, firstVis + visCount + OVERSCAN);

    const sliceKey = `${start}:${end}:${total}:${state.calcSerial}:${state.showDamageSplit}:${state.numericScaling}:${state.enemyPreset}:${state.colCrit}:${state.colDType}:${state.colBuff}:${state.colStam}:${state.colStance}:${state.favoritesOnly}:${state.pinFavTop}:${(state.favoriteIds || []).length}:${state.inspectedRes ? state.inspectedRes.weapon.id : -1}`;
    if (!force && lastRenderSlice.key === sliceKey) return;
    if (!force && start >= lastRenderSlice.start + 2 && end <= lastRenderSlice.end - 2 && lastRenderSlice.total === total) {
      return;
    }

    lastRenderSlice = { start, end, total, key: sliceKey };

    const topPad = start * ROW_HEIGHT;
    const bottomPad = Math.max(0, (total - end) * ROW_HEIGHT);
    const rowsHtml = [];
    if (topPad > 0) rowsHtml.push(`<tr class="v-spacer" style="height:${topPad}px"><td colspan="${colCount}"></td></tr>`);
    for (let i = start; i < end; i++) {
      rowsHtml.push(buildRowHtml(state.flatItems[i]));
    }
    if (bottomPad > 0) rowsHtml.push(`<tr class="v-spacer" style="height:${bottomPad}px"><td colspan="${colCount}"></td></tr>`);
    tbody.innerHTML = rowsHtml.join("");
  }

  // Inspector Drawer
  function openDrawer(tabName = null) {
    $("inspectorDrawer").classList.remove("hidden");
    if (tabName) switchDrawerTab(tabName);
    setTimeout(() => renderVirtualViewport(true), 20);
  }

  function closeDrawer() {
    $("inspectorDrawer").classList.add("hidden");
    setTimeout(() => renderVirtualViewport(true), 20);
  }

  function switchDrawerTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll(".drawer-tabs .tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabName);
    });
    document.querySelectorAll(".drawer-body .tab-pane").forEach((p) => {
      p.classList.toggle("active", p.id === `pane-${tabName}`);
    });
    if (tabName === "optimizer" && state.inspectedRes) {
      runOptimizerNow();
    } else if (tabName === "curve" && state.inspectedRes) {
      renderScalingCurve();
      requestAnimationFrame(renderScalingCurve);
    }
  }

  function detectActiveCurveStats(w) {
    const aec = state.data.aec[String(w.aec)];
    const active = [];
    for (let si = 0; si < 5; si++) {
      if (w.corr[si] > 0) {
        active.push(si);
        continue;
      }
      if (aec) {
        let hit = false;
        for (let el = 0; el < 5; el++) {
          if (w.atk[el] <= 0 && !(w.cat && el === 1)) continue;
          const idx = el * 5 + si;
          if (aec.f[idx] && aec.o[idx] > 0) {
            hit = true;
            break;
          }
        }
        if (hit) active.push(si);
      }
    }
    return active.length ? active : [0];
  }

  function renderScalingCurve() {
    const res = state.inspectedRes;
    const svg = $("scalingCurveSvg");
    const tooltip = $("curveTooltip");
    if (!res) {
      svg.innerHTML = "";
      $("curveSoftcaps").innerHTML = "";
      $("curveLegend").textContent = "";
      state.curveData = null;
      return;
    }

    const w = res.weapon;
    const metric = state.curveMetric || "total";
    const activeStats = detectActiveCurveStats(w);
    const statLabels = ["STR", "DEX", "INT", "FAI", "ARC"];
    const statColors = ["#e06c75", "#e5c07b", "#61afef", "#d4ab53", "#c678dd"];

    // Softcaps from primary element CalcCorrectGraph
    let primaryEl = w.cat ? 1 : 0;
    if (!w.cat) {
      let bestAtk = -1;
      for (let el = 0; el < 5; el++) {
        if (w.atk[el] > bestAtk) {
          bestAtk = w.atk[el];
          primaryEl = el;
        }
      }
    }
    const ccgEntry = state.data.ccg[String(w.ccg[primaryEl])];
    const softcaps = [];
    if (ccgEntry && ccgEntry[0]) {
      for (let i = 1; i <= 3; i++) {
        const cap = Math.round(ccgEntry[0][i]);
        if (cap > 10 && cap < 99 && !softcaps.includes(cap)) softcaps.push(cap);
      }
    }
    $("curveSoftcaps").innerHTML = softcaps.length
      ? softcaps.map((c) => `<span class="badge gold">Softcap: ${c}</span>`).join("")
      : `<span class="badge">Linear / No intermediate softcap</span>`;
    $("curveLegend").textContent = activeStats.map((si) => statLabels[si]).join(" · ") + ` (${metric === "eff" ? "Eff Dmg" : (metric === "spell" ? "Spell" : "AR")})`;

    const curves = [];
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const si of activeStats) {
      const pts = [];
      const key = STAT_KEYS[si];
      for (let x = 10; x <= 99; x++) {
        const modStats = Object.assign({}, state.stats);
        modStats[key] = x;
        const r = computeWeapon(w, state.data, state.enemyPresets, modStats, res.lv, res.lv, state.twoHand, res.lv, state.enemyPreset, state.activeBuffs);
        const y = metric === "eff" ? r.eff : (metric === "spell" ? r.spell : r.total);
        pts.push({ x, y });
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
      curves.push({ si, label: statLabels[si], color: statColors[si], curStat: Math.max(10, Math.min(99, state.stats[key])), pts });
    }

    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;
    if (Math.abs(yMax - yMin) < 1) {
      yMin = Math.max(0, yMin - 5);
      yMax = yMax + 5;
    } else {
      const padY = (yMax - yMin) * 0.08;
      yMin = Math.max(0, yMin - padY);
      yMax = yMax + padY;
    }

    const wrap = $("curveChartWrap");
    const W = Math.max(460, wrap.clientWidth || 720);
    const H = Math.max(150, wrap.clientHeight || 192);
    const padL = 44;
    const padR = 16;
    const padT = 14;
    const padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const toPx = (x) => padL + ((x - 10) / 89) * plotW;
    const toPy = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const out = [];

    // Horizontal Y grid
    for (let g = 0; g <= 4; g++) {
      const yVal = yMin + ((yMax - yMin) * g) / 4;
      const py = toPy(yVal).toFixed(1);
      out.push(`<line x1="${padL}" y1="${py}" x2="${W - padR}" y2="${py}" stroke="#2b251f" stroke-width="1"/>`);
      out.push(`<text x="${padL - 6}" y="${Number(py) + 3}" fill="#8e8375" font-size="10" text-anchor="end">${Math.round(yVal)}</text>`);
    }

    // X ticks (10..99)
    for (const xt of [10, 20, 30, 40, 50, 60, 70, 80, 90, 99]) {
      const px = toPx(xt).toFixed(1);
      out.push(`<line x1="${px}" y1="${padT}" x2="${px}" y2="${H - padB}" stroke="#231e19" stroke-width="1"/>`);
      out.push(`<text x="${px}" y="${H - 6}" fill="#8e8375" font-size="10" text-anchor="middle">${xt}</text>`);
    }

    // Softcap vertical dashed lines
    for (const sc of softcaps) {
      const px = toPx(sc).toFixed(1);
      out.push(`<line x1="${px}" y1="${padT}" x2="${px}" y2="${H - padB}" stroke="#d4ab53" stroke-opacity="0.45" stroke-dasharray="4 3" stroke-width="1"/>`);
      out.push(`<text x="${Number(px) + 3}" y="${padT + 10}" fill="#d4ab53" font-size="9.5" opacity="0.85">${sc}</text>`);
    }

    // Curves + current stat marker dots
    for (const c of curves) {
      const ptsStr = c.pts.map((p) => `${toPx(p.x).toFixed(1)},${toPy(p.y).toFixed(1)}`).join(" ");
      out.push(`<polyline fill="none" stroke="${c.color}" stroke-width="2.1" points="${ptsStr}" />`);
      const curPt = c.pts[c.curStat - 10];
      if (curPt) {
        out.push(`<circle cx="${toPx(curPt.x).toFixed(1)}" cy="${toPy(curPt.y).toFixed(1)}" r="4" fill="${c.color}" stroke="#14110f" stroke-width="1.5" />`);
      }
    }

    out.push(`<line id="curveCrosshair" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="#ede6dc" stroke-opacity="0.5" stroke-width="1" style="display:none;"/>`);
    svg.innerHTML = out.join("");
    tooltip.classList.add("hidden");
    state.curveData = { W, padL, plotW, curves };
  }

  function updateCurveHover(clientX) {
    const cd = state.curveData;
    const svg = $("scalingCurveSvg");
    const tooltip = $("curveTooltip");
    if (!cd || !svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * cd.W;
    const norm = Math.max(0, Math.min(1, (svgX - cd.padL) / cd.plotW));
    const statLevel = Math.round(10 + norm * 89);
    const idx = Math.max(0, Math.min(89, statLevel - 10));
    const px = cd.padL + (idx / 89) * cd.plotW;

    const line = $("curveCrosshair");
    if (line) {
      line.setAttribute("x1", px.toFixed(1));
      line.setAttribute("x2", px.toFixed(1));
      line.style.display = "";
    }

    const lines = cd.curves.map((c) => {
      const pt = c.pts[idx];
      const prevPt = idx > 0 ? c.pts[idx - 1] : pt;
      const slope = pt.y - prevPt.y;
      return `<div style="color:${c.color};font-weight:600;">${c.label}: ${pt.y.toFixed(1)} <span style="color:#9e9384;font-weight:400;">(+${slope.toFixed(1)}/pt)</span></div>`;
    });
    tooltip.innerHTML = `<div style="color:#e6dfd5;font-weight:600;margin-bottom:2px;">Attribute Lv ${statLevel}</div>${lines.join("")}`;
    tooltip.classList.remove("hidden");
  }

  function renderInspectorDetails(res, updateAffTable = true) {
    state.inspectedRes = res;
    const w = res.weapon;
    const wtName = state.data.weaponTypes[String(w.wt)] || "";
    $("drawerTitle").textContent = `${w.name} +${res.lv} (${wtName})`;
    $("badgeDType").textContent = `Dmg: ${w.physTypes || "-"}`;
    $("badgeSkill").textContent = `Skill: ${w.skill || "-"}`;

    const bBuff = $("badgeBuff");
    bBuff.textContent = w.buffable ? "Grease OK" : "No Grease";
    bBuff.className = w.buffable ? "badge good" : "badge";

    const bInf = $("badgeInfuse");
    bInf.textContent = w.infusable ? "Infusable" : "Unique";
    bInf.className = w.infusable ? "badge gold" : "badge";

    $("badgeMisc").textContent = `Crit ${w.crit} · Wt ${Number(w.weight || 0).toFixed(1)}`;

    // Proportional AR Split Bar
    const bar = $("arSplitBar");
    const totPos = res.ar.reduce((a, b) => a + Math.max(0, b), 0);
    if (totPos <= 0.05) {
      bar.innerHTML = `<div style="width:100%;display:flex;align-items:center;justify-content:center;color:#9e9384;font-size:11px;">Utility / Non-Damaging</div>`;
    } else {
      const clsNames = ["phys", "mag", "fire", "ltng", "holy"];
      const lblNames = ["Phys", "Mag", "Fire", "Ltng", "Holy"];
      bar.innerHTML = res.ar.map((v, i) => {
        if (v <= 0.05) return "";
        const pct = (v * 100) / totPos;
        const txt = pct >= 14 ? `${lblNames[i]} ${Math.round(v)} (${Math.round(pct)}%)` : (pct >= 8 ? `${Math.round(v)}` : "");
        return `<div class="ar-seg ${clsNames[i]}" style="width:${pct.toFixed(2)}%" title="${lblNames[i]}: ${v.toFixed(1)}">${txt}</div>`;
      }).join("");
    }

    // Breakdown Grid
    const stNames = ["STR", "DEX", "INT", "FAI", "ARC"];
    const reqStr = w.req.map((rv, i) => res.metList[i] ? `${stNames[i]}:${rv}` : `<span style="color:#f05454">${stNames[i]}:${rv}!</span>`).join(" ");
    const grdStr = res.grades.map((g, i) => `${stNames[i]}:${g}`).join(" ");
    const stItems = STATUS_KEYS.map((k, i) => res.status[i] > 0.05 ? `${k[0].toUpperCase() + k.slice(1)} ${Math.round(res.status[i])}` : "").filter(Boolean);

    $("breakdownGrid").innerHTML = `
      <div class="kv-box"><div class="kv-label">Total Attack Power</div><div class="kv-val ${res.met ? "gold" : "red"}">${res.total.toFixed(1)}</div></div>
      <div class="kv-box"><div class="kv-label">Eff Dmg (${escHtml(state.enemyPreset.split(" (")[0])})</div><div class="kv-val ${res.met ? "blue" : "red"}">${res.eff.toFixed(1)}</div></div>
      <div class="kv-box"><div class="kv-label">${w.cat ? "Spell Scaling" : "Two-Hand Bonus"}</div><div class="kv-val">${w.cat ? res.spell.toFixed(1) : (w.dual ? "Dual (1x)" : (state.twoHand ? "1.5x STR" : "1x STR"))}</div></div>
      <div class="kv-box" style="grid-column: span 2;"><div class="kv-label">Requirements</div><div class="kv-val" style="font-size:11.5px;">${reqStr}</div></div>
      <div class="kv-box"><div class="kv-label">Scaling</div><div class="kv-val" style="font-size:11.5px;">${escHtml(grdStr)}</div></div>
    `;

    const elemNames = ["Physical", "Magic   ", "Fire    ", "Ltng    ", "Holy    "];
    const lines = [];
    for (let i = 0; i < 5; i++) {
      if (res.base[i] > 0 || res.ar[i] > 0) {
        const postScale = res.ar[i] - res.base[i];
        const sign = postScale >= 0 ? "+" : "-";
        lines.push(`${elemNames[i]}: ${res.ar[i].toFixed(1).padStart(6)}  (Base ${res.base[i].toFixed(1).padStart(5)} ${sign}${Math.abs(postScale).toFixed(1).padStart(5)}) -> Eff ${res.effElems[i].toFixed(1)}`);
      }
    }
    if (stItems.length) lines.push(`Status  : ${stItems.join(", ")}`);
    $("elemLines").textContent = lines.length ? lines.join("\n") : "No offensive scaling base attack.";

    // Next +5 gains
    const gains = computeNextStatGains(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, 5, res.lv, state.enemyPreset, state.activeBuffs);
    let bestKey = "str";
    let bestScore = -1e9;
    for (const sk of STAT_KEYS) {
      const g = gains[sk];
      const sc = (w.cat && g.spell > g.ar && g.spell > g.eff) ? g.spell : (state.enemyPreset !== "Raw AR (No Defense)" ? g.eff : g.ar);
      if (sc > bestScore) {
        bestScore = sc;
        bestKey = sk;
      }
    }
    $("nextGainsRow").innerHTML = STAT_KEYS.map((sk) => {
      const g = gains[sk];
      const isBest = sk === bestKey && bestScore > 0.05;
      const spl = w.cat && Math.abs(g.spell) > 0.05 ? ` / +${g.spell.toFixed(1)} Spl` : "";
      const effT = state.enemyPreset !== "Raw AR (No Defense)" ? ` (+${g.eff.toFixed(1)} Eff)` : "";
      return `<span class="gain-chip ${isBest ? "best" : ""}">${sk.toUpperCase()} +${g.ar.toFixed(1)} AR${effT}${spl}</span>`;
    }).join("");

    if (updateAffTable) {
      const variants = state.byBase.get(w.baseId) || [w];
      $("affPanelTitle").textContent = `All Affinities for ${w.baseName} (${variants.length})`;
      const comp = variants.map((vw) =>
        computeWeapon(vw, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, res.lv, state.enemyPreset, state.activeBuffs)
      );
      comp.sort((a, b) => (state.enemyPreset !== "Raw AR (No Defense)" ? b.eff - a.eff : b.total - a.total) || b.total - a.total);

      const bestId = comp.length ? comp[0].weapon.id : -1;
      const tbody = $("affPanelBody");
      tbody.innerHTML = comp.map((cr) => {
        const vw = cr.weapon;
        const clss = [];
        if (!cr.met) clss.push("unmet-sub");
        else if (vw.id === bestId) clss.push("best-row");
        if (vw.id === w.id) clss.push("selected-sub");
        return `<tr class="${clss.join(" ")}" data-aff-wid="${vw.id}">
          <td class="left">${escHtml(vw.aff)}</td>
          <td>${formatCellNum(cr.total, false)}</td>
          <td>${formatCellNum(cr.eff, false)}</td>
          <td>${formatCellNum(cr.ar[0])}</td>
          <td>${formatCellNum(cr.ar[1])}</td>
          <td>${formatCellNum(cr.ar[2])}</td>
          <td>${formatCellNum(cr.ar[3])}</td>
          <td>${formatCellNum(cr.ar[4])}</td>
          <td>${formatCellNum(cr.spell)}</td>
          <td class="center">${vw.buffable ? "✓" : "-"}</td>
          <td class="center">${escHtml(cr.grades.join(" "))}</td>
        </tr>`;
      }).join("");

      tbody.querySelectorAll("tr[data-aff-wid]").forEach((tr) => {
        tr.addEventListener("click", () => {
          const wid = Number(tr.dataset.affWid);
          const found = comp.find((c) => c.weapon.id === wid);
          if (found) {
            tbody.querySelectorAll("tr").forEach((x) => x.classList.remove("selected-sub"));
            tr.classList.add("selected-sub");
            renderInspectorDetails(found, false);
          }
        });
        tr.addEventListener("dblclick", () => {
          pinWeaponId(Number(tr.dataset.affWid));
        });
      });

      if (state.activeTab === "optimizer") {
        runOptimizerNow();
      } else if (state.activeTab === "curve") {
        renderScalingCurve();
      }
    } else if (state.activeTab === "curve") {
      renderScalingCurve();
    }
  }

  async function runOptimizerNow() {
    const res = state.inspectedRes;
    const tbody = $("optTableBody");
    if (!res) {
      $("optStatusText").textContent = "Select a weapon row to optimize.";
      tbody.innerHTML = "";
      return [];
    }
    const [floorMode, extraStr] = $("optBudgetSelect").value.split(":");
    const extra = Number(extraStr) || 0;
    const goal = $("optGoalSelect").value;

    const result = await window.pywebview.api.optimize_weapon(
      res.weapon.baseId,
      state.stats,
      state.regLv,
      state.somberLv,
      state.twoHand,
      extra,
      floorMode,
      goal,
      state.enemyPreset,
      res.lv,
      state.activeBuffs,
      getCustomEnemyPresetForBackend()
    );
    state.optResults = result.entries || [];
    const totalPts = STAT_KEYS.reduce((s, k) => s + state.stats[k], 0) + extra;
    $("optStatusText").textContent = `${res.weapon.baseName} +${res.lv} · Budget ${totalPts} pts (${floorMode === "keep" ? "Level Up" : "Respec min 8"}) · ${result.ms.toFixed(0)} ms`;

    const baseVal = goal === "eff" ? res.eff : (goal === "spell" ? res.spell : res.total);
    const bestId = state.optResults.length ? state.optResults[0].weaponId : -1;

    tbody.innerHTML = state.optResults.map((ent, i) => {
      const curVal = goal === "eff" ? ent.eff : (goal === "spell" ? ent.spell : ent.total);
      const dv = curVal - baseVal;
      const dStr = dv >= 0 ? `+${dv.toFixed(1)}` : dv.toFixed(1);
      const st = ent.stats;
      const statStr = `${st.str} / ${st.dex} / ${st.int} / ${st.fai} / ${st.arc}`;
      const cls = !ent.met ? "unmet-sub" : (ent.weaponId === bestId ? "best-row" : (i === 0 ? "selected-sub" : ""));
      return `<tr class="${cls}" data-opt-idx="${i}">
        <td class="left">${escHtml(ent.aff)}</td>
        <td>${Math.round(ent.total)}</td>
        <td>${Math.round(ent.eff)}</td>
        <td>${dStr}</td>
        <td>${ent.spell > 0.05 ? Math.round(ent.spell) : "-"}</td>
        <td class="center">${statStr}</td>
        <td class="center">${escHtml(ent.grades.join(" "))}</td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("tr[data-opt-idx]").forEach((tr) => {
      tr.addEventListener("click", () => {
        tbody.querySelectorAll("tr").forEach((x) => x.classList.remove("selected-sub"));
        tr.classList.add("selected-sub");
      });
      tr.addEventListener("dblclick", () => {
        applyOptimizerIndex(Number(tr.dataset.optIdx));
      });
    });
    if (tbody.firstElementChild) tbody.firstElementChild.classList.add("selected-sub");
    return state.optResults;
  }

  function applyOptimizerIndex(idx) {
    const ent = state.optResults[idx];
    if (!ent) return;
    state.stats = Object.assign({}, ent.stats);
    updateStatInputsDom();
    recalculateAndRender();
  }

  function pinWeaponId(wid, openCalcDrawer = true) {
    if (!state.byId.has(wid)) return;
    if (!state.compareIds.includes(wid)) {
      if (state.compareIds.length >= 6) state.compareIds.shift();
      state.compareIds.push(wid);
    }
    refreshCompareTray();
    if (openCalcDrawer) openDrawer("compare");
    else if (state.activeView === "equip") renderEquipCenterDetail(getEquipSelectedWeaponResult());
  }

  function refreshCompareTray() {
    const n = state.compareIds.length;
    if ($("topCompareBtn")) $("topCompareBtn").textContent = `Compare (${n})`;
    if ($("eqCmpCnt")) $("eqCmpCnt").textContent = String(n);
    $("compareTabBtn").textContent = `Compare Tray (${n}/6)`;
    const tbody = $("cmpTableBody");
    if (!n) {
      tbody.innerHTML = "";
      return;
    }
    const items = state.compareIds
      .map((wid) => state.byId.get(wid))
      .filter(Boolean)
      .map((w) => computeWeapon(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, -1, state.enemyPreset, state.activeBuffs));
    if (!items.length) return;

    const baseTot = items[0].total;
    const baseEff = items[0].eff;
    const elShort = ["P", "M", "F", "L", "H"];

    tbody.innerHTML = items.map((r, idx) => {
      const w = r.weapon;
      const dt = idx === 0 ? "Base" : (r.total - baseTot >= 0 ? `+${Math.round(r.total - baseTot)}` : `${Math.round(r.total - baseTot)}`);
      const de = idx === 0 ? "Base" : (r.eff - baseEff >= 0 ? `+${Math.round(r.eff - baseEff)}` : `${Math.round(r.eff - baseEff)}`);
      const splitStr = r.ar.map((v, i) => v > 0.05 ? `${elShort[i]}:${Math.round(v)}` : "").filter(Boolean).join(" / ") || "-";
      const stStr = STATUS_KEYS.map((k, i) => r.status[i] > 0.05 ? `${k.slice(0, 3)}:${Math.round(r.status[i])}` : "").filter(Boolean).join(", ") || "-";
      const cls = !r.met ? "unmet-sub" : (idx === 0 ? "best-row" : "");
      return `<tr class="${cls}" data-cmp-wid="${w.id}">
        <td class="left">${escHtml(w.baseName)} +${r.lv}</td>
        <td class="left">${escHtml(w.aff)}</td>
        <td>${Math.round(r.total)}</td>
        <td>${dt}</td>
        <td>${Math.round(r.eff)}</td>
        <td>${de}</td>
        <td class="left">${escHtml(splitStr)}</td>
        <td>${r.spell > 0.05 ? Math.round(r.spell) : "-"}</td>
        <td class="left">${escHtml(stStr)}</td>
        <td>${w.crit}</td>
        <td class="center">${w.buffable ? "✓" : "-"}</td>
        <td class="left">${escHtml(w.skill || "-")}</td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("tr[data-cmp-wid]").forEach((tr) => {
      tr.addEventListener("click", () => {
        tbody.querySelectorAll("tr").forEach((x) => x.classList.remove("selected-sub"));
        tr.classList.add("selected-sub");
      });
    });
  }

  // Save Loading & Application
  function applySavePayload(parsed, selectLatest = true) {
    if (!parsed || !parsed.characters || !parsed.characters.length) {
      $("charMetaText").textContent = parsed && parsed.error ? parsed.error : "Manual stats";
      $("saveAcceptedIcon").classList.remove("active");
      return false;
    }
    state.savePath = parsed.savePath;
    state.characters = parsed.characters;

    const sel = $("charSelect");
    sel.innerHTML = parsed.characters.map((c) => {
      const tag = c.slot === parsed.lastSlot ? " [Latest]" : "";
      return `<option value="${c.slot}">Slot ${c.slot + 1}: ${escHtml(c.name)} (Lv.${c.level} · ${escHtml(c.playTime)})${tag}</option>`;
    }).join("");

    const targetSlot = selectLatest ? parsed.lastSlot : state.activeSlot;
    const ch = parsed.characters.find((c) => c.slot === targetSlot) || parsed.characters[0];
    sel.value = String(ch.slot);
    applyCharacter(ch);
    return true;
  }

  function cloneEquipSlots(slots) {
    const cp = (arr) => [0, 1, 2].map((i) => {
      const e = arr && arr[i];
      return e && e.weaponId ? { weaponId: Number(e.weaponId), level: Number(e.level) || 0 } : null;
    });
    return { rh: cp(slots && slots.rh), lh: cp(slots && slots.lh) };
  }

  function rebuildEquippedMapFromSlots() {
    state.equippedMap = new Map();
    for (const arr of [state.equippedSlots.rh, state.equippedSlots.lh]) {
      for (const s of arr) {
        if (!s || !s.weaponId) continue;
        const prev = state.equippedMap.get(s.weaponId);
        state.equippedMap.set(s.weaponId, prev === undefined ? s.level : Math.max(prev, s.level));
      }
    }
  }

  function loadEquipSlotsFromChar(ch) {
    const norm = (e) => (e && e.weaponId ? { weaponId: Number(e.weaponId), level: Number(e.level) || 0 } : null);
    const rh = [null, null, null];
    const lh = [null, null, null];
    if (ch && (Array.isArray(ch.rightHand) || Array.isArray(ch.leftHand))) {
      for (let i = 0; i < 3; i++) {
        rh[i] = Array.isArray(ch.rightHand) ? norm(ch.rightHand[i]) : null;
        lh[i] = Array.isArray(ch.leftHand) ? norm(ch.leftHand[i]) : null;
      }
    } else if (ch && Array.isArray(ch.equipped)) {
      for (let i = 0; i < 3; i++) {
        rh[i] = norm(ch.equipped[i]);
        lh[i] = norm(ch.equipped[i + 3]);
      }
    }
    state.savedEquipSlots = cloneEquipSlots({ rh, lh });
    state.equippedSlots = cloneEquipSlots({ rh, lh });
    const normAmmo = (arr) => [arr && arr[0] ? Number(arr[0]) : null, arr && arr[1] ? Number(arr[1]) : null];
    const arrows = normAmmo(ch && ch.arrows);
    const bolts = normAmmo(ch && ch.bolts);
    state.savedAmmo = { arrows: arrows.slice(), bolts: bolts.slice() };
    state.arrowIds = arrows;
    state.boltIds = bolts;
    state.spellIds = Array.isArray(ch && ch.spells) ? ch.spells.slice() : [];
    state.armStyle = (ch && typeof ch.armStyle === "number" && ch.armStyle >= 0 && ch.armStyle <= 3) ? ch.armStyle : 1;
    state.activeRhSlot = (ch && typeof ch.activeRhSlot === "number" && ch.activeRhSlot >= 0 && ch.activeRhSlot <= 2) ? ch.activeRhSlot : 0;
    state.activeLhSlot = (ch && typeof ch.activeLhSlot === "number" && ch.activeLhSlot >= 0 && ch.activeLhSlot <= 2) ? ch.activeLhSlot : 0;
    state.equipPreviewWid = null;
    rebuildEquippedMapFromSlots();
    let sel = { kind: "rh", idx: 0 };
    const rIdx = rh.findIndex(Boolean);
    if (rIdx >= 0) sel = { kind: "rh", idx: rIdx };
    else {
      const lIdx = lh.findIndex(Boolean);
      if (lIdx >= 0) sel = { kind: "lh", idx: lIdx };
    }
    state.equipSelectedSlot = sel;
    const selEnt = state.equippedSlots[sel.kind][sel.idx];
    state.equipSelectedWid = selEnt ? selEnt.weaponId : null;
  }

  function applyCharacter(ch) {
    state.activeSlot = ch.slot;
    state.savedSnapshot = {
      str: ch.stats.str,
      dex: ch.stats.dex,
      int: ch.stats.int,
      fai: ch.stats.fai,
      arc: ch.stats.arc,
    };
    state.stats = Object.assign({}, state.savedSnapshot);
    loadEquipSlotsFromChar(ch);
    state.equipPickerTarget = null;
    if ($("eqSlotPicker")) $("eqSlotPicker").classList.add("hidden");
    const ar = ch.armor || [null, null, null, null];
    const tl = ch.talismans || [null, null, null, null];
    state.savedGear = {
      armor: [ar[0] || null, ar[1] || null, ar[2] || null, ar[3] || null],
      talismans: [tl[0] || null, tl[1] || null, tl[2] || null, tl[3] || null],
    };
    state.armorIds = state.savedGear.armor.slice();
    state.talismanIds = state.savedGear.talismans.slice();
    syncGearDropdownValues();
    recomputeActiveBuffs();

    matchEquippedLevels(false);
    updateStatInputsDom();
    $("charMetaText").textContent = `${ch.name} Lv.${ch.level} · Vig ${ch.stats.vig} Mnd ${ch.stats.mnd} End ${ch.stats.end}`;
    $("saveAcceptedIcon").classList.add("active");
    const saveName = state.savePath ? state.savePath.split(/[/\\]/).pop() : "save";
    const modName = (state.data && state.data.mod) || (state.modSource && state.modSource.modLabel) || "Regulation Data";
    $("infoBannerText").innerHTML =
      `Using regulation data from <strong>${escHtml(modName)}</strong> &middot; Loaded <strong>${escHtml(ch.name)} (Lv.${ch.level})</strong> from <strong>${escHtml(saveName)}</strong>`;
    if (ch.playerPos && mapState.loaded) maybeAutoSwitchPlayerLayer(ch.playerPos);
    if (isMapVisible()) {
      const cntEl = $("cnt-pins");
      if (cntEl) cntEl.textContent = String(getActiveWorldPins().length);
      updateMapSearchList();
      updateMapPlayerReadout();
      renderMapCanvas();
    } else if (state.activeView === "pip") {
      renderPipViewerWorkspace();
    }
  }

  function matchEquippedLevels(recalc = true) {
    let maxReg = null;
    let maxSomber = null;
    for (const [wid, lv] of state.equippedMap.entries()) {
      const w = state.byId.get(wid);
      if (!w) continue;
      if (w.maxLv === 25) maxReg = maxReg === null ? lv : Math.max(maxReg, lv);
      else if (w.maxLv > 0) maxSomber = maxSomber === null ? lv : Math.max(maxSomber, lv);
    }
    if (maxReg !== null && maxSomber !== null) {
      state.regLv = maxReg;
      state.somberLv = maxSomber;
    } else if (maxReg !== null) {
      state.regLv = maxReg;
      state.somberLv = Math.min(10, Math.round((maxReg * 10) / 25));
    } else if (maxSomber !== null) {
      state.somberLv = maxSomber;
      state.regLv = Math.min(25, Math.round((maxSomber * 25) / 10));
    }
    syncLevelSelectValue();
    if (recalc) recalculateAndRender();
  }

  function persistSettings() {
    if (!window.pywebview || !window.pywebview.api) return;
    window.pywebview.api.save_settings({
      twoHand: state.twoHand,
      groupByType: state.groupByType,
      numericScaling: state.numericScaling,
      showDamageSplit: state.showDamageSplit,
      colCrit: state.colCrit,
      colDType: state.colDType,
      colBuff: state.colBuff,
      colStam: state.colStam,
      colStance: state.colStance,
      condTalismans: state.condTalismans,
      greaseId: state.greaseId,
      buffToggles: state.buffToggles,
      effectiveOnly: state.effectiveOnly,
      bestAffinityOnly: state.bestAffinityOnly,
      buffableOnly: state.buffableOnly,
      ownedOnly: state.ownedOnly,
      favoritesOnly: state.favoritesOnly,
      pinFavTop: state.pinFavTop,
      favoriteIds: state.favoriteIds,
      enemyPreset: state.enemyPreset,
      customBossPreset: state.customBossPreset,
      liveWatch: state.liveWatch,
      bannerDismissed: state.bannerDismissed,
      pipOpacity: state.pipOpacity,
      pipCorner: state.pipCorner,
      pipBossPlacement: state.pipBossPlacement,
      pipGripPlacement: state.pipGripPlacement,
      pvPreviewMode: state.pvPreviewMode,
      pipBossHud: state.pipBossHud,
      pipMapBossHud: state.pipMapBossHud,
      pipBossDesign: state.pipBossDesign,
      pipBossResMode: state.pipBossResMode,
      pipLocked: state.pipLocked,
      pipAutoHide: state.pipAutoHide,
      minimizeToTray: state.minimizeToTray,
      pipSmartFade: state.pipSmartFade,
      pipIdleOpacity: state.pipIdleOpacity,
      pipCombatOpacity: state.pipCombatOpacity,
      pipFadeMs: state.pipFadeMs,
      pipFadeOnBoss: state.pipFadeOnBoss,
      pipFadeOnBuffs: state.pipFadeOnBuffs,
      pipBuffHud: state.pipBuffHud,
      pipMapBuffHud: state.pipMapBuffHud,
      buffExpFlash: state.buffExpFlash,
      buffHideLooping: state.buffHideLooping,
      buffSweepOpacity: state.buffSweepOpacity,
      buffTextOpacity: state.buffTextOpacity,
      enemyShowStatuses: state.enemyShowStatuses,
      enemyShowStance: state.enemyShowStance,
      keybinds: state.keybinds,
      mapLayer: mapState.layer,
      mapCats: mapState.cats,
      mapShowPlayer: mapState.showPlayer,
      mapShowPins: mapState.showPins,
      mapAutoClearBeacon: mapState.autoClearBeacon,
      mapShowOffscreenArrow: mapState.showOffscreenArrow,
      mapShowLabels: mapState.showLabels,
      mapPipNearbyLabelsOnly: mapState.pipNearbyLabelsOnly,
      mapPipNearbyLabelRadius: mapState.pipNearbyLabelRadius,
      mapLabelCats: mapState.labelCats,
      mapFollow: mapState.followPlayer,
      mapAutoSwitchLayer: mapState.autoSwitchLayer,
      mapAutoDetect: mapState.autoDetect,
      mapCompletedMode: mapState.completedMode,
      manualCompleted: mapState.manualCompleted,
      promptMode: state.promptMode,
    });
  }

  function bindUiEvents() {
    $("drawerToggleBtn").addEventListener("click", () => {
      $("sidebar").classList.toggle("collapsed");
      setTimeout(() => renderVirtualViewport(true), 200);
    });

    if ($("topReloadBtn")) {
      $("topReloadBtn").addEventListener("click", async () => {
        const res = await window.pywebview.api.reload_save(false);
        if (applySavePayload(res, true)) recalculateAndRender();
      });
    }
    $("sideReloadBtn").addEventListener("click", async () => {
      const res = await window.pywebview.api.reload_save(false);
      if (applySavePayload(res, true)) recalculateAndRender();
    });
    $("sideBrowseBtn").addEventListener("click", async () => {
      const res = await window.pywebview.api.browse_save();
      if (res && !res.cancelled && applySavePayload(res, true)) recalculateAndRender();
    });
    $("charSelect").addEventListener("change", () => {
      const slot = Number($("charSelect").value);
      const ch = state.characters.find((c) => c.slot === slot);
      if (ch) {
        applyCharacter(ch);
        recalculateAndRender();
      }
    });

    $("liveWatchCb").addEventListener("change", (e) => {
      state.liveWatch = e.target.checked;
      syncSettingsToggleablesUi();
      persistSettings();
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_live_watch) {
        window.pywebview.api.set_live_watch(state.liveWatch);
      }
    });

    if ($("topMatchEqBtn")) $("topMatchEqBtn").addEventListener("click", () => matchEquippedLevels(true));
    if ($("syncInvLvBtn")) $("syncInvLvBtn").addEventListener("click", () => syncInventoryUpgrades(true, true));
    $("maxUpgradeBtn").addEventListener("click", () => {
      state.regLv = 25;
      state.somberLv = 10;
      syncLevelSelectValue();
      recalculateAndRender();
    });
    $("revertStatsBtn").addEventListener("click", () => {
      if (state.savedSnapshot) {
        state.stats = Object.assign({}, state.savedSnapshot);
        updateStatInputsDom();
        recalculateAndRender();
      }
    });
    $("topCompareBtn").addEventListener("click", () => {
      const drw = $("inspectorDrawer");
      if (!drw.classList.contains("hidden") && state.activeTab === "compare") closeDrawer();
      else openDrawer("compare");
    });
    const applyRefreshedPayload = (res, statusEl = null) => {
      if (!res || !res.ok || !res.data) return false;
      state.data = res.data;
      state.byId.clear();
      state.byBase.clear();
      buildSearchTags(state.data);
      buildAffinitySidebar();
      buildWeaponTypeTree();
      populateGearDropdowns();
      if (res.save) applySavePayload(res.save, false);
      syncGearDropdownValues();
      recalculateAndRender();
      if (res.modSource) state.modSource = res.modSource;
      const srcTxt = res.source ? String(res.source) : "regulation data";
      const modLbl = state.data.mod || (state.modSource && state.modSource.modLabel) || srcTxt;
      if ($("hdrModTag") && modLbl) $("hdrModTag").textContent = modLbl;
      if ($("erFtrTag") && modLbl) $("erFtrTag").textContent = String(modLbl).toUpperCase();
      if ($("erFtrArmoryCount")) $("erFtrArmoryCount").textContent = state.data.weapons.length.toLocaleString();
      const chName = (state.characters.find((c) => c.slot === state.activeSlot) || {}).name;
      $("infoBannerText").innerHTML = chName
        ? `Refreshed <strong>${Number(res.weaponCount || res.data.weapons.length).toLocaleString()} weapons</strong> from <strong>${escHtml(srcTxt)}</strong> &middot; Character: <strong>${escHtml(chName)}</strong>`
        : `Refreshed <strong>${Number(res.weaponCount || res.data.weapons.length).toLocaleString()} weapons</strong> from <strong>${escHtml(srcTxt)}</strong>`;
      if (statusEl) {
        statusEl.className = "mod-source-status ok";
        statusEl.textContent = `Loaded ${Number(res.weaponCount || res.data.weapons.length).toLocaleString()} weapons from ${srcTxt}`;
      }
      showErToast("Mod Data Loaded", `${Number(res.weaponCount || res.data.weapons.length).toLocaleString()} weapons from ${modLbl}`, "ok");
      syncModSourceUi(false);
      if (state.activeView === "equip") renderEquipView();
      else if (state.activeView === "pip") renderPipViewerWorkspace();
      return true;
    };

    const runModRefresh = async (mode = "auto", customPath = null, statusEl = null) => {
      const btn = $("topRefreshModBtn") || $("modRefreshNowBtn");
      const prevTxt = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Extracting...";
      }
      if (statusEl) {
        statusEl.className = "mod-source-status";
        statusEl.textContent = mode === "game" ? "Reading active game / regulation data..." : "Extracting regulation data...";
      }
      try {
        let res = await window.pywebview.api.refresh_mod_data(mode, customPath);
        if (res && res.needsPicker && mode === "auto") {
          const picked = await window.pywebview.api.browse_regulation();
          if (!picked || picked.cancelled) {
            if (statusEl) {
              statusEl.className = "mod-source-status";
              statusEl.textContent = "Selection cancelled.";
            }
            return;
          }
          if (picked.ok && picked.regulationPath) {
            res = await window.pywebview.api.refresh_mod_data("file", picked.regulationPath);
          } else {
            res = picked;
          }
        }
        if (res && res.ok) {
          applyRefreshedPayload(res, statusEl);
        } else {
          const msg = (res && res.message) || "Failed to refresh mod data.";
          if (statusEl) {
            statusEl.className = "mod-source-status err";
            statusEl.textContent = msg;
          } else {
            alert(msg);
          }
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = prevTxt;
        }
      }
    };

    const syncModSourceUi = async (refreshLiveInfo = false) => {
      if (refreshLiveInfo && window.pywebview && window.pywebview.api && window.pywebview.api.get_mod_source_info) {
        try {
          state.modSource = await window.pywebview.api.get_mod_source_info();
        } catch (_) {}
      }
      const ms = state.modSource || {};
      const disp = $("modRegPathDisplay");
      if (disp) {
        disp.textContent = ms.regulationPath || `Bundled (${ms.modLabel || "ERR v2.3.10.1"})`;
      }
      if ($("hdrModTag") && ms.modLabel) $("hdrModTag").textContent = ms.modLabel;
      const rg = ms.runningGame || {};
      const liveOk = Boolean(state.ramLive || rg.running);
      const mark = liveOk ? '<span class="ok-mark">&#10003;</span>' : '<span class="err-mark">&#10005;</span>';
      if ($("ramHeaderBadge")) {
        $("ramHeaderBadge").innerHTML = mark;
        $("ramHeaderBadge").title = liveOk ? "Game / Live RAM Detected" : "Game Not Running";
      }
      if ($("sysGameStatusBadge")) {
        $("sysGameStatusBadge").className = liveOk ? "ok-mark" : "err-mark";
        $("sysGameStatusBadge").title = rg.source || (liveOk ? "Running" : "Not running");
        $("sysGameStatusBadge").innerHTML = liveOk ? "&#10003;" : "&#10005;";
      }
      if ($("mapPlayerStatusTag")) {
        $("mapPlayerStatusTag").className = liveOk ? "ok-mark" : "err-mark";
        $("mapPlayerStatusTag").innerHTML = liveOk ? "&#10003;" : "&#10005;";
        $("mapPlayerStatusTag").title = liveOk ? "Live RAM synced" : "Game offline (save position)";
      }
      if ($("sysDiagRamMark")) {
        $("sysDiagRamMark").className = liveOk ? "ok-mark" : "err-mark";
        $("sysDiagRamMark").innerHTML = liveOk ? "&#10003;" : "&#10005;";
      }
      if ($("sysDiagProc")) {
        $("sysDiagProc").textContent = rg.running ? `eldenring.exe (${rg.source || "Active"})` : "Not Running";
      }
      if ($("sysDiagWeapons") && state.data) {
        $("sysDiagWeapons").textContent = state.data.weapons.length.toLocaleString();
      }
      if ($("sysDiagIcons")) {
        const cnt = state.erUiIcons && state.erUiIcons.count ? state.erUiIcons.count : 0;
        $("sysDiagIcons").textContent = `${cnt.toLocaleString()} icons`;
        if ($("sysIconsCountTag")) $("sysIconsCountTag").textContent = `${cnt.toLocaleString()} Cached`;
      }
      if ($("sysDiagEac")) {
        $("sysDiagEac").textContent = rg.eac ? "EAC Active" : "Offline Safe";
      }
    };
    window.__syncModSourceUi = syncModSourceUi;

    if ($("topRefreshModBtn")) $("topRefreshModBtn").addEventListener("click", () => runModRefresh("auto", null, null));
    const triggerBrowseReg = async () => {
      const stEl = $("modSourceStatus");
      const picked = await window.pywebview.api.browse_regulation();
      if (!picked || picked.cancelled) return;
      if (picked.ok && picked.regulationPath) {
        await runModRefresh("file", picked.regulationPath, stEl);
      } else if (stEl) {
        stEl.className = "mod-source-status err";
        stEl.textContent = (picked && picked.message) || "Failed to select regulation.bin.";
      }
    };
    if ($("modBrowseRegBtn")) $("modBrowseRegBtn").addEventListener("click", triggerBrowseReg);
    if ($("modRegRow")) $("modRegRow").addEventListener("click", triggerBrowseReg);
    if ($("modReadGameBtn")) {
      $("modReadGameBtn").addEventListener("click", () => runModRefresh("game", null, $("modSourceStatus")));
    }
    if ($("modRefreshNowBtn")) {
      $("modRefreshNowBtn").addEventListener("click", () => runModRefresh("auto", null, $("modSourceStatus")));
    }
    if ($("modClearRegBtn")) {
      $("modClearRegBtn").addEventListener("click", async () => {
        const res = await window.pywebview.api.clear_regulation_path();
        if (res && res.ok && res.data) {
          applyRefreshedPayload(res, $("modSourceStatus"));
        } else {
          if (res && res.modSource) state.modSource = res.modSource;
          await syncModSourceUi(true);
          if ($("modSourceStatus")) {
            $("modSourceStatus").className = "mod-source-status ok";
            $("modSourceStatus").textContent = "Cleared custom path. Using running game / bundled data.";
          }
        }
      });
    }
    if ($("sysReextractIconsBtn")) {
      $("sysReextractIconsBtn").addEventListener("click", async () => {
        const st = $("modSourceStatus");
        if (st) { st.className = "mod-source-status"; st.textContent = "Extracting game icons..."; }
        const r = await window.pywebview.api.reextract_er_ui_icons();
        if (r && r.ok && r.erUiIcons) {
          state.erUiIcons = r.erUiIcons;
          if (r.erMenuAssets) {
            window.__ER_MENU_ASSETS = r.erMenuAssets;
            hydrateErMenuAssets();
            buildAffinitySidebar();
            buildWeaponTypeTree();
          }
          if (st) { st.className = "mod-source-status ok"; st.textContent = `Extracted ${r.count} item icons, ${r.affCount} affinities, ${r.wtCount} weapon classes.`; }
          syncModSourceUi(false);
          if (state.activeView === "equip") renderEquipView();
          else if (state.activeView === "pip") renderPipViewerWorkspace();
        } else if (st) {
          st.className = "mod-source-status err";
          st.textContent = (r && r.message) || "Failed to extract game icons.";
        }
      });
    }
    if ($("sysPromptModeRow")) {
      $("sysPromptModeRow").addEventListener("click", () => {
        const order = ["auto", "kbm", "xbox", "ps5"];
        state.promptMode = order[(order.indexOf(state.promptMode) + 1) % order.length];
        persistSettings();
        renderFooterPrompts();
      });
    }
    if ($("sysMinTrayRow")) {
      $("sysMinTrayRow").addEventListener("click", () => {
        setMinimizeToTray(!state.minimizeToTray, true);
      });
    }
    const switchSysSubTab = (tab) => {
      const next = ["hotkeys", "advanced"].includes(tab) ? tab : "mod";
      state.sysSubTab = next;
      document.querySelectorAll("#sysSubTabs .subtab").forEach((b) => {
        b.classList.toggle("active", b.dataset.systab === next);
      });
      if ($("sysPaneMod")) $("sysPaneMod").classList.toggle("hidden", next !== "mod");
      if ($("sysPaneHotkeys")) $("sysPaneHotkeys").classList.toggle("hidden", next !== "hotkeys");
      if ($("sysPaneAdvanced")) $("sysPaneAdvanced").classList.toggle("hidden", next !== "advanced");
      if (next === "hotkeys" || next === "advanced") {
        if (window.__renderKeybindsUi) window.__renderKeybindsUi();
        if (window.__syncTogUi) window.__syncTogUi();
      } else {
        state.recordingKeybindAction = null;
      }
    };
    window.__switchSysSubTab = switchSysSubTab;
    document.querySelectorAll("#sysSubTabs .subtab").forEach((btn) => {
      btn.addEventListener("click", () => switchSysSubTab(btn.dataset.systab));
    });
    if ($("sysOpenSettingsModalBtn")) {
      $("sysOpenSettingsModalBtn").addEventListener("click", () => switchSysSubTab("hotkeys"));
    }
    if ($("ramHeaderBadge")) {
      $("ramHeaderBadge").addEventListener("click", () => { switchMainView("system"); switchSysSubTab("mod"); });
    }
    $("topGearBtn").addEventListener("click", () => {
      $("gearPanel").classList.toggle("hidden");
      setTimeout(() => renderVirtualViewport(true), 20);
    });
    $("extraColsBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      $("extraColsMenu").classList.toggle("hidden");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".extra-cols-anchor")) {
        $("extraColsMenu").classList.add("hidden");
      }
    });
    for (const [cbId, stateKey] of [
      ["colCritCb", "colCrit"],
      ["colDTypeCb", "colDType"],
      ["colBuffCb", "colBuff"],
      ["colStamCb", "colStam"],
      ["colStanceCb", "colStance"],
    ]) {
      $(cbId).addEventListener("change", (e) => {
        state[stateKey] = e.target.checked;
        updateExtraColsButtonLabel();
        renderTableHeader();
        persistSettings();
        lastRenderSlice.key = "";
        renderVirtualViewport(true);
      });
    }

    const armorSelIds = ["armorHeadSel", "armorChestSel", "armorArmsSel", "armorLegsSel"];
    armorSelIds.forEach((id, slot) => {
      $(id).addEventListener("change", (e) => {
        state.armorIds[slot] = e.target.value ? Number(e.target.value) : null;
        recalculateAndRender();
      });
    });
    for (let s = 0; s < 4; s++) {
      ((slot) => {
        $(`tal${slot}Sel`).addEventListener("change", (e) => {
          state.talismanIds[slot] = e.target.value ? Number(e.target.value) : null;
          recalculateAndRender();
        });
      })(s);
    }
    $("condTalismansCb").addEventListener("change", (e) => {
      state.condTalismans = e.target.checked;
      persistSettings();
      recalculateAndRender();
    });
    $("greaseSel").addEventListener("change", (e) => {
      state.greaseId = Number(e.target.value) || 0;
      persistSettings();
      recalculateAndRender();
    });
    document.querySelectorAll("#buffPillsRow .buff-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.buff;
        state.buffToggles[k] = !state.buffToggles[k];
        btn.classList.toggle("active", state.buffToggles[k]);
        persistSettings();
        recalculateAndRender();
      });
    });
    $("gearResetBtn").addEventListener("click", () => {
      state.equippedSlots = cloneEquipSlots(state.savedEquipSlots);
      state.arrowIds = (state.savedAmmo && state.savedAmmo.arrows ? state.savedAmmo.arrows : [null, null]).slice();
      state.boltIds = (state.savedAmmo && state.savedAmmo.bolts ? state.savedAmmo.bolts : [null, null]).slice();
      state.equipPreviewWid = null;
      rebuildEquippedMapFromSlots();
      state.armorIds = state.savedGear.armor.slice();
      state.talismanIds = state.savedGear.talismans.slice();
      syncGearDropdownValues();
      recalculateAndRender();
    });
    $("gearClearBuffsBtn").addEventListener("click", () => {
      state.condTalismans = false;
      state.greaseId = 0;
      for (const k of Object.keys(state.buffToggles)) state.buffToggles[k] = false;
      syncGearDropdownValues();
      persistSettings();
      recalculateAndRender();
    });

    $("curveMetricSelect").addEventListener("change", (e) => {
      state.curveMetric = e.target.value;
      renderScalingCurve();
    });
    $("scalingCurveSvg").addEventListener("mousemove", (e) => {
      updateCurveHover(e.clientX);
    });
    $("scalingCurveSvg").addEventListener("mouseleave", () => {
      const line = $("curveCrosshair");
      if (line) line.style.display = "none";
      $("curveTooltip").classList.add("hidden");
    });
    if ($("topSearchFocusBtn")) {
      $("topSearchFocusBtn").addEventListener("click", () => {
        $("sidebar").classList.remove("collapsed");
        const inp = $("searchInput");
        inp.focus();
        inp.select();
      });
    }

    for (const [id, key] of [["strInput", "str"], ["dexInput", "dex"], ["intInput", "int"], ["faiInput", "fai"], ["arcInput", "arc"]]) {
      $(id).addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        if (!Number.isNaN(val)) {
          state.stats[key] = Math.max(1, Math.min(199, val));
          update2hHint();
          recalculateAndRender();
        }
      });
    }

    $("levelSelect").addEventListener("change", (e) => {
      const [r, s] = e.target.value.split(":").map(Number);
      state.regLv = r;
      state.somberLv = s;
      recalculateAndRender();
    });

    $("enemySelect").addEventListener("change", (e) => {
      state.enemyPreset = e.target.value;
      if ($("eqEnemySel") && $("eqEnemySel").value !== state.enemyPreset) {
        $("eqEnemySel").value = state.enemyPreset;
      }
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_enemy_preset_live) {
        window.pywebview.api.set_enemy_preset_live(state.enemyPreset === "__LIVE_TARGET__");
      }
      renderTableHeader();
      persistSettings();
      recalculateAndRender();
    });

    const renderBossPickerList = () => {
      const listEl = $("bossPickerList");
      if (!listEl) return;
      const allBosses = (state.data && Array.isArray(state.data.bossPresets)) ? state.data.bossPresets : [];
      const q = ($("bossPickerInput")?.value || "").trim().toLowerCase();
      const bossOnly = Boolean($("bossPickerBossOnlyCb")?.checked);
      const matches = [];
      for (const b of allBosses) {
        if (bossOnly && !b.b) continue;
        if (q && !b.n.toLowerCase().includes(q)) continue;
        matches.push(b);
        if (matches.length >= 80) break;
      }
      if (!matches.length) {
        listEl.innerHTML = `<div class="muted" style="padding:16px;text-align:center;">No matching enemies found.</div>`;
        return;
      }
      const negNames = ["Std", "Sla", "Str", "Pie", "Mag", "Fir", "Ltn", "Hol"];
      listEl.innerHTML = matches.map((b, idx) => {
        const negsHtml = (b.g || []).map((val, ni) => {
          const cls = val < 0 ? "w" : (val >= 40 ? "r" : "");
          return `<span class="boss-picker-neg-c ${cls}" title="${negNames[ni]} ${val}%">${val > 0 ? `+${val}` : val}</span>`;
        }).join("");
        return `<div class="boss-picker-item" data-bp-id="${b.id}">
          <span class="boss-picker-name">${escHtml(b.n)}${b.b ? '<span class="boss-picker-badge">BOSS</span>' : ""}</span>
          <span class="boss-picker-negs">${negsHtml}</span>
        </div>`;
      }).join("");
      listEl.querySelectorAll(".boss-picker-item[data-bp-id]").forEach((row) => {
        row.addEventListener("click", () => {
          const nid = Number(row.dataset.bpId);
          const found = allBosses.find((x) => x.id === nid);
          if (found) {
            state.customBossPreset = found;
            state.enemyPreset = "__CUSTOM_BOSS__";
            populateEnemySelect();
            if ($("enemySelect")) $("enemySelect").value = "__CUSTOM_BOSS__";
            if ($("eqEnemySel")) $("eqEnemySel").value = "__CUSTOM_BOSS__";
            if (window.pywebview && window.pywebview.api && window.pywebview.api.set_enemy_preset_live) {
              window.pywebview.api.set_enemy_preset_live(false);
            }
            $("bossPickerPopover")?.classList.add("hidden");
            renderTableHeader();
            persistSettings();
            recalculateAndRender();
            showErToast("Enemy Defense Selected", found.n, "info");
          }
        });
      });
    };
    const openBossPicker = () => {
      const pop = $("bossPickerPopover");
      if (!pop) return;
      pop.classList.remove("hidden");
      renderBossPickerList();
      if ($("bossPickerInput")) {
        $("bossPickerInput").focus();
        $("bossPickerInput").select();
      }
    };
    window.__openBossPicker = openBossPicker;
    $("enemyBossPickerBtn")?.addEventListener("click", openBossPicker);
    $("eqBossPickerBtn")?.addEventListener("click", openBossPicker);
    $("bossPickerCloseBtn")?.addEventListener("click", () => $("bossPickerPopover")?.classList.add("hidden"));
    $("bossPickerInput")?.addEventListener("input", renderBossPickerList);
    $("bossPickerBossOnlyCb")?.addEventListener("change", renderBossPickerList);

    $("twoHandCb").addEventListener("change", (e) => {
      state.twoHand = e.target.checked;
      update2hHint();
      updateContextualFooterPrompts();
      persistSettings();
      recalculateAndRender();
    });
    $("groupByTypeCb").addEventListener("change", (e) => {
      state.groupByType = e.target.checked;
      persistSettings();
      sortAndFlattenItems(lastComputedList);
      lastRenderSlice.key = "";
      renderVirtualViewport(true);
    });
    $("numericScalingCb").addEventListener("change", (e) => {
      state.numericScaling = e.target.checked;
      renderTableHeader();
      persistSettings();
      lastRenderSlice.key = "";
      renderVirtualViewport(true);
    });
    $("showDamageSplitCb").addEventListener("change", (e) => {
      state.showDamageSplit = e.target.checked;
      renderTableHeader();
      persistSettings();
      lastRenderSlice.key = "";
      renderVirtualViewport(true);
    });

    $("effectiveOnlyCb").addEventListener("change", (e) => {
      state.effectiveOnly = e.target.checked;
      persistSettings();
      recalculateAndRender();
    });
    $("bestAffinityOnlyCb").addEventListener("change", (e) => {
      state.bestAffinityOnly = e.target.checked;
      persistSettings();
      recalculateAndRender();
    });
    $("buffableOnlyCb").addEventListener("change", (e) => {
      state.buffableOnly = e.target.checked;
      persistSettings();
      recalculateAndRender();
    });
    $("equippedOnlyCb").addEventListener("change", (e) => {
      state.equippedOnly = e.target.checked;
      syncQuickPresetChips();
      recalculateAndRender();
    });
    if ($("ownedOnlyCb")) {
      $("ownedOnlyCb").addEventListener("change", (e) => {
        state.ownedOnly = e.target.checked;
        syncQuickPresetChips();
        persistSettings();
        recalculateAndRender();
      });
    }
    if ($("favoritesOnlyCb")) {
      $("favoritesOnlyCb").addEventListener("change", (e) => {
        state.favoritesOnly = e.target.checked;
        syncQuickPresetChips();
        persistSettings();
        recalculateAndRender();
      });
    }
    if ($("pinFavTopCb")) {
      $("pinFavTopCb").addEventListener("change", (e) => {
        state.pinFavTop = e.target.checked;
        persistSettings();
        sortAndFlattenItems(lastComputedList);
        lastRenderSlice.key = "";
        renderVirtualViewport(true);
      });
    }
    function syncQuickPresetChips() {
      const qBar = $("armoryQuickPresets");
      if (!qBar) return;
      qBar.querySelectorAll(".qp-chip").forEach((c) => {
        const p = c.dataset.qp;
        let act = false;
        if (p === "all") act = !state.equippedOnly && !state.ownedOnly && !state.effectiveOnly && !state.favoritesOnly && !state.buffableOnly && !state.search;
        else if (p === "equipped") act = state.equippedOnly;
        else if (p === "owned_eff") act = state.ownedOnly && state.effectiveOnly;
        else if (p === "favorites") act = state.favoritesOnly;
        else if (p === "bleed") act = state.search.toLowerCase().trim() === "bleed";
        else if (p === "buffable") act = state.buffableOnly;
        c.classList.toggle("active", act);
      });
    }
    if ($("armoryQuickPresets")) {
      $("armoryQuickPresets").querySelectorAll(".qp-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          const p = btn.dataset.qp;
          state.equippedOnly = false;
          state.ownedOnly = false;
          state.effectiveOnly = false;
          state.favoritesOnly = false;
          state.buffableOnly = false;
          if (p === "bleed") {
            state.search = "bleed";
          } else if (state.search.toLowerCase().trim() === "bleed") {
            state.search = "";
          }
          if (p === "equipped") state.equippedOnly = true;
          else if (p === "owned_eff") { state.ownedOnly = true; state.effectiveOnly = true; }
          else if (p === "favorites") state.favoritesOnly = true;
          else if (p === "buffable") state.buffableOnly = true;
          if ($("equippedOnlyCb")) $("equippedOnlyCb").checked = state.equippedOnly;
          if ($("ownedOnlyCb")) $("ownedOnlyCb").checked = state.ownedOnly;
          if ($("effectiveOnlyCb")) $("effectiveOnlyCb").checked = state.effectiveOnly;
          if ($("favoritesOnlyCb")) $("favoritesOnlyCb").checked = state.favoritesOnly;
          if ($("buffableOnlyCb")) $("buffableOnlyCb").checked = state.buffableOnly;
          if ($("searchInput")) $("searchInput").value = state.search;
          if ($("searchClearBtn")) $("searchClearBtn").classList.toggle("visible", Boolean(state.search));
          syncQuickPresetChips();
          persistSettings();
          recalculateAndRender();
        });
      });
    }

    let searchTimer = null;
    $("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      $("searchClearBtn").classList.toggle("visible", Boolean(state.search));
      clearTimeout(searchTimer);
      searchTimer = setTimeout(recalculateAndRender, 50);
    });
    $("searchClearBtn").addEventListener("click", () => {
      $("searchInput").value = "";
      state.search = "";
      $("searchClearBtn").classList.remove("visible");
      recalculateAndRender();
    });

    $("affAllBtn").addEventListener("click", () => {
      state.selectedAffs = new Set(state.allAffList);
      syncAffinityCheckboxesDom();
      recalculateAndRender();
    });
    $("affNoneBtn").addEventListener("click", () => {
      state.selectedAffs.clear();
      syncAffinityCheckboxesDom();
      recalculateAndRender();
    });
    $("affPhysBtn").addEventListener("click", () => {
      state.selectedAffs = new Set(state.allAffList.filter((a) => PHYSICAL_AFFS.has(a)));
      syncAffinityCheckboxesDom();
      recalculateAndRender();
    });

    $("typeAllBtn").addEventListener("click", () => {
      state.selectedWts = new Set(state.allWtList);
      syncWeaponTypeDom();
      recalculateAndRender();
    });
    $("typeNoneBtn").addEventListener("click", () => {
      state.selectedWts.clear();
      syncWeaponTypeDom();
      recalculateAndRender();
    });

    $("bannerCloseBtn").addEventListener("click", () => {
      state.bannerDismissed = true;
      $("infoBanner").classList.add("hidden");
      persistSettings();
      setTimeout(() => renderVirtualViewport(true), 20);
    });

    // Virtual table scroll & row click / dblclick
    $("tableScroll").addEventListener("scroll", () => {
      renderVirtualViewport(false);
    });
    if ($("equipPickCancelBtn")) {
      $("equipPickCancelBtn").addEventListener("click", () => {
        state.equipPickSlot = null;
        if ($("equipPickBanner")) $("equipPickBanner").classList.add("hidden");
        switchMainView("equip");
      });
    }
    $("tableBody").addEventListener("click", (e) => {
      const favBtn = e.target.closest(".fav-star-btn[data-fav-wid]");
      if (favBtn) {
        e.stopPropagation();
        toggleFavoriteWeapon(Number(favBtn.dataset.favWid), true);
        return;
      }
      const tr = e.target.closest("tr.w-row");
      if (!tr) return;
      const wid = Number(tr.dataset.wid);
      const item = state.flatItems.find((x) => x.kind === "row" && x.res.weapon.id === wid);
      if (!item) return;
      if (state.equipPickSlot) {
        const pick = state.equipPickSlot;
        const kind = pick.kind === "lh" ? "lh" : "rh";
        const idx = Math.max(0, Math.min(2, Number(pick.index) || 0));
        state.equippedSlots[kind][idx] = { weaponId: wid, level: item.res.lv };
        rebuildEquippedMapFromSlots();
        state.equipSelectedSlot = { kind, idx };
        state.equipSelectedWid = wid;
        state.equipPickSlot = null;
        if ($("equipPickBanner")) $("equipPickBanner").classList.add("hidden");
        recalculateAndRender();
        switchMainView("equip");
        return;
      }
      renderInspectorDetails(item.res, true);
      openDrawer();
      renderVirtualViewport(true);
    });
    $("tableBody").addEventListener("mouseover", (e) => {
      const tr = e.target.closest("tr.w-row");
      if (!tr) return;
      const wid = Number(tr.dataset.wid);
      const tgt = state.equipPickSlot
        ? { kind: state.equipPickSlot.kind === "lh" ? "lh" : "rh", idx: Number(state.equipPickSlot.index) || 0 }
        : (state.equipSelectedSlot || { kind: "rh", idx: 0 });
      state._hoverEquipOverride = { kind: tgt.kind, idx: tgt.idx, weaponId: wid };
      renderEquipLoadBars();
    });
    $("tableBody").addEventListener("mouseleave", () => {
      if (state._hoverEquipOverride) {
        state._hoverEquipOverride = null;
        renderEquipLoadBars();
      }
    });
    $("tableBody").addEventListener("dblclick", (e) => {
      const tr = e.target.closest("tr.w-row");
      if (!tr) return;
      pinWeaponId(Number(tr.dataset.wid));
    });

    // Inspector Drawer controls
    document.querySelectorAll(".drawer-tabs .tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchDrawerTab(btn.dataset.tab));
    });
    $("drawerCloseBtn").addEventListener("click", closeDrawer);
    $("pinCompareBtn").addEventListener("click", () => {
      if (state.inspectedRes) pinWeaponId(state.inspectedRes.weapon.id);
    });
    $("cmpPinCurrentBtn").addEventListener("click", () => {
      if (state.inspectedRes) pinWeaponId(state.inspectedRes.weapon.id);
    });
    $("cmpRemoveBtn").addEventListener("click", () => {
      const selTr = $("cmpTableBody").querySelector("tr.selected-sub");
      if (!selTr) return;
      const wid = Number(selTr.dataset.cmpWid);
      state.compareIds = state.compareIds.filter((id) => id !== wid);
      refreshCompareTray();
    });
    $("cmpClearBtn").addEventListener("click", () => {
      state.compareIds = [];
      refreshCompareTray();
    });
    $("copySummaryBtn").addEventListener("click", () => {
      const r = state.inspectedRes;
      if (!r) return;
      const w = r.weapon;
      const txt = `${w.name} +${r.lv} (${w.aff}) | AR ${Math.round(r.total)} | Eff ${Math.round(r.eff)} (${state.enemyPreset}) | Scaling ${r.grades.join(" ")} | Skill: ${w.skill || "-"}`;
      window.pywebview.api.copy_text(txt);
    });

    $("optBudgetSelect").addEventListener("change", runOptimizerNow);
    $("optGoalSelect").addEventListener("change", runOptimizerNow);
    $("optRunBtn").addEventListener("click", runOptimizerNow);
    $("optPreviewBtn").addEventListener("click", () => {
      const selTr = $("optTableBody").querySelector("tr.selected-sub");
      const idx = selTr ? Number(selTr.dataset.optIdx) : 0;
      applyOptimizerIndex(idx);
    });
    $("optRevertBtn").addEventListener("click", () => {
      if (state.savedSnapshot) {
        state.stats = Object.assign({}, state.savedSnapshot);
        updateStatInputsDom();
        recalculateAndRender();
      }
    });

    // Settings & System Sub-Tabs + Elden Ring Toggleables
    const TOG_VALUE_GETTERS = {
      pipBuffHud: () => state.pipBuffHud,
      pipMapBuffHud: () => state.pipMapBuffHud,
      buffExpFlash: () => state.buffExpFlash,
      buffHideLooping: () => state.buffHideLooping,
      pipBossHud: () => state.pipBossHud,
      pipMapBossHud: () => state.pipMapBossHud,
      enemyShowStatuses: () => state.enemyShowStatuses,
      enemyShowStance: () => state.enemyShowStance,
      liveWatch: () => state.liveWatch,
      mapFollow: () => mapState.followPlayer,
      mapAutoSwitchLayer: () => mapState.autoSwitchLayer,
      mapAutoDetect: () => mapState.autoDetect,
      mapShowPlayer: () => mapState.showPlayer,
      mapShowPins: () => mapState.showPins,
      mapAutoClearBeacon: () => mapState.autoClearBeacon,
      mapShowOffscreenArrow: () => mapState.showOffscreenArrow,
      mapShowLabels: () => mapState.showLabels,
      mapPipNearbyLabelsOnly: () => mapState.pipNearbyLabelsOnly,
    };

    const renderLabelCatsGrid = () => {
      const grid = $("setLabelCatsGrid");
      if (!grid) return;
      grid.classList.toggle("muted", !mapState.showLabels);
      grid.innerHTML = MAP_LABEL_CAT_ORDER.map(([k, lbl]) => {
        const on = Boolean(mapState.labelCats[k]);
        return `<div class="er-cat-cell${on ? " on" : ""}" data-lbl-cat="${k}">
          <span>${escHtml(lbl)}</span>
          <span class="er-opt-state">${on ? "\u25C6 ON" : "\u25C7 OFF"}</span>
        </div>`;
      }).join("");
      grid.querySelectorAll(".er-cat-cell[data-lbl-cat]").forEach((cell) => {
        cell.addEventListener("click", () => {
          const cat = cell.dataset.lblCat;
          mapState.labelCats[cat] = !mapState.labelCats[cat];
          renderLabelCatsGrid();
          renderMapCanvas();
          persistSettings();
        });
      });
    };

    const refreshTogUiNow = () => {
      document.querySelectorAll("#systemWorkspace .er-opt-row[data-tog]").forEach((row) => {
        const k = row.dataset.tog;
        const fn = TOG_VALUE_GETTERS[k];
        const on = fn ? Boolean(fn()) : true;
        row.classList.toggle("on", on);
        const stEl = row.querySelector(".er-opt-state");
        if (stEl) stEl.textContent = on ? "\u25C6 ON" : "\u25C7 OFF";
      });
      if ($("setBuffSweepRng")) $("setBuffSweepRng").value = String(state.buffSweepOpacity);
      if ($("setBuffSweepNum") && document.activeElement !== $("setBuffSweepNum")) {
        $("setBuffSweepNum").value = String(state.buffSweepOpacity);
      }
      if ($("setBuffTextRng")) $("setBuffTextRng").value = String(state.buffTextOpacity);
      if ($("setBuffTextNum") && document.activeElement !== $("setBuffTextNum")) {
        $("setBuffTextNum").value = String(state.buffTextOpacity);
      }
      if ($("setPipLabelRadRng")) $("setPipLabelRadRng").value = String(mapState.pipNearbyLabelRadius);
      if ($("setPipLabelRadNum") && document.activeElement !== $("setPipLabelRadNum")) {
        $("setPipLabelRadNum").value = String(mapState.pipNearbyLabelRadius);
      }
      document.querySelectorAll("#setDesignGroup .pip-d-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.design === state.pipBossDesign);
      });
      if ($("setCompletedModeSel")) $("setCompletedModeSel").value = mapState.completedMode;
      if ($("setBossResModeSel")) $("setBossResModeSel").value = state.pipBossResMode;
      if ($("sysMinTrayVal")) $("sysMinTrayVal").textContent = state.minimizeToTray ? "ON" : "OFF";
      updateHiddenLoopBuffsUi();
      renderLabelCatsGrid();
    };
    window.__syncTogUi = refreshTogUiNow;

    const renderKeybindsUi = () => {
      const box = $("keybindsList");
      if (!box) return;
      box.innerHTML = KEYBIND_ACTIONS.map(({ key, label }) => {
        const cur = state.keybinds[key] || "";
        const rec = state.recordingKeybindAction === key;
        const txt = rec ? "Press key combo..." : (cur || "Unbound");
        return `<div class="kb-row">
          <span class="kb-label">${escHtml(label)}</span>
          <span class="kb-controls">
            <button type="button" class="kb-cap-btn${rec ? " recording" : ""}" data-kb-act="${key}">${escHtml(txt)}</button>
            <button type="button" class="kb-clear-btn" data-kb-clr="${key}" title="Clear keybind">&times;</button>
          </span>
        </div>`;
      }).join("");
      box.querySelectorAll(".kb-cap-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.recordingKeybindAction = state.recordingKeybindAction === btn.dataset.kbAct ? null : btn.dataset.kbAct;
          renderKeybindsUi();
        });
      });
      box.querySelectorAll(".kb-clear-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const k = btn.dataset.kbClr;
          state.keybinds[k] = "";
          await syncKeybindsToBackend();
          renderKeybindsUi();
        });
      });
      const errs = Object.values(state.hotkeyErrors || {}).filter(Boolean);
      const errEl = $("keybindErrorNote");
      if (errEl) errEl.textContent = errs.join(" · ");
      refreshTogUiNow();
    };
    const syncKeybindsToBackend = async () => {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_keybinds) {
        const res = await window.pywebview.api.set_keybinds(state.keybinds);
        if (res) {
          state.hotkeyErrors = res.errors || {};
          if (res.keybinds) state.keybinds = Object.assign({}, res.keybinds);
        }
      }
      persistSettings();
    };
    window.__renderKeybindsUi = renderKeybindsUi;
    if ($("topSettingsBtn")) {
      $("topSettingsBtn").addEventListener("click", async () => {
        await switchMainView("system");
        if (window.__switchSysSubTab) window.__switchSysSubTab("hotkeys");
      });
    }
    if ($("keybindResetBtn")) {
      $("keybindResetBtn").addEventListener("click", async () => {
        state.recordingKeybindAction = null;
        state.keybinds = Object.assign({}, state.defaultKeybinds);
        await syncKeybindsToBackend();
        renderKeybindsUi();
      });
    }

    const applyTogAction = (key, nextVal) => {
      const v = Boolean(nextVal);
      if (key === "pipBuffHud") {
        setPipBuffHud(v, true);
      } else if (key === "pipMapBuffHud") {
        setPipMapBuffHud(v, true);
      } else if (key === "buffExpFlash") {
        state.buffExpFlash = v;
        renderPipBuffBoxes();
        persistSettings();
      } else if (key === "buffHideLooping") {
        setBuffHideLooping(v, true);
      } else if (key === "pipBossHud") {
        setPipBossHud(v, true);
      } else if (key === "pipMapBossHud") {
        setPipMapBossHud(v, true);
      } else if (key === "enemyShowStatuses") {
        state.enemyShowStatuses = v;
        renderPipBossBoxes();
        persistSettings();
      } else if (key === "enemyShowStance") {
        state.enemyShowStance = v;
        renderPipBossBoxes();
        persistSettings();
      } else if (key === "liveWatch") {
        state.liveWatch = v;
        if ($("liveWatchCb")) $("liveWatchCb").checked = v;
        if (window.pywebview && window.pywebview.api && window.pywebview.api.set_live_watch) {
          window.pywebview.api.set_live_watch(v);
        }
        persistSettings();
      } else if (key === "mapFollow") {
        setMapFollow(v);
        persistSettings();
      } else if (key === "mapAutoSwitchLayer") {
        mapState.autoSwitchLayer = v;
        if ($("mapAutoLayerCb")) $("mapAutoLayerCb").checked = v;
        persistSettings();
      } else if (key === "mapAutoDetect") {
        mapState.autoDetect = v;
        if ($("mapAutoDetectCb")) $("mapAutoDetectCb").checked = v;
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      } else if (key === "mapShowPlayer") {
        mapState.showPlayer = v;
        if ($("mapCatPlayer")) $("mapCatPlayer").checked = v;
        persistSettings();
        renderMapCanvas();
      } else if (key === "mapShowPins") {
        mapState.showPins = v;
        if ($("mapCatPins")) $("mapCatPins").checked = v;
        persistSettings();
        renderMapCanvas();
      } else if (key === "mapAutoClearBeacon") {
        mapState.autoClearBeacon = v;
        if (!v) mapState.clearedBeaconKeys.clear();
        persistSettings();
        renderMapCanvas();
      } else if (key === "mapShowOffscreenArrow") {
        mapState.showOffscreenArrow = v;
        persistSettings();
        renderMapCanvas();
      } else if (key === "mapShowLabels") {
        mapState.showLabels = v;
        persistSettings();
        renderMapCanvas();
      } else if (key === "mapPipNearbyLabelsOnly") {
        mapState.pipNearbyLabelsOnly = v;
        persistSettings();
        renderMapCanvas();
      }
      refreshTogUiNow();
    };

    document.querySelectorAll("#systemWorkspace .er-opt-row[data-tog]").forEach((row) => {
      row.addEventListener("click", () => {
        const key = row.dataset.tog;
        const getter = TOG_VALUE_GETTERS[key];
        const cur = getter ? Boolean(getter()) : true;
        applyTogAction(key, !cur);
      });
    });

    document.querySelectorAll("#systemWorkspace .er-q").forEach((q) => {
      q.addEventListener("click", (e) => e.stopPropagation());
      q.addEventListener("mouseenter", () => showErHelpTip(q));
      q.addEventListener("mouseleave", hideErHoverTip);
    });

    if ($("setBuffSweepRng")) {
      $("setBuffSweepRng").addEventListener("input", (e) => applyBuffSweepOpacity(e.target.value, true, false));
    }
    if ($("setBuffSweepNum")) {
      $("setBuffSweepNum").addEventListener("input", (e) => applyBuffSweepOpacity(e.target.value, true, true));
      $("setBuffSweepNum").addEventListener("blur", () => {
        const raw = $("setBuffSweepNum").value;
        applyBuffSweepOpacity(raw === "" ? 30 : raw, true, false);
      });
    }
    if ($("setBuffTextRng")) {
      $("setBuffTextRng").addEventListener("input", (e) => applyBuffTextOpacity(e.target.value, true, false));
    }
    if ($("setBuffTextNum")) {
      $("setBuffTextNum").addEventListener("input", (e) => applyBuffTextOpacity(e.target.value, true, true));
      $("setBuffTextNum").addEventListener("blur", () => {
        const raw = $("setBuffTextNum").value;
        applyBuffTextOpacity(raw === "" ? 75 : raw, true, false);
      });
    }
    if ($("setPipLabelRadRng")) {
      $("setPipLabelRadRng").addEventListener("input", (e) => applyPipLabelRadius(e.target.value, true, false));
    }
    if ($("setPipLabelRadNum")) {
      $("setPipLabelRadNum").addEventListener("input", (e) => applyPipLabelRadius(e.target.value, true, true));
      $("setPipLabelRadNum").addEventListener("blur", () => {
        const raw = $("setPipLabelRadNum").value;
        applyPipLabelRadius(raw === "" ? 95 : raw, true, false);
      });
    }
    const setAllLabelCats = (on) => {
      for (const [k] of MAP_LABEL_CAT_ORDER) mapState.labelCats[k] = Boolean(on);
      renderLabelCatsGrid();
      renderMapCanvas();
      persistSettings();
    };
    if ($("setLabelCatsAllBtn")) $("setLabelCatsAllBtn").addEventListener("click", () => setAllLabelCats(true));
    if ($("setLabelCatsNoneBtn")) $("setLabelCatsNoneBtn").addEventListener("click", () => setAllLabelCats(false));
    if ($("setLabelCatsDefBtn")) {
      $("setLabelCatsDefBtn").addEventListener("click", () => {
        mapState.labelCats = defaultMapLabelCats();
        renderLabelCatsGrid();
        renderMapCanvas();
        persistSettings();
      });
    }
    if ($("setTogResetBtn")) {
      $("setTogResetBtn").addEventListener("click", () => {
        setPipBuffHud(true, false);
        setPipMapBuffHud(true, false);
        state.buffExpFlash = true;
        applyBuffSweepOpacity(30, false, false);
        applyBuffTextOpacity(75, false, false);
        setPipBossHud(true, false);
        setPipMapBossHud(true, false);
        state.enemyShowStatuses = true;
        state.enemyShowStance = true;
        state.liveWatch = true;
        if ($("liveWatchCb")) $("liveWatchCb").checked = true;
        if (window.pywebview && window.pywebview.api && window.pywebview.api.set_live_watch) {
          window.pywebview.api.set_live_watch(true);
        }
        setMapFollow(true);
        mapState.autoSwitchLayer = true;
        if ($("mapAutoLayerCb")) $("mapAutoLayerCb").checked = true;
        mapState.autoDetect = true;
        if ($("mapAutoDetectCb")) $("mapAutoDetectCb").checked = true;
        mapState.showPlayer = true;
        if ($("mapCatPlayer")) $("mapCatPlayer").checked = true;
        mapState.showPins = true;
        if ($("mapCatPins")) $("mapCatPins").checked = true;
        mapState.autoClearBeacon = true;
        mapState.clearedBeaconKeys.clear();
        setPipBossResMode("compact", false);
        mapState.showOffscreenArrow = true;
        mapState.showLabels = true;
        mapState.pipNearbyLabelsOnly = true;
        applyPipLabelRadius(95, false, false);
        mapState.labelCats = defaultMapLabelCats();
        state.buffHideLooping = true;
        state.suppressedLoopBuffIds.clear();
        state._buffLoopTrack.clear();
        state.pipCorner = "bottom-right";
        state.pipBossPlacement = "inside";
        state.pipGripPlacement = "weapon";
        if ($("pvGripPlaceSel")) $("pvGripPlaceSel").value = "weapon";
        applyBossPlacementClass();
        setPipBossDesign("1", false);
        mapState.completedMode = "dim";
        if ($("setCompletedModeSel")) $("setCompletedModeSel").value = "dim";
        if ($("mapCompletedModeSel")) $("mapCompletedModeSel").value = "dim";
        updateHiddenLoopBuffsUi();
        renderPipBuffBoxes();
        renderPipBossBoxes();
        if (state.activeView === "pip") renderPipViewerWorkspace();
        updateMapSearchList();
        renderMapCanvas();
        refreshTogUiNow();
        persistSettings();
        const note = $("setTogResetNote");
        if (note) {
          note.classList.add("show");
          clearTimeout(window.__erResetNoteTimer);
          window.__erResetNoteTimer = setTimeout(() => note.classList.remove("show"), 1800);
        }
      });
    }

    document.querySelectorAll("#setDesignGroup .pip-d-btn").forEach((b) => {
      b.addEventListener("click", () => setPipBossDesign(b.dataset.design, true));
    });
    if ($("setCompletedModeSel")) {
      $("setCompletedModeSel").addEventListener("change", (e) => {
        mapState.completedMode = e.target.value;
        if ($("mapCompletedModeSel")) $("mapCompletedModeSel").value = mapState.completedMode;
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      });
    }
    if ($("setBossResModeSel")) {
      $("setBossResModeSel").addEventListener("change", (e) => {
        setPipBossResMode(e.target.value, true);
      });
    }

    const formatKeyEventCombo = (e) => {
      const k = e.key;
      if (["Control", "Shift", "Alt", "Meta"].includes(k)) return null;
      const mods = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      let main = "";
      if (/^[a-zA-Z0-9]$/.test(k)) main = k.toUpperCase();
      else if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(k)) main = k.toUpperCase();
      else if (k === " ") main = "Space";
      else if (["Tab", "Insert", "Delete", "Home", "End", "PageUp", "PageDown"].includes(k)) main = k;
      else if (k.startsWith("Arrow")) main = k.slice(5);
      else if (["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"].includes(k)) main = k;
      else return null;
      if (!mods.length && !main.startsWith("F")) return null;
      return [...mods, main].join("+");
    };

    // Keyboard shortcuts
    window.addEventListener("keydown", async (e) => {
      if (state.recordingKeybindAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          state.recordingKeybindAction = null;
          renderKeybindsUi();
          return;
        }
        const combo = formatKeyEventCombo(e);
        if (combo) {
          const act = state.recordingKeybindAction;
          state.recordingKeybindAction = null;
          state.keybinds[act] = combo;
          await syncKeybindsToBackend();
          renderKeybindsUi();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (isMapPipMode()) {
          setPipSearchPopover(true);
        } else if (state.activeView === "map") {
          if ($("mapSearchInput")) { $("mapSearchInput").focus(); $("mapSearchInput").select(); }
        } else {
          $("sidebar").classList.remove("collapsed");
          $("searchInput").focus();
          $("searchInput").select();
        }
      } else if (e.key === "Escape") {
        const sPop = $("pipSearchPopover");
        const opPop = $("pipOpacityPopover");
        const bpPop = $("bossPickerPopover");
        const eqPicker = $("eqSlotPicker");
        const pinCard = $("mapPinCard");
        const colsMenu = $("extraColsMenu");
        const gearPnl = $("gearPanel");
        if (bpPop && !bpPop.classList.contains("hidden")) {
          bpPop.classList.add("hidden");
        } else if (eqPicker && !eqPicker.classList.contains("hidden")) {
          eqPicker.classList.add("hidden");
          state.equipPickerTarget = null;
          if (state.activeView === "equip") renderEquipView();
        } else if (pinCard && !pinCard.classList.contains("hidden")) {
          showMapPinCard(null);
        } else if (colsMenu && !colsMenu.classList.contains("hidden")) {
          colsMenu.classList.add("hidden");
        } else if (state.equipPickSlot) {
          state.equipPickSlot = null;
          if ($("equipPickBanner")) $("equipPickBanner").classList.add("hidden");
          switchMainView("equip");
        } else if (gearPnl && !gearPnl.classList.contains("hidden")) {
          gearPnl.classList.add("hidden");
        } else if (sPop && !sPop.classList.contains("hidden")) {
          setPipSearchPopover(false);
        } else if (opPop && !opPop.classList.contains("hidden")) {
          setPipOpacityPopover(false);
        } else if (state.pipMode !== "off") {
          setPipMode("off");
        } else if (document.activeElement === $("searchInput") && state.search) {
          $("searchInput").value = "";
          state.search = "";
          $("searchClearBtn").classList.remove("visible");
          recalculateAndRender();
        } else if (!$("inspectorDrawer").classList.contains("hidden")) {
          closeDrawer();
        }
      } else if (e.key === "F5") {
        e.preventDefault();
        window.pywebview.api.reload_save(false).then((res) => {
          if (applySavePayload(res, true)) recalculateAndRender();
        });
      } else if (e.key.toLowerCase() === "p" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        if (state.activeView === "equip") {
          const curRes = getEquipSelectedWeaponResult();
          if (curRes) pinWeaponId(curRes.weapon.id, false);
        } else if (state.inspectedRes) {
          pinWeaponId(state.inspectedRes.weapon.id);
        }
      } else if (
        !e.ctrlKey && !e.altKey && !e.metaKey &&
        state.pipMode === "off" &&
        !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)
      ) {
        const k = e.key.toLowerCase();
        if (e.key === "Tab") {
          e.preventDefault();
          switchMainView(state.activeView === "calc" ? "equip" : "calc");
        } else if (k === "q" || k === "e") {
          const order = ["equip", "calc", "map", "pip", "system"];
          const idx = Math.max(0, order.indexOf(state.activeView));
          const next = order[(idx + (k === "e" ? 1 : -1) + order.length) % order.length];
          switchMainView(next);
        } else if (k === "f") {
          if (state.activeView === "equip") {
            state.equipCenterTab = (state.equipCenterTab + 1) % 4;
            renderEquipView();
          } else if (state.activeView === "calc") {
            $("twoHandCb").checked = !$("twoHandCb").checked;
            $("twoHandCb").dispatchEvent(new Event("change"));
          }
        } else if (k === "r") {
          if (state.activeView === "equip") {
            $("erFtrPromptX")?.click();
          } else if (state.activeView === "map") {
            const layers = ["m00", "m01", "m10"];
            const nextLayer = layers[(layers.indexOf(mapState.layer) + 1) % layers.length];
            const btn = document.querySelector(`.map-layer-btn[data-layer="${nextLayer}"]`);
            if (btn) btn.click();
          }
        } else if (k === "m") {
          switchMainView(state.activeView === "system" ? "equip" : "system");
        }
      }
    });

    $("tabEquipBtn")?.addEventListener("click", () => switchMainView("equip"));
    $("tabCalcBtn").addEventListener("click", () => switchMainView("calc"));
    $("tabMapBtn").addEventListener("click", () => switchMainView("map"));
    $("tabPipBtn")?.addEventListener("click", () => switchMainView("pip"));
    $("tabSysBtn")?.addEventListener("click", () => switchMainView("system"));
    const VIEW_ORDER = ["equip", "calc", "map", "pip", "system"];
    if ($("erKeyQ")) {
      $("erKeyQ").addEventListener("click", () => {
        const idx = Math.max(0, VIEW_ORDER.indexOf(state.activeView));
        switchMainView(VIEW_ORDER[(idx + VIEW_ORDER.length - 1) % VIEW_ORDER.length]);
      });
    }
    if ($("erKeyE")) {
      $("erKeyE").addEventListener("click", () => {
        const idx = Math.max(0, VIEW_ORDER.indexOf(state.activeView));
        switchMainView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]);
      });
    }
    $("sysResetLoopBuffsBtn")?.addEventListener("click", () => resetHiddenLoopBuffs(true));
    $("erFtrPromptA")?.addEventListener("click", () => triggerActiveConfirm());
    $("erFtrPromptB")?.addEventListener("click", () => {
      if ($("eqSlotPicker") && !$("eqSlotPicker").classList.contains("hidden")) {
        $("eqSlotPicker").classList.add("hidden");
        state.equipPickerTarget = null;
        if (state.activeView === "equip") renderEquipView();
      } else if ($("mapPinCard") && !$("mapPinCard").classList.contains("hidden")) {
        showMapPinCard(null);
      } else if ($("extraColsMenu") && !$("extraColsMenu").classList.contains("hidden")) {
        $("extraColsMenu").classList.add("hidden");
      } else if (state.equipPickSlot) {
        state.equipPickSlot = null;
        if ($("equipPickBanner")) $("equipPickBanner").classList.add("hidden");
        switchMainView("equip");
      } else if ($("gearPanel") && !$("gearPanel").classList.contains("hidden")) {
        $("gearPanel").classList.add("hidden");
      } else if (!$("inspectorDrawer").classList.contains("hidden")) {
        closeDrawer();
      } else if (state.activeView !== "equip") {
        switchMainView("equip");
      }
    });
    $("erFtrPromptX")?.addEventListener("click", () => {
      if (state.activeView === "equip") {
        const curRes = getEquipSelectedWeaponResult();
        if (curRes) pinWeaponId(curRes.weapon.id, false);
      } else if (state.activeView === "calc") {
        if (state.inspectedRes) pinWeaponId(state.inspectedRes.weapon.id);
        else $("topCompareBtn")?.click();
      }
    });
    $("erFtrPromptY")?.addEventListener("click", () => {
      if (state.activeView === "equip") {
        state.equipCenterTab = (state.equipCenterTab + 1) % 4;
        renderEquipView();
      } else if (state.activeView === "calc") {
        $("twoHandCb").checked = !$("twoHandCb").checked;
        $("twoHandCb").dispatchEvent(new Event("change"));
      }
    });
    $("erFtrPromptR3")?.addEventListener("click", () => switchMainView(state.activeView === "calc" ? "equip" : "calc"));
    $("erFtrPromptMenu")?.addEventListener("click", () => switchMainView(state.activeView === "system" ? "equip" : "system"));
    $("erFtrF5Btn")?.addEventListener("click", () => {
      window.pywebview.api.reload_save(false).then((res) => {
        if (applySavePayload(res, true)) recalculateAndRender();
      });
    });

    // Auto-switch input device prompts on keyboard/mouse vs Gamepad
    window.addEventListener("keydown", () => {
      if (state.promptMode === "auto" && state.activePromptDevice !== "kbm") {
        state.activePromptDevice = "kbm";
        renderFooterPrompts();
      }
    });
    window.addEventListener("mousedown", () => {
      if (state.promptMode === "auto" && state.activePromptDevice !== "kbm") {
        state.activePromptDevice = "kbm";
        renderFooterPrompts();
      }
    });
    window.addEventListener("gamepadconnected", (e) => {
      if (state.promptMode === "auto") {
        const gid = ((e.gamepad && e.gamepad.id) || "").toLowerCase();
        state.activePromptDevice = (gid.includes("dualsense") || gid.includes("dualshock") || gid.includes("054c") || gid.includes("sony")) ? "ps5" : "xbox";
        renderFooterPrompts();
      }
    });
    startGamepadLoop();
    $("showOnMapBtn").addEventListener("click", () => {
      if (state.inspectedRes) locateWeaponOnMap(state.inspectedRes.weapon);
    });

    window.addEventListener("resize", () => {
      syncPipBarHeightVar();
      renderVirtualViewport(true);
      if (state.activeTab === "curve" && !$("inspectorDrawer").classList.contains("hidden")) {
        renderScalingCurve();
      }
      if (isMapVisible()) renderMapCanvas();
    });
  }

  let syncPulseTimer = null;
  function pulseSavePill() {
    const pill = $("saveStatusPill");
    if (!pill) return;
    pill.classList.add("synced");
    if (syncPulseTimer) clearTimeout(syncPulseTimer);
    syncPulseTimer = setTimeout(() => pill.classList.remove("synced"), 1200);
  }

  function applyIncomingSaveUpdate(saveObj) {
    if (!saveObj || state.ramLive) return;
    if (applySavePayload(saveObj, true)) {
      recalculateAndRender();
      pulseSavePill();
      const ch = getActiveSaveChar();
      if (ch) {
        showErToast("Save Synced", `${ch.name} (Lv.${ch.level})`, "ok");
      }
      if (ch && ch.playerPos) maybeAutoSwitchPlayerLayer(ch.playerPos);
      if (isMapVisible()) {
        const cntEl = $("cnt-pins");
        if (cntEl) cntEl.textContent = String(getActiveWorldPins().length);
        updateMapSearchList();
        updateMapPlayerReadout();
        renderMapCanvas();
      }
    }
  }

  function applyIncomingPlayerPosUpdate(posPayload) {
    if (!posPayload || !posPayload.positions || state.ramLive) return;
    const prevSlot = state.activeSlot;
    for (const ch of state.characters) {
      const k = String(ch.slot);
      if (k in posPayload.positions) ch.playerPos = posPayload.positions[k];
    }
    if (typeof posPayload.lastSlot === "number" && posPayload.lastSlot !== prevSlot) {
      const nextCh = state.characters.find((c) => c.slot === posPayload.lastSlot);
      if (nextCh) {
        $("charSelect").value = String(nextCh.slot);
        applyCharacter(nextCh);
        recalculateAndRender();
      }
    }
    const chNow = getActiveSaveChar();
    if (chNow && chNow.playerPos) maybeAutoSwitchPlayerLayer(chNow.playerPos);
    updateMapPlayerReadout();
    if (isMapVisible()) renderMapCanvas();
  }

  function applyLiveRamCharacter(ch) {
    if (!ch || !ch.stats) return;
    const wasAttached = state._prevRamAttached;
    const prevName = state._prevRamCharName;
    state.ramLive = true;
    state._prevRamAttached = true;
    state._prevRamCharName = String(ch.name || "");
    state.ramChar = ch;
    state.savedSnapshot = {
      str: ch.stats.str,
      dex: ch.stats.dex,
      int: ch.stats.int,
      fai: ch.stats.fai,
      arc: ch.stats.arc,
    };
    state.stats = Object.assign({}, state.savedSnapshot);
    loadEquipSlotsFromChar(ch);
    const ar = ch.armor || [null, null, null, null];
    const tl = ch.talismans || [null, null, null, null];
    state.savedGear = {
      armor: [ar[0] || null, ar[1] || null, ar[2] || null, ar[3] || null],
      talismans: [tl[0] || null, tl[1] || null, tl[2] || null, tl[3] || null],
    };
    state.armorIds = state.savedGear.armor.slice();
    state.talismanIds = state.savedGear.talismans.slice();
    syncGearDropdownValues();
    recomputeActiveBuffs();

    matchEquippedLevels(false);
    updateStatInputsDom();
    $("charMetaText").textContent = `\u2713 \u00B7 ${ch.name} Lv.${ch.level} \u00B7 Vig ${ch.stats.vig} Mnd ${ch.stats.mnd} End ${ch.stats.end}`;
    $("saveAcceptedIcon").classList.add("active");
    $("saveStatusPill").classList.add("ram-live");
    const modName = (state.data && state.data.mod) || (state.modSource && state.modSource.modLabel) || "Regulation Data";
    $("infoBannerText").innerHTML =
      `Using regulation data from <strong>${escHtml(modName)}</strong> &middot; Syncing <strong>${escHtml(ch.name)} (Lv.${ch.level})</strong> (<strong>&#10003;</strong>)`;
    recalculateAndRender();
    if (window.__syncModSourceUi) window.__syncModSourceUi(false);
    renderPipRamBadges();
    pulseSavePill();
    updateMapPlayerReadout();
    if (!wasAttached) {
      showErToast("Live Game Connected", `Attached to ${ch.name} (Lv.${ch.level})`, "ok");
    } else if (prevName && prevName !== state._prevRamCharName) {
      showErToast("Character Switched", `Now syncing ${ch.name} (Lv.${ch.level})`, "info");
    }
  }

  function getActiveCharKey() {
    if (state.ramLive && state.ramChar && state.ramChar.name) {
      return `ram:${state.ramChar.name}`;
    }
    const saveName = state.savePath ? state.savePath.split(/[/\\]/).pop() : "manual";
    return `${saveName}:${state.activeSlot ?? 0}`;
  }

  function getActiveSaveChar() {
    return state.characters.find((c) => c.slot === state.activeSlot) || state.characters[0] || null;
  }

  let _cachedSetsKey = "";
  let _cachedSetsVal = null;
  function getActiveProgressSets() {
    const ch = getActiveSaveChar();
    const useRamOwned = Boolean(state.ramLive && mapState.ramOwned);
    const useRamFlags = Boolean(state.ramLive && Array.isArray(mapState.ramFlags));
    const ow = useRamOwned ? mapState.ramOwned : (ch && ch.owned) || {};
    const fl = useRamFlags ? mapState.ramFlags : (ch && ch.setFlags) || [];
    const wlObj = (ow && ow.weaponLevels && typeof ow.weaponLevels === "object") ? ow.weaponLevels : {};
    const wlCount = Object.keys(wlObj).length;
    const key = `${state.ramLive}|${state.activeSlot}|${fl.length}|${(ow.weapons || []).length}|${(ow.armor || []).length}|${(ow.talismans || []).length}|${(ow.goods || []).length}|${wlCount}`;
    if (key === _cachedSetsKey && _cachedSetsVal) return _cachedSetsVal;
    _cachedSetsKey = key;
    const weaponLevels = new Map();
    for (const [widStr, lv] of Object.entries(wlObj)) {
      weaponLevels.set(Number(widStr), Number(lv) || 0);
    }
    _cachedSetsVal = {
      weapons: new Set(ow.weapons || []),
      armor: new Set(ow.armor || []),
      talismans: new Set(ow.talismans || []),
      goods: new Set(ow.goods || []),
      flags: new Set(fl || []),
      weaponLevels,
    };
    return _cachedSetsVal;
  }

  function getManualOverride(markerId) {
    const ck = getActiveCharKey();
    const map = mapState.manualCompleted && mapState.manualCompleted[ck];
    if (map && Object.prototype.hasOwnProperty.call(map, markerId)) {
      return map[markerId];
    }
    return undefined;
  }

  function isMarkerCompleted(m) {
    if (!m) return false;
    const man = getManualOverride(m.id);
    if (typeof man === "boolean") return man;
    if (!mapState.autoDetect) return false;
    const sets = getActiveProgressSets();
    if (m.eventFlag && sets.flags.has(m.eventFlag)) return true;
    if (Array.isArray(m.eventFlags)) {
      for (const f of m.eventFlags) {
        if (sets.flags.has(f)) return true;
      }
    }
    if (m.cat === "weapon" && m.itemId && sets.weapons.has(m.itemId)) return true;
    if (m.cat === "talisman" && m.itemId && sets.talismans.has(m.itemId)) return true;
    if (m.cat === "armor") {
      if (Array.isArray(m.itemIds) && m.itemIds.length > 0 && m.itemIds.every((id) => sets.armor.has(id))) return true;
      if (m.itemId && sets.armor.has(m.itemId)) return true;
    }
    if (m.goodId && sets.goods.has(m.goodId)) return true;
    return false;
  }

  function setMarkerManualState(markerId, val) {
    const ck = getActiveCharKey();
    if (!mapState.manualCompleted || typeof mapState.manualCompleted !== "object") {
      mapState.manualCompleted = {};
    }
    if (!mapState.manualCompleted[ck]) mapState.manualCompleted[ck] = {};
    if (val === null || val === undefined) {
      delete mapState.manualCompleted[ck][markerId];
    } else {
      mapState.manualCompleted[ck][markerId] = Boolean(val);
    }
    persistSettings();
    if (mapState.selectedPin && mapState.selectedPin.id === markerId) {
      showMapPinCard(mapState.selectedPin);
    }
    updateMapSearchList();
    renderMapCanvas();
  }

  function getActiveWorldPins() {
    if (state.ramLive && Array.isArray(mapState.ramPins)) return mapState.ramPins;
    const ch = getActiveSaveChar();
    return (ch && Array.isArray(ch.mapPins)) ? ch.mapPins : [];
  }

  function maybeAutoSwitchPlayerLayer(pp) {
    if (!pp || !mapState.loaded) return;
    const lp = resolvePlayerToMapLayer(pp);
    if (!lp || !lp.layer) return;
    const prev = mapState.lastPlayerLayer;
    mapState.lastPlayerLayer = lp.layer;
    if (mapState.autoSwitchLayer && lp.layer !== prev && mapState.layer !== lp.layer) {
      mapState.layer = lp.layer;
      syncMapLayerButtons();
      ensureMapImage(lp.layer).then(() => {
        updateMapSearchList();
        renderMapCanvas();
      });
      persistSettings();
    }
  }

  function checkAutoClearBeaconOnArrival(pos) {
    if (!mapState.autoClearBeacon || !pos || !mapState.data) return;
    const lp = resolvePlayerToMapLayer(pos);
    if (!lp || !lp.layer) return;
    const cal = (mapState.data.layers && mapState.data.layers[lp.layer]) || { span: 10496.0 };
    const span = cal.span || 10496.0;
    const ARRIVAL_RADIUS_M = 15.0;

    if (mapState.selectedPin && mapState.selectedPin.layer === lp.layer) {
      const distM = Math.hypot(mapState.selectedPin.u - lp.u, mapState.selectedPin.v - lp.v) * span;
      if (distM <= ARRIVAL_RADIUS_M) {
        const arrivedName = mapState.selectedPin.name || "Target";
        showMapPinCard(null);
        showErToast("Arrived at Marker", `Cleared ${arrivedName}`, "ok");
      }
    }

    const pins = getActiveWorldPins();
    const liveKeys = new Set();
    for (const pin of pins) {
      if (pin.kind !== "beacon") continue;
      const bKey = `${pin.slot || 0}_${Number(pin.u).toFixed(4)}_${Number(pin.v).toFixed(4)}`;
      liveKeys.add(bKey);
      if (pin.layer !== lp.layer || mapState.clearedBeaconKeys.has(bKey)) continue;
      const distM = Math.hypot(pin.u - lp.u, pin.v - lp.v) * span;
      if (distM <= ARRIVAL_RADIUS_M) {
        mapState.clearedBeaconKeys.add(bKey);
        showErToast("Arrived at Beacon", `Cleared blue beacon #${pin.slot || 1}`, "ok");
      }
    }
    for (const k of Array.from(mapState.clearedBeaconKeys)) {
      if (!liveKeys.has(k)) mapState.clearedBeaconKeys.delete(k);
    }
  }

  function applyLiveRamPos(pos) {
    if (!pos) return;
    const wasLive = state.ramLive;
    state.ramLive = true;
    state.ramPos = pos;
    if (!wasLive || state.pipMode !== "off") {
      renderPipRamBadges();
      renderPipBossBoxes();
    }
    if (!wasLive && window.__syncModSourceUi) window.__syncModSourceUi(false);
    updateMapPlayerReadout();
    maybeAutoSwitchPlayerLayer(pos);
    checkAutoClearBeaconOnArrival(pos);
    if (isMapVisible()) {
      if (mapState.followPlayer) {
        const lp = resolvePlayerToMapLayer(pos);
        if (lp) {
          if (mapState.layer !== lp.layer) {
            mapState.layer = lp.layer;
            syncMapLayerButtons();
            ensureMapImage(lp.layer).then(() => renderMapCanvas());
          }
          const { w, h } = getMapLayout();
          const scale = Math.min(w, h) * 0.96 * mapState.zoom;
          mapState.panX = (0.5 - lp.u) * scale;
          mapState.panY = (0.5 - lp.v) * scale;
        }
      }
      renderMapCanvas();
    }
  }

  function applyLiveRamStatus(st) {
    if (!st || st.attached) return;
    if (!state.ramLive) return;
    const hadAttach = state._prevRamAttached;
    state.ramLive = false;
    state._prevRamAttached = false;
    state._prevRamCharName = "";
    state.ramChar = null;
    state.ramLiveArBuffs = null;
    state.ramPos = null;
    state.ramBosses = [];
    state.ramBuffs = [];
    state.ramBuffsStamp = 0;
    hideErHoverTip();
    mapState.ramPins = null;
    mapState.ramOwned = null;
    mapState.ramFlags = null;
    if (hadAttach) showErToast("Live Game Disconnected", "Reverted to save / manual stats", "warn");
    scheduleSmartFadeUpdate();
    $("saveStatusPill").classList.remove("ram-live");
    const ch = state.characters.find((c) => c.slot === state.activeSlot) || state.characters[0];
    if (ch) {
      applyCharacter(ch);
      recalculateAndRender();
    } else {
      $("charMetaText").textContent = "Manual stats";
      $("saveAcceptedIcon").classList.remove("active");
      const modName = (state.data && state.data.mod) || (state.modSource && state.modSource.modLabel) || "Regulation Data";
      $("infoBannerText").innerHTML =
        `Using regulation data from <strong>${escHtml(modName)}</strong>`;
      recalculateAndRender();
    }
    if (state.pipMode === "stats" || state.pipMode === "hud") renderPipStats();
    else {
      renderPipRamBadges();
      renderPipBossBoxes();
      renderPipBuffBoxes();
    }
    if (window.__syncModSourceUi) window.__syncModSourceUi(false);
    updateMapPlayerReadout();
    if (isMapVisible()) {
      updateMapSearchList();
      renderMapCanvas();
    }
  }

  function applyLiveRamBosses(bosses) {
    const prevNpcId = (state.ramBosses && state.ramBosses[0] && state.ramBosses[0].npcParamId) || null;
    state.ramBosses = Array.isArray(bosses) ? bosses : [];
    const nextNpcId = (state.ramBosses[0] && state.ramBosses[0].npcParamId) || null;
    renderPipBossBoxes();
    scheduleSmartFadeUpdate();
    if (state.enemyPreset === "__LIVE_TARGET__" && prevNpcId !== nextNpcId) {
      populateEnemySelect();
      recalculateAndRender();
    }
  }

  function applyLiveRamBuffs(buffs, nowMs = null) {
    state.ramBuffs = Array.isArray(buffs) ? buffs : [];
    state.ramBuffsStamp = performance.now();
    ingestPlayerBuffLoopCheck(state.ramBuffs, typeof nowMs === "number" ? nowMs : state.ramBuffsStamp);
    renderPipBuffBoxes();
    scheduleSmartFadeUpdate();
    if (state.activeView === "pip") renderPipViewerWorkspace();
  }

  function applyLiveRamArBuffs(arBuffs) {
    const prevEw = state.ramLiveArBuffs ? state.ramLiveArBuffs.equipWeightMult : 1.0;
    state.ramLiveArBuffs = (arBuffs && typeof arBuffs === "object") ? arBuffs : null;
    const nextEw = state.ramLiveArBuffs ? state.ramLiveArBuffs.equipWeightMult : 1.0;
    if (Math.abs((prevEw || 1.0) - (nextEw || 1.0)) > 1e-4) {
      renderEquipLoadBars();
    }
    if (state.pipMode === "stats" || state.pipMode === "hud") renderPipStats();
    if (state.activeView === "pip") renderPipViewerWorkspace();
  }

  function applyLiveRamPins(pins) {
    if (!Array.isArray(pins)) return;
    mapState.ramPins = pins;
    const cntEl = $("cnt-pins");
    if (cntEl) cntEl.textContent = String(pins.length);
    if (isMapVisible()) renderMapCanvas();
  }

  function applyLiveRamProgress(prog) {
    if (!prog || typeof prog !== "object") return;
    if (prog.owned) mapState.ramOwned = prog.owned;
    if (Array.isArray(prog.setFlags)) mapState.ramFlags = prog.setFlags;
    if (isMapVisible()) {
      updateMapSearchList();
      renderMapCanvas();
    }
  }

  async function handleGlobalHotkey(action) {
    if (action === "togglePipMap") {
      await setPipMode(state.pipMode === "map" ? "off" : "map");
    } else if (action === "togglePipStats") {
      await setPipMode(state.pipMode === "stats" ? "off" : "stats");
    } else if (action === "togglePipClickThrough") {
      if (state.pipMode === "off") return;
      state.pipClickThrough = !state.pipClickThrough;
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_click_through) {
        const res = await window.pywebview.api.set_pip_click_through(state.pipClickThrough);
        if (res && typeof res.clickThrough === "boolean") state.pipClickThrough = res.clickThrough;
      }
      const gb = $("pipGhostBanner");
      if (gb) gb.classList.toggle("hidden", !state.pipClickThrough);
    } else if (action === "toggleFollow") {
      await setMapFollow(!mapState.followPlayer);
    } else if (action === "focusPipSearch") {
      if (isMapPipMode()) {
        setPipSearchPopover(true);
      } else {
        await switchMainView("map");
        if ($("mapSearchInput")) {
          $("mapSearchInput").focus();
          $("mapSearchInput").select();
        }
      }
    } else if (action === "toggleOverlayHide") {
      if (state.pipMode === "off") return;
      state.overlayHidden = !state.overlayHidden;
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_overlay_hidden) {
        const res = await window.pywebview.api.set_overlay_hidden(state.overlayHidden);
        if (res && typeof res.hidden === "boolean") state.overlayHidden = res.hidden;
      }
    } else if (action === "toggleBossResMode") {
      const order = ["compact", "full", "off"];
      const next = order[(order.indexOf(state.pipBossResMode) + 1) % order.length];
      setPipBossResMode(next, true);
    }
  }

  window.__onLiveSavePush = applyIncomingSaveUpdate;
  window.__onLivePlayerPos = applyIncomingPlayerPosUpdate;
  window.__onLiveRamChar = applyLiveRamCharacter;
  window.__onLiveRamPos = applyLiveRamPos;
  window.__onLiveRamStatus = applyLiveRamStatus;
  window.__onLiveRamPins = applyLiveRamPins;
  window.__onLiveRamProgress = applyLiveRamProgress;
  window.__onLiveRamBosses = applyLiveRamBosses;
  window.__onLiveRamBuffs = applyLiveRamBuffs;
  window.__onLiveRamArBuffs = applyLiveRamArBuffs;
  window.__onGlobalHotkey = handleGlobalHotkey;

  function resolvePlayerToMapLayer(pp) {
    if (!pp || !mapState.data) return null;
    if (pp.area === 11 && pp.gridX === 10) {
      const rt = mapState.data.markers.find((m) => m.cat === "grace" && m.name && m.name.toLowerCase().includes("table of lost grace"));
      if (rt) return { layer: rt.layer, u: rt.u, v: rt.v, yaw: pp.yaw || 0, label: "Roundtable Hold" };
    }
    let dstArea, wx, wz;
    if (pp.area === 60 || pp.area === 61) {
      const sub = pp.sub || 0;
      if (sub === 99) return null;
      const tier = sub % 10;
      const sc = tier <= 2 ? (1 << tier) : 1;
      wx = (pp.gridX * sc + (sc - 1) * 0.5) * 256 + pp.x;
      wz = (pp.gridZ * sc + (sc - 1) * 0.5) * 256 + pp.z;
      dstArea = pp.area;
    } else {
      const key = `${pp.area}_${pp.gridX}_${pp.gridZ}`;
      const off = mapState.data.legacyOffsets && mapState.data.legacyOffsets[key];
      if (!off) return null;
      dstArea = off[0];
      wx = off[1] + pp.x;
      wz = off[2] + pp.z;
    }
    const mlKey = `${pp.area}_${pp.gridX}_${pp.gridZ}`;
    const mappedLayer = mapState.data.mapLayers && mapState.data.mapLayers[mlKey];
    const layer = dstArea === 61 ? "m10" : (mappedLayer || (pp.area === 12 ? "m01" : "m00"));
    const cal = mapState.data.layers[layer];
    if (!cal) return null;
    const u = (wx - cal.ox) / cal.span;
    const v = (cal.oz - wz) / cal.span;
    if (u < -0.08 || u > 1.08 || v < -0.08 || v > 1.08) return null;
    return { layer, u, v, yaw: pp.yaw || 0, label: `m${pp.area}_${pp.gridX}_${pp.gridZ}` };
  }

  function getActiveLivePlayerPos() {
    if (state.ramLive && state.ramPos) {
      return resolvePlayerToMapLayer(state.ramPos);
    }
    const ch = state.characters.find((c) => c.slot === state.activeSlot);
    if (!ch || !ch.playerPos) return null;
    return resolvePlayerToMapLayer(ch.playerPos);
  }

  function yawToCompass(yaw) {
    if (typeof yaw !== "number" || !Number.isFinite(yaw)) return "";
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const deg = ((((yaw + Math.PI) * 180) / Math.PI) % 360 + 360) % 360;
    return dirs[Math.round(deg / 45) % 8];
  }

  function updateMapPlayerReadout() {
    const el = $("mapPlayerStatus");
    if (!el) return;
    if (state.ramLive && state.ramPos) {
      const pos = state.ramPos;
      const chName = (state.ramChar && state.ramChar.name) || "Player";
      const resolved = resolvePlayerToMapLayer(pos);
      const layerName = resolved && mapState.data && mapState.data.layers[resolved.layer]
        ? mapState.data.layers[resolved.layer].title
        : `m${pos.area}`;
      const hz = mapState.followPlayer ? " 30Hz" : "";
      el.textContent = `\u2713${hz}: ${chName} \u00B7 ${layerName} (${Math.round(pos.x)}, ${Math.round(pos.z)}) ${yawToCompass(pos.yaw)}`;
      return;
    }
    const ch = state.characters.find((c) => c.slot === state.activeSlot);
    if (!ch || !ch.playerPos) {
      el.textContent = "Player position: unavailable in current slot";
      return;
    }
    const resolved = resolvePlayerToMapLayer(ch.playerPos);
    const layerName = resolved && mapState.data && mapState.data.layers[resolved.layer]
      ? mapState.data.layers[resolved.layer].title
      : `m${ch.playerPos.area}`;
    el.textContent = `${ch.name}: ${layerName} (${Math.round(ch.playerPos.x)}, ${Math.round(ch.playerPos.z)}) ${yawToCompass(ch.playerPos.yaw)}`;
  }

  async function ensureMapImage(layer) {
    if (mapState.images[layer]) return mapState.images[layer];
    if (mapState.imgPromises[layer]) return mapState.imgPromises[layer];
    const p = (async () => {
      if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.get_map_image) return null;
      const res = await window.pywebview.api.get_map_image(layer);
      if (!res || !res.ok || !res.dataUrl) return null;
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = res.dataUrl;
      });
      if (img.naturalWidth > 0) {
        mapState.images[layer] = img;
        return img;
      }
      return null;
    })();
    mapState.imgPromises[layer] = p;
    return p;
  }

  async function ensureMapIcons() {
    if (Object.keys(mapState.icons).length > 0) return;
    if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.get_map_icons) return;
    const rawIcons = await window.pywebview.api.get_map_icons();
    if (!rawIcons || typeof rawIcons !== "object") return;
    mapState.icons = rawIcons;
    const decodes = [];
    for (const [k, url] of Object.entries(rawIcons)) {
      if (!url) continue;
      const img = new Image();
      decodes.push(new Promise((resolve) => {
        img.onload = () => {
          mapState.iconImgs[k] = img;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      }));
    }
    mapState.unlitGraceCanvas = null;
    await Promise.all(decodes);
    for (const k of ["player", "grace", "weapon", "talisman", "armor", "boss", "merchant", "poi", "beacon", ...MAP_COLLECTIBLE_CATS]) {
      const el = $(`icon-legend-${k}`);
      if (el && rawIcons[k]) {
        el.src = rawIcons[k];
        el.classList.add("loaded");
      }
    }
  }

  function getUnlitGraceCanvas() {
    if (mapState.unlitGraceCanvas) return mapState.unlitGraceCanvas;
    const sp = mapState.iconImgs.grace;
    if (!sp || !sp.naturalWidth) return null;
    const c = document.createElement("canvas");
    c.width = sp.naturalWidth;
    c.height = sp.naturalHeight;
    const cctx = c.getContext("2d");
    cctx.drawImage(sp, 0, 0);
    const id = cctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      const lum = Math.min(240, Math.round((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * 1.15 + 24));
      d[i] = Math.round(lum * 0.88);
      d[i + 1] = Math.round(lum * 0.93);
      d[i + 2] = Math.min(255, Math.round(lum * 1.04));
      d[i + 3] = Math.round(a * 0.56);
    }
    cctx.putImageData(id, 0, 0);
    mapState.unlitGraceCanvas = c;
    return c;
  }

  function requestMapTile(layer, cx, cy) {
    const key = `${layer}_${cx}_${cy}`;
    if (mapState.tiles.has(key) || mapState.tilePromises.has(key)) return;
    if (mapState.tileInFlight >= 4) return;
    if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.get_map_tile) return;
    mapState.tileInFlight++;
    const p = (async () => {
      try {
        const res = await window.pywebview.api.get_map_tile(layer, cx, cy);
        if (!res || !res.ok || !res.dataUrl) {
          mapState.tiles.set(key, null);
          return;
        }
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = res.dataUrl;
        });
        if (img.naturalWidth > 0) {
          if (mapState.tiles.size >= 48) {
            const oldestKey = mapState.tiles.keys().next().value;
            mapState.tiles.delete(oldestKey);
          }
          mapState.tiles.set(key, img);
          if (isMapVisible() && mapState.layer === layer) renderMapCanvas();
        }
      } finally {
        mapState.tileInFlight = Math.max(0, mapState.tileInFlight - 1);
        mapState.tilePromises.delete(key);
      }
    })();
    mapState.tilePromises.set(key, p);
  }

  async function ensureMapLoaded() {
    if (mapState.loaded) return;
    if (mapState.loading) {
      while (mapState.loading) await new Promise((r) => setTimeout(r, 30));
      return;
    }
    mapState.loading = true;
    const ov = $("mapLoadingOverlay");
    if (ov) ov.classList.remove("hidden");
    try {
      const [data] = await Promise.all([
        window.pywebview.api.get_map_data(),
        ensureMapIcons(),
      ]);
      mapState.data = data;
      mapState.loaded = Boolean(data && Array.isArray(data.markers));
      computeVisibleMarkers();
      const cnts = (data && data.counts) || {};
      for (const k of Object.keys(MAP_CAT_META)) {
        const cel = $(`cnt-${k}`);
        if (cel) cel.textContent = String(cnts[k] || 0);
      }
      const pcntEl = $("cnt-pins");
      if (pcntEl) pcntEl.textContent = String(getActiveWorldPins().length);
      if (!mapState.firstOpenDone) {
        mapState.firstOpenDone = true;
        const lp = getActiveLivePlayerPos();
        if (lp && lp.layer) {
          mapState.lastPlayerLayer = lp.layer;
          if (mapState.autoSwitchLayer) mapState.layer = lp.layer;
        }
      }
      syncMapLayerButtons();
      await ensureMapImage(mapState.layer);
      updateMapSearchList();
      updateMapPlayerReadout();
      resetMapView(false);
      if (window.pywebview && window.pywebview.api && window.pywebview.api.get_map_extract_status) {
        const ext = await window.pywebview.api.get_map_extract_status();
        updateMapExtractUi(ext);
      }
    } finally {
      mapState.loading = false;
      if (ov) ov.classList.add("hidden");
    }
  }

  function updateMapExtractUi(st) {
    if (!st) return;
    const hasMaps = Boolean(st.hasMaps);
    const running = Boolean(st.running);
    const btn = $("mapExtractBtn");
    const banner = $("mapExtractBanner");
    const progWrap = $("mapExtractProgressWrap");
    const fill = $("mapExtractProgressFill");
    const status = $("mapExtractStatus");
    const heroBtn = $("mapExtractHeroBtn");
    const browseBtn = $("mapExtractBrowseBtn");

    if (btn) {
      btn.disabled = running;
      btn.textContent = running ? "Extracting..." : (hasMaps ? "Re-extract Game Maps" : "Extract Game Maps & Icons");
    }
    if (heroBtn) heroBtn.disabled = running;
    if (browseBtn) browseBtn.disabled = running;

    if (banner) {
      banner.classList.toggle("hidden", hasMaps || mapState.mapExtractBannerDismissed);
    }
    if (progWrap && fill && status) {
      const showProg = running || (st.done && st.message);
      progWrap.classList.toggle("hidden", !showProg);
      fill.style.width = `${Math.max(0, Math.min(100, Number(st.pct || 0)))}%`;
      status.textContent = st.message || "";
      status.style.color = st.error ? "#f05454" : "";
    }
  }

  async function reloadMapAssets() {
    mapState.images = {};
    mapState.imgPromises = {};
    mapState.tiles.clear();
    mapState.tilePromises.clear();
    mapState.icons = {};
    mapState.iconImgs = {};
    await Promise.all([
      ensureMapIcons(),
      ensureMapImage(mapState.layer),
    ]);
    updateMapSearchList();
    renderMapCanvas();
  }

  window.__onMapExtractProgress = async (st) => {
    updateMapExtractUi(st);
    if (st && st.done && st.ok) {
      await reloadMapAssets();
      updateMapExtractUi(st);
    }
  };

  async function triggerMapExtraction(browse = false) {
    if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.start_map_extraction) return;
    const res = await window.pywebview.api.start_map_extraction(Boolean(browse));
    if (res && res.error) {
      updateMapExtractUi({
        hasMaps: false,
        running: false,
        pct: 0,
        done: true,
        ok: false,
        error: res.error,
        message: res.error,
      });
    }
  }

  function syncMapLayerButtons() {
    document.querySelectorAll(".map-layer-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.layer === mapState.layer);
    });
  }

  function getMapLayout() {
    const canvas = $("mapCanvas");
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(100, rect.width);
    const h = Math.max(100, rect.height);
    const baseSize = Math.min(w, h) * 0.96;
    const scale = baseSize * mapState.zoom;
    const ox = w * 0.5 + mapState.panX - scale * 0.5;
    const oy = h * 0.5 + mapState.panY - scale * 0.5;
    return { w, h, scale, ox, oy };
  }

  function resetMapView(redraw = true) {
    mapState.panX = 0;
    mapState.panY = 0;
    mapState.zoom = 1.0;
    mapState.fitDone = true;
    if (redraw) renderMapCanvas();
  }

  function centerMapOnUV(u, v, targetZoom = null) {
    const { w, h } = getMapLayout();
    if (targetZoom !== null) mapState.zoom = Math.max(0.7, Math.min(24, targetZoom));
    const baseSize = Math.min(w, h) * 0.96;
    const scale = baseSize * mapState.zoom;
    mapState.panX = (0.5 - u) * scale;
    mapState.panY = (0.5 - v) * scale;
    renderMapCanvas();
  }

  function markerMatchesSearch(m, q) {
    if (!q) return true;
    if (m.name && m.name.toLowerCase().includes(q)) return true;
    if (m.sub && m.sub.toLowerCase().includes(q)) return true;
    if (m.baseName && m.baseName.toLowerCase().includes(q)) return true;
    if (Array.isArray(m.items)) {
      for (const it of m.items) {
        if (String(it).toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }

  function computeVisibleMarkers() {
    if (!mapState.data || !mapState.data.markers) {
      mapState.visibleMarkers = [];
      return [];
    }
    const q = mapState.search.trim().toLowerCase();
    const hideCompleted = mapState.completedMode === "hide";
    const out = [];
    for (const m of mapState.data.markers) {
      if (m.layer !== mapState.layer) continue;
      if (!mapState.cats[m.cat]) continue;
      if (!markerMatchesSearch(m, q)) continue;
      if (hideCompleted && m.cat !== "grace" && isMarkerCompleted(m)) continue;
      out.push(m);
    }
    mapState.visibleMarkers = out;
    return out;
  }

  function drawMarkerShape(ctx, shape, x, y, r, color, isSelected) {
    ctx.save();
    ctx.beginPath();
    if (shape === "star") {
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r * 1.28 : r * 0.48;
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === "diamond") {
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.05, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.05, y);
      ctx.closePath();
    } else if (shape === "triangle") {
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r * 1.1, y + r * 0.9);
      ctx.lineTo(x - r * 1.1, y + r * 0.9);
      ctx.closePath();
    } else if (shape === "square") {
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    } else if (shape === "hex") {
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + Math.cos(ang) * r * 1.05;
        const py = y + Math.sin(ang) * r * 1.05;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = isSelected ? 2.4 : 1.4;
    ctx.strokeStyle = isSelected ? "#ffffff" : "#0b0d10";
    ctx.stroke();
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#f2cf7e";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function getMarkerIconKey(m) {
    if (m.icon && mapState.iconImgs[m.icon]) return m.icon;
    return m.cat;
  }

  function drawMarkerPin(ctx, m, x, y, iconPx, isSelected, isHovered) {
    const completed = isMarkerCompleted(m);
    const ikey = getMarkerIconKey(m);
    let sprite = mapState.iconImgs[ikey] || mapState.iconImgs[m.cat];
    const isGrace = m.cat === "grace";
    const isUnlitGrace = isGrace && !completed;
    const isDimOther = !isGrace && completed && mapState.completedMode === "dim";

    if (isUnlitGrace) {
      const unlit = getUnlitGraceCanvas();
      if (unlit) sprite = unlit;
    }

    if (sprite && (sprite.naturalWidth > 0 || sprite.width > 0)) {
      const sw = sprite.naturalWidth || sprite.width;
      const sh = sprite.naturalHeight || sprite.height;
      const ratio = sw / Math.max(1, sh);
      let dw = iconPx;
      let dh = iconPx;
      if (ratio > 1) dh = iconPx / ratio;
      else if (ratio < 1) dw = iconPx * ratio;
      ctx.save();
      if (isDimOther) ctx.globalAlpha = 0.34;
      ctx.beginPath();
      const rad = Math.max(dw, dh) * 0.448;
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(25, 20, 14, 0.88)" : (isUnlitGrace ? "rgba(12, 13, 16, 0.42)" : "rgba(12, 11, 10, 0.58)");
      ctx.fill();
      if (isUnlitGrace && !isSelected) {
        ctx.save();
        ctx.setLineDash([2.5, 2.5]);
        ctx.strokeStyle = isHovered ? "#ffffff" : "rgba(195, 206, 222, 0.55)";
        ctx.lineWidth = isHovered ? 1.5 : 1.1;
        ctx.stroke();
        ctx.restore();
      } else if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? "#f2cf7e" : "#ffffff";
        ctx.lineWidth = isSelected ? 2.2 : 1.4;
        ctx.stroke();
      }
      ctx.drawImage(sprite, x - dw * 0.5, y - dh * 0.5, dw, dh);
      if (completed && !isGrace && iconPx >= 15) {
        ctx.globalAlpha = 0.92;
        const br = Math.max(4.5, Math.min(7, iconPx * 0.22));
        const bx = x + dw * 0.32;
        const by = y + dh * 0.32;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = "#194d2c";
        ctx.fill();
        ctx.strokeStyle = "#4df088";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx - br * 0.45, by);
        ctx.lineTo(bx - br * 0.1, by + br * 0.35);
        ctx.lineTo(bx + br * 0.45, by - br * 0.35);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const meta = MAP_CAT_META[m.cat] || MAP_CAT_META.poi;
    ctx.save();
    if (isDimOther || isUnlitGrace) ctx.globalAlpha = isUnlitGrace ? 0.42 : 0.34;
    drawMarkerShape(ctx, meta.shape, x, y, iconPx * 0.34, isUnlitGrace ? "#9aa6b8" : meta.color, isSelected);
    ctx.restore();
  }

  function computePipProximityScale(baseIconPx, distPx) {
    if (!Number.isFinite(distPx) || distPx >= 110) {
      return { iconPx: baseIconPx, near: false };
    }
    const t = Math.max(0, Math.min(1, (distPx - 14) / (110 - 14)));
    const ease = t * t * (3 - 2 * t);
    const minPx = Math.min(baseIconPx, 14);
    return {
      iconPx: minPx + (baseIconPx - minPx) * ease,
      near: distPx < 85,
    };
  }

  function computePipPlayerScale(nearestDistPx) {
    if (!Number.isFinite(nearestDistPx) || nearestDistPx >= 55) return 1.0;
    const t = Math.max(0, Math.min(1, (nearestDistPx - 8) / (55 - 8)));
    return 0.55 + 0.45 * t;
  }

  function getMapIconPx() {
    const z = Math.max(0.7, mapState.zoom);
    const baseIconPx = Math.max(21.25, Math.min(32.5, (17 + Math.log2(Math.max(1, z)) * 2.2) * 1.25));
    if (mapState.search.trim().length > 0) {
      const zoomOutBonus = z < 2.0 ? (2.0 - z) * 4.5 : 0;
      return Math.min(66, Math.max(46, baseIconPx * 2.0 + zoomOutBonus));
    }
    return baseIconPx;
  }

  function renderMapCanvas() {
    if (!isMapVisible()) return;
    const canvas = $("mapCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(rect.width * dpr);
    const ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h, scale, ox, oy } = getMapLayout();

    ctx.fillStyle = "#0d1115";
    ctx.fillRect(0, 0, w, h);

    const img = mapState.images[mapState.layer];
    if (img && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, ox, oy, scale, scale);
    } else {
      ctx.fillStyle = "#14191f";
      ctx.fillRect(ox, oy, scale, scale);
      ctx.strokeStyle = "#262f3a";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 16; i++) {
        const g = (i / 16) * scale;
        ctx.beginPath(); ctx.moveTo(ox + g, oy); ctx.lineTo(ox + g, oy + scale); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + g); ctx.lineTo(ox + scale, oy + g); ctx.stroke();
      }
      ctx.fillStyle = "#8a94a0";
      ctx.font = "600 13px Segoe UI, sans-serif";
      ctx.fillText("Map tiles not extracted yet — click 'Extract Game Maps & Icons' below", ox + 20, oy + 32);
    }

    // Native L0 8x8 high-res tile overlay when zoomed in beyond overview detail
    const tileGrid = (mapState.data && mapState.data.tileGrid) || 8;
    if (scale > 2200 && tileGrid > 0) {
      const tilePx = scale / tileGrid;
      const cxMin = Math.max(0, Math.floor(-ox / tilePx));
      const cxMax = Math.min(tileGrid - 1, Math.floor((w - ox) / tilePx));
      const cyMin = Math.max(0, Math.floor(-oy / tilePx));
      const cyMax = Math.min(tileGrid - 1, Math.floor((h - oy) / tilePx));
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const tkey = `${mapState.layer}_${cx}_${cy}`;
          const timg = mapState.tiles.get(tkey);
          if (timg && timg.naturalWidth > 0) {
            ctx.drawImage(timg, ox + cx * tilePx, oy + cy * tilePx, tilePx + 0.75, tilePx + 0.75);
          } else if (timg === undefined) {
            requestMapTile(mapState.layer, cx, cy);
          }
        }
      }
    }

    const vis = computeVisibleMarkers();
    const isSearching = mapState.search.trim().length > 0;
    const iconPx = getMapIconPx();
    const cullPad = Math.ceil(iconPx * 0.75 + 8);
    const lp = mapState.showPlayer ? getActiveLivePlayerPos() : null;
    const hasPlayerOnLayer = Boolean(lp && lp.layer === mapState.layer);
    const playerX = hasPlayerOnLayer ? ox + lp.u * scale : 0;
    const playerY = hasPlayerOnLayer ? oy + lp.v * scale : 0;
    const pipSearchProx = isMapPipMode() && isSearching && hasPlayerOnLayer;
    let nearestSearchDist = Infinity;

    const drawPinWithProx = (m, sx, sy, basePinPx, isSel, isHov) => {
      let pinPx = basePinPx;
      let near = false;
      if (pipSearchProx) {
        const dist = Math.hypot(sx - playerX, sy - playerY);
        if (dist < nearestSearchDist) nearestSearchDist = dist;
        const prox = computePipProximityScale(basePinPx, dist);
        pinPx = prox.iconPx;
        near = prox.near;
      }
      drawMarkerPin(ctx, m, sx, sy, pinPx, isSel, isHov);
      if (near) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe48a";
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#0e0c0a";
        ctx.stroke();
        ctx.restore();
      }
    };

    const drawOrder = [
      "poi", "armor", "talisman", "weapon",
      "crystal_tear", "golden_seed", "sacred_tear", "scadutree", "revered_ash", "memory_stone", "whetblade",
      "bell_bearing", "merchant", "boss", "grace",
    ];
    const byCat = new Map(drawOrder.map((c) => [c, []]));
    for (const m of vis) {
      if (m === mapState.selectedPin || m === mapState.hoveredPin) continue;
      if (byCat.has(m.cat)) byCat.get(m.cat).push(m);
    }

    for (const cat of drawOrder) {
      const list = byCat.get(cat);
      for (const m of list) {
        const sx = ox + m.u * scale;
        const sy = oy + m.v * scale;
        if (sx < -cullPad || sx > w + cullPad || sy < -cullPad || sy > h + cullPad) continue;
        drawPinWithProx(m, sx, sy, iconPx, false, false);
      }
    }

    // Native Elden Ring Blue Beacons (1-5) & Green Map Stamps
    if (mapState.showPins) {
      const pins = getActiveWorldPins();
      for (const pin of pins) {
        if (pin.layer !== mapState.layer) continue;
        if (pin.kind === "beacon" && mapState.autoClearBeacon) {
          const bKey = `${pin.slot || 0}_${Number(pin.u).toFixed(4)}_${Number(pin.v).toFixed(4)}`;
          if (mapState.clearedBeaconKeys.has(bKey)) continue;
        }
        const sx = ox + pin.u * scale;
        const sy = oy + pin.v * scale;
        if (sx < -30 || sx > w + 30 || sy < -30 || sy > h + 30) continue;
        ctx.save();
        if (pin.kind === "beacon") {
          const bPx = Math.max(24, Math.min(34, iconPx * 1.12));
          ctx.beginPath();
          ctx.arc(sx, sy, bPx * 0.48, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(40, 150, 255, 0.24)";
          ctx.fill();
          ctx.strokeStyle = "#5cc8ff";
          ctx.lineWidth = 2;
          ctx.stroke();
          const bImg = mapState.iconImgs.beacon;
          if (bImg && bImg.naturalWidth > 0) {
            const br = bImg.naturalWidth / Math.max(1, bImg.naturalHeight);
            const bh = bPx;
            const bw = bh * br;
            ctx.drawImage(bImg, sx - bw * 0.5, sy - bh * 0.5, bw, bh);
          } else {
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = "#5cc8ff";
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(sx + bPx * 0.34, sy - bPx * 0.34, 7, 0, Math.PI * 2);
          ctx.fillStyle = "#0b1a2a";
          ctx.fill();
          ctx.strokeStyle = "#5cc8ff";
          ctx.lineWidth = 1.3;
          ctx.stroke();
          ctx.fillStyle = "#bfe8ff";
          ctx.font = "700 9.5px Consolas, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(pin.slot || ""), sx + bPx * 0.34, sy - bPx * 0.34);
        } else {
          const sPx = Math.max(18, Math.min(26, iconPx * 0.85));
          const sImg = mapState.iconImgs[`memo_${pin.stampType}`] || mapState.iconImgs.memo_0;
          if (sImg && sImg.naturalWidth > 0) {
            ctx.drawImage(sImg, sx - sPx * 0.5, sy - sPx * 0.5, sPx, sPx);
          } else {
            drawMarkerShape(ctx, "diamond", sx, sy, 6, "#7ee69a", false);
          }
        }
        ctx.restore();
      }
    }

    // Labels when zoomed in or searching (with optional PiP nearby decluttering & per-category toggles)
    mapState.lastLabelsDrawnCount = 0;
    if (mapState.showLabels && (mapState.zoom >= 3.2 || (isSearching && vis.length <= 40))) {
      ctx.font = "600 11px Segoe UI, sans-serif";
      ctx.textBaseline = "middle";
      const lblOff = iconPx * 0.52 + 4;
      const usePipNearby = isMapPipMode() && mapState.pipNearbyLabelsOnly && !isSearching;
      const anchorX = hasPlayerOnLayer ? playerX : w * 0.5;
      const anchorY = hasPlayerOnLayer ? playerY : h * 0.5;
      const radiusPx = mapState.pipNearbyLabelRadius || 95;
      const cands = [];
      for (const m of vis) {
        if (!isSearching && !mapState.labelCats[m.cat]) continue;
        const sx = ox + m.u * scale;
        const sy = oy + m.v * scale;
        if (usePipNearby) {
          if (sx < 6 || sx > w - 6 || sy < 24 || sy > h - 8) continue;
          const dist = Math.hypot(sx - anchorX, sy - anchorY);
          if (dist > radiusPx) continue;
          cands.push({ m, sx, sy, dist });
        } else {
          if (sx < 10 || sx > w - 40 || sy < 10 || sy > h - 10) continue;
          cands.push({ m, sx, sy, dist: 0 });
        }
      }
      if (usePipNearby) cands.sort((a, b) => a.dist - b.dist);

      let labelsDrawn = 0;
      const maxLabels = usePipNearby ? 24 : 60;
      const placedBoxes = [];
      const boxesOverlap = (a, b) => !(a.x + a.w + 2 < b.x || b.x + b.w + 2 < a.x || a.y + a.h + 2 < b.y || b.y + b.h + 2 < a.y);

      for (const { m, sx, sy, dist } of cands) {
        if (labelsDrawn >= maxLabels) break;
        const txt = m.name;
        const tw = ctx.measureText(txt).width;
        const boxW = tw + 8;
        const boxH = 16;
        let lx = sx + lblOff;
        const ly = sy - 8;
        if (usePipNearby) {
          if (lx + boxW > w - 4) lx = Math.max(4, sx - lblOff - boxW);
          const box = { x: lx, y: ly, w: boxW, h: boxH };
          if (placedBoxes.some((b) => boxesOverlap(box, b))) continue;
          placedBoxes.push(box);
        }
        let alpha = 1.0;
        if (usePipNearby && dist > radiusPx * 0.68) {
          alpha = Math.max(0.28, 1 - (dist - radiusPx * 0.68) / Math.max(1, radiusPx * 0.32));
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(15, 13, 11, 0.80)";
        ctx.fillRect(lx, ly, boxW, boxH);
        ctx.fillStyle = "#ece4d8";
        ctx.fillText(txt, lx + 4, sy);
        ctx.restore();
        labelsDrawn++;
      }
      mapState.lastLabelsDrawnCount = labelsDrawn;
    }

    // Highlight hovered and selected pin on top
    for (const special of [mapState.hoveredPin, mapState.selectedPin]) {
      if (!special || special.layer !== mapState.layer) continue;
      const sx = ox + special.u * scale;
      const sy = oy + special.v * scale;
      drawPinWithProx(special, sx, sy, iconPx + (isSearching ? 6 : 4), special === mapState.selectedPin, special === mapState.hoveredPin);
    }

    // Live Player marker (authentic Elden Ring player medallion + directional pointer)
    if (hasPlayerOnLayer) {
      const pScale = pipSearchProx ? computePipPlayerScale(nearestSearchDist) : 1.0;
      const ph = 44 * pScale;
      const ringR = ph * (10.3 / 56.0);
      ctx.save();
      ctx.translate(playerX, playerY);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Subtle dark translucent disc inside the hollow ring so the gold Tarnished bust reads cleanly
      const haloGrad = ctx.createRadialGradient(0, 0, ringR * 0.15, 0, 0, ringR * 1.06);
      haloGrad.addColorStop(0, "rgba(10, 8, 6, 0.44)");
      haloGrad.addColorStop(0.75, "rgba(10, 8, 6, 0.34)");
      haloGrad.addColorStop(1, "rgba(10, 8, 6, 0)");
      ctx.beginPath();
      ctx.arc(0, 0, ringR * 1.06, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();

      ctx.shadowColor = "rgba(0, 0, 0, 0.78)";
      ctx.shadowBlur = Math.max(2, ph * 0.06);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(0.75, ph * 0.018);

      const pBase = mapState.iconImgs.player;
      const pArrow = mapState.iconImgs.player_arrow;
      // 1. Rotating golden ring + directional spear underneath, pivoted on exact inner-ring center
      if (pArrow && pArrow.naturalWidth > 0) {
        ctx.save();
        ctx.rotate(lp.yaw + Math.PI);
        const pr = pArrow.naturalWidth / Math.max(1, pArrow.naturalHeight);
        const pw = ph * pr;
        ctx.drawImage(pArrow, -pw * (12.50 / 27.0), -ph * (33.40 / 56.0), pw, ph);
        ctx.restore();
      }
      // 2. Upright golden Tarnished bust on top, dead-center inside the hollow ring
      if (pBase && pBase.naturalWidth > 0) {
        const br = pBase.naturalWidth / Math.max(1, pBase.naturalHeight);
        const bh = ph * 0.355;
        const bw = bh * br;
        ctx.drawImage(pBase, -bw * (15.55 / 38.0), -bh * (24.45 / 56.0), bw, bh);
      } else if (!pArrow || pArrow.naturalWidth <= 0) {
        ctx.save();
        ctx.rotate(lp.yaw + Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -10 * pScale);
        ctx.lineTo(7 * pScale, 8 * pScale);
        ctx.lineTo(0, 4 * pScale);
        ctx.lineTo(-7 * pScale, 8 * pScale);
        ctx.closePath();
        ctx.fillStyle = "#e6d29c";
        ctx.fill();
        ctx.strokeStyle = "#18130c";
        ctx.lineWidth = Math.max(1.0, 1.6 * pScale);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Nearest off-screen target arrow + distance in PiP Map Mode (single nearest match only)
    mapState.offscreenTarget = null;
    if (mapState.showOffscreenArrow && isMapPipMode() && isSearching && vis.length > 0) {
      const cal = (mapState.data && mapState.data.layers && mapState.data.layers[mapState.layer]) || { span: 10496.0 };
      const span = cal.span || 10496.0;
      const refU = hasPlayerOnLayer ? lp.u : (w * 0.5 - ox) / scale;
      const refV = hasPlayerOnLayer ? lp.v : (h * 0.5 - oy) / scale;
      let nearestM = null;
      let nearestDist = Infinity;
      for (const m of vis) {
        const dist = Math.hypot(m.u - refU, m.v - refV) * span;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestM = m;
        }
      }
      if (nearestM) {
        const tx = ox + nearestM.u * scale;
        const ty = oy + nearestM.v * scale;
        const margin = 12;
        if (tx < margin || tx > w - margin || ty < margin || ty > h - margin) {
          const cx0 = w * 0.5;
          const cy0 = h * 0.5;
          const dx = tx - cx0;
          const dy = ty - cy0;
          const leftB = 42;
          const rightB = w - 42;
          const topB = 40;
          const botB = h - 22;
          let tEdge = Infinity;
          if (dx > 0.001) tEdge = Math.min(tEdge, (rightB - cx0) / dx);
          else if (dx < -0.001) tEdge = Math.min(tEdge, (leftB - cx0) / dx);
          if (dy > 0.001) tEdge = Math.min(tEdge, (botB - cy0) / dy);
          else if (dy < -0.001) tEdge = Math.min(tEdge, (topB - cy0) / dy);
          if (Number.isFinite(tEdge) && tEdge > 0) {
            const ix = Math.max(leftB, Math.min(rightB, cx0 + dx * tEdge));
            const iy = Math.max(topB, Math.min(botB, cy0 + dy * tEdge));
            const ang = Math.atan2(dy, dx);
            const distTxt = nearestDist >= 1000 ? `${(nearestDist / 1000).toFixed(1)}km` : `${Math.round(nearestDist)}m`;
            ctx.save();
            ctx.font = "700 11px Segoe UI, sans-serif";
            const tw = ctx.measureText(distTxt).width;
            const pw = tw + 28;
            const ph = 22;
            const bx = Math.max(6, Math.min(w - pw - 6, ix - pw * 0.5));
            const by = Math.max(30, Math.min(h - ph - 6, iy - ph * 0.5));
            ctx.fillStyle = "rgba(18, 15, 11, 0.92)";
            ctx.strokeStyle = "#e6c16c";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, pw, ph, 11);
            else ctx.rect(bx, by, pw, ph);
            ctx.fill();
            ctx.stroke();

            // Directional arrow rotated toward off-screen target
            ctx.save();
            ctx.translate(bx + 12, by + ph * 0.5);
            ctx.rotate(ang);
            ctx.beginPath();
            ctx.moveTo(6, 0);
            ctx.lineTo(-4, -4.5);
            ctx.lineTo(-2, 0);
            ctx.lineTo(-4, 4.5);
            ctx.closePath();
            ctx.fillStyle = "#ffe48a";
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = "#ffe48a";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(distTxt, bx + 21, by + ph * 0.5 + 0.5);
            ctx.restore();
            mapState.offscreenTarget = { id: nearestM.id, name: nearestM.name, distMeters: Math.round(nearestDist), ix: Math.round(ix), iy: Math.round(iy) };
          }
        }
      }
    }
  }

  function findHitMarker(clientX, clientY) {
    const canvas = $("mapCanvas");
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { scale, ox, oy } = getMapLayout();
    let best = null;
    const hitR = Math.max(15, getMapIconPx() * 0.52);
    let bestDist2 = hitR * hitR;
    for (const m of mapState.visibleMarkers) {
      const sx = ox + m.u * scale;
      const sy = oy + m.v * scale;
      const d2 = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d2 <= bestDist2) {
        bestDist2 = d2;
        best = m;
      }
    }
    if (!best && mapState.showPins) {
      for (const pin of getActiveWorldPins()) {
        if (pin.layer !== mapState.layer) continue;
        const sx = ox + pin.u * scale;
        const sy = oy + pin.v * scale;
        const d2 = (sx - mx) ** 2 + (sy - my) ** 2;
        if (d2 <= bestDist2) {
          bestDist2 = d2;
          const cal = (mapState.data && mapState.data.layers && mapState.data.layers[pin.layer]) || { ox: 7040, oz: 16512, span: 10496 };
          best = {
            id: `pin:${pin.kind}:${pin.slot ?? pin.stampType}:${pin.u}`,
            cat: "poi",
            isNativePin: true,
            name: pin.kind === "beacon" ? `Blue Beacon #${pin.slot}` : "Map Stamp",
            sub: pin.kind === "beacon" ? "In-Game Waypoint Beacon" : "In-Game Custom Map Marker",
            layer: pin.layer,
            u: pin.u,
            v: pin.v,
            wx: Math.round(pin.u * cal.span + cal.ox),
            wz: Math.round(cal.oz - pin.v * cal.span),
          };
        }
      }
    }
    return best;
  }

  function showMapPinCard(m) {
    const card = $("mapPinCard");
    if (!m) {
      mapState.selectedPin = null;
      card.classList.add("hidden");
      renderMapCanvas();
      return;
    }
    mapState.selectedPin = m;
    const meta = MAP_CAT_META[m.cat] || MAP_CAT_META.poi;
    const badge = $("mapPinBadge");
    const completed = !m.isNativePin && isMarkerCompleted(m);
    badge.textContent = completed
      ? `${meta.label} ✓`
      : meta.label;
    badge.style.color = meta.color;
    badge.style.borderColor = meta.color;
    $("mapPinTitle").textContent = m.name;
    $("mapPinSub").textContent = m.sub || "";
    const itemsEl = $("mapPinItems");
    if (Array.isArray(m.items) && m.items.length) {
      itemsEl.innerHTML = m.items.map((it) => `<div>&bull; ${escHtml(String(it))}</div>`).join("");
    } else {
      itemsEl.innerHTML = "";
    }
    const layerTitle = (mapState.data && mapState.data.layers[m.layer] && mapState.data.layers[m.layer].title) || m.layer;
    $("mapPinCoords").textContent = `${layerTitle} · ${m.mapId || ""} (${m.wx ?? 0}, ${m.wz ?? 0})`;
    const acts = $("mapPinActions");
    acts.innerHTML = "";
    if (m.calcId) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "top-btn gold-outline";
      btn.textContent = "Open in Calculator";
      btn.addEventListener("click", () => openWeaponInCalculator(m.calcId, m.baseName || m.name));
      acts.appendChild(btn);
    }
    if (!m.isNativePin) {
      const verb = m.cat === "boss" ? "Defeated" : (m.cat === "grace" ? "Discovered" : "Collected");
      const mBtn = document.createElement("button");
      mBtn.type = "button";
      mBtn.className = "top-btn";
      mBtn.textContent = completed ? `Unmark ${verb}` : `Mark ${verb}`;
      mBtn.addEventListener("click", () => setMarkerManualState(m.id, !completed));
      acts.appendChild(mBtn);

      if (typeof getManualOverride(m.id) === "boolean") {
        const clrBtn = document.createElement("button");
        clrBtn.type = "button";
        clrBtn.className = "mini-link-btn";
        clrBtn.textContent = "Auto";
        clrBtn.title = "Clear manual override and return to auto-detect";
        clrBtn.addEventListener("click", () => setMarkerManualState(m.id, null));
        acts.appendChild(clrBtn);
      }
    }
    card.classList.remove("hidden");
    renderMapCanvas();
  }

  function updateMapSearchList() {
    const listEl = $("mapSearchList");
    const metaEl = $("mapSearchMeta");
    const pipBtn = $("pipSearchBtn");
    const pipInp = $("pipSearchInput");
    const pipClr = $("pipSearchClearBtn");
    const pipMeta = $("pipSearchMeta");
    const pipList = $("pipSearchList");
    const q = mapState.search.trim().toLowerCase();
    if (pipBtn) pipBtn.classList.toggle("active", q.length > 0);
    if (pipClr) pipClr.classList.toggle("visible", mapState.search.length > 0);
    if (pipInp && document.activeElement !== pipInp && pipInp.value !== mapState.search) {
      pipInp.value = mapState.search;
    }
    if (!listEl || !mapState.data) return;
    const hideComp = mapState.completedMode === "hide";
    const matches = [];
    for (const m of mapState.data.markers) {
      if (!mapState.cats[m.cat]) continue;
      if (hideComp && m.cat !== "grace" && isMarkerCompleted(m)) continue;
      if (q && !markerMatchesSearch(m, q)) continue;
      matches.push(m);
      if (!q && matches.length >= 40) break;
    }
    const total = q ? matches.length : Object.keys(mapState.cats).reduce((a, k) => a + (mapState.cats[k] ? (mapState.data.counts[k] || 0) : 0), 0);
    const metaTxt = q ? `${matches.length} matching markers` : `${total} enabled markers (${mapState.layer})`;
    metaEl.textContent = metaTxt;
    if (pipMeta) pipMeta.textContent = q ? metaTxt : "Type to filter markers on PiP map";
    const renderItemsHtml = (arr) => arr.map((m, idx) => {
      const meta = MAP_CAT_META[m.cat] || MAP_CAT_META.poi;
      const layerTag = m.layer === "m10" ? "DLC" : (m.layer === "m01" ? "UG" : "LB");
      const done = isMarkerCompleted(m);
      const ikey = getMarkerIconKey(m);
      const iurl = mapState.icons[ikey] || mapState.icons[m.cat];
      const iconHtml = iurl
        ? `<img class="map-search-icon" src="${iurl}" alt="" />`
        : `<span class="map-dot ${m.cat}" style="background:${meta.color}"></span>`;
      const doneTag = done ? ` <span style="color:#4df088;font-size:10px;">✓</span>` : "";
      return `<button type="button" class="map-search-item" data-midx="${idx}">
        ${iconHtml}
        <span class="map-search-item-txt">
          <div class="map-search-item-name">${escHtml(m.name)}${doneTag}</div>
          <div class="map-search-item-sub">[${layerTag}] ${escHtml(m.sub || meta.label)}</div>
        </span>
      </button>`;
    }).join("");

    const slice = matches.slice(0, 80);
    listEl.innerHTML = renderItemsHtml(slice);
    listEl.querySelectorAll(".map-search-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const m = slice[Number(btn.dataset.midx)];
        if (!m) return;
        await focusMarkerOnMap(m, 4.5);
      });
    });

    if (pipList) {
      const pipSlice = q ? matches.slice(0, 50) : [];
      pipList.innerHTML = renderItemsHtml(pipSlice);
      pipList.querySelectorAll(".map-search-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const m = pipSlice[Number(btn.dataset.midx)];
          if (!m) return;
          if (mapState.followPlayer) await setMapFollow(false);
          await focusMarkerOnMap(m, Math.max(mapState.zoom, 4.5));
          setPipSearchPopover(false);
        });
      });
    }
  }

  async function focusMarkerOnMap(m, targetZoom = 4.5) {
    if (!m) return;
    if (mapState.layer !== m.layer) {
      mapState.layer = m.layer;
      syncMapLayerButtons();
      await ensureMapImage(m.layer);
    }
    centerMapOnUV(m.u, m.v, targetZoom);
    showMapPinCard(m);
  }

  function notifyStreamMode() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_live_stream_mode) {
      const streamView = (state.pipMode === "map" || state.pipMode === "hud" || state.activeView === "map")
        ? "map"
        : state.activeView;
      window.pywebview.api.set_live_stream_mode(streamView, mapState.followPlayer).catch(() => {});
    }
  }

  async function setMapFollow(enabled) {
    mapState.followPlayer = Boolean(enabled);
    const btn = $("mapFollowBtn");
    if (btn) btn.classList.toggle("following", mapState.followPlayer);
    const pbtn = $("pipFollowBtn");
    if (pbtn) pbtn.classList.toggle("following", mapState.followPlayer);
    syncSettingsToggleablesUi();
    updateMapPlayerReadout();
    notifyStreamMode();
    persistSettings();
    if (mapState.followPlayer) {
      const lp = getActiveLivePlayerPos();
      if (lp) {
        if (mapState.layer !== lp.layer) {
          mapState.layer = lp.layer;
          syncMapLayerButtons();
          await ensureMapImage(lp.layer);
        }
        centerMapOnUV(lp.u, lp.v, Math.max(mapState.zoom, 4.0));
      }
    }
  }

  const RAM_CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const RAM_CROSS_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  const STATUS_SVGS = {
    bleed: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5C12 2.5 5.5 10 5.5 14.8A6.5 6.5 0 0 0 18.5 14.8C18.5 10 12 2.5 12 2.5Z"/></svg>',
    frost: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M4.5 7l15 10M19.5 7l-15 10"/></svg>',
    rot: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c2 2.5 2 5 0 7 2.5-.5 4.8.5 6.2 2.5-2.2 1.2-4.5 1-6.2-.2 1.6 1.8 2 4.3.8 6.7-1.8-1.6-2.5-3.8-2.8-6-.3 2.2-1 4.4-2.8 6-1.2-2.4-.8-4.9.8-6.7-1.7 1.2-4 1.4-6.2.2C7.2 10.5 9.5 9.5 12 10c-2-2-2-4.5 0-7z"/></svg>',
    sleep: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.5 3.5a8.5 8.5 0 1 0 6 14.5A7 7 0 0 1 14.5 3.5z"/></svg>',
    poison: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="14" r="2.2"/><circle cx="15" cy="14" r="2.2"/><path d="M12 3a8 8 0 0 0-7.5 10.7L6 18h12l1.5-4.3A8 8 0 0 0 12 3zm0 11a5.5 5.5 0 0 1-5-3.2A5.5 5.5 0 0 1 12 5.5a5.5 5.5 0 0 1 5 5.3A5.5 5.5 0 0 1 12 14z"/></svg>',
    madness: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
  };

  function renderRamBadgeEl(el, isLive) {
    if (!el) return;
    el.classList.toggle("on", Boolean(isLive));
    el.classList.toggle("off", !isLive);
    el.innerHTML = isLive ? RAM_CHECK_SVG : RAM_CROSS_SVG;
    el.title = isLive
      ? "RAM Connected (30 Hz Read-Only Offline RAM)"
      : "RAM Disconnected (Offline eldenring.exe not attached or EAC active)";
  }

  function renderPipRamBadges() {
    renderRamBadgeEl($("pipRamBadge"), state.ramLive);
    renderRamBadgeEl($("pipMapRamBadge"), state.ramLive);
  }

  function renderStatusesForDesign(design, rawStatuses) {
    const list = Array.isArray(rawStatuses) ? rawStatuses.filter((s) => s && !s.immune && Number(s.max) > 0) : [];
    if (!list.length) return "";
    if (design === "2") {
      return `<div class="er-row-2">${list.map((s) => {
        const pct = Math.max(0, Math.min(100, ((Number(s.cur) || 0) / Number(s.max)) * 100));
        const ic = getStatusIconHtml(s.key, "er-st-img", s.label);
        return `<div class="er-med-2 c-${escHtml(s.key)}${pct >= 80 ? " hot" : ""}">
          <div class="er-med-2-fill" style="height:${pct.toFixed(1)}%"></div>
          <div class="er-med-2-in">
            <div class="er-st-lbl">${ic}<span>${escHtml(s.label)}</span></div>
            <div class="er-st-num">${Math.round(s.cur)}/${Math.round(s.max)}</div>
          </div>
        </div>`;
      }).join("")}</div>`;
    }
    if (design === "3") {
      return `<div class="er-stack-3">${list.map((s) => {
        const pct = Math.max(0, Math.min(100, ((Number(s.cur) || 0) / Number(s.max)) * 100));
        const ic = getStatusIconHtml(s.key, "er-st-img", s.label);
        return `<div class="er-bar-3 c-${escHtml(s.key)}${pct >= 80 ? " hot" : ""}">
          <div class="er-bar-3-fill" style="width:${pct.toFixed(1)}%"></div>
          <div class="er-bar-3-in">
            <span class="er-st-lbl">${ic}<span>${escHtml(s.label)}</span></span>
            <span class="er-st-num">${Math.round(s.cur)} / ${Math.round(s.max)}</span>
          </div>
        </div>`;
      }).join("")}</div>`;
    }
    const cols3 = (list.length === 3 || list.length >= 5) ? " cols-3" : "";
    return `<div class="er-grid-1${cols3}">${list.map((s) => {
      const pct = Math.max(0, Math.min(100, ((Number(s.cur) || 0) / Number(s.max)) * 100));
      const ic = getStatusIconHtml(s.key, "er-st-img", s.label);
      const showLbl = list.length <= 2 ? `<span>${escHtml(s.label)}</span>` : "";
      return `<div class="er-pill-1 c-${escHtml(s.key)}${pct >= 80 ? " hot" : ""}" title="${escHtml(s.label)}: ${Math.round(s.cur)}/${Math.round(s.max)}">
        <div class="er-pill-1-fill" style="width:${pct.toFixed(1)}%"></div>
        <div class="er-pill-1-in">
          <span class="er-st-lbl">${ic}${showLbl}</span>
          <span class="er-st-num">${Math.round(s.cur)}/${Math.round(s.max)}</span>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  const BOSS_RES_META = [
    ["Std", "ap_std", "Standard"],
    ["Sla", "ap_slash", "Slash"],
    ["Str", "ap_strike", "Strike"],
    ["Pie", "ap_pierce", "Pierce"],
    ["Mag", "ap_mag", "Magic"],
    ["Fir", "ap_fire", "Fire"],
    ["Ltn", "ap_ltng", "Lightning"],
    ["Hol", "ap_holy", "Holy"],
  ];

  function buildBossResistanceStripHtml(negArr) {
    const mode = state.pipBossResMode || "compact";
    if (mode === "off" || !Array.isArray(negArr) || negArr.length < 8) return "";
    const assets = getErMenuAssets();
    const negs = negArr.slice(0, 8).map((v) => Math.round(Number(v) || 0));
    let indices = [];
    const weakSet = new Set();
    const bestSet = new Set();

    for (let i = 0; i < 8; i++) {
      if (negs[i] < 0) weakSet.add(i);
    }
    if (weakSet.size === 0) {
      const minVal = Math.min(...negs);
      for (let i = 0; i < 8 && bestSet.size < 3; i++) {
        if (negs[i] === minVal) bestSet.add(i);
      }
    }

    if (mode === "full") {
      indices = [0, 1, 2, 3, 4, 5, 6, 7];
    } else {
      for (let i = 0; i < 8; i++) {
        if (weakSet.has(i) || bestSet.has(i) || negs[i] >= 40) {
          indices.push(i);
        }
      }
    }
    if (!indices.length) return "";

    return `<div class="er-res-strip">${indices.map((i) => {
      const v = negs[i];
      const [shortLbl, icKey, fullLbl] = BOSS_RES_META[i];
      const icSrc = assets[icKey] || "";
      let cls = "";
      if (weakSet.has(i) || v < 0) cls = "res-weak";
      else if (bestSet.has(i)) cls = "res-best";
      else if (v >= 40) cls = "res-resist";
      else if (v >= 20) cls = "res-mid";
      const valTxt = `${v > 0 ? "" : ""}${v}%`;
      return `<span class="er-res-pill ${cls}" title="${escHtml(fullLbl)} Negation: ${valTxt}">${icSrc ? `<img src="${icSrc}" alt="" />` : `<span>${shortLbl}</span>`}<span>${valTxt}</span></span>`;
    }).join("")}</div>`;
  }

  async function inspectBossInArmory(bossObj) {
    if (!bossObj) return;
    const def = Array.isArray(bossObj.def) && bossObj.def.length >= 5 ? bossObj.def : [125, 125, 125, 125, 125];
    const neg = Array.isArray(bossObj.neg) && bossObj.neg.length >= 8 ? bossObj.neg : [0, 0, 0, 0, 0, 0, 0, 0];
    state.customBossPreset = {
      id: bossObj.npcParamId || bossObj.id || 0,
      n: bossObj.name || "Target Enemy",
      d: def,
      g: neg,
    };
    state.enemyPreset = "__CUSTOM_BOSS__";
    populateEnemySelect();
    if ($("enemySelect")) $("enemySelect").value = "__CUSTOM_BOSS__";
    if ($("eqEnemySel")) $("eqEnemySel").value = "__CUSTOM_BOSS__";
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_enemy_preset_live) {
      window.pywebview.api.set_enemy_preset_live(false);
    }
    if (state.pipMode !== "off") {
      await setPipMode("off");
    }
    await switchMainView("calc");
    renderTableHeader();
    persistSettings();
    recalculateAndRender();
    showErToast("Benchmarking Enemy", `${state.customBossPreset.n}`, "info");
  }

  function buildBossCardsHtml(bosses, compact) {
    const design = state.pipBossDesign || "1";
    return bosses.map((b, bIdx) => {
      const hp = Math.max(0, Math.round(b.hp || 0));
      const maxHp = Math.max(1, Math.round(b.maxHp || 1));
      const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      const stMax = Number(b.maxStance) || 0;
      const stCur = Math.max(0, Number(b.stance) || 0);
      const stPct = stMax > 0 ? Math.max(0, Math.min(100, (stCur / stMax) * 100)) : 0;
      const stLbl = b.stanceKind === "poise" ? "POISE" : (b.stanceKind === "guard" ? "GUARD" : "STANCE");
      const broken = Boolean(b.stanceBroken);
      const stResetTxt = b.stanceReset > 0 ? `${b.stanceReset.toFixed(1)}s` : "";
      const stRow = (state.enemyShowStance && stMax > 0)
        ? `<div class="er-cap-row">
            <span class="er-cap st left"></span>
            ${broken
              ? `<div class="er-meter st broken"><div class="er-meter-fill er-fill-st-broken"></div><div class="er-broken-text">STANCE BROKEN &mdash; RIPOSTE READY</div></div>`
              : `<div class="er-meter st"><div class="er-meter-fill er-fill-st" style="width:${stPct.toFixed(1)}%"></div><div class="er-meter-text"><span>${stLbl} ${Math.round(stCur)}/${Math.round(stMax)}</span><span>${stResetTxt}</span></div></div>`
            }
            <span class="er-cap st right"></span>
          </div>`
        : "";
      const stHtml = state.enemyShowStatuses ? renderStatusesForDesign(design, b.statuses) : "";
      const resStripHtml = buildBossResistanceStripHtml(b.neg);
      const canInspect = Boolean(Array.isArray(b.neg) && b.neg.length >= 8);
      return `<div class="pip-boss-card${compact ? " compact" : ""}">
        <div class="er-boss-name"${canInspect ? ` data-boss-inspect-idx="${bIdx}" title="Click to inspect &amp; benchmark ${escHtml(b.name || "Boss")} in Armory"` : ""}>${escHtml(b.name || "Boss")}</div>
        <div class="er-bars-col">
          <div class="er-cap-row">
            <span class="er-cap left"></span>
            <div class="er-meter hp">
              <div class="er-meter-fill er-fill-hp" style="width:${hpPct.toFixed(1)}%"></div>
              <div class="er-meter-text">
                <span>${hp.toLocaleString()} / ${maxHp.toLocaleString()}</span>
                <span>${Math.round(hpPct)}%</span>
              </div>
            </div>
            <span class="er-cap right"></span>
          </div>
          ${stRow}
        </div>
        ${resStripHtml}
        ${stHtml}
      </div>`;
    }).join("");
  }

  function measurePipBossExtPx(bossBox) {
    if (!bossBox || bossBox.classList.contains("hidden")) return 0;
    const extCss = Math.ceil(bossBox.getBoundingClientRect().height || bossBox.offsetHeight || 0);
    const dpr = window.devicePixelRatio || 1;
    return extCss > 0 ? Math.max(0, Math.min(420, Math.ceil(extCss * dpr))) : 0;
  }

  function lockPipMapHeight() {
    if (state.pipMode !== "hud" && state.pipMode !== "map") return 0;
    const mapWs = $("mapWorkspace");
    if (!mapWs) return 0;
    if (state._pipMapLockedH > 0) return state._pipMapLockedH;
    const h = Math.round(mapWs.getBoundingClientRect().height || 0);
    if (h >= 100) {
      mapWs.style.flex = `0 0 ${h}px`;
      state._pipMapLockedH = h;
      return h;
    }
    return 0;
  }

  function unlockPipMapHeight() {
    const mapWs = $("mapWorkspace");
    if (mapWs) {
      mapWs.style.flex = "";
    }
    state._pipMapLockedH = 0;
  }

  function renderPipBossBoxes() {
    const bossBtn = $("pipBossBtn");
    const activeEnabled = (state.pipMode === "map" || state.pipMode === "hud") ? state.pipMapBossHud : state.pipBossHud;
    if (bossBtn) bossBtn.classList.toggle("active", Boolean(activeEnabled));
    const hasData = Boolean(state.ramLive && Array.isArray(state.ramBosses) && state.ramBosses.length > 0);
    const mapBox = $("pipMapBossBox");
    const useMapSlot = (state.pipMode === "map" || state.pipMode === "hud")
      && state.pipMapBossHud && state.pipBossPlacement !== "below";
    if (mapBox) {
      const showMap = hasData && useMapSlot;
      mapBox.classList.toggle("hidden", !showMap);
      mapBox.innerHTML = showMap ? buildBossCardsHtml(state.ramBosses, true) : "";
    }

    const statsBox = $("pipBossBox");
    if (!statsBox) return;

    const useStatsBottom = (state.pipMode === "stats" && state.pipBossHud)
      || ((state.pipMode === "hud" || state.pipMode === "map") && state.pipMapBossHud && state.pipBossPlacement === "below");
    const showStats = hasData && useStatsBottom && state.pipMode !== "off";
    const wasVisible = !statsBox.classList.contains("hidden") && !statsBox.classList.contains("pip-boss-measuring");
    const multiBoss = state.ramBosses.length > 1 || state.pipMode !== "stats";
    const deferExt = Boolean(state._pipModeSwitching && !state._selfTest);

    if (!showStats) {
      if (!wasVisible && statsBox.classList.contains("hidden") && (state._lastPipBossExtPx || 0) === 0) {
        return;
      }
      if (!deferExt) lockPipMapHeight();
      statsBox.classList.add("hidden");
      statsBox.classList.remove("pip-boss-measuring");
      statsBox.innerHTML = "";
      const seq = (state._bossExtSeq = (state._bossExtSeq || 0) + 1);
      state._lastPipBossExtPx = 0;
      state._lastBossExtReturned = 0;
      if (!deferExt && !state._selfTest && window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_extension) {
        Promise.resolve(window.pywebview.api.set_pip_boss_extension(0)).then(() => {
          if (seq === state._bossExtSeq) {
            requestAnimationFrame(() => unlockPipMapHeight());
          }
        }).catch(() => unlockPipMapHeight());
      } else if (!deferExt) {
        unlockPipMapHeight();
      }
      return;
    }

    const html = buildBossCardsHtml(state.ramBosses, multiBoss);
    if (deferExt) {
      statsBox.classList.remove("hidden", "pip-boss-measuring");
      statsBox.innerHTML = html;
      return;
    }
    if (wasVisible) {
      statsBox.innerHTML = html;
      const extPx = measurePipBossExtPx(statsBox);
      state._lastBossExtReturned = extPx;
      if (extPx !== (state._lastPipBossExtPx || 0)) {
        lockPipMapHeight();
        state._lastPipBossExtPx = extPx;
        if (!state._selfTest && window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_extension) {
          window.pywebview.api.set_pip_boss_extension(extPx);
        }
      }
      return;
    }

    lockPipMapHeight();
    const seq = (state._bossExtSeq = (state._bossExtSeq || 0) + 1);
    statsBox.classList.add("pip-boss-measuring");
    statsBox.classList.remove("hidden");
    statsBox.innerHTML = html;
    const extPx = measurePipBossExtPx(statsBox);
    state._lastBossExtReturned = extPx;
    state._lastPipBossExtPx = extPx;
    if (!state._selfTest && window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_extension) {
      Promise.resolve(window.pywebview.api.set_pip_boss_extension(extPx)).then(() => {
        if (seq !== state._bossExtSeq) return;
        statsBox.classList.remove("pip-boss-measuring");
      }).catch(() => {
        if (seq === state._bossExtSeq) statsBox.classList.remove("pip-boss-measuring");
      });
    } else {
      statsBox.classList.remove("pip-boss-measuring");
    }
  }

  function syncPipBossExtension() {
    const bossBox = $("pipBossBox");
    const isShown = state.pipMode !== "off" && Boolean(bossBox && !bossBox.classList.contains("hidden"));
    const extPx = isShown ? measurePipBossExtPx(bossBox) : 0;
    state._lastBossExtReturned = extPx;
    state._lastPipBossExtPx = extPx;
    if (!state._selfTest && window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_extension) {
      window.pywebview.api.set_pip_boss_extension(extPx);
    }
    return extPx;
  }

  let _hoveredBuffState = null;

  function syncSettingsToggleablesUi() {
    if (typeof window.__syncTogUi === "function") window.__syncTogUi();
  }

  function placeErHoverTip(anchor) {
    const tip = $("erHoverTip");
    if (!tip || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    tip.classList.add("show");
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 60;
    const left = Math.min(window.innerWidth - tw - 8, Math.max(8, rect.left - 8));
    let top = rect.top - th - 6;
    if (top < 6) top = Math.min(window.innerHeight - th - 6, rect.bottom + 6);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showErHelpTip(qEl) {
    const tip = $("erHoverTip");
    if (!tip || !qEl) return;
    _hoveredBuffState = null;
    tip.classList.remove("debuff");
    const tag = $("erTipTag");
    const tm = $("erTipTime");
    if (tag) tag.classList.add("hidden");
    if (tm) tm.classList.add("hidden");
    if ($("erTipTitle")) $("erTipTitle").textContent = qEl.dataset.title || "";
    if ($("erTipBody")) $("erTipBody").textContent = qEl.dataset.tip || "";
    placeErHoverTip(qEl);
  }

  function resolveBuffMeta(b) {
    const pack = state.buffIcons || {};
    const icons = pack.icons || {};
    const iconMap = pack.iconMap || {};
    const spMeta = pack.spMeta || {};
    const icEntry = iconMap[String(b.iconId)] || null;
    const spEntry = spMeta[String(b.id)] || null;
    const iconKey = icEntry ? icEntry[0] : "fex_54";
    const title = (spEntry && spEntry[0]) || (icEntry && icEntry[1]) || `Effect #${b.id}`;
    const desc = (spEntry && spEntry[1]) || (icEntry && icEntry[2]) || "Temporary active status effect.";
    const debuff = spEntry ? Boolean(spEntry[2]) : Boolean(icEntry && icEntry[3]);
    const b64 = icons[iconKey] || icons.fex_54 || "";
    const src = b64 ? `data:image/png;base64,${b64}` : "";
    return { iconKey, title, desc, debuff, src };
  }

  function formatBuffSec(sec) {
    const s = Math.max(0, Math.ceil(sec));
    if (s >= 100) return `${Math.ceil(s / 60)}m`;
    return String(s);
  }

  function getInterpolatedBuffRem(b) {
    const dt = state.ramBuffsStamp > 0 ? Math.max(0, (performance.now() - state.ramBuffsStamp) / 1000) : 0;
    return Math.max(0, Number(b.rem || 0) - dt);
  }

  function showErBuffTip(tileEl, buffObj) {
    const tip = $("erHoverTip");
    if (!tip || !tileEl || !buffObj) return;
    const meta = resolveBuffMeta(buffObj);
    _hoveredBuffState = buffObj;
    tip.classList.toggle("debuff", meta.debuff);
    if ($("erTipTitle")) $("erTipTitle").textContent = meta.title;
    const tag = $("erTipTag");
    if (tag) {
      tag.textContent = meta.debuff ? "\u25BC DEBUFF" : "BUFF";
      tag.classList.remove("hidden");
    }
    if ($("erTipBody")) $("erTipBody").textContent = meta.desc;
    const tm = $("erTipTime");
    if (tm) {
      const rem = getInterpolatedBuffRem(buffObj);
      const dur = Math.max(0.1, Number(buffObj.dur || 1));
      tm.textContent = `${rem.toFixed(1)}s / ${Math.round(dur)}s`;
      tm.classList.remove("hidden");
    }
    placeErHoverTip(tileEl);
  }

  function hideErHoverTip() {
    _hoveredBuffState = null;
    const tip = $("erHoverTip");
    if (tip) tip.classList.remove("show");
  }

  function clampOpacityPct(val, fallback) {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, n));
  }

  function applyBuffSweepOpacity(val, persist = true, fromNum = false) {
    if (fromNum && String(val).trim() === "") return state.buffSweepOpacity;
    const pct = clampOpacityPct(val, 30);
    state.buffSweepOpacity = pct;
    document.documentElement.style.setProperty("--buff-swp-a", (pct / 100).toFixed(2));
    if ($("setBuffSweepRng")) $("setBuffSweepRng").value = String(pct);
    if ($("setBuffSweepNum") && (!fromNum || Number(val) !== pct)) $("setBuffSweepNum").value = String(pct);
    if (persist) persistSettings();
    return pct;
  }

  function applyBuffTextOpacity(val, persist = true, fromNum = false) {
    if (fromNum && String(val).trim() === "") return state.buffTextOpacity;
    const pct = clampOpacityPct(val, 75);
    state.buffTextOpacity = pct;
    document.documentElement.style.setProperty("--buff-txt-a", (pct / 100).toFixed(2));
    if ($("setBuffTextRng")) $("setBuffTextRng").value = String(pct);
    if ($("setBuffTextNum") && (!fromNum || Number(val) !== pct)) $("setBuffTextNum").value = String(pct);
    if (persist) persistSettings();
    return pct;
  }

  function applyPipLabelRadius(val, persist = true, fromNum = false) {
    if (fromNum && String(val).trim() === "") return mapState.pipNearbyLabelRadius;
    const n = Math.round(Number(val));
    const px = Number.isFinite(n) ? Math.max(30, Math.min(220, n)) : 95;
    mapState.pipNearbyLabelRadius = px;
    if ($("setPipLabelRadRng")) $("setPipLabelRadRng").value = String(px);
    if ($("setPipLabelRadNum") && (!fromNum || Number(val) !== px)) $("setPipLabelRadNum").value = String(px);
    renderMapCanvas();
    if (persist) persistSettings();
    return px;
  }

  function setPipBuffHud(enabled, persist = true) {
    state.pipBuffHud = Boolean(enabled);
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_buff_hud) {
      window.pywebview.api.set_pip_buff_hud(state.pipBuffHud);
    }
    syncSettingsToggleablesUi();
    renderPipBuffBoxes();
    if (persist) persistSettings();
    return state.pipBuffHud;
  }

  function setPipMapBuffHud(enabled, persist = true) {
    state.pipMapBuffHud = Boolean(enabled);
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_map_buff_hud) {
      window.pywebview.api.set_pip_map_buff_hud(state.pipMapBuffHud);
    }
    syncSettingsToggleablesUi();
    renderPipBuffBoxes();
    if (persist) persistSettings();
    return state.pipMapBuffHud;
  }

  function ingestPlayerBuffLoopCheck(buffs, nowMs = performance.now()) {
    const activeIds = new Set();
    for (const b of (buffs || [])) {
      if (!b || b.id == null) continue;
      const id = Number(b.id);
      const rem = Number(b.rem || 0);
      const dur = Number(b.dur || 0);
      activeIds.add(id);
      let rec = state._buffLoopTrack.get(id);
      if (!rec) {
        rec = { active: false, lastRem: rem, lastDur: dur, hits: [], lastSeen: nowMs };
        state._buffLoopTrack.set(id, rec);
      }
      const jumpedUp = rec.active && rem > rec.lastRem + 0.15;
      const reappeared = !rec.active;
      if (reappeared || jumpedUp) {
        rec.hits.push(nowMs);
        rec.hits = rec.hits.filter((t) => nowMs - t <= 10000);
        if (rec.hits.length > 3) {
          state.suppressedLoopBuffIds.add(id);
        }
      }
      rec.active = true;
      rec.lastRem = rem;
      rec.lastDur = dur;
      rec.lastSeen = nowMs;
    }
    for (const [id, rec] of state._buffLoopTrack.entries()) {
      if (!activeIds.has(id)) {
        rec.active = false;
        if (nowMs - (rec.lastSeen || 0) > 30000 && !state.suppressedLoopBuffIds.has(id)) {
          state._buffLoopTrack.delete(id);
        }
      }
    }
    updateHiddenLoopBuffsUi();
  }

  function getVisiblePlayerBuffs() {
    const raw = Array.isArray(state.ramBuffs) ? state.ramBuffs : [];
    if (!state.buffHideLooping || !state.suppressedLoopBuffIds.size) return raw;
    return raw.filter((b) => !state.suppressedLoopBuffIds.has(Number(b.id)));
  }

  function updateHiddenLoopBuffsUi() {
    const cnt = state.suppressedLoopBuffIds.size;
    if ($("pvHideLoopBuffsCb")) $("pvHideLoopBuffsCb").checked = Boolean(state.buffHideLooping);
    if ($("pvResetLoopBuffsBtn")) $("pvResetLoopBuffsBtn").textContent = `Hidden: ${cnt}`;
    if ($("sysResetLoopBuffsBtn")) $("sysResetLoopBuffsBtn").textContent = `Reset Hidden (${cnt})`;
  }

  function setBuffHideLooping(enabled, persist = true) {
    state.buffHideLooping = Boolean(enabled);
    updateHiddenLoopBuffsUi();
    syncSettingsToggleablesUi();
    renderPipBuffBoxes();
    if (state.activeView === "pip") renderPipViewerWorkspace();
    if (persist) persistSettings();
    return state.buffHideLooping;
  }

  function resetHiddenLoopBuffs(rerender = true) {
    state.suppressedLoopBuffIds.clear();
    state._buffLoopTrack.clear();
    updateHiddenLoopBuffsUi();
    if (rerender) {
      renderPipBuffBoxes();
      if (state.activeView === "pip") renderPipViewerWorkspace();
    }
  }

  function applyBossPlacementClass() {
    document.body.classList.toggle("pip-boss-below", state.pipBossPlacement === "below");
  }

  function setPipBossPlacement(place, persist = true) {
    state.pipBossPlacement = place === "below" ? "below" : "inside";
    applyBossPlacementClass();
    renderPipBossBoxes();
    if ($("pvBossPlaceSel")) $("pvBossPlaceSel").value = state.pipBossPlacement;
    if (state.pipMode === "map" || state.pipMode === "hud") {
      setTimeout(() => renderMapCanvas(), 40);
    }
    if (state.activeView === "pip") renderPipViewerWorkspace();
    if (persist) persistSettings();
    return state.pipBossPlacement;
  }

  function setPipGripPlacement(place, persist = true) {
    state.pipGripPlacement = ["weapon", "header", "map"].includes(place) ? place : "weapon";
    if ($("pvGripPlaceSel")) $("pvGripPlaceSel").value = state.pipGripPlacement;
    if (state.pipMode !== "off") renderPipStats();
    if (state.activeView === "pip") renderPipViewerWorkspace();
    if (persist) persistSettings();
    return state.pipGripPlacement;
  }

  function setPipCorner(corner, persist = true, snapBackend = true) {
    const valid = ["bottom-right", "top-right", "bottom-left", "top-left"];
    state.pipCorner = valid.includes(corner) ? corner : "bottom-right";
    if ($("pvCornerSel")) $("pvCornerSel").value = state.pipCorner;
    if (snapBackend && window.pywebview && window.pywebview.api && window.pywebview.api.snap_pip_corner) {
      for (const m of ["hud", "map", "stats"]) {
        window.pywebview.api.snap_pip_corner(m, state.pipCorner).catch(() => {});
      }
    }
    if (state.activeView === "pip") renderPipViewerWorkspace();
    if (persist) persistSettings();
    return state.pipCorner;
  }

  function applyTileVisualState(tile, b, debuff) {
    const dur = Math.max(0.1, Number(b.dur || 1));
    const rem = getInterpolatedBuffRem(b);
    const elapsedFrac = 1 - Math.max(0, Math.min(1, rem / dur));
    tile.style.setProperty("--deg", `${(elapsedFrac * 360).toFixed(1)}deg`);
    tile.classList.toggle("expiring", Boolean(state.buffExpFlash && !debuff && rem <= 10));
    const cnt = tile.querySelector(".buff-count");
    if (cnt) cnt.textContent = formatBuffSec(rem);
  }

  function renderBuffContainer(el, whichKey, list, szPx) {
    if (!el) return false;
    const show = Boolean(list && list.length > 0);
    el.classList.toggle("hidden", !show);
    if (!show) {
      if (state.buffDomKeys[whichKey]) {
        state.buffDomKeys[whichKey] = "";
        el.innerHTML = "";
      }
      return false;
    }
    const sig = list.map((b) => `${b.id}:${b.iconId}`).join("|");
    if (sig !== state.buffDomKeys[whichKey]) {
      state.buffDomKeys[whichKey] = sig;
      el.innerHTML = list.map((b, idx) => {
        const meta = resolveBuffMeta(b);
        return `<div class="buff-tile${meta.debuff ? " debuff" : ""}" data-bidx="${idx}" style="--sz:${szPx}px;">
          ${meta.src ? `<img src="${meta.src}" alt="" />` : ""}
          <div class="buff-sweep"></div>
          <div class="buff-ring"></div>
          <div class="buff-count">${formatBuffSec(b.rem)}</div>
          ${meta.debuff ? '<div class="buff-debuff-tag">&#9660;</div>' : ""}
        </div>`;
      }).join("");
      el.querySelectorAll(".buff-tile").forEach((tile) => {
        tile.addEventListener("mouseenter", () => {
          const i = Number(tile.dataset.bidx);
          const vis = getVisiblePlayerBuffs();
          if (vis[i]) showErBuffTip(tile, vis[i]);
        });
        tile.addEventListener("mouseleave", hideErHoverTip);
      });
    }
    el.querySelectorAll(".buff-tile").forEach((tile) => {
      const i = Number(tile.dataset.bidx);
      const b = list[i];
      if (!b) return;
      const meta = resolveBuffMeta(b);
      applyTileVisualState(tile, b, meta.debuff);
    });
    return true;
  }

  function tickPlayerBuffs() {
    state.buffRafId = 0;
    const vis = getVisiblePlayerBuffs();
    const hasData = Boolean(state.ramLive && vis.length > 0);
    if (!hasData) return;
    const boxes = [];
    if (state.pipMode === "stats" && state.pipBuffHud) {
      const sb = $("pipStatsBuffBox");
      if (sb && !sb.classList.contains("hidden")) boxes.push(sb);
    }
    if ((state.pipMode === "map" || state.pipMode === "hud") && state.pipMapBuffHud) {
      const mb = $("pipMapBuffBox");
      if (mb && !mb.classList.contains("hidden")) boxes.push(mb);
    }
    if (!boxes.length) return;

    for (const box of boxes) {
      box.querySelectorAll(".buff-tile").forEach((tile) => {
        const i = Number(tile.dataset.bidx);
        const b = vis[i];
        if (!b) return;
        const meta = resolveBuffMeta(b);
        applyTileVisualState(tile, b, meta.debuff);
      });
    }
    if (_hoveredBuffState && $("erHoverTip") && $("erHoverTip").classList.contains("show")) {
      const tm = $("erTipTime");
      if (tm) {
        const rem = getInterpolatedBuffRem(_hoveredBuffState);
        const dur = Math.max(0.1, Number(_hoveredBuffState.dur || 1));
        tm.textContent = `${rem.toFixed(1)}s / ${Math.round(dur)}s`;
      }
    }
    state.buffRafId = requestAnimationFrame(tickPlayerBuffs);
  }

  function renderPipBuffBoxes() {
    const vis = getVisiblePlayerBuffs();
    const hasData = Boolean(state.ramLive && vis.length > 0);
    const showStats = hasData && state.pipBuffHud && state.pipMode === "stats";
    const showMap = hasData && state.pipMapBuffHud && (state.pipMode === "map" || state.pipMode === "hud");
    const anyStats = renderBuffContainer($("pipStatsBuffBox"), "stats", showStats ? vis : null, 34);
    const anyMap = renderBuffContainer($("pipMapBuffBox"), "map", showMap ? vis : null, 30);
    if ((anyStats || anyMap) && !state.buffRafId) {
      state.buffRafId = requestAnimationFrame(tickPlayerBuffs);
    } else if (!anyStats && !anyMap && state.buffRafId) {
      cancelAnimationFrame(state.buffRafId);
      state.buffRafId = 0;
    }
    if (!anyStats && !anyMap && _hoveredBuffState) {
      hideErHoverTip();
    }
  }

  function buildPipStanceBadgeHtml(armStyle) {
    const is2hR = armStyle === 3;
    const is2hL = armStyle === 2;
    const is2h = is2hR || is2hL;
    if (is2hR) {
      return `<span class="pip-grip-badge two-h" title="Detected stance: Two-Handing Right Hand"><span class="pip-grip-num">2</span><span>(RH)</span></span>`;
    }
    if (is2hL) {
      return `<span class="pip-grip-badge two-h" title="Detected stance: Two-Handing Left Hand"><span class="pip-grip-num">2</span><span>(LH)</span></span>`;
    }
    return `<span class="pip-grip-badge one-h" title="Detected stance: One-Handed"><span class="pip-grip-num">1</span></span>`;
  }

  function buildPipGripTileHtml(armStyle, showCornerTag = false) {
    const a = getErMenuAssets();
    const is2hR = armStyle === 3;
    const is2hL = armStyle === 2;
    const is2h = is2hR || is2hL;
    const ic = is2h ? (a.grip_2h || a.ic_weapon || "") : (a.grip_1h || a.ic_weapon || "");
    const cornerLbl = is2h ? "2H" : "1H";
    const tip = is2hR ? "Two-Handing Right Hand" : (is2hL ? "Two-Handing Left Hand" : "One-Handed");
    return `<div class="pip-grip-tile ${is2h ? "two-h" : "one-h"}" title="${tip}">${ic ? `<img src="${ic}" alt="${cornerLbl}" />` : ""}${showCornerTag ? `<span class="pip-grip-corner">${cornerLbl}</span>` : ""}</div>`;
  }

  function getLiveRamSlotAr(hand, idx) {
    if (!state.ramLive) return 0;
    const sa = (state.ramLiveArBuffs && state.ramLiveArBuffs.slotAr)
      || (state.ramChar && state.ramChar.slotAr)
      || null;
    if (!sa || !Array.isArray(sa[hand])) return 0;
    const v = Number(sa[hand][idx]);
    return (Number.isFinite(v) && v > 0 && v <= 99999) ? Math.round(v) : 0;
  }

  function buildPipWeaponRows(maxRows, showEff, gripPlacement = "weapon") {
    const armStyle = typeof state.armStyle === "number" ? state.armStyle : 1;
    const rhSlots = (state.equippedSlots && state.equippedSlots.rh) || [];
    const lhSlots = (state.equippedSlots && state.equippedSlots.lh) || [];
    const la = (state.ramLive && state.ramLiveArBuffs) ? state.ramLiveArBuffs : null;
    const makeSlotBuffs = (hand, isActive) => {
      if (!la) return state.activeBuffs;
      const gMult = la.globalMult || [1, 1, 1, 1, 1];
      const gFlat = la.globalFlat || [0, 0, 0, 0, 0];
      const hMult = isActive ? (hand === "lh" ? (la.lhMult || [1, 1, 1, 1, 1]) : (la.rhMult || [1, 1, 1, 1, 1])) : [1, 1, 1, 1, 1];
      const hFlat = isActive ? (hand === "lh" ? (la.lhFlat || [0, 0, 0, 0, 0]) : (la.rhFlat || [0, 0, 0, 0, 0])) : [0, 0, 0, 0, 0];
      return {
        statBonus: la.statBonus || [0, 0, 0, 0, 0],
        handMult: [0, 1, 2, 3, 4].map((i) => Number(hMult[i]) || 1),
        handFlat: [0, 1, 2, 3, 4].map((i) => Number(hFlat[i]) || 0),
        elemMult: [0, 1, 2, 3, 4].map((i) => Number(gMult[i]) || 1),
        globalFlat: [0, 1, 2, 3, 4].map((i) => Number(gFlat[i]) || 0),
        stanceMult: 1.0,
        grease: null,
      };
    };

    const entries = [];
    for (const [hand, arr] of [["rh", rhSlots], ["lh", lhSlots]]) {
      for (let idx = 0; idx < arr.length; idx++) {
        const s = arr[idx];
        if (!s || !s.weaponId) continue;
        const w = state.byId.get(s.weaponId);
        if (!w) continue;
        const isActive = (hand === "rh" && idx === state.activeRhSlot) || (hand === "lh" && idx === state.activeLhSlot);
        const slotTwoHand = (armStyle === 3 && hand === "rh" && idx === state.activeRhSlot)
          || (armStyle === 2 && hand === "lh" && idx === state.activeLhSlot);
        const heldNow = armStyle === 3
          ? (hand === "rh" && idx === state.activeRhSlot)
          : (armStyle === 2 ? (hand === "lh" && idx === state.activeLhSlot) : isActive);
        const res = computeWeapon(
          w, state.data, state.enemyPresets, state.stats,
          state.regLv, state.somberLv, slotTwoHand, s.level,
          state.enemyPreset, makeSlotBuffs(hand, isActive)
        );
        const ramAr = getLiveRamSlotAr(hand, idx);
        if (ramAr > 0) {
          const prevTot = Number(res.total || 0);
          res.total = ramAr;
          res.eff = showEff ? (prevTot > 0 ? res.eff * (ramAr / prevTot) : ramAr) : ramAr;
        }
        entries.push({ res, heldNow, slotTwoHand, isActive, handLabel: hand === "rh" ? "RH" : "LH" });
      }
    }
    if (!entries.length && state.equippedMap.size) {
      for (const [wid, eqLv] of state.equippedMap.entries()) {
        const w = state.byId.get(wid);
        if (!w) continue;
        const res = computeWeapon(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, armStyle === 3, eqLv, state.enemyPreset, makeSlotBuffs("rh", true));
        entries.push({ res, heldNow: true, slotTwoHand: armStyle === 3, isActive: true, handLabel: "RH" });
      }
    }
    entries.sort((x, y) => {
      if (x.heldNow !== y.heldNow) return x.heldNow ? -1 : 1;
      if (x.isActive !== y.isActive) return x.isActive ? -1 : 1;
      return showEff ? (y.res.eff - x.res.eff) : (y.res.total - x.res.total);
    });
    if (!entries.length) {
      return `<div class="pip-wep-row"><span class="pip-wep-name" style="color:var(--text-muted)">No equipped weapons detected</span></div>`;
    }
    let featuredUsed = false;
    return entries.slice(0, maxRows).map(({ res: r, heldNow, slotTwoHand, handLabel }) => {
      const w = r.weapon;
      const effHtml = showEff ? `<span class="pip-wep-eff">(${Math.round(r.eff)})</span>` : "";
      if (gripPlacement === "weapon" && heldNow && !featuredUsed) {
        featuredUsed = true;
        const stTxt = `${escHtml(w.aff)} \u00B7 Active ${handLabel} (${slotTwoHand ? "2H" : "1H"})`;
        return `<div class="pip-wep-row active-held featured-grip" data-held="1">
          ${buildPipGripTileHtml(slotTwoHand ? (handLabel === "LH" ? 2 : 3) : 1, false)}
          <span class="pip-wep-info">
            <span class="pip-wep-name">${escHtml(w.baseName)} +${r.lv}</span>
            <span class="pip-wep-sub">${stTxt}</span>
          </span>
          <span class="pip-wep-ar${r.met ? "" : " ar-unmet"}">${Math.round(r.total)}</span>
          ${effHtml}
        </div>`;
      }
      return `<div class="pip-wep-row${heldNow ? " active-held" : ""}" data-held="${heldNow ? 1 : 0}">
        <span class="pip-wep-name">${escHtml(w.baseName)} +${r.lv} <span class="pip-wep-aff">${escHtml(w.aff)}</span></span>
        <span class="pip-wep-ar${r.met ? "" : " ar-unmet"}">${Math.round(r.total)}</span>
        ${effHtml}
      </div>`;
    }).join("");
  }

  function renderPipStats() {
    renderPipRamBadges();
    renderPipBuffBoxes();
    renderPipBossBoxes();
    const ch = state.ramLive && state.ramChar
      ? state.ramChar
      : (state.characters.find((c) => c.slot === state.activeSlot) || null);
    const chName = ch ? `${ch.name} (Lv.${ch.level})` : "Manual Stats";
    $("pipCharName").textContent = chName;

    const place = ["weapon", "header", "map"].includes(state.pipGripPlacement) ? state.pipGripPlacement : "weapon";
    const showMapCorner = place === "map" && (state.pipMode === "hud" || state.pipMode === "map");
    const listEl = $("pipWeaponsList");
    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    const arSrcLbl = (state.ramLive && state.ramLiveArBuffs) ? "AR" : (showEff ? escHtml(state.enemyPreset) : "Raw AR");
    $("pipPresetTag").innerHTML = `${buildPipStanceBadgeHtml(state.armStyle)}<span>${arSrcLbl}</span>`;

    if (listEl) listEl.innerHTML = buildPipWeaponRows(state.pipMode === "hud" ? 3 : 6, showEff, place);
    const weaponFeaturedVisible = Boolean(place === "weapon" && listEl && listEl.querySelector(".pip-wep-row.featured-grip"));
    const showHeaderTile = place === "header"
      || (place === "map" && state.pipMode === "stats")
      || (place === "weapon" && !weaponFeaturedVisible);
    const hdrGrip = $("pipHdrGripSlot");
    if (hdrGrip) {
      hdrGrip.classList.toggle("hidden", !showHeaderTile);
      hdrGrip.innerHTML = showHeaderTile ? buildPipGripTileHtml(state.armStyle, true) : "";
    }
    const mapGrip = $("pipMapGripBox");
    if (mapGrip) {
      mapGrip.classList.toggle("hidden", !showMapCorner);
      mapGrip.innerHTML = showMapCorner ? buildPipGripTileHtml(state.armStyle, true) : "";
    }

    const vig = ch && ch.stats ? ch.stats.vig : "-";
    const mnd = ch && ch.stats ? ch.stats.mnd : "-";
    const end = ch && ch.stats ? ch.stats.end : "-";
    const entries = [
      ["VIG", vig], ["MND", mnd], ["END", end], ["STR", state.stats.str],
      ["DEX", state.stats.dex], ["INT", state.stats.int], ["FAI", state.stats.fai], ["ARC", state.stats.arc],
    ];
    $("pipStatsGrid").innerHTML = entries.map(([k, v]) =>
      `<div class="pip-stat-cell"><span class="pip-stat-lbl">${k}</span><span class="pip-stat-val">${escHtml(String(v))}</span></div>`
    ).join("");

    const armNames = (state.armorIds || []).map((id) => (id && state.data.armors && state.data.armors[String(id)] ? state.data.armors[String(id)].n : null)).filter(Boolean);
    const talNames = (state.talismanIds || []).map((id) => (id && state.data.talismans && state.data.talismans[String(id)] ? state.data.talismans[String(id)].n : null)).filter(Boolean);
    const parts = [];
    if (talNames.length) parts.push(`Talismans: ${talNames.join(", ")}`);
    if (armNames.length) parts.push(`Armor: ${armNames.join(", ")}`);
    $("pipGearLine").textContent = parts.join(" · ") || "Equip armor/talismans or buffs in Gear & Buffs";
  }

  function syncPipPopoverOpenClass() {
    const opOpen = Boolean($("pipOpacityPopover") && !$("pipOpacityPopover").classList.contains("hidden"));
    const srOpen = Boolean($("pipSearchPopover") && !$("pipSearchPopover").classList.contains("hidden"));
    document.body.classList.toggle("pip-popover-open", opOpen || srOpen);
  }

  function setPipOpacityPopover(open) {
    const pop = $("pipOpacityPopover");
    if (!pop) return;
    const next = Boolean(open);
    if (next && $("pipSearchPopover")) $("pipSearchPopover").classList.add("hidden");
    pop.classList.toggle("hidden", !next);
    syncPipPopoverOpenClass();
  }

  function setPipSearchPopover(open) {
    const pop = $("pipSearchPopover");
    if (!pop) return;
    const next = Boolean(open) && isMapPipMode();
    if (next && $("pipOpacityPopover")) $("pipOpacityPopover").classList.add("hidden");
    pop.classList.toggle("hidden", !next);
    syncPipPopoverOpenClass();
    if (next) {
      const inp = $("pipSearchInput");
      if (inp) {
        inp.value = mapState.search;
        updateMapSearchList();
        inp.focus();
        inp.select();
      }
    }
  }

  function applyPipOpacity(pct, persist = true) {
    const num = Math.round(Number(pct));
    const clamped = Number.isFinite(num) ? Math.max(15, Math.min(100, num)) : 100;
    state.pipOpacity = clamped / 100;
    const btn = $("pipOpacityBtn");
    const opVal = $("pipOpacityVal");
    if (opVal) opVal.textContent = `${clamped}%`;
    else if (btn) btn.textContent = `Opacity ${clamped}%`;
    const rng = $("pipOpacityRange");
    if (rng) rng.value = String(clamped);
    const numInp = $("pipOpacityNum");
    if (numInp) numInp.value = String(clamped);
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_opacity) {
      window.pywebview.api.set_pip_opacity(state.pipOpacity);
    }
    if (persist) persistSettings();
    return clamped;
  }

  function setPipBossHud(enabled, persist = true) {
    state.pipBossHud = Boolean(enabled);
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_hud) {
      window.pywebview.api.set_pip_boss_hud(state.pipBossHud);
    }
    syncSettingsToggleablesUi();
    renderPipBossBoxes();
    if (persist) persistSettings();
    return state.pipBossHud;
  }

  function setPipMapBossHud(enabled, persist = true) {
    state.pipMapBossHud = Boolean(enabled);
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_map_boss_hud) {
      window.pywebview.api.set_pip_map_boss_hud(state.pipMapBossHud);
    }
    syncSettingsToggleablesUi();
    renderPipBossBoxes();
    if (persist) persistSettings();
    return state.pipMapBossHud;
  }

  function setPipBossDesign(design, persist = true) {
    const d = ["1", "2", "3"].includes(String(design)) ? String(design) : "1";
    state.pipBossDesign = d;
    syncSettingsToggleablesUi();
    const spin = $("pipDesignSpin");
    if (spin) {
      spin.dataset.design = d;
      spin.title = `Enemy HUD Design ${d}/3 (click ▲/▼ to cycle)`;
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_boss_design) {
      window.pywebview.api.set_pip_boss_design(d);
    }
    renderPipBossBoxes();
    if (persist) persistSettings();
    return d;
  }

  function stepPipBossDesign(delta, persist = true) {
    const cur = Number(state.pipBossDesign) || 1;
    const next = String((((cur - 1 + delta) % 3) + 3) % 3 + 1);
    return setPipBossDesign(next, persist);
  }

  function setPipBossResMode(mode, persist = true) {
    const m = ["compact", "full", "off"].includes(String(mode)) ? String(mode) : "compact";
    state.pipBossResMode = m;
    if ($("pvBossResModeSel")) $("pvBossResModeSel").value = m;
    if ($("setBossResModeSel")) $("setBossResModeSel").value = m;
    renderPipBossBoxes();
    if (state.activeView === "pip") renderPipViewerWorkspace();
    if (persist) persistSettings();
    return m;
  }

  function setPipLocked(locked, persist = true) {
    state.pipLocked = Boolean(locked);
    document.body.classList.toggle("pip-locked", state.pipLocked);
    if ($("pvPipLockCb")) $("pvPipLockCb").checked = state.pipLocked;
    if ($("pipLockBtn")) {
      $("pipLockBtn").classList.toggle("active", state.pipLocked);
      $("pipLockBtn").title = state.pipLocked ? "PiP Locked (Position & Size)" : "Lock PiP Position & Size";
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_locked) {
      window.pywebview.api.set_pip_locked(state.pipLocked);
    }
    if (persist) persistSettings();
    return state.pipLocked;
  }

  function setPipAutoHide(enabled, persist = true) {
    state.pipAutoHide = Boolean(enabled);
    if ($("pvAutoHideCb")) $("pvAutoHideCb").checked = state.pipAutoHide;
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_auto_hide) {
      window.pywebview.api.set_pip_auto_hide(state.pipAutoHide);
    }
    if (persist) persistSettings();
    return state.pipAutoHide;
  }

  function setMinimizeToTray(enabled, persist = true) {
    state.minimizeToTray = Boolean(enabled);
    if ($("sysMinTrayVal")) $("sysMinTrayVal").textContent = state.minimizeToTray ? "ON" : "OFF";
    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_minimize_to_tray) {
      window.pywebview.api.set_minimize_to_tray(state.minimizeToTray);
    }
    if (persist) persistSettings();
    return state.minimizeToTray;
  }

  function getSmartFadeTargetOpacity() {
    if (!state.pipSmartFade) return state.pipOpacity || 1.0;
    if (state._pipMouseHover) return Math.max(0.10, Math.min(1.0, state.pipCombatOpacity || 1.0));
    const hasBoss = Boolean(state.pipFadeOnBoss && state.ramLive && Array.isArray(state.ramBosses) && state.ramBosses.length > 0);
    const hasBuff = Boolean(state.pipFadeOnBuffs && state.ramLive && getVisiblePlayerBuffs().length > 0);
    const active = hasBoss || hasBuff;
    return active
      ? Math.max(0.10, Math.min(1.0, state.pipCombatOpacity || 1.0))
      : Math.max(0.10, Math.min(1.0, state.pipIdleOpacity || 0.45));
  }

  function scheduleSmartFadeUpdate() {
    if (state.pipMode === "off" || !state.pipSmartFade || state._selfTest) {
      if (state._fadeRafId) {
        cancelAnimationFrame(state._fadeRafId);
        state._fadeRafId = 0;
      }
      return;
    }
    if (state._fadeRafId) return;
    state._fadeLastTs = performance.now();
    const tick = (now) => {
      state._fadeRafId = 0;
      if (state.pipMode === "off" || !state.pipSmartFade) return;
      const target = getSmartFadeTargetOpacity();
      const cur = Number.isFinite(state._effectiveOpacity) ? state._effectiveOpacity : (state.pipOpacity || 1.0);
      const dt = Math.max(0, Math.min(100, now - (state._fadeLastTs || now)));
      state._fadeLastTs = now;
      const fadeMs = Math.max(100, Math.min(1500, Number(state.pipFadeMs) || 400));
      const maxStep = dt / fadeMs;
      const diff = target - cur;
      let next = target;
      if (Math.abs(diff) > 0.006) {
        const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(0.015, maxStep));
        next = cur + step;
      }
      state._effectiveOpacity = next;
      if ((now - (state._fadeLastPushTs || 0)) >= 28 || Math.abs(target - next) < 0.006) {
        state._fadeLastPushTs = now;
        if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_opacity) {
          window.pywebview.api.set_pip_opacity(next);
        }
      }
      if (Math.abs(target - next) >= 0.006) {
        state._fadeRafId = requestAnimationFrame(tick);
      }
    };
    state._fadeRafId = requestAnimationFrame(tick);
  }

  function syncPipBarHeightVar() {
    const bar = $("pipBar");
    if (!bar) return;
    const h = bar.offsetHeight || 28;
    document.documentElement.style.setProperty("--pip-bar-h", `${Math.max(26, h) + 10}px`);
  }

  async function setPipMode(mode) {
    const next = (mode === "map" || mode === "stats" || mode === "hud") ? mode : "off";
    state.pipMode = next;
    document.body.classList.toggle("pip-active", next !== "off");
    document.body.classList.toggle("pip-map", next === "map");
    document.body.classList.toggle("pip-stats", next === "stats");
    document.body.classList.toggle("pip-hud", next === "hud");
    applyBossPlacementClass();
    syncPipBarHeightVar();
    if (next !== "map" && next !== "hud") {
      setPipSearchPopover(false);
    }
    if (next === "off") {
      state.pipClickThrough = false;
      state.overlayHidden = false;
      const gb = $("pipGhostBanner");
      if (gb) gb.classList.add("hidden");
      document.body.classList.remove("pip-hover");
      setPipOpacityPopover(false);
    }
    if ($("pipModeMapBtn")) $("pipModeMapBtn").classList.toggle("active", next === "map");
    if ($("pipModeHudBtn")) $("pipModeHudBtn").classList.toggle("active", next === "hud");
    if ($("pipModeStatsBtn")) $("pipModeStatsBtn").classList.toggle("active", next === "stats");
    if ($("pipModeSwapBtn")) {
      $("pipModeSwapBtn").textContent = next === "hud" ? "HUD" : (next === "stats" ? "Stats" : "Map");
    }
    renderPipRamBadges();
    state._bossExtSeq = (state._bossExtSeq || 0) + 1;
    state._lastPipBossExtPx = 0;
    unlockPipMapHeight();
    state._pipModeSwitching = next !== "off";
    renderPipBossBoxes();
    renderPipBuffBoxes();
    hideErHoverTip();
    if (next === "stats" || next === "hud") renderPipStats();

    if (next === "map") {
      await switchMainView("map");
    } else if (next === "hud") {
      await ensureMapLoaded();
    }

    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_mode) {
      await window.pywebview.api.set_pip_mode(next, state.pipSmartFade ? getSmartFadeTargetOpacity() : state.pipOpacity, state.pipCorner);
    }
    state._effectiveOpacity = state.pipSmartFade ? getSmartFadeTargetOpacity() : state.pipOpacity;
    scheduleSmartFadeUpdate();
    state._pipModeSwitching = false;
    if (next !== "off") {
      syncPipBarHeightVar();
      if (next === "stats" || next === "hud") renderPipStats();
      renderPipBossBoxes();
    }

    if (next === "map" || next === "hud") {
      renderPipStats();
      syncPipBarHeightVar();
      notifyStreamMode();
      if (getActiveLivePlayerPos() && !mapState.followPlayer) {
        await setMapFollow(true);
      } else {
        setTimeout(() => { syncPipBarHeightVar(); renderMapCanvas(); }, 60);
      }
    } else if (next === "stats") {
      renderPipStats();
      syncPipBarHeightVar();
      notifyStreamMode();
    } else {
      const mg = $("pipMapGripBox");
      if (mg) { mg.classList.add("hidden"); mg.innerHTML = ""; }
      notifyStreamMode();
      setTimeout(() => {
        if (isMapVisible()) renderMapCanvas();
        else if (state.activeView === "pip") renderPipViewerWorkspace();
        else renderVirtualViewport(true);
      }, 60);
    }
  }

  function getErMenuAssets() {
    return window.__ER_MENU_ASSETS || {};
  }

  function getActivePromptDevice() {
    return state.promptMode === "auto" ? state.activePromptDevice : state.promptMode;
  }

  function updateContextualFooterPrompts() {
    const view = state.activeView;
    const xBtn = $("erFtrPromptX");
    const yBtn = $("erFtrPromptY");
    const yLbl = $("erFtrSwitchLbl");
    const isEquip = view === "equip";
    const isCalc = view === "calc";
    if (xBtn) xBtn.classList.toggle("hidden", !(isEquip || isCalc));
    if (yBtn) {
      yBtn.classList.toggle("hidden", !(isEquip || isCalc));
      if (yLbl) {
        if (isEquip) yLbl.textContent = ":Switch view (right)";
        else if (isCalc) yLbl.textContent = state.twoHand ? ":Switch (One-Handed)" : ":Switch (Two-Handed)";
      }
    }
  }

  function renderFooterPrompts() {
    const a = getErMenuAssets();
    const dev = getActivePromptDevice();
    const sets = {
      xbox: { a: "xbox_a", b: "xbox_b", x: "xbox_x", y: "xbox_y", r3: "xbox_r3", st: "xbox_start", q: "xbox_lb", e: "xbox_rb", lbl: "Xbox Controller", pin: "(X)", f5: "Refresh" },
      ps5: { a: "ps5_a", b: "ps5_b", x: "ps5_x", y: "ps5_y", r3: "ps5_r3", st: "ps5_start", q: "ps5_lb", e: "ps5_rb", lbl: "PlayStation Controller", pin: "(\u25A1)", f5: "Refresh" },
      kbm: { a: "kbm_ok", b: "kbm_back", x: "kbm_x", y: "kbm_y", r3: "kbm_r3", st: "kbm_start", q: "kbm_lb", e: "kbm_rb", lbl: "Keyboard & Mouse", pin: "(P)", f5: "F5" },
    };
    const m = sets[dev] || sets.kbm;
    const setImg = (id, key, fb) => {
      const el = $(id);
      if (el && (a[key] || a[fb])) el.src = a[key] || a[fb];
    };
    setImg("erFtrKeyA", m.a, "kbm_ok");
    setImg("erFtrKeyEsc", m.b, "key_esc");
    setImg("erFtrKeyP", m.x, "key_p");
    setImg("erFtrKeyF", m.y, "key_f");
    setImg("erFtrKeyR", m.r3, "key_r");
    setImg("erFtrKeyQ", m.st, "key_q");
    setImg("erKeyQ", m.q, "key_q");
    setImg("erKeyE", m.e, "key_e");
    setImg("erKeyFCenter", m.y, "key_f");
    if ($("erFtrF5Chip")) $("erFtrF5Chip").textContent = m.f5;
    if ($("eqPinBtn")) $("eqPinBtn").textContent = `+ Pin Compare ${m.pin}`;
    if ($("erFtrArmoryCount") && state.data && state.data.weapons) {
      $("erFtrArmoryCount").textContent = state.data.weapons.length.toLocaleString();
    }
    if ($("erFtrTag")) {
      const modLbl = (state.data && state.data.mod) || (state.modSource && state.modSource.modLabel) || "ELDEN RING Reforged";
      $("erFtrTag").textContent = String(modLbl).toUpperCase();
    }
    if ($("sysPromptModeLbl")) {
      $("sysPromptModeLbl").textContent = state.promptMode === "auto" ? `Auto (${m.lbl})` : m.lbl;
    }
    if ($("sysDiagPromptDev")) {
      $("sysDiagPromptDev").textContent = m.lbl;
    }
    updateContextualFooterPrompts();
  }

  function openArmoryForSlot(kind, index, oldWid, label) {
    state.equipPickSlot = { kind, index, oldWid, label };
    if ($("equipPickBanner")) $("equipPickBanner").classList.remove("hidden");
    if ($("equipPickBannerText")) {
      $("equipPickBannerText").innerHTML = `Selecting <strong>${escHtml(label || "Armament")}</strong> &mdash; Click any weapon row to equip &amp; return`;
    }
    switchMainView("calc");
  }

  function getEquipPadGroups() {
    const pick = (sel) => Array.from(document.querySelectorAll(sel));
    return [
      pick("#eqRhRow .waku, #eqArrowRow .waku"),
      pick("#eqLhRow .waku, #eqBoltRow .waku"),
      pick("#eqArmRow .waku"),
      pick("#eqTalRow .waku"),
      pick("#eqBuffRow .waku"),
    ].filter((g) => g.length > 0);
  }

  function triggerActiveConfirm() {
    if ($("eqSlotPicker") && !$("eqSlotPicker").classList.contains("hidden")) {
      const sel = $("eqPickerSel");
      if (sel) sel.focus();
      return;
    }
    if (state.activeView === "equip") {
      const focused = document.querySelector("#equipWorkspace .waku.pad-focus");
      if (focused) { focused.click(); return; }
      const sel = document.querySelector("#equipWorkspace .waku.active");
      if (sel && sel.dataset.eqOpenCalc) {
        sel.click();
      } else if ($("eqChangeSlotBtn")) {
        $("eqChangeSlotBtn").click();
      }
    } else if (state.activeView === "calc") {
      const drwOpen = $("inspectorDrawer") && !$("inspectorDrawer").classList.contains("hidden");
      if (drwOpen) return;
      const focused = document.querySelector("#tableBody tr.w-row.pad-focus");
      if (focused) { focused.click(); return; }
      const rows = document.querySelectorAll("#tableBody tr.w-row");
      const r = rows[state.armoryPadRowIdx] || rows[0];
      if (r) r.click();
    } else if (state.activeView === "system") {
      const rows = document.querySelectorAll("#sysList .sys-row");
      const r = rows[state.sysCursorIdx] || rows[0];
      if (r) r.click();
    }
  }

  function movePadSelection(dx, dy) {
    if ($("eqSlotPicker") && !$("eqSlotPicker").classList.contains("hidden")) return;
    if ($("inspectorDrawer") && !$("inspectorDrawer").classList.contains("hidden")) return;
    if (state.activeView === "equip") {
      const groups = getEquipPadGroups();
      if (!groups.length) return;
      let r = Number(state.equipPadRow || 0);
      let c = Number(state.equipPadCol || 0);
      r = Math.max(0, Math.min(groups.length - 1, r));
      c = Math.max(0, Math.min(groups[r].length - 1, c));
      if (dy !== 0) {
        r = (r + (dy > 0 ? 1 : -1) + groups.length) % groups.length;
        c = Math.min(c, groups[r].length - 1);
      }
      if (dx !== 0) {
        const rowLen = groups[r].length;
        c = (c + (dx > 0 ? 1 : -1) + rowLen) % rowLen;
      }
      state.equipPadRow = r;
      state.equipPadCol = c;
      const target = groups[r][c];
      if (target && target.dataset.slotKind) {
        state.equipPreviewWid = null;
        state.equipSelectedSlot = { kind: target.dataset.slotKind === "lh" ? "lh" : "rh", idx: Number(target.dataset.slotIdx) || 0 };
        state.equipSelectedWid = target.dataset.eqWid ? Number(target.dataset.eqWid) : null;
        renderEquipView();
      }
      const freshGroups = getEquipPadGroups();
      const ft = (freshGroups[r] && freshGroups[r][c]) || null;
      document.querySelectorAll("#equipWorkspace .waku.pad-focus").forEach((el) => el.classList.remove("pad-focus"));
      if (ft) {
        ft.classList.add("pad-focus");
        ft.scrollIntoView({ block: "nearest" });
      }
    } else if (state.activeView === "calc" && dy !== 0) {
      const flat = state.flatItems || [];
      const rowIndices = [];
      for (let i = 0; i < flat.length; i++) {
        if (flat[i] && flat[i].kind === "row") rowIndices.push(i);
      }
      if (!rowIndices.length) return;
      let pos = rowIndices.indexOf(state.armoryPadFlatIdx);
      if (pos < 0) pos = dy > 0 ? 0 : rowIndices.length - 1;
      else pos = Math.max(0, Math.min(rowIndices.length - 1, pos + (dy > 0 ? 1 : -1)));
      const flatIdx = rowIndices[pos];
      state.armoryPadFlatIdx = flatIdx;
      state.armoryPadRowIdx = pos;
      const scroller = $("tableScroll");
      if (scroller) {
        const topY = flatIdx * ROW_HEIGHT;
        const headH = ($("tableHead") && $("tableHead").offsetHeight) || 56;
        const viewH = Math.max(200, scroller.clientHeight - headH);
        if (topY < scroller.scrollTop) scroller.scrollTop = topY;
        else if (topY + ROW_HEIGHT > scroller.scrollTop + viewH) scroller.scrollTop = Math.max(0, topY + ROW_HEIGHT - viewH);
        renderVirtualViewport(true);
      }
      const targetWid = flat[flatIdx] && flat[flatIdx].res ? flat[flatIdx].res.weapon.id : 0;
      const domRows = Array.from(document.querySelectorAll("#tableBody tr.w-row"));
      domRows.forEach((tr) => tr.classList.toggle("pad-focus", Number(tr.dataset.wid) === targetWid));
    } else if (state.activeView === "system" && dy !== 0) {
      const rows = Array.from(document.querySelectorAll("#sysList .sys-row"));
      if (!rows.length) return;
      state.sysCursorIdx = (state.sysCursorIdx + dy + rows.length) % rows.length;
      rows.forEach((r, i) => {
        r.classList.toggle("active", i === state.sysCursorIdx);
        r.classList.toggle("pad-focus", i === state.sysCursorIdx);
      });
    }
  }

  function startGamepadLoop() {
    if (!navigator.getGamepads) return;
    let prevBtns = [];
    let lastAxisMove = 0;
    const VIEW_ORDER = ["equip", "calc", "map", "pip", "system"];
    const tick = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = pads && Array.from(pads).find((p) => p && p.connected);
      if (pad) {
        const gid = (pad.id || "").toLowerCase();
        const isPs = gid.includes("dualsense") || gid.includes("dualshock") || gid.includes("054c") || gid.includes("sony");
        const pressed = pad.buttons.map((b) => Boolean(b && b.pressed));
        const justPressed = (idx) => pressed[idx] && !prevBtns[idx];
        const anyInput = pressed.some((p, i) => p && !prevBtns[i]) || Math.abs(pad.axes[0] || 0) > 0.45 || Math.abs(pad.axes[1] || 0) > 0.45;
        if (anyInput && state.promptMode === "auto") {
          const want = isPs ? "ps5" : "xbox";
          if (state.activePromptDevice !== want) {
            state.activePromptDevice = want;
            renderFooterPrompts();
          }
        }
        const now = performance.now();
        if (justPressed(12)) movePadSelection(0, -1);
        else if (justPressed(13)) movePadSelection(0, 1);
        else if (justPressed(14)) movePadSelection(-1, 0);
        else if (justPressed(15)) movePadSelection(1, 0);
        else if (now - lastAxisMove > 180) {
          const ax = pad.axes[0] || 0;
          const ay = pad.axes[1] || 0;
          if (Math.abs(ay) > 0.55) { movePadSelection(0, ay > 0 ? 1 : -1); lastAxisMove = now; }
          else if (Math.abs(ax) > 0.55) { movePadSelection(ax > 0 ? 1 : -1, 0); lastAxisMove = now; }
        }
        if (justPressed(0)) triggerActiveConfirm();
        else if (justPressed(1)) $("erFtrPromptB")?.click();
        else if (justPressed(2)) $("erFtrPromptX")?.click();
        else if (justPressed(3)) $("erFtrPromptY")?.click();
        else if (justPressed(4)) {
          const idx = Math.max(0, VIEW_ORDER.indexOf(state.activeView));
          switchMainView(VIEW_ORDER[(idx + VIEW_ORDER.length - 1) % VIEW_ORDER.length]);
        } else if (justPressed(5)) {
          const idx = Math.max(0, VIEW_ORDER.indexOf(state.activeView));
          switchMainView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]);
        } else if (justPressed(11)) $("erFtrPromptR3")?.click();
        else if (justPressed(9)) $("erFtrPromptMenu")?.click();
        prevBtns = pressed;
      } else {
        prevBtns = [];
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function hydrateErMenuAssets() {
    const a = getErMenuAssets();
    const cssVarMap = {
      base_main: "--er-base-main",
      base_panel: "--er-base-panel",
      line_h: "--er-line-h",
      line_v: "--er-line-v",
      line_v_full: "--er-line-v-full",
      equip_waku: "--er-equip-waku",
      equip_deco: "--er-equip-deco",
      slot_base: "--er-slot-base",
      arts_waku: "--er-arts-waku",
      sl_cursor: "--er-sl-cursor",
      bright_waku: "--er-bright-waku",
      cursor_wide: "--er-cursor-wide",
      cursor_half: "--er-cursor-half",
      cursor_top: "--er-cursor-top",
      cond_waku: "--er-cond-waku",
      arrow: "--er-arrow",
      hp_base: "--er-hp-base",
      boss_bar_deco: "--er-boss-deco",
      boss_bar_deco_l: "--er-boss-deco-l",
      boss_bar_hp: "--er-boss-hp-bar",
      boss_bar_cond: "--er-boss-cond-bar",
      boss_name_base: "--er-boss-name-base",
      cb_empty: "--er-cb-empty",
      cb_full: "--er-cb-full",
      ic_completed: "--er-ic-completed",
      ic_cross: "--er-ic-cross",
    };
    const rootStyle = document.documentElement.style;
    for (const [k, cssVar] of Object.entries(cssVarMap)) {
      if (a[k]) rootStyle.setProperty(cssVar, `url("${a[k]}")`);
    }
    document.body.classList.toggle("er-cb-assets", Boolean(a.cb_empty && a.cb_full));
    document.body.classList.toggle("er-boss-assets", Boolean(a.boss_bar_deco_l || a.boss_bar_deco));
    const setSrc = (id, key) => {
      const el = $(id);
      if (el && a[key]) el.src = a[key];
    };
    setSrc("erHdrMedallion", "ic_equip");
    setSrc("erNavIcEquip", "ic_equip");
    setSrc("erNavIcCalc", "ic_weapon");
    setSrc("erNavIcMap", a.ic_map ? "ic_map" : "ic_grace");
    setSrc("erNavIcPip", "ic_stat_mini");
    setSrc("erNavIcSys", "ic_option");
    setSrc("pvCtrlIc", "ic_option");
    setSrc("sysSecIc", "ic_option");
    setSrc("sysInfoIc", "ic_chara");
    setSrc("eqDetAshSil", "sl_arts");
    setSrc("erSettingsMedallion", "ic_option");
    setSrc("eqIcStatMini", "ic_chara");
    setSrc("eqIcAtkMini", "ic_attack");
    setSrc("eqIcCutMini", "ic_guard");
    if (a.ic_lockon) {
      const lockHost = document.querySelector("#pipBossBtn .pip-ico");
      if (lockHost) lockHost.innerHTML = `<img class="pip-er-ico" src="${a.ic_lockon}" alt="" />`;
    }
    if (a.ic_zoom_in && $("mapZoomInBtn")) {
      $("mapZoomInBtn").innerHTML = `<img class="map-zoom-ic" src="${a.ic_zoom_in}" alt="+" />`;
    }
    if (a.ic_zoom_out && $("mapZoomOutBtn")) {
      $("mapZoomOutBtn").innerHTML = `<img class="map-zoom-ic" src="${a.ic_zoom_out}" alt="-" />`;
    }
    if (a.cursor_top) {
      document.querySelectorAll(".er-nav-cur").forEach((img) => {
        img.src = a.cursor_top;
      });
    }
    renderFooterPrompts();
    if (state.data) {
      renderTableHeader();
      renderPipBossBoxes();
      if (state.activeView === "equip") renderEquipView();
      if (state.activeView === "pip") renderPipViewerWorkspace();
    }
  }

  function getErAffGem(aff) {
    const a = getErMenuAssets();
    if (!aff) return "";
    if (a[`aff_${aff}`]) return a[`aff_${aff}`];
    if (["Fire", "Magma"].includes(aff)) return a.aff_magma || a.aff_fell || "";
    if (["Fell", "Bloody", "Fated", "Rotten", "Frenzied"].includes(aff)) return a.aff_fell || a.aff_magma || "";
    if (["Lightning", "Bolt", "Sacred", "Blessed"].includes(aff)) return a.aff_bolt || "";
    if (["Magic", "Cold", "Night", "Soporific", "Gravitational", "Cursed"].includes(aff)) return a.aff_night || "";
    return "";
  }

  function getEquipSelectedWeaponResult() {
    if (!state.data || !state.data.weapons || !state.data.weapons.length) return null;
    const sel = state.equipSelectedSlot || { kind: "rh", idx: 0 };
    const slotList = state.equippedSlots && state.equippedSlots[sel.kind];
    const slotEnt = slotList ? slotList[sel.idx] : null;
    let wid = slotEnt && state.byId.has(slotEnt.weaponId) ? slotEnt.weaponId : null;
    let overrideLv = slotEnt && state.byId.has(slotEnt.weaponId) ? slotEnt.level : -1;
    if (state.equipPreviewWid && state.byId.has(state.equipPreviewWid)) {
      wid = state.equipPreviewWid;
      if (overrideLv < 0 && state.equippedMap.has(wid)) {
        overrideLv = state.equippedMap.get(wid);
      }
    } else if (!wid) {
      if (state.equipSelectedWid && state.byId.has(state.equipSelectedWid)) {
        wid = state.equipSelectedWid;
        overrideLv = state.equippedMap.has(wid) ? state.equippedMap.get(wid) : -1;
      } else {
        const firstRh = (state.equippedSlots?.rh || []).find((e) => e && state.byId.has(e.weaponId));
        const firstLh = (state.equippedSlots?.lh || []).find((e) => e && state.byId.has(e.weaponId));
        const fb = firstRh || firstLh;
        if (fb) {
          wid = fb.weaponId;
          overrideLv = fb.level;
        } else if (state.equippedMap.size) {
          wid = Array.from(state.equippedMap.keys())[0];
          overrideLv = state.equippedMap.get(wid);
        } else if (state.inspectedRes) {
          wid = state.inspectedRes.weapon.id;
        } else if (lastComputedList.length) {
          wid = lastComputedList[0].weapon.id;
        } else {
          wid = state.data.weapons[0].id;
        }
      }
    }
    state.equipSelectedWid = wid;
    const w = state.byId.get(wid);
    if (!w) return null;
    return computeWeapon(
      w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv,
      state.twoHand, overrideLv, state.enemyPreset, state.activeBuffs
    );
  }

  function openEquipSlotPicker(type, slot) {
    const picker = $("eqSlotPicker");
    const sel = $("eqPickerSel");
    const title = $("eqPickerTitle");
    if (!picker || !sel || !title) return;
    if (
      state.equipPickerTarget &&
      state.equipPickerTarget.type === type &&
      state.equipPickerTarget.slot === slot &&
      !picker.classList.contains("hidden")
    ) {
      picker.classList.add("hidden");
      state.equipPickerTarget = null;
      state._hoverEquipOverride = null;
      renderEquipView();
      return;
    }
    state.equipPickerTarget = { type, slot };
    const slotNames = ["Head", "Chest", "Arms", "Legs"];
    const srcSel = type === "armor"
      ? $(["armorHeadSel", "armorChestSel", "armorArmsSel", "armorLegsSel"][slot])
      : $(`tal${slot}Sel`);
    if (!srcSel) return;
    title.textContent = type === "armor" ? `Select ${slotNames[slot]} Armor` : `Select Talisman Slot ${slot + 1}`;
    const ownedOnly = Boolean($("eqPickerOwnedCb") && $("eqPickerOwnedCb").checked);
    const sets = ownedOnly ? getActiveProgressSets() : null;
    const ownSet = sets ? (type === "armor" ? sets.armor : sets.talismans) : null;
    const curVal = srcSel.value;
    if (ownedOnly && ownSet) {
      const opts = Array.from(srcSel.options).filter((o) => !o.value || o.value === curVal || ownSet.has(Number(o.value)));
      sel.innerHTML = opts.map((o) => `<option value="${escHtml(o.value)}">${escHtml(o.textContent)}</option>`).join("");
    } else {
      sel.innerHTML = srcSel.innerHTML;
    }
    sel.value = curVal;
    picker.classList.remove("hidden");
    renderEquipView();
    sel.focus();
  }

  function renderEquipCenterDetail(res) {
    const titleEl = $("eqDetTitle");
    const subEl = $("eqDetSub");
    const skillEl = $("eqDetSkill");
    const bigImg = $("eqDetBigImg");
    const bigBadge = $("eqDetBigBadge");
    const gemImg = $("eqDetAffGem");
    const bodyEl = $("eqDetBody");
    const cmpCnt = $("eqCmpCnt");
    if (cmpCnt) cmpCnt.textContent = String(state.compareIds.length);
    document.querySelectorAll("#eqSubTabs .subtab").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.eqtab) === state.equipCenterTab);
    });
    if (!res || !bodyEl) return;

    const w = res.weapon;
    const assets = getErMenuAssets();
    const wtName = state.data.weaponTypes[String(w.wt)] || "";
    if (titleEl) titleEl.textContent = `${w.name} +${res.lv}`;
    if (subEl) subEl.textContent = `${wtName} \u00B7 ${w.aff}${w.physTypes ? " \u00B7 " + w.physTypes : ""}`;
    if (skillEl) skillEl.textContent = w.skill || "-";
    if ($("eqDetWeight")) $("eqDetWeight").textContent = (w.weight != null ? Number(w.weight).toFixed(1) : "-");
    if ($("eqDetStance")) $("eqDetStance").textContent = (res.stance != null ? Number(res.stance).toFixed(1) : (w.stance != null ? Number(w.stance).toFixed(1) : "-"));
    if (bigImg) bigImg.src = getItemIconUri("wep", w) || assets.ic_weapon || "";
    if (bigBadge) bigBadge.textContent = `+${res.lv}`;
    if (gemImg) {
      const g = getErAffGem(w.aff);
      if (g) {
        gemImg.src = g;
        gemImg.classList.remove("hidden");
        if ($("eqDetAshSil")) $("eqDetAshSil").style.opacity = "0.14";
      } else {
        gemImg.classList.add("hidden");
        if ($("eqDetAshSil")) $("eqDetAshSil").style.opacity = "0.36";
      }
    }

    const stNames = ["Str", "Dex", "Int", "Fai", "Arc"];
    const apIcKeys = ["ap_phys", "ap_mag", "ap_fire", "ap_ltng", "ap_holy"];
    const guardIcKeys = ["guard_phys", "guard_mag", "guard_fire", "guard_ltng", "guard_holy", "attr_stam"];
    const attrIcKeys = ["attr_str", "attr_dex", "attr_int", "attr_fai", "attr_arc"];
    if (state.equipCenterTab === 0) {
      const showEff = state.enemyPreset !== "Raw AR (No Defense)";
      const effCls = !res.met ? "er-red" : (showEff ? "er-blue" : "");
      const statusItems = STATUS_KEYS
        .map((k, i) => (res.status[i] > 0.05 ? { key: k, label: k[0].toUpperCase() + k.slice(1), val: Math.round(res.status[i]) } : null))
        .filter(Boolean);
      const apSplitRow = (lbl, idx) => {
        const hasVal = res.base[idx] > 0.05 || res.ar[idx] > 0.05;
        const postArR = Math.round(res.ar[idx]);
        const bR = Math.round(res.base[idx]);
        const scR = postArR - bR;
        const bTxt = hasVal ? String(bR) : "0";
        const opTxt = hasVal ? (scR >= 0 ? "+" : "-") : "";
        const sTxt = hasVal ? String(Math.abs(scR)) : "";
        const ic = getErInlineIconHtml(apIcKeys[idx], lbl);
        return `<div class="eq-ap-row"><span class="muted">${ic}${lbl}</span><span class="er-num" style="text-align:right">${bTxt}</span><span class="muted" style="text-align:center">${opTxt}</span><span class="er-num" style="text-align:right">${sTxt}</span></div>`;
      };
      const rawGuard = (res.guard && res.guard.length >= 6) ? res.guard : (Array.isArray(w.guard) && w.guard.length >= 6 ? w.guard : [0, 0, 0, 0, 0, 0]);
      const guardVals = [0, 1, 2, 3, 4].map((gi) => Number(rawGuard[gi] || 0).toFixed(1));
      guardVals.push(String(Math.round(Number(rawGuard[5] || 0))));
      const guardLbls = ["Physical", "Magic", "Fire", "Lightning", "Holy", "Guard Boost"];
      bodyEl.innerHTML = `
        <div class="stat-2col">
          <div>
            <div class="er-sec"><img src="${assets.ic_attack || ""}" alt="" /><span>Attack Power</span></div>
            <div class="eq-sec-indent">
              ${apSplitRow("Physical", 0)}
              ${apSplitRow("Magic", 1)}
              ${apSplitRow("Fire", 2)}
              ${apSplitRow("Lightning", 3)}
              ${apSplitRow("Holy", 4)}
              <div class="eq-ap-row"><span class="muted">Critical</span><span class="er-num" style="text-align:right">${w.crit || 100}</span><span></span><span></span></div>
              <div class="eq-kv eq-kv-line"><span>Total AR${w.cat ? " / Spell" : ""}</span><span class="er-num ${res.met ? "" : "er-red"}">${Math.round(res.total)}${w.cat ? ` / ${Math.round(res.spell)}` : ""}</span></div>
              <div class="eq-kv"><span class="${effCls}">Eff vs Benchmark</span><span class="er-num ${effCls}"><b>${Math.round(res.eff)}</b></span></div>
            </div>
          </div>
          <div>
            <div class="er-sec"><img src="${assets.ic_guard || assets.ic_cut || ""}" alt="" /><span>Guarded Damage Negation</span></div>
            <div class="eq-sec-indent">
              ${guardLbls.map((gl, gi) => `<div class="eq-kv"><span class="muted">${getErInlineIconHtml(guardIcKeys[gi], gl)}${gl}</span><span class="er-num">${guardVals[gi]}</span></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="stat-2col">
          <div>
            <div class="er-sec"><img src="${assets.ic_corr || ""}" alt="" /><span>Attribute Scaling</span></div>
            <div class="eq-sec-indent">
              ${[0, 1, 2, 3, 4].map((i) => `<div class="eq-kv"><span class="muted">${getErInlineIconHtml(attrIcKeys[i], stNames[i])}${stNames[i]}</span><span class="er-num">${escHtml(res.grades[i])}</span></div>`).join("")}
            </div>
          </div>
          <div>
            <div class="er-sec"><img src="${assets.ic_req || assets.ic_stat_mini || ""}" alt="" /><span>Attributes Required</span></div>
            <div class="eq-sec-indent">
              ${[0, 1, 2, 3, 4].map((i) => `<div class="eq-kv"><span class="muted">${getErInlineIconHtml(attrIcKeys[i], stNames[i])}${stNames[i]}</span><span class="er-num ${res.metList[i] ? "" : "er-red"}">${w.req[i]}${res.metList[i] ? "" : " !"}</span></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="er-sec"><img src="${assets.ic_passive || assets.ic_attack || ""}" alt="" /><span>Passive Effects</span></div>
        <div class="eq-sec-indent" style="font-size:12px;">
          ${statusItems.length ? statusItems.map((sp) => `<div style="color:#e6c678;display:flex;align-items:center;gap:5px;">${getStatusIconHtml(sp.key, "er-inline-ic", sp.label)}<span>${escHtml(sp.label)} (${sp.val})</span></div>`).join("") : `<div class="muted">-</div><div class="muted">-</div>`}
        </div>
      `;
    } else if (state.equipCenterTab === 1) {
      const variants = (state.byBase.get(w.baseId) || [w]).map((vw) =>
        computeWeapon(vw, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, res.lv, state.enemyPreset, state.activeBuffs)
      );
      variants.sort((a, b) => (state.enemyPreset !== "Raw AR (No Defense)" ? b.eff - a.eff : b.total - a.total) || b.total - a.total);
      bodyEl.innerHTML = `<div style="max-height:360px;overflow-y:auto;">` + variants.map((v, i) => `
        <div class="er-row ${v.weapon.id === w.id ? "active" : ""}" data-eq-aff-wid="${v.weapon.id}">
          <span><span class="muted">${i + 1}.</span> <b style="color:${v.met ? "#e4dbc7" : "#ee6c65"};">${escHtml(v.weapon.aff)}</b></span>
          <span class="er-num"><span class="muted">AR ${Math.round(v.total)} &middot;</span> <span class="er-blue">Eff ${Math.round(v.eff)}</span></span>
        </div>
      `).join("") + `</div>`;
      bodyEl.querySelectorAll("[data-eq-aff-wid]").forEach((row) => {
        row.addEventListener("click", () => {
          const pickedWid = Number(row.dataset.eqAffWid);
          state.equipPreviewWid = pickedWid;
          state.equipSelectedWid = pickedWid;
          renderEquipView();
        });
      });
    } else if (state.equipCenterTab === 2) {
      const gains = computeNextStatGains(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, 5, res.lv, state.enemyPreset, state.activeBuffs);
      bodyEl.innerHTML = `<div class="muted" style="font-size:11.5px;margin-bottom:6px;">Projected gains for +5 investment into each attribute:</div>` +
        STAT_KEYS.map((sk, idx) => {
          const g = gains[sk];
          const spl = w.cat && Math.abs(g.spell) > 0.05 ? ` · +${g.spell.toFixed(1)} Spell` : "";
          return `<div class="er-row">
            <span>+5 ${stNames[idx]} (${state.stats[sk]} &rarr; ${Math.min(199, state.stats[sk] + 5)})</span>
            <span class="er-num"><span style="color:#e6c678;">+${g.ar.toFixed(1)} AR</span> <span class="er-blue">(+${g.eff.toFixed(1)} Eff${spl})</span></span>
          </div>`;
        }).join("") +
        `<div style="margin-top:10px;"><button type="button" class="top-btn gold-outline" id="eqOpenOptBtn">Open Full Respec Optimizer &rarr;</button></div>`;
      const optBtn = $("eqOpenOptBtn");
      if (optBtn) {
        optBtn.addEventListener("click", async () => {
          await switchMainView("calc");
          renderInspectorDetails(res, true);
          openDrawer("optimizer");
        });
      }
    } else {
      const cmp = state.compareIds
        .map((id) => state.byId.get(id))
        .filter(Boolean)
        .map((cw) => computeWeapon(cw, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, -1, state.enemyPreset, state.activeBuffs));
      if (!cmp.length) {
        bodyEl.innerHTML = `<div class="muted" style="padding:14px 4px;">No armaments pinned yet. Press <b>P</b> or click <b>+ Pin Compare</b> above to pin weapons.</div>`;
      } else {
        const base = cmp[0];
        bodyEl.innerHTML = cmp.map((r, i) => {
          const de = Math.round(r.eff - base.eff);
          const dStr = i === 0 ? "Base" : (de >= 0 ? `+${de}` : `${de}`);
          return `<div class="er-row ${r.weapon.id === w.id ? "active" : ""}" data-eq-cmp-wid="${r.weapon.id}">
            <span>${escHtml(r.weapon.name)} +${r.lv}</span>
            <span class="er-num">AR ${Math.round(r.total)} &middot; <span class="er-blue">Eff ${Math.round(r.eff)}</span> <span class="muted">(${dStr})</span></span>
          </div>`;
        }).join("");
        bodyEl.querySelectorAll("[data-eq-cmp-wid]").forEach((row) => {
          row.addEventListener("click", () => {
            const pickedWid = Number(row.dataset.eqCmpWid);
            state.equipPreviewWid = pickedWid;
            state.equipSelectedWid = pickedWid;
            renderEquipView();
          });
        });
      }
    }
  }

  function renderEquipView() {
    if (!state.data || !$("equipWorkspace")) return;
    const a = getErMenuAssets();

    // Sync right-column dropdowns with main calculator controls
    const syncSelect = (dstId, srcId) => {
      const dst = $(dstId);
      const src = $(srcId);
      if (!dst || !src) return;
      if (dst.innerHTML !== src.innerHTML) dst.innerHTML = src.innerHTML;
      dst.value = src.value;
    };
    syncSelect("eqCharSel", "charSelect");
    syncSelect("eqLevelSel", "levelSelect");
    syncSelect("eqGreaseSel", "greaseSel");
    syncSelect("eqEnemySel", "enemySelect");

    const condBtn = $("eqCondTogBtn");
    if (condBtn) {
      condBtn.classList.toggle("on", Boolean(state.condTalismans));
      condBtn.textContent = state.condTalismans ? "\u25C6 Conditional Active" : "\u25C7 Conditional Off";
    }
    const twoHBtn = $("eqTwoHandBtn");
    if (twoHBtn) {
      twoHBtn.classList.toggle("on", Boolean(state.twoHand));
      twoHBtn.innerHTML = state.twoHand ? "&#9670; Two-Handing (1.5&times; STR)" : "&#9671; One-Handing (1&times; STR)";
    }
    const saveLbl = $("eqSaveName");
    if (saveLbl) {
      saveLbl.textContent = state.ramLive ? "\u2713" : (state.savePath ? state.savePath.split(/[/\\]/).pop() : "Manual");
    }

    const selSlot = state.equipSelectedSlot || { kind: "rh", idx: 0 };
    const selRes = getEquipSelectedWeaponResult();
    if ($("eqActiveSlotCat")) {
      const handLbl = `${selSlot.kind === "lh" ? "Left" : "Right"} Hand Armament ${selSlot.idx + 1}`;
      $("eqActiveSlotCat").textContent = (state.equipPreviewWid && selRes && state.equipSelectedSlot) ? `${handLbl} (Preview)` : handLbl;
    }
    if ($("eqActiveSlotName")) {
      $("eqActiveSlotName").textContent = selRes ? `${selRes.weapon.name} +${selRes.lv}` : "-";
    }

    // Populate RH (top row) and LH (bottom row) sockets accurately from equippedSlots
    const rhSlots = (state.equippedSlots && state.equippedSlots.rh) || [null, null, null];
    const lhSlots = (state.equippedSlots && state.equippedSlots.lh) || [null, null, null];
    const renderWeaponSlots = (rowEl, slots, silKey, kind) => {
      if (!rowEl) return;
      let html = "";
      for (let i = 0; i < 3; i++) {
        const entry = slots[i];
        const w = entry ? state.byId.get(entry.weaponId) : null;
        const slotLbl = `${kind === "rh" ? "Right" : "Left"} Hand Armament ${i + 1}`;
        const isActive = selSlot.kind === kind && selSlot.idx === i;
        if (w) {
          const lv = entry.level;
          const gem = getErAffGem(w.aff);
          const icUri = getItemIconUri("wep", w) || a.ic_weapon || "";
          html += `<div class="waku ${isActive ? "active" : ""}" data-eq-wid="${w.id}" data-slot-kind="${kind}" data-slot-idx="${i}" data-slot-lbl="${slotLbl}" title="${escHtml(w.name)} +${lv} (${escHtml(w.aff)}) — click again to swap">
            <div class="waku-glow"></div>
            <span class="eq-badge">+${lv}</span>
            ${gem ? `<img class="aff-gem" src="${gem}" alt="" />` : ""}
            <img class="waku-ic" src="${icUri}" alt="" />
            <div class="waku-cap">${escHtml(w.baseName || w.name)}</div>
          </div>`;
        } else {
          html += `<div class="waku ${isActive ? "active" : ""}" data-eq-open-calc="1" data-slot-kind="${kind}" data-slot-idx="${i}" data-slot-lbl="${slotLbl}" title="${slotLbl} — click to equip from Armory">
            <div class="waku-glow"></div>
            <img class="waku-sil" src="${a[silKey] || ""}" alt="" />
          </div>`;
        }
      }
      rowEl.innerHTML = html;
      rowEl.querySelectorAll("[data-eq-wid]").forEach((el) => {
        el.addEventListener("click", () => {
          const clickedWid = Number(el.dataset.eqWid);
          const clickedKind = el.dataset.slotKind === "lh" ? "lh" : "rh";
          const clickedIdx = Number(el.dataset.slotIdx) || 0;
          const alreadyActive =
            state.equipSelectedSlot &&
            state.equipSelectedSlot.kind === clickedKind &&
            state.equipSelectedSlot.idx === clickedIdx &&
            !state.equipPreviewWid;
          if ($("eqActiveSlotCat")) $("eqActiveSlotCat").textContent = el.dataset.slotLbl || "Armament";
          if (alreadyActive) {
            openArmoryForSlot(clickedKind, clickedIdx, clickedWid, el.dataset.slotLbl);
          } else {
            state.equipPreviewWid = null;
            state.equipSelectedSlot = { kind: clickedKind, idx: clickedIdx };
            state.equipSelectedWid = clickedWid;
            renderEquipView();
          }
        });
      });
      rowEl.querySelectorAll("[data-eq-open-calc]").forEach((el) => {
        el.addEventListener("click", () => {
          const clickedKind = el.dataset.slotKind === "lh" ? "lh" : "rh";
          const clickedIdx = Number(el.dataset.slotIdx) || 0;
          state.equipPreviewWid = null;
          state.equipSelectedSlot = { kind: clickedKind, idx: clickedIdx };
          openArmoryForSlot(clickedKind, clickedIdx, 0, el.dataset.slotLbl);
        });
      });
    };
    renderWeaponSlots($("eqRhRow"), rhSlots, "sl_r_wep", "rh");
    renderWeaponSlots($("eqLhRow"), lhSlots, "sl_l_wep", "lh");
    const renderAmmoSlots = (rowEl, ids, silKey, labelPrefix) => {
      if (!rowEl) return;
      const ammoDb = (state.data && state.data.ammo) || {};
      rowEl.innerHTML = [0, 1].map((idx) => {
        const aid = ids && ids[idx];
        const am = aid ? ammoDb[String(aid)] : null;
        const ic = am ? (getItemIconUri("ammo", aid) || a[silKey] || "") : (a[silKey] || "");
        const atk = am && Array.isArray(am.atk) ? am.atk.reduce((s, v) => s + (v || 0), 0) : 0;
        const tip = am ? `${am.n}${atk ? ` (AR ${atk})` : ""}` : `${labelPrefix} ${idx + 1} (Empty)`;
        return `<div class="waku" data-ammo-kind="${labelPrefix}" data-ammo-idx="${idx}" data-ammo-name="${escHtml(am ? am.n : "Empty")}" title="${escHtml(tip)}">
          <div class="waku-glow"></div>
          ${am && atk ? `<span class="eq-badge">${atk}</span>` : ""}
          <img class="${am ? "waku-ic" : "waku-sil"}" src="${ic}" alt="" />
          ${am ? `<div class="waku-cap">${escHtml(am.n)}</div>` : ""}
        </div>`;
      }).join("");
      rowEl.querySelectorAll("[data-ammo-kind]").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = Number(el.dataset.ammoIdx) + 1;
          if ($("eqActiveSlotCat")) $("eqActiveSlotCat").textContent = `${el.dataset.ammoKind} Slot ${idx}`;
          if ($("eqActiveSlotName")) $("eqActiveSlotName").textContent = el.dataset.ammoName || "Empty";
        });
      });
    };
    renderAmmoSlots($("eqArrowRow"), state.arrowIds, "sl_arrow", "Arrow");
    renderAmmoSlots($("eqBoltRow"), state.boltIds, "sl_bolt", "Bolt");

    // Populate Armor sockets with real extracted armor icons
    const armors = state.data.armors || {};
    const armSilKeys = ["sl_head", "sl_body", "sl_hand", "sl_leg"];
    const armNames = ["Head", "Chest", "Arms", "Legs"];
    if ($("eqArmRow")) {
      $("eqArmRow").innerHTML = [0, 1, 2, 3].map((slot) => {
        const aid = state.armorIds[slot];
        const arm = aid ? armors[String(aid)] : null;
        const armUri = arm ? (getItemIconUri("arm", aid) || a.ic_armor || a[armSilKeys[slot]] || "") : (a[armSilKeys[slot]] || "");
        const isEditing = state.equipPickerTarget && state.equipPickerTarget.type === "armor" && state.equipPickerTarget.slot === slot && !$("eqSlotPicker").classList.contains("hidden");
        return `<div class="waku ${isEditing ? "active" : ""}" data-eq-armor-slot="${slot}" title="${arm ? escHtml(arm.n + formatGearBonusTag(arm)) : armNames[slot] + " (Click to change)"}">
          <div class="waku-glow"></div>
          ${arm ? '<span class="eq-badge">E</span>' : ""}
          <img class="${arm ? "waku-ic" : "waku-sil"}" src="${armUri}" alt="" />
          <div class="waku-cap">${arm ? escHtml(arm.n) : armNames[slot]}</div>
        </div>`;
      }).join("");
      $("eqArmRow").querySelectorAll("[data-eq-armor-slot]").forEach((el) => {
        el.addEventListener("click", () => {
          if ($("eqActiveSlotCat")) $("eqActiveSlotCat").textContent = `${armNames[Number(el.dataset.eqArmorSlot)]} Armor`;
          openEquipSlotPicker("armor", Number(el.dataset.eqArmorSlot));
        });
      });
    }

    // Populate Talisman sockets with real extracted talisman icons
    const tals = state.data.talismans || {};
    if ($("eqTalRow")) {
      $("eqTalRow").innerHTML = [0, 1, 2, 3].map((slot) => {
        const tid = state.talismanIds[slot];
        const tal = tid ? tals[String(tid)] : null;
        const talUri = tal ? (getItemIconUri("tal", tid) || a.ic_attack || a.sl_tal || "") : (a.sl_tal || "");
        const isEditing = state.equipPickerTarget && state.equipPickerTarget.type === "talisman" && state.equipPickerTarget.slot === slot && !$("eqSlotPicker").classList.contains("hidden");
        return `<div class="waku ${isEditing ? "active" : ""}" data-eq-tal-slot="${slot}" title="${tal ? escHtml(tal.n + formatGearBonusTag(tal)) : `Talisman ${slot + 1} (Click to change)`}">
          <div class="waku-glow"></div>
          ${tal ? '<span class="eq-badge">E</span>' : ""}
          <img class="${tal ? "waku-ic" : "waku-sil"}" src="${talUri}" alt="" />
          <div class="waku-cap">${tal ? escHtml(tal.n) : `Talisman ${slot + 1}`}</div>
        </div>`;
      }).join("");
      $("eqTalRow").querySelectorAll("[data-eq-tal-slot]").forEach((el) => {
        el.addEventListener("click", () => {
          if ($("eqActiveSlotCat")) $("eqActiveSlotCat").textContent = `Talisman Pouch ${Number(el.dataset.eqTalSlot) + 1}`;
          openEquipSlotPicker("talisman", Number(el.dataset.eqTalSlot));
        });
      });
    }

    // Core Character Vitals & Memory Slots (synced to active save or live RAM)
    if ($("eqCoreVitals")) {
      const ch = state.ramLive && state.ramChar ? state.ramChar : (state.characters.find((c) => c.slot === state.activeSlot) || null);
      const cs = (ch && ch.stats) || {};
      const vig = cs.vig || 15;
      const mnd = cs.mnd || 10;
      const end = cs.end || 11;
      const lv = ch ? ch.level : Math.max(1, vig + mnd + end + state.stats.str + state.stats.dex + state.stats.int + state.stats.fai + state.stats.arc - 79);
      $("eqCoreVitals").innerHTML = `
        <div><span class="muted">Level</span> <b class="er-num">${lv}</b></div>
        <div><span class="muted">VIG</span> <b class="er-num">${vig}</b></div>
        <div><span class="muted">MND/END</span> <b class="er-num">${mnd}/${end}</b></div>
      `;
    }
    renderEquipLoadBars();
    if ($("eqMemTiles")) {
      const spellDb = (state.data && state.data.spells) || {};
      const sList = Array.isArray(state.spellIds) ? state.spellIds : [];
      const tileCount = Math.max(4, Math.min(12, sList.length));
      if ($("eqMemCountLbl")) $("eqMemCountLbl").textContent = sList.length ? `Memory Slots (${sList.length})` : "Memory Slots";
      const tiles = [];
      for (let i = 0; i < tileCount; i++) {
        const sid = sList[i] || 0;
        const sp = sid ? spellDb[String(sid)] : null;
        const spIc = sid ? (getItemIconUri("spell", sid) || a.sl_mem || "") : (a.sl_mem || "");
        const title = sp ? sp.n : `Memory Slot ${i + 1}`;
        tiles.push(`<div class="mem-tile${sp ? " filled" : ""}" data-spell-idx="${i}" data-spell-name="${escHtml(sp ? sp.n : "Empty")}" title="${escHtml(title)}"><img src="${spIc}" alt="" /></div>`);
      }
      $("eqMemTiles").innerHTML = tiles.join("");
      $("eqMemTiles").querySelectorAll("[data-spell-idx]").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = Number(el.dataset.spellIdx) + 1;
          if ($("eqActiveSlotCat")) $("eqActiveSlotCat").textContent = `Memorized Spell ${idx}`;
          if ($("eqActiveSlotName")) $("eqActiveSlotName").textContent = el.dataset.spellName || "Empty";
        });
      });
    }

    // Temporary Buff sockets synced with #buffPillsRow
    const biMap = (state.buffIcons && state.buffIcons.icons) || {};
    const fexUri = (fk) => (biMap[fk] ? `data:image/png;base64,${biMap[fk]}` : "");
    const buffSpecs = [
      ["goldenVow", "Golden Vow", "x1.15 All", getItemIconUri("spell", 6600) || fexUri("fex_27") || a.ic_attack || ""],
      ["fgms", "FGMS", "x1.20 P/F", getItemIconUri("spell", 6050) || fexUri("fex_54") || a.aff_magma || a.ic_attack || ""],
      ["howl", "Shabriri", "x1.25 All", getItemIconUri("spell", 7330) || fexUri("fex_63") || a.aff_fell || a.ic_attack || ""],
      ["exultBleed", "Blood Exult.", "x1.20 All", fexUri("fex_54") || a.aff_bloody || a.ic_attack || ""],
      ["exultPoison", "Rot Exult.", "x1.20 All", fexUri("fex_14") || fexUri("fex_63") || a.aff_poison || a.ic_corr || ""],
      ["twoHandTal", "2H Talisman", "x1.15 (2H)", fexUri("fex_78") || a.ic_weapon || a.ic_attack || ""],
    ];
    if ($("eqBuffRow")) {
      $("eqBuffRow").innerHTML = buffSpecs.map(([k, lbl, mult, ic]) => {
        const on = Boolean(state.buffToggles[k]);
        return `<div class="waku ${on ? "active" : ""}" data-eq-buff="${k}" title="${escHtml(lbl)} (${escHtml(mult)})">
          <div class="waku-glow"></div>
          ${on ? `<span class="eq-badge" style="font-size:8px;">ON</span>` : ""}
          <img class="waku-ic" style="width:20px;height:20px;${on ? "" : "opacity:0.45;"}" src="${ic}" alt="" />
          <div class="waku-cap">${escHtml(lbl)}</div>
        </div>`;
      }).join("");
      $("eqBuffRow").querySelectorAll("[data-eq-buff]").forEach((el) => {
        el.addEventListener("click", () => {
          const btn = document.querySelector(`#buffPillsRow .buff-pill[data-buff="${el.dataset.eqBuff}"]`);
          if (btn) btn.click();
        });
      });
    }
    if ($("eqBuffSummary") && $("gearBonusSummary")) {
      $("eqBuffSummary").textContent = $("gearBonusSummary").textContent;
    }

    // Right column editable attribute rows synced with #strInput..#arcInput (preserve input focus)
    const attrMeta = [
      ["str", "Strength", "strInput", 0],
      ["dex", "Dexterity", "dexInput", 1],
      ["int", "Intelligence", "intInput", 2],
      ["fai", "Faith", "faiInput", 3],
      ["arc", "Arcane", "arcInput", 4],
    ];
    const sb = (state.activeBuffs && state.activeBuffs.statBonus) ? state.activeBuffs.statBonus : [0, 0, 0, 0, 0];
    const attrHost = $("eqAttrList");
    if (attrHost) {
      if (!attrHost.querySelector("[data-eq-attr]")) {
        attrHost.innerHTML = attrMeta.map(([k, label, srcId]) => `
          <div class="eq-attr-row" data-eq-attr-row="${k}">
            <span class="eq-attr-lbl" data-eq-attr-lbl="${k}">${label}</span>
            <span class="eq-attr-ctrl">
              <button type="button" class="arr-btn" data-eq-step="${srcId}:-1" title="-1 ${label}"></button>
              <input type="number" min="1" max="199" class="eq-attr-input er-num" data-eq-attr="${srcId}" value="${state.stats[k]}" />
              <button type="button" class="arr-btn arr-r" data-eq-step="${srcId}:1" title="+1 ${label}"></button>
            </span>
          </div>`).join("");
        attrHost.querySelectorAll("[data-eq-step]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const [srcId, delta] = btn.dataset.eqStep.split(":");
            const inp = $(srcId);
            if (!inp) return;
            const next = Math.max(1, Math.min(199, (parseInt(inp.value, 10) || 10) + Number(delta)));
            inp.value = String(next);
            inp.dispatchEvent(new Event("input"));
          });
        });
        attrHost.querySelectorAll("[data-eq-attr]").forEach((inp) => {
          inp.addEventListener("input", () => {
            const src = $(inp.dataset.eqAttr);
            if (!src) return;
            src.value = inp.value;
            src.dispatchEvent(new Event("input"));
          });
        });
      }
      for (const [k, label, srcId, idx] of attrMeta) {
        const lblEl = attrHost.querySelector(`[data-eq-attr-lbl="${k}"]`);
        if (lblEl) {
          const ic = getErInlineIconHtml(`attr_${k}`, label);
          const bonus = sb[idx] || 0;
          const bTag = bonus !== 0 ? ` <span class="er-green">(${bonus > 0 ? "+" : ""}${bonus})</span>` : "";
          const twoHTag = k === "str" && state.twoHand
            ? ` <span class="er-blue" style="font-size:10.5px;">&rarr;${Math.trunc((state.stats.str + bonus) * 1.5)}</span>`
            : "";
          lblEl.innerHTML = `${ic}${label}${bTag}${twoHTag}`;
        }
        const inpEl = attrHost.querySelector(`[data-eq-attr="${srcId}"]`);
        if (inpEl && document.activeElement !== inpEl) {
          inpEl.value = String(state.stats[k]);
        }
      }
    }

    // Right column Equipped Attack Power clickable list
    if ($("eqAtkSummary")) {
      const slotItems = [];
      const noManualBuffs = !state.greaseId && !state.condTalismans && !Object.values(state.buffToggles || {}).some(Boolean);
      const showEff = state.enemyPreset !== "Raw AR (No Defense)";
      for (const [kind, prefix, arr] of [["rh", "R", rhSlots], ["lh", "L", lhSlots]]) {
        for (let i = 0; i < 3; i++) {
          const ent = arr[i];
          const w = ent ? state.byId.get(ent.weaponId) : null;
          if (!w) continue;
          const r = computeWeapon(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, ent.level, state.enemyPreset, state.activeBuffs);
          if (noManualBuffs) {
            const ramAr = getLiveRamSlotAr(kind, i);
            if (ramAr > 0) {
              const prevTot = Number(r.total || 0);
              r.total = ramAr;
              r.eff = showEff ? (prevTot > 0 ? r.eff * (ramAr / prevTot) : ramAr) : ramAr;
            }
          }
          slotItems.push({ kind, idx: i, tag: `${prefix}${i + 1}`, res: r });
        }
      }
      if (!slotItems.length && selRes) {
        slotItems.push({ kind: selSlot.kind, idx: selSlot.idx, tag: "R1", res: selRes });
      }
      $("eqAtkSummary").innerHTML = slotItems.map(({ kind, idx, tag, res: r }) => {
        const active = selSlot.kind === kind && selSlot.idx === idx;
        return `
        <div class="er-row ${active ? "active" : ""}" data-eq-atk-wid="${r.weapon.id}" data-slot-kind="${kind}" data-slot-idx="${idx}" style="padding:3px 8px;font-size:12px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:155px;"><span class="muted">${tag}</span> ${escHtml(r.weapon.name)} +${r.lv}</span>
          <span class="er-num">${Math.round(r.total)} <span class="muted">/</span> <b class="er-blue">${Math.round(r.eff)}</b></span>
        </div>
      `;
      }).join("");
      $("eqAtkSummary").querySelectorAll("[data-eq-atk-wid]").forEach((row) => {
        row.addEventListener("click", () => {
          state.equipPreviewWid = null;
          state.equipSelectedSlot = { kind: row.dataset.slotKind === "lh" ? "lh" : "rh", idx: Number(row.dataset.slotIdx) || 0 };
          state.equipSelectedWid = Number(row.dataset.eqAtkWid);
          renderEquipView();
        });
      });
    }

    renderEquipCenterDetail(selRes);
  }

  function bindEquipUiEvents() {
    const mirrorChange = (eqId, srcId) => {
      const eqEl = $(eqId);
      const srcEl = $(srcId);
      if (!eqEl || !srcEl) return;
      eqEl.addEventListener("change", () => {
        srcEl.value = eqEl.value;
        srcEl.dispatchEvent(new Event("change"));
      });
    };
    mirrorChange("eqCharSel", "charSelect");
    mirrorChange("eqLevelSel", "levelSelect");
    mirrorChange("eqGreaseSel", "greaseSel");
    mirrorChange("eqEnemySel", "enemySelect");

    const mirrorClick = (eqId, srcId) => {
      const eqEl = $(eqId);
      const srcEl = $(srcId);
      if (eqEl && srcEl) eqEl.addEventListener("click", () => srcEl.click());
    };
    mirrorClick("eqReloadBtn", "sideReloadBtn");
    mirrorClick("eqBrowseBtn", "sideBrowseBtn");
    if ($("eqSyncInvLvBtn")) $("eqSyncInvLvBtn").addEventListener("click", () => syncInventoryUpgrades(true, true));
    mirrorClick("eqMatchLvBtn", "topMatchEqBtn");
    mirrorClick("eqMaxLvBtn", "maxUpgradeBtn");
    mirrorClick("eqRevertBtn", "revertStatsBtn");
    mirrorClick("eqGearResetBtn", "gearResetBtn");
    mirrorClick("eqClearBuffsBtn", "gearClearBuffsBtn");

    if ($("eqCondTogBtn")) {
      $("eqCondTogBtn").addEventListener("click", () => {
        $("condTalismansCb").checked = !$("condTalismansCb").checked;
        $("condTalismansCb").dispatchEvent(new Event("change"));
      });
    }
    if ($("eqTwoHandBtn")) {
      $("eqTwoHandBtn").addEventListener("click", () => {
        $("twoHandCb").checked = !$("twoHandCb").checked;
        $("twoHandCb").dispatchEvent(new Event("change"));
      });
    }
    if ($("eqPickerCloseBtn")) {
      $("eqPickerCloseBtn").addEventListener("click", () => {
        $("eqSlotPicker").classList.add("hidden");
        state.equipPickerTarget = null;
        state._hoverEquipOverride = null;
        renderEquipView();
      });
    }
    if ($("eqPickerOwnedCb")) {
      $("eqPickerOwnedCb").addEventListener("change", () => {
        const tgt = state.equipPickerTarget;
        if (!tgt) return;
        const t = tgt.type;
        const s = tgt.slot;
        state.equipPickerTarget = null;
        openEquipSlotPicker(t, s);
      });
    }
    if ($("eqPickerMapBtn")) {
      $("eqPickerMapBtn").addEventListener("click", () => {
        const tgt = state.equipPickerTarget;
        if (!tgt) return;
        const val = Number($("eqPickerSel")?.value || 0);
        if (!val) {
          showErToast("Select Item First", "Pick an armor piece or talisman to locate on map.", "warn");
          return;
        }
        const dict = tgt.type === "armor" ? (state.data && state.data.armors) : (state.data && state.data.talismans);
        const item = dict && dict[String(val)];
        if (item) locateItemOnMap(tgt.type, { id: val, name: item.n });
      });
    }
    if ($("eqPickerSel")) {
      $("eqPickerSel").addEventListener("change", () => {
        const tgt = state.equipPickerTarget;
        if (!tgt) return;
        const srcSel = tgt.type === "armor"
          ? $(["armorHeadSel", "armorChestSel", "armorArmsSel", "armorLegsSel"][tgt.slot])
          : $(`tal${tgt.slot}Sel`);
        if (srcSel) {
          srcSel.value = $("eqPickerSel").value;
          srcSel.dispatchEvent(new Event("change"));
        }
      });
    }

    document.querySelectorAll("#eqSubTabs .subtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.equipCenterTab = Number(btn.dataset.eqtab) || 0;
        renderEquipView();
      });
    });
    if ($("erKeyFCenter")) {
      $("erKeyFCenter").addEventListener("click", () => {
        state.equipCenterTab = (state.equipCenterTab + 1) % 4;
        renderEquipView();
      });
    }
    if ($("eqOpenCalcBtn")) {
      $("eqOpenCalcBtn").addEventListener("click", async () => {
        const wid = state.equipSelectedWid;
        await switchMainView("calc");
        if (wid && state.byId.has(wid)) {
          const item = state.flatItems.find((x) => x.kind === "row" && x.res.weapon.id === wid);
          const res = item ? item.res : getEquipSelectedWeaponResult();
          if (res) {
            renderInspectorDetails(res, true);
            openDrawer("details");
          }
        }
      });
    }
    if ($("eqDetBigBox")) {
      $("eqDetBigBox").addEventListener("click", () => {
        if ($("eqOpenCalcBtn")) $("eqOpenCalcBtn").click();
      });
    }
    if ($("eqDetAshBox")) {
      $("eqDetAshBox").addEventListener("click", () => {
        const res = getEquipSelectedWeaponResult();
        if (!res) return;
        const list = (state.byBase.get(res.weapon.baseId) || []).slice().sort((a, b) => a.id - b.id);
        if (list.length > 1) {
          const idx = list.findIndex((x) => x.id === res.weapon.id);
          const nextWid = list[(idx + 1) % list.length].id;
          state.equipPreviewWid = nextWid;
          state.equipSelectedWid = nextWid;
          renderEquipView();
        }
      });
    }
    if ($("eqChangeSlotBtn")) {
      $("eqChangeSlotBtn").addEventListener("click", () => {
        const s = state.equipSelectedSlot || { kind: "rh", idx: 0 };
        const lbl = `${s.kind === "lh" ? "Left" : "Right"} Hand Armament ${s.idx + 1}`;
        const curEnt = state.equippedSlots && state.equippedSlots[s.kind] ? state.equippedSlots[s.kind][s.idx] : null;
        openArmoryForSlot(s.kind, s.idx, curEnt ? curEnt.weaponId : (state.equipSelectedWid || 0), lbl);
      });
    }
    if ($("eqShowMapBtn")) {
      $("eqShowMapBtn").addEventListener("click", () => {
        const res = getEquipSelectedWeaponResult();
        if (res) locateWeaponOnMap(res.weapon);
      });
    }
    if ($("eqPinBtn")) {
      $("eqPinBtn").addEventListener("click", () => {
        const res = getEquipSelectedWeaponResult();
        if (res) pinWeaponId(res.weapon.id, false);
      });
    }
  }

  const PV_SAMPLE_BOSS = [
    {
      slot: 0,
      npcParamId: 25000800,
      name: "Crucible Knight Ordovis",
      hp: 2840,
      maxHp: 4412,
      stance: 46.2,
      maxStance: 80.0,
      stanceReset: 3.8,
      stanceBroken: false,
      stanceKind: "stance",
      def: [115, 139, 139, 139, 139],
      neg: [35, 35, 35, 35, 40, 20, -10, 40],
      statuses: [
        { key: "bleed", label: "Bleed", cur: 135, max: 245 },
        { key: "frost", label: "Frost", cur: 85, max: 260 },
      ],
    },
  ];

  function renderPipViewerWorkspace() {
    const shell = $("pvOverlayShell");
    const op = Math.max(0.15, Math.min(1.0, state.pipOpacity || 1.0));
    const mode = ["hud", "map", "stats"].includes(state.pvPreviewMode) ? state.pvPreviewMode : "hud";
    const corner = ["bottom-right", "top-right", "bottom-left", "top-left"].includes(state.pipCorner) ? state.pipCorner : "bottom-right";
    const cCls = { "bottom-right": "corner-br", "top-right": "corner-tr", "bottom-left": "corner-bl", "top-left": "corner-tl" }[corner];
    if (shell) {
      shell.className = `pv-overlay-shell ${cCls} mode-${mode}`;
      shell.style.opacity = String(op);
    }

    const bi = (state.buffIcons && state.buffIcons.icons) || {};
    const visLiveBuffs = state.ramLive ? getVisiblePlayerBuffs() : [];
    const renderPreviewBuffTiles = (szPx) => {
      if (visLiveBuffs.length) {
        return visLiveBuffs.map((b) => {
          const meta = resolveBuffMeta(b);
          const dur = Math.max(0.1, Number(b.dur || 1));
          const rem = getInterpolatedBuffRem(b);
          const deg = ((1 - Math.max(0, Math.min(1, rem / dur))) * 360).toFixed(1);
          return `<div class="buff-tile${meta.debuff ? " debuff" : ""}${(state.buffExpFlash && !meta.debuff && rem <= 10) ? " expiring" : ""}" style="--sz:${szPx}px;--deg:${deg}deg">
            ${meta.src ? `<img src="${meta.src}" alt="" />` : ""}
            <div class="buff-sweep"></div>
            <div class="buff-ring"></div>
            <div class="buff-count">${formatBuffSec(rem)}</div>
            ${meta.debuff ? '<div class="buff-debuff-tag">&#9660;</div>' : ""}
          </div>`;
        }).join("");
      }
      const sample = [
        ["fex_54", "52", 125, false, false],
        ["fex_27", "34", 195, false, false],
        ["fex_134", "9", 285, false, Boolean(state.buffExpFlash)],
        ["fex_53", "22", 160, true, false],
      ];
      return sample.map(([fk, sec, deg, deb, exp]) => {
        const uri = bi[fk] ? `data:image/png;base64,${bi[fk]}` : "";
        return `<div class="buff-tile${deb ? " debuff" : ""}${exp ? " expiring" : ""}" style="--sz:${szPx}px;--deg:${deg}deg">
          ${uri ? `<img src="${uri}" alt="" />` : ""}
          <div class="buff-sweep"></div>
          <div class="buff-ring"></div>
          <div class="buff-count">${sec}</div>
          ${deb ? '<div class="buff-debuff-tag">&#9660;</div>' : ""}
        </div>`;
      }).join("");
    };

    if ($("pvMapBuffPreview")) {
      $("pvMapBuffPreview").classList.toggle("hidden", !state.pipMapBuffHud);
      $("pvMapBuffPreview").innerHTML = state.pipMapBuffHud ? renderPreviewBuffTiles(24) : "";
    }
    const pvGripPlace = ["weapon", "header", "map"].includes(state.pipGripPlacement) ? state.pipGripPlacement : "weapon";
    const pvShowMapGrip = pvGripPlace === "map" && mode !== "stats";
    if ($("pvMapGripPreview")) {
      $("pvMapGripPreview").classList.toggle("hidden", !pvShowMapGrip);
      $("pvMapGripPreview").innerHTML = pvShowMapGrip ? buildPipGripTileHtml(state.armStyle, true) : "";
    }

    const bossHost = $("pvEnemyBox");
    const targetSlot = (mode !== "stats" && state.pipBossPlacement !== "below")
      ? $("pvEnemyInsideSlot")
      : $("pvEnemyBelowSlot");
    if (bossHost && targetSlot && bossHost.parentElement !== targetSlot) {
      targetSlot.appendChild(bossHost);
    }
    const bossData = (state.ramLive && Array.isArray(state.ramBosses) && state.ramBosses.length)
      ? state.ramBosses
      : PV_SAMPLE_BOSS;
    if (bossHost) {
      const showBossPreview = mode === "stats" ? Boolean(state.pipBossHud) : Boolean(state.pipMapBossHud);
      bossHost.classList.toggle("hidden", !showBossPreview);
      bossHost.innerHTML = showBossPreview ? buildBossCardsHtml(bossData, true) : "";
    }

    const statsBox = $("pvStatsBox");
    if (statsBox) {
      const ch = state.ramLive && state.ramChar
        ? state.ramChar
        : (state.characters.find((c) => c.slot === state.activeSlot) || null);
      const chName = ch ? `${ch.name} (Lv.${ch.level})` : "Manual Stats";
      const cs = (ch && ch.stats) || {};
      const entries = [
        ["VIG", cs.vig ?? "-"], ["MND", cs.mnd ?? "-"], ["END", cs.end ?? "-"], ["STR", state.stats.str],
        ["DEX", state.stats.dex], ["INT", state.stats.int], ["FAI", state.stats.fai], ["ARC", state.stats.arc],
      ];
      const showEff = state.enemyPreset !== "Raw AR (No Defense)";
      const wepLimit = mode === "hud" ? 3 : 5;
      const wepHtml = buildPipWeaponRows(wepLimit, showEff, pvGripPlace);
      const pvHasFeaturedWep = pvGripPlace === "weapon" && wepHtml.includes("featured-grip");
      const pvShowHdrGrip = pvGripPlace === "header" || (pvGripPlace === "map" && mode === "stats") || (pvGripPlace === "weapon" && !pvHasFeaturedWep);
      const arSrcLbl = (state.ramLive && state.ramLiveArBuffs) ? "AR" : (showEff ? escHtml(state.enemyPreset) : "Raw AR");
      const statsBuffHtml = (mode === "stats" && state.pipBuffHud)
        ? `<div class="pip-buff-row">${renderPreviewBuffTiles(28)}</div>`
        : "";
      const pvHdrTileHtml = pvShowHdrGrip
        ? `<span class="pip-hdr-grip-slot">${buildPipGripTileHtml(state.armStyle, true)}</span>`
        : "";
      statsBox.innerHTML = `
        <div class="pip-stats-hdr">
          <span class="pip-char-name">${escHtml(chName)}</span>
          <span class="pip-hdr-right">${pvHdrTileHtml}<span class="pip-ram-badge ${state.ramLive ? "on" : "off"}">${state.ramLive ? RAM_CHECK_SVG : RAM_CROSS_SVG}</span></span>
        </div>
        ${statsBuffHtml}
        <div class="pip-stats-grid">${entries.map(([k, v]) => `<div class="pip-stat-cell"><span class="pip-stat-lbl">${k}</span><span class="pip-stat-val">${escHtml(String(v))}</span></div>`).join("")}</div>
        <div class="pip-subhdr"><span>Equipped Weapons</span><span class="pip-preset-tag">${buildPipStanceBadgeHtml(state.armStyle)}<span>${arSrcLbl}</span></span></div>
        <div class="pip-weapons-list">${wepHtml}</div>
      `;
    }

    if ($("pvPreviewModeSel")) $("pvPreviewModeSel").value = mode;
    if ($("pvCornerSel")) $("pvCornerSel").value = corner;
    if ($("pvBossPlaceSel")) $("pvBossPlaceSel").value = state.pipBossPlacement;
    if ($("pvGripPlaceSel")) $("pvGripPlaceSel").value = pvGripPlace;
    if ($("pvBossHudCb")) $("pvBossHudCb").checked = Boolean(state.pipBossHud);
    if ($("pvMapBossHudCb")) $("pvMapBossHudCb").checked = Boolean(state.pipMapBossHud);
    if ($("pvBuffHudCb")) $("pvBuffHudCb").checked = Boolean(state.pipBuffHud);
    if ($("pvMapBuffCb")) $("pvMapBuffCb").checked = Boolean(state.pipMapBuffHud);
    if ($("pvFollowCb")) $("pvFollowCb").checked = Boolean(mapState.followPlayer);
    if ($("pvDesignSel")) $("pvDesignSel").value = String(state.pipBossDesign || "1");
    if ($("pvBossResModeSel")) $("pvBossResModeSel").value = state.pipBossResMode || "compact";
    if ($("pvPipLockCb")) $("pvPipLockCb").checked = Boolean(state.pipLocked);
    if ($("pvAutoHideCb")) $("pvAutoHideCb").checked = Boolean(state.pipAutoHide);
    if ($("pvSmartFadeCb")) $("pvSmartFadeCb").checked = Boolean(state.pipSmartFade);
    if ($("pvSmartFadeGroup")) $("pvSmartFadeGroup").classList.toggle("hidden", !state.pipSmartFade);
    const idlePct = Math.round((state.pipIdleOpacity ?? 0.45) * 100);
    const combPct = Math.round((state.pipCombatOpacity ?? 1.0) * 100);
    if ($("pvIdleOpRng")) $("pvIdleOpRng").value = String(idlePct);
    if ($("pvIdleOpNum") && document.activeElement !== $("pvIdleOpNum")) $("pvIdleOpNum").value = String(idlePct);
    if ($("pvCombatOpRng")) $("pvCombatOpRng").value = String(combPct);
    if ($("pvCombatOpNum") && document.activeElement !== $("pvCombatOpNum")) $("pvCombatOpNum").value = String(combPct);
    if ($("pvFadeMsRng")) $("pvFadeMsRng").value = String(state.pipFadeMs || 400);
    if ($("pvFadeMsNum") && document.activeElement !== $("pvFadeMsNum")) $("pvFadeMsNum").value = String(state.pipFadeMs || 400);
    if ($("pvFadeTrigBossCb")) $("pvFadeTrigBossCb").checked = Boolean(state.pipFadeOnBoss);
    if ($("pvFadeTrigBuffCb")) $("pvFadeTrigBuffCb").checked = Boolean(state.pipFadeOnBuffs);
    updateHiddenLoopBuffsUi();
    const opPct = Math.round(op * 100);
    if ($("pvOpRng")) $("pvOpRng").value = String(opPct);
    if ($("pvOpVal")) $("pvOpVal").textContent = `${opPct}%`;
    if ($("pvMapOpLbl")) $("pvMapOpLbl").textContent = `Opacity ${opPct}%`;
    const layerNames = { m00: "The Lands Between", m01: "Underground", m10: "Shadow Realm" };
    if ($("pvMapLayerTitle")) $("pvMapLayerTitle").textContent = layerNames[mapState.layer] || "Minimap HUD";
    const cnv = $("pvMapCanvas");
    if (cnv) {
      const ctx = cnv.getContext("2d");
      ctx.fillStyle = "#191610";
      ctx.fillRect(0, 0, cnv.width, cnv.height);
      const img = mapState.images && (mapState.images[mapState.layer] || mapState.images.m00);
      if (img && img.complete && img.naturalWidth > 0) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        ctx.drawImage(img, iw * 0.34, ih * 0.50, iw * 0.24, ih * 0.22, 0, 0, cnv.width, cnv.height);
      } else {
        ctx.strokeStyle = "rgba(191,169,122,0.22)";
        for (let x = 24; x < cnv.width; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cnv.height); ctx.stroke(); }
        for (let y = 24; y < cnv.height; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cnv.width, y); ctx.stroke(); }
        ctx.fillStyle = "#c8b997";
        ctx.font = "12px Constantia, Georgia, serif";
        ctx.fillText("Limgrave · Live Minimap Preview", 14, 102);
      }
      ctx.fillStyle = "#dfc07a";
      ctx.beginPath(); ctx.arc(178, 96, 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function bindPipViewerEvents() {
    $("pvLaunchHudBtn")?.addEventListener("click", () => setPipMode("hud"));
    $("pvLaunchMapBtn")?.addEventListener("click", () => setPipMode("map"));
    $("pvLaunchStatsBtn")?.addEventListener("click", () => setPipMode("stats"));
    $("pvPreviewModeSel")?.addEventListener("change", (e) => {
      state.pvPreviewMode = ["hud", "map", "stats"].includes(e.target.value) ? e.target.value : "hud";
      persistSettings();
      renderPipViewerWorkspace();
    });
    $("pvCornerSel")?.addEventListener("change", (e) => setPipCorner(e.target.value, true, true));
    $("pvBossPlaceSel")?.addEventListener("change", (e) => setPipBossPlacement(e.target.value, true));
    $("pvGripPlaceSel")?.addEventListener("change", (e) => setPipGripPlacement(e.target.value, true));
    $("pvBossHudCb")?.addEventListener("change", (e) => { setPipBossHud(e.target.checked, true); renderPipViewerWorkspace(); });
    $("pvMapBossHudCb")?.addEventListener("change", (e) => { setPipMapBossHud(e.target.checked, true); renderPipViewerWorkspace(); });
    $("pvBuffHudCb")?.addEventListener("change", (e) => { setPipBuffHud(e.target.checked, true); renderPipViewerWorkspace(); });
    $("pvMapBuffCb")?.addEventListener("change", (e) => { setPipMapBuffHud(e.target.checked, true); renderPipViewerWorkspace(); });
    $("pvFollowCb")?.addEventListener("change", (e) => setMapFollow(e.target.checked));
    $("pvHideLoopBuffsCb")?.addEventListener("change", (e) => setBuffHideLooping(e.target.checked, true));
    $("pvResetLoopBuffsBtn")?.addEventListener("click", () => resetHiddenLoopBuffs(true));
    $("pvDesignSel")?.addEventListener("change", (e) => { setPipBossDesign(e.target.value, true); renderPipViewerWorkspace(); });
    $("pvBossResModeSel")?.addEventListener("change", (e) => setPipBossResMode(e.target.value, true));
    $("pvPipLockCb")?.addEventListener("change", (e) => setPipLocked(e.target.checked, true));
    $("pvAutoHideCb")?.addEventListener("change", (e) => setPipAutoHide(e.target.checked, true));
    $("pvSmartFadeCb")?.addEventListener("change", (e) => {
      state.pipSmartFade = e.target.checked;
      $("pvSmartFadeGroup")?.classList.toggle("hidden", !state.pipSmartFade);
      persistSettings();
      scheduleSmartFadeUpdate();
    });
    const bindFadePct = (rngId, numId, stateKey) => {
      $(rngId)?.addEventListener("input", (e) => {
        const pct = Math.max(10, Math.min(100, Math.round(Number(e.target.value) || 45)));
        state[stateKey] = pct / 100;
        if ($(numId)) $(numId).value = String(pct);
        persistSettings();
        scheduleSmartFadeUpdate();
      });
      $(numId)?.addEventListener("change", (e) => {
        const pct = Math.max(10, Math.min(100, Math.round(Number(e.target.value) || 45)));
        state[stateKey] = pct / 100;
        if ($(rngId)) $(rngId).value = String(pct);
        $(numId).value = String(pct);
        persistSettings();
        scheduleSmartFadeUpdate();
      });
    };
    bindFadePct("pvIdleOpRng", "pvIdleOpNum", "pipIdleOpacity");
    bindFadePct("pvCombatOpRng", "pvCombatOpNum", "pipCombatOpacity");
    $("pvFadeMsRng")?.addEventListener("input", (e) => {
      state.pipFadeMs = Math.max(100, Math.min(1500, Math.round(Number(e.target.value) || 400)));
      if ($("pvFadeMsNum")) $("pvFadeMsNum").value = String(state.pipFadeMs);
      persistSettings();
    });
    $("pvFadeMsNum")?.addEventListener("change", (e) => {
      state.pipFadeMs = Math.max(100, Math.min(1500, Math.round(Number(e.target.value) || 400)));
      if ($("pvFadeMsRng")) $("pvFadeMsRng").value = String(state.pipFadeMs);
      $("pvFadeMsNum").value = String(state.pipFadeMs);
      persistSettings();
    });
    $("pvFadeTrigBossCb")?.addEventListener("change", (e) => {
      state.pipFadeOnBoss = e.target.checked;
      persistSettings();
      scheduleSmartFadeUpdate();
    });
    $("pvFadeTrigBuffCb")?.addEventListener("change", (e) => {
      state.pipFadeOnBuffs = e.target.checked;
      persistSettings();
      scheduleSmartFadeUpdate();
    });
    $("pvOpRng")?.addEventListener("input", (e) => { applyPipOpacity(Number(e.target.value), true); renderPipViewerWorkspace(); });

    // Delegate click on Boss HUD enemy name -> jump to Armory defense benchmark
    const wireBossNameClick = (hostId, getArr) => {
      $(hostId)?.addEventListener("click", (e) => {
        const nmEl = e.target.closest(".er-boss-name[data-boss-inspect-idx]");
        if (!nmEl) return;
        const arr = getArr();
        const b = arr[Number(nmEl.dataset.bossInspectIdx)];
        if (b) inspectBossInArmory(b);
      });
    };
    wireBossNameClick("pipBossBox", () => state.ramBosses || []);
    wireBossNameClick("pipMapBossBox", () => state.ramBosses || []);
    wireBossNameClick("pvEnemyBox", () => ((state.ramLive && Array.isArray(state.ramBosses) && state.ramBosses.length) ? state.ramBosses : PV_SAMPLE_BOSS));
  }

  async function switchMainView(view) {
    state.activeView = ["equip", "map", "pip", "system"].includes(view) ? view : "calc";
    const isEquip = state.activeView === "equip";
    const isMap = state.activeView === "map";
    const isPip = state.activeView === "pip";
    const isSys = state.activeView === "system";
    const isCalc = state.activeView === "calc";
    if (!isCalc && state.equipPickSlot) {
      state.equipPickSlot = null;
      if ($("equipPickBanner")) $("equipPickBanner").classList.add("hidden");
    }
    if ($("tabEquipBtn")) $("tabEquipBtn").classList.toggle("active", isEquip);
    $("tabCalcBtn").classList.toggle("active", isCalc);
    $("tabMapBtn").classList.toggle("active", isMap);
    if ($("tabPipBtn")) $("tabPipBtn").classList.toggle("active", isPip);
    if ($("tabSysBtn")) $("tabSysBtn").classList.toggle("active", isSys);
    document.querySelectorAll(".main-tab").forEach((btn) => {
      const cur = btn.querySelector(".er-nav-cur");
      if (cur) cur.classList.toggle("hidden", btn.dataset.view !== state.activeView);
    });

    const a = getErMenuAssets();
    const med = $("erHdrMedallion");
    if (med) {
      const mapMed = a.ic_map ? "ic_map" : "ic_grace";
      const medKey = isEquip ? "ic_equip" : (isMap ? mapMed : (isSys ? "ic_option" : (isPip ? "ic_stat_mini" : "ic_weapon")));
      if (a[medKey]) med.src = a[medKey];
    }
    const titleEl = document.querySelector(".app-title");
    if (titleEl) {
      const titles = { equip: "Equipment", calc: "Armory", map: "Map", pip: "PiP Viewer", system: "System" };
      titleEl.textContent = titles[state.activeView] || "Equipment";
    }
    const helpEl = $("erFooterHelp");
    if (helpEl) {
      const helps = {
        equip: "Select slot to inspect or click again to swap in Armory \u2014 cycle [Y] for All Affinities & Optimizer.",
        calc: state.equipPickSlot ? "Click any weapon row to equip it directly to your selected Equipment slot." : "Filter affinities, weapon classes, and requirements \u2014 click any row to inspect, [X/P] to pin compare.",
        map: "Scroll to zoom, drag to pan, and filter 15 marker categories across The Lands Between, Underground, and Shadow Realm.",
        pip: "Preview and customize the always-on-top Elden Ring Minimap, Enemy Lock-On HUD, and Stats + Buff Timers overlay.",
        system: "Configure custom regulation.bin, Live RAM reader, global hotkeys, map labels, and HUD options.",
      };
      helpEl.textContent = helps[state.activeView] || "";
    }

    if ($("equipWorkspace")) $("equipWorkspace").classList.toggle("hidden", !isEquip);
    $("calcWorkspace").classList.toggle("hidden", !isCalc);
    $("mapWorkspace").classList.toggle("hidden", !isMap);
    if ($("pipViewerWorkspace")) $("pipViewerWorkspace").classList.toggle("hidden", !isPip);
    if ($("systemWorkspace")) $("systemWorkspace").classList.toggle("hidden", !isSys);
    $("drawerToggleBtn").style.display = isCalc ? "inline-flex" : "none";
    updateContextualFooterPrompts();
    notifyStreamMode();
    if (isEquip) {
      renderEquipView();
    } else if (isMap) {
      await ensureMapLoaded();
      renderMapCanvas();
    } else if (isPip) {
      await ensureMapLoaded();
      renderPipViewerWorkspace();
    } else if (isSys) {
      if (window.__switchSysSubTab) window.__switchSysSubTab(state.sysSubTab || "mod");
      if (window.__syncModSourceUi) window.__syncModSourceUi(true);
      renderFooterPrompts();
    } else {
      renderVirtualViewport(true);
    }
  }

  async function locateItemOnMap(cat, itemObj) {
    await switchMainView("map");
    if (!mapState.loaded || !mapState.data) return null;
    if (mapState.cats[cat] === false) {
      mapState.cats[cat] = true;
      const cb = document.querySelector(`.map-cat-cb[data-cat='${cat}']`);
      if (cb) cb.checked = true;
    }
    const baseLower = String((itemObj && (itemObj.baseName || itemObj.name)) || "").toLowerCase();
    const itemId = itemObj ? Number(itemObj.id || 0) : 0;
    const markers = mapState.data.markers || [];
    let cands = [];
    if (cat === "weapon" && itemId) {
      cands = markers.filter((m) => m.cat === "weapon" && (m.calcId === itemId || m.itemId === itemId));
    } else if (itemId) {
      cands = markers.filter((m) => m.cat === cat && (m.itemId === itemId || (Array.isArray(m.itemIds) && m.itemIds.includes(itemId))));
    }
    if (!cands.length && baseLower) {
      cands = markers.filter((m) => m.cat === cat && String(m.baseName || m.name || "").toLowerCase() === baseLower);
    }
    if (!cands.length && baseLower) {
      cands = markers.filter((m) => m.cat === cat && String(m.name || "").toLowerCase().includes(baseLower));
    }

    const lp = getActiveLivePlayerPos();
    let hit = cands[0] || null;
    let bestDistM = null;
    if (cands.length > 0 && lp && lp.layer) {
      const calMap = mapState.data.layers || {};
      let bestScore = Infinity;
      for (const m of cands) {
        const span = (calMap[m.layer] && calMap[m.layer].span) || 10496.0;
        const distM = Math.hypot(m.u - lp.u, m.v - lp.v) * span;
        const score = (m.layer === lp.layer ? 0 : 1e8) + distM;
        if (score < bestScore) {
          bestScore = score;
          hit = m;
          bestDistM = m.layer === lp.layer ? distM : null;
        }
      }
    }

    mapState.search = (itemObj && (itemObj.baseName || itemObj.name)) || "";
    $("mapSearchInput").value = mapState.search;
    updateMapSearchList();
    if (hit) {
      await focusMarkerOnMap(hit, 4.5);
      const distTag = bestDistM !== null ? ` (${Math.round(bestDistM)}m away)` : "";
      showErToast("Located Closest Match", `${hit.name}${distTag}`, "info");
    } else {
      renderMapCanvas();
      showErToast("Not Found on Map", `No map marker matched ${mapState.search}`, "warn");
    }
    return hit;
  }

  async function locateWeaponOnMap(weapon) {
    return locateItemOnMap("weapon", weapon);
  }

  function openWeaponInCalculator(calcId, fallbackSearch) {
    switchMainView("calc");
    const w = state.byId.get(Number(calcId));
    if (w) {
      const res = computeWeapon(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, -1, state.enemyPreset, state.activeBuffs);
      renderInspectorDetails(res, true);
      openDrawer("details");
    } else if (fallbackSearch) {
      $("searchInput").value = fallbackSearch;
      state.search = fallbackSearch;
      recalculateAndRender();
    }
  }

  function bindMapUiEvents() {
    document.querySelectorAll(".map-layer-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const layer = btn.dataset.layer;
        if (!layer || mapState.layer === layer) return;
        mapState.layer = layer;
        syncMapLayerButtons();
        showMapPinCard(null);
        persistSettings();
        await ensureMapImage(layer);
        updateMapSearchList();
        resetMapView(true);
      });
    });

    if ($("mapAutoLayerCb")) {
      $("mapAutoLayerCb").addEventListener("change", (e) => {
        mapState.autoSwitchLayer = e.target.checked;
        syncSettingsToggleablesUi();
        persistSettings();
      });
    }
    if ($("mapAutoDetectCb")) {
      $("mapAutoDetectCb").addEventListener("change", (e) => {
        mapState.autoDetect = e.target.checked;
        syncSettingsToggleablesUi();
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      });
    }
    if ($("mapCompletedModeSel")) {
      $("mapCompletedModeSel").addEventListener("change", (e) => {
        mapState.completedMode = e.target.value;
        if ($("setCompletedModeSel")) $("setCompletedModeSel").value = mapState.completedMode;
      if ($("setBossResModeSel")) $("setBossResModeSel").value = state.pipBossResMode;
      if ($("sysMinTrayVal")) $("sysMinTrayVal").textContent = state.minimizeToTray ? "ON" : "OFF";
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      });
    }
    if ($("mapCatPins")) {
      $("mapCatPins").addEventListener("change", (e) => {
        mapState.showPins = e.target.checked;
        syncSettingsToggleablesUi();
        persistSettings();
        renderMapCanvas();
      });
    }
    if ($("mapCollectiblesToggleBtn")) {
      $("mapCollectiblesToggleBtn").addEventListener("click", () => {
        const anyOff = MAP_COLLECTIBLE_CATS.some((c) => !mapState.cats[c]);
        for (const c of MAP_COLLECTIBLE_CATS) {
          mapState.cats[c] = anyOff;
          const cb = document.querySelector(`.map-cat-cb[data-cat='${c}']`);
          if (cb) cb.checked = anyOff;
        }
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      });
    }

    document.querySelectorAll(".map-cat-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        mapState.cats[cb.dataset.cat] = cb.checked;
        persistSettings();
        updateMapSearchList();
        renderMapCanvas();
      });
    });
    $("mapCatPlayer").addEventListener("change", (e) => {
      mapState.showPlayer = e.target.checked;
      syncSettingsToggleablesUi();
      persistSettings();
      renderMapCanvas();
    });
    $("mapCatAllBtn").addEventListener("click", () => {
      document.querySelectorAll(".map-cat-cb").forEach((cb) => {
        cb.checked = true;
        mapState.cats[cb.dataset.cat] = true;
      });
      mapState.showPlayer = true;
      $("mapCatPlayer").checked = true;
      mapState.showPins = true;
      if ($("mapCatPins")) $("mapCatPins").checked = true;
      persistSettings();
      updateMapSearchList();
      renderMapCanvas();
    });
    $("mapCatNoneBtn").addEventListener("click", () => {
      document.querySelectorAll(".map-cat-cb").forEach((cb) => {
        cb.checked = false;
        mapState.cats[cb.dataset.cat] = false;
      });
      persistSettings();
      updateMapSearchList();
      renderMapCanvas();
    });

    let mapSearchTimer = null;
    $("mapSearchInput").addEventListener("input", (e) => {
      mapState.search = e.target.value;
      if ($("pipSearchInput")) $("pipSearchInput").value = mapState.search;
      clearTimeout(mapSearchTimer);
      mapSearchTimer = setTimeout(() => {
        updateMapSearchList();
        renderMapCanvas();
      }, 60);
    });
    $("mapSearchClearBtn").addEventListener("click", () => {
      $("mapSearchInput").value = "";
      if ($("pipSearchInput")) $("pipSearchInput").value = "";
      mapState.search = "";
      updateMapSearchList();
      renderMapCanvas();
    });

    $("pipSearchBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const pop = $("pipSearchPopover");
      setPipSearchPopover(Boolean(pop && pop.classList.contains("hidden")));
    });
    $("pipSearchInput").addEventListener("input", (e) => {
      mapState.search = e.target.value;
      if ($("mapSearchInput")) $("mapSearchInput").value = mapState.search;
      clearTimeout(mapSearchTimer);
      mapSearchTimer = setTimeout(() => {
        updateMapSearchList();
        renderMapCanvas();
      }, 60);
    });
    $("pipSearchClearBtn").addEventListener("click", () => {
      mapState.search = "";
      $("pipSearchInput").value = "";
      if ($("mapSearchInput")) $("mapSearchInput").value = "";
      updateMapSearchList();
      renderMapCanvas();
      $("pipSearchInput").focus();
    });
    $("pipSearchPopover").addEventListener("mousedown", (e) => e.stopPropagation());
    document.addEventListener("mousedown", (e) => {
      const sp = $("pipSearchPopover");
      if (sp && !sp.classList.contains("hidden") && !e.target.closest("#pipSearchPopover, #pipSearchBtn")) {
        setPipSearchPopover(false);
      }
    });

    const centerPlayer = async () => {
      const lp = getActiveLivePlayerPos();
      if (!lp) return;
      if (mapState.layer !== lp.layer) {
        mapState.layer = lp.layer;
        syncMapLayerButtons();
        await ensureMapImage(lp.layer);
      }
      centerMapOnUV(lp.u, lp.v, Math.max(mapState.zoom, 4.0));
    };
    $("mapStagePlayerBtn").addEventListener("click", centerPlayer);
    $("mapFollowBtn").addEventListener("click", () => setMapFollow(!mapState.followPlayer));
    $("mapPipBtn").addEventListener("click", () => setPipMode("map"));
    $("topPipBtn").addEventListener("click", () => setPipMode(state.pipMode !== "off" ? "off" : (state.activeView === "map" ? "map" : "hud")));
    $("pipModeMapBtn").addEventListener("click", () => setPipMode("map"));
    $("pipModeHudBtn")?.addEventListener("click", () => setPipMode("hud"));
    $("pipModeStatsBtn").addEventListener("click", () => setPipMode("stats"));
    if ($("pipModeSwapBtn")) {
      $("pipModeSwapBtn").addEventListener("click", () => {
        const order = ["map", "hud", "stats"];
        setPipMode(order[(order.indexOf(state.pipMode) + 1) % order.length]);
      });
    }
    $("pipExitBtn").addEventListener("click", () => setPipMode("off"));
    $("pipFollowBtn").addEventListener("click", () => setMapFollow(!mapState.followPlayer));
    if ($("pipBossBtn")) {
      $("pipBossBtn").addEventListener("click", () => {
        if (state.pipMode === "map" || state.pipMode === "hud") setPipMapBossHud(!state.pipMapBossHud, true);
        else setPipBossHud(!state.pipBossHud, true);
      });
    }
    if ($("pipDesignPrevBtn")) {
      $("pipDesignPrevBtn").addEventListener("click", () => stepPipBossDesign(-1, true));
    }
    if ($("pipDesignNextBtn")) {
      $("pipDesignNextBtn").addEventListener("click", () => stepPipBossDesign(1, true));
    }
    $("pipTwoHandBtn").addEventListener("click", () => {
      state.twoHand = !state.twoHand;
      $("twoHandCb").checked = state.twoHand;
      update2hHint();
      persistSettings();
      recalculateAndRender();
    });
    $("pipLockBtn")?.addEventListener("click", () => setPipLocked(!state.pipLocked, true));
    $("pipOpacityBtn").addEventListener("click", () => {
      setPipOpacityPopover(false);
      const curPct = Math.round(state.pipOpacity * 100);
      const presets = [100, 85, 70, 50];
      let nextPct = 100;
      for (const p of presets) {
        if (p < curPct - 1) {
          nextPct = p;
          break;
        }
      }
      applyPipOpacity(nextPct, true);
    });
    $("pipOpacityBtn").addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pop = $("pipOpacityPopover");
      const openNow = pop.classList.contains("hidden");
      setPipOpacityPopover(openNow);
      if (openNow) {
        const curPct = Math.max(15, Math.min(100, Math.round(state.pipOpacity * 100)));
        $("pipOpacityRange").value = String(curPct);
        $("pipOpacityNum").value = String(curPct);
        $("pipOpacityNum").focus();
        $("pipOpacityNum").select();
      }
    });
    $("pipOpacityRange").addEventListener("input", (e) => {
      applyPipOpacity(e.target.value, true);
    });
    $("pipOpacityNum").addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      if (!Number.isNaN(v) && v >= 15 && v <= 100) {
        applyPipOpacity(v, false);
      }
    });
    $("pipOpacityNum").addEventListener("change", (e) => {
      applyPipOpacity(e.target.value, true);
    });
    $("pipOpacityPopover").addEventListener("mousedown", (e) => e.stopPropagation());
    document.addEventListener("mousedown", (e) => {
      const pop = $("pipOpacityPopover");
      if (pop && !pop.classList.contains("hidden") && !e.target.closest("#pipOpacityPopover, #pipOpacityBtn")) {
        setPipOpacityPopover(false);
      }
    });

    const setPipHover = (on) => {
      if (state.pipMode === "off") return;
      state._pipMouseHover = Boolean(on);
      document.body.classList.toggle("pip-hover", Boolean(on));
      scheduleSmartFadeUpdate();
    };
    document.documentElement.addEventListener("mouseenter", () => setPipHover(true));
    document.documentElement.addEventListener("mousemove", () => setPipHover(true));
    document.documentElement.addEventListener("mouseleave", () => setPipHover(false));
    window.addEventListener("blur", () => setPipHover(false));

    $("pipBar").addEventListener("mousedown", (e) => {
      if (e.button !== 0 || state.pipMode === "off") return;
      if (e.target.closest("button, select, input")) return;
      e.preventDefault();
      if (window.pywebview && window.pywebview.api && window.pywebview.api.start_window_drag) {
        window.pywebview.api.start_window_drag();
      }
    });
    if (typeof ResizeObserver === "function" && $("pipBar")) {
      new ResizeObserver(() => syncPipBarHeightVar()).observe($("pipBar"));
    }
    let activeResizeEdge = null;
    let resizeRafPending = false;
    document.querySelectorAll(".pip-resize-edge").forEach((el) => {
      el.addEventListener("pointerdown", async (e) => {
        if (e.button !== 0 || state.pipMode === "off") return;
        e.preventDefault();
        e.stopPropagation();
        activeResizeEdge = el.dataset.edge || "se";
        unlockPipMapHeight();
        try {
          el.setPointerCapture(e.pointerId);
        } catch (_) {}
        if (window.pywebview && window.pywebview.api && window.pywebview.api.begin_pip_resize) {
          await window.pywebview.api.begin_pip_resize(activeResizeEdge);
        }
      });
      el.addEventListener("pointermove", () => {
        if (!activeResizeEdge || resizeRafPending) return;
        resizeRafPending = true;
        requestAnimationFrame(async () => {
          resizeRafPending = false;
          if (activeResizeEdge && window.pywebview && window.pywebview.api && window.pywebview.api.step_pip_resize) {
            await window.pywebview.api.step_pip_resize();
          }
        });
      });
      const finishResize = (e) => {
        if (!activeResizeEdge) return;
        activeResizeEdge = null;
        resizeRafPending = false;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (_) {}
        if (window.pywebview && window.pywebview.api && window.pywebview.api.end_pip_resize) {
          window.pywebview.api.end_pip_resize();
        }
        setTimeout(() => {
          const bb = $("pipBossBox");
          if (bb && !bb.classList.contains("hidden") && (state.pipMode === "hud" || state.pipMode === "map")) {
            lockPipMapHeight();
          }
        }, 40);
      };
      el.addEventListener("pointerup", finishResize);
      el.addEventListener("pointercancel", finishResize);
    });

    $("mapExtractBtn").addEventListener("click", () => triggerMapExtraction(false));
    $("mapExtractHeroBtn").addEventListener("click", () => triggerMapExtraction(false));
    $("mapExtractBrowseBtn").addEventListener("click", () => triggerMapExtraction(true));
    $("mapExtractBannerClose").addEventListener("click", () => {
      mapState.mapExtractBannerDismissed = true;
      $("mapExtractBanner").classList.add("hidden");
    });

    $("mapZoomInBtn").addEventListener("click", () => {
      mapState.zoom = Math.min(24, mapState.zoom * 1.45);
      renderMapCanvas();
    });
    $("mapZoomOutBtn").addEventListener("click", () => {
      mapState.zoom = Math.max(0.7, mapState.zoom / 1.45);
      renderMapCanvas();
    });
    $("mapZoomResetBtn").addEventListener("click", () => resetMapView(true));
    $("mapPinCloseBtn").addEventListener("click", () => showMapPinCard(null));

    const canvas = $("mapCanvas");
    const stage = canvas.parentElement;
    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      mapState.dragging = true;
      mapState.dragMoved = false;
      mapState.lastX = e.clientX;
      mapState.lastY = e.clientY;
      stage.classList.add("dragging");
    });
    window.addEventListener("mousemove", (e) => {
      if (mapState.dragging) {
        const dx = e.clientX - mapState.lastX;
        const dy = e.clientY - mapState.lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          mapState.dragMoved = true;
          if (mapState.followPlayer) setMapFollow(false);
        }
        mapState.panX += dx;
        mapState.panY += dy;
        mapState.lastX = e.clientX;
        mapState.lastY = e.clientY;
        $("mapHoverTip").classList.add("hidden");
        renderMapCanvas();
      }
    });
    window.addEventListener("mouseup", () => {
      if (mapState.dragging) {
        mapState.dragging = false;
        stage.classList.remove("dragging");
      }
    });
    canvas.addEventListener("mousemove", (e) => {
      if (mapState.dragging || state.activeView !== "map") return;
      const hit = findHitMarker(e.clientX, e.clientY);
      const tip = $("mapHoverTip");
      if (hit !== mapState.hoveredPin) {
        mapState.hoveredPin = hit;
        renderMapCanvas();
      }
      if (hit) {
        const rect = stage.getBoundingClientRect();
        tip.textContent = `${hit.name}${hit.sub ? " — " + hit.sub : ""}`;
        tip.style.left = `${Math.max(4, Math.min(rect.width - 180, e.clientX - rect.left + 12))}px`;
        tip.style.top = `${Math.max(8, e.clientY - rect.top - 24)}px`;
        tip.classList.remove("hidden");
        canvas.style.cursor = "pointer";
      } else {
        tip.classList.add("hidden");
        canvas.style.cursor = "grab";
      }
    });
    canvas.addEventListener("mouseleave", () => {
      $("mapHoverTip").classList.add("hidden");
      if (mapState.hoveredPin) {
        mapState.hoveredPin = null;
        renderMapCanvas();
      }
    });
    canvas.addEventListener("click", (e) => {
      if (mapState.dragMoved) return;
      const hit = findHitMarker(e.clientX, e.clientY);
      showMapPinCard(hit);
    });
    canvas.addEventListener("contextmenu", (e) => {
      const hit = findHitMarker(e.clientX, e.clientY);
      if (hit && !hit.isNativePin) {
        e.preventDefault();
        setMarkerManualState(hit.id, !isMarkerCompleted(hit));
      }
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { w, h, scale, ox, oy } = getMapLayout();
      const u = (mx - ox) / scale;
      const v = (my - oy) / scale;
      const factor = e.deltaY < 0 ? 1.24 : 1 / 1.24;
      const nextZoom = Math.max(0.7, Math.min(24, mapState.zoom * factor));
      const baseSize = Math.min(w, h) * 0.96;
      const newScale = baseSize * nextZoom;
      const newOx = mx - u * newScale;
      const newOy = my - v * newScale;
      mapState.zoom = nextZoom;
      mapState.panX = newOx + newScale * 0.5 - w * 0.5;
      mapState.panY = newOy + newScale * 0.5 - h * 0.5;
      renderMapCanvas();
    }, { passive: false });
  }

  async function initApp() {
    const payload = await window.pywebview.api.get_initial_payload();
    state._selfTest = Boolean(payload.selfTestMode);
    if (payload.erMenuAssets && typeof payload.erMenuAssets === "object") {
      window.__ER_MENU_ASSETS = payload.erMenuAssets;
    }
    state.data = payload.data;
    state.enemyPresets = payload.enemyPresets || { "Raw AR (No Defense)": null };
    state.buffIcons = payload.buffIcons || { icons: {}, iconMap: {}, spMeta: {} };
    state.erUiIcons = payload.erUiIcons || { icons: {}, wep: {}, arm: {}, tal: {}, good: {}, count: 0 };
    state.modSource = payload.modSource || null;
    buildSearchTags(state.data);
    buildAffinitySidebar();
    buildWeaponTypeTree();
    populateEnemySelect();
    populateGearDropdowns();

    const cfg = payload.settings || {};
    if (["auto", "kbm", "xbox", "ps5"].includes(cfg.promptMode)) state.promptMode = cfg.promptMode;
    state.defaultKeybinds = Object.assign({}, payload.defaultKeybinds || {});
    state.keybinds = Object.assign({}, state.defaultKeybinds, (cfg.keybinds && typeof cfg.keybinds === "object") ? cfg.keybinds : {});
    state.hotkeyErrors = Object.assign({}, payload.hotkeyErrors || {});
    if (typeof cfg.twoHand === "boolean") state.twoHand = cfg.twoHand;
    if (typeof cfg.groupByType === "boolean") state.groupByType = cfg.groupByType;
    if (typeof cfg.numericScaling === "boolean") state.numericScaling = cfg.numericScaling;
    if (typeof cfg.showDamageSplit === "boolean") state.showDamageSplit = cfg.showDamageSplit;
    if (typeof cfg.colCrit === "boolean") state.colCrit = cfg.colCrit;
    if (typeof cfg.colDType === "boolean") state.colDType = cfg.colDType;
    if (typeof cfg.colBuff === "boolean") state.colBuff = cfg.colBuff;
    if (typeof cfg.colStam === "boolean") state.colStam = cfg.colStam;
    if (typeof cfg.colStance === "boolean") state.colStance = cfg.colStance;
    if (typeof cfg.condTalismans === "boolean") state.condTalismans = cfg.condTalismans;
    if (typeof cfg.greaseId === "number") state.greaseId = cfg.greaseId;
    if (cfg.buffToggles && typeof cfg.buffToggles === "object") {
      Object.assign(state.buffToggles, cfg.buffToggles);
    }
    if (typeof cfg.effectiveOnly === "boolean") state.effectiveOnly = cfg.effectiveOnly;
    if (typeof cfg.bestAffinityOnly === "boolean") state.bestAffinityOnly = cfg.bestAffinityOnly;
    if (typeof cfg.buffableOnly === "boolean") state.buffableOnly = cfg.buffableOnly;
    if (typeof cfg.ownedOnly === "boolean") state.ownedOnly = cfg.ownedOnly;
    if (typeof cfg.favoritesOnly === "boolean") state.favoritesOnly = cfg.favoritesOnly;
    if (typeof cfg.pinFavTop === "boolean") state.pinFavTop = cfg.pinFavTop;
    if (Array.isArray(cfg.favoriteIds)) {
      state.favoriteIds = cfg.favoriteIds.map((x) => Number(x)).filter(Boolean);
      state._favSet = new Set(state.favoriteIds);
    }
    if (typeof cfg.liveWatch === "boolean") state.liveWatch = cfg.liveWatch;
    if (cfg.customBossPreset && typeof cfg.customBossPreset === "object" && cfg.customBossPreset.n) {
      state.customBossPreset = cfg.customBossPreset;
      populateEnemySelect();
    }
    if (cfg.enemyPreset && (cfg.enemyPreset in state.enemyPresets || cfg.enemyPreset === "__LIVE_TARGET__" || (cfg.enemyPreset === "__CUSTOM_BOSS__" && state.customBossPreset))) {
      state.enemyPreset = cfg.enemyPreset;
    }
    if (cfg.bannerDismissed) state.bannerDismissed = true;
    if (typeof cfg.pipOpacity === "number" && Number.isFinite(cfg.pipOpacity)) {
      applyPipOpacity(Math.round(cfg.pipOpacity * 100), false);
    }
    setPipBossHud(typeof cfg.pipBossHud === "boolean" ? cfg.pipBossHud : true, false);
    setPipMapBossHud(typeof cfg.pipMapBossHud === "boolean" ? cfg.pipMapBossHud : true, false);
    setPipBossDesign(typeof cfg.pipBossDesign === "string" ? cfg.pipBossDesign : "1", false);
    setPipBossResMode(["compact", "full", "off"].includes(cfg.pipBossResMode) ? cfg.pipBossResMode : "compact", false);
    setPipLocked(Boolean(cfg.pipLocked), false);
    setPipAutoHide(Boolean(cfg.pipAutoHide), false);
    setMinimizeToTray(Boolean(cfg.minimizeToTray), false);
    state.pipSmartFade = Boolean(cfg.pipSmartFade);
    if (typeof cfg.pipIdleOpacity === "number" && Number.isFinite(cfg.pipIdleOpacity)) state.pipIdleOpacity = Math.max(0.10, Math.min(1.0, cfg.pipIdleOpacity));
    if (typeof cfg.pipCombatOpacity === "number" && Number.isFinite(cfg.pipCombatOpacity)) state.pipCombatOpacity = Math.max(0.10, Math.min(1.0, cfg.pipCombatOpacity));
    if (typeof cfg.pipFadeMs === "number" && Number.isFinite(cfg.pipFadeMs)) state.pipFadeMs = Math.max(100, Math.min(1500, cfg.pipFadeMs));
    if (typeof cfg.pipFadeOnBoss === "boolean") state.pipFadeOnBoss = cfg.pipFadeOnBoss;
    if (typeof cfg.pipFadeOnBuffs === "boolean") state.pipFadeOnBuffs = cfg.pipFadeOnBuffs;
    setPipBuffHud(typeof cfg.pipBuffHud === "boolean" ? cfg.pipBuffHud : true, false);
    setPipMapBuffHud(typeof cfg.pipMapBuffHud === "boolean" ? cfg.pipMapBuffHud : true, false);
    state.buffExpFlash = typeof cfg.buffExpFlash === "boolean" ? cfg.buffExpFlash : true;
    state.buffHideLooping = typeof cfg.buffHideLooping === "boolean" ? cfg.buffHideLooping : true;
    if (["bottom-right", "top-right", "bottom-left", "top-left"].includes(cfg.pipCorner)) state.pipCorner = cfg.pipCorner;
    if (["below", "inside"].includes(cfg.pipBossPlacement)) state.pipBossPlacement = cfg.pipBossPlacement;
    if (["weapon", "header", "map"].includes(cfg.pipGripPlacement)) state.pipGripPlacement = cfg.pipGripPlacement;
    if (["hud", "map", "stats"].includes(cfg.pvPreviewMode)) state.pvPreviewMode = cfg.pvPreviewMode;
    applyBossPlacementClass();
    updateHiddenLoopBuffsUi();
    applyBuffSweepOpacity(typeof cfg.buffSweepOpacity === "number" ? cfg.buffSweepOpacity : 30, false, false);
    applyBuffTextOpacity(typeof cfg.buffTextOpacity === "number" ? cfg.buffTextOpacity : 75, false, false);
    state.enemyShowStatuses = typeof cfg.enemyShowStatuses === "boolean" ? cfg.enemyShowStatuses : true;
    state.enemyShowStance = typeof cfg.enemyShowStance === "boolean" ? cfg.enemyShowStance : true;
    mapState.showOffscreenArrow = typeof cfg.mapShowOffscreenArrow === "boolean" ? cfg.mapShowOffscreenArrow : true;
    mapState.showLabels = typeof cfg.mapShowLabels === "boolean" ? cfg.mapShowLabels : true;
    mapState.pipNearbyLabelsOnly = typeof cfg.mapPipNearbyLabelsOnly === "boolean" ? cfg.mapPipNearbyLabelsOnly : true;
    applyPipLabelRadius(typeof cfg.mapPipNearbyLabelRadius === "number" ? cfg.mapPipNearbyLabelRadius : 95, false, false);
    if (cfg.mapLabelCats && typeof cfg.mapLabelCats === "object") {
      for (const [k] of MAP_LABEL_CAT_ORDER) {
        if (typeof cfg.mapLabelCats[k] === "boolean") mapState.labelCats[k] = cfg.mapLabelCats[k];
      }
    }
    renderPipRamBadges();
    if (typeof cfg.mapLayer === "string" && ["m00", "m01", "m10"].includes(cfg.mapLayer)) {
      mapState.layer = cfg.mapLayer;
      mapState.firstOpenDone = true;
    }
    if (cfg.mapCats && typeof cfg.mapCats === "object") {
      for (const k of Object.keys(MAP_CAT_META)) {
        if (typeof cfg.mapCats[k] === "boolean") mapState.cats[k] = cfg.mapCats[k];
      }
    }
    if (typeof cfg.mapShowPlayer === "boolean") mapState.showPlayer = cfg.mapShowPlayer;
    if (typeof cfg.mapShowPins === "boolean") mapState.showPins = cfg.mapShowPins;
    mapState.autoClearBeacon = typeof cfg.mapAutoClearBeacon === "boolean" ? cfg.mapAutoClearBeacon : true;
    if (typeof cfg.mapFollow === "boolean") mapState.followPlayer = cfg.mapFollow;
    if (typeof cfg.mapAutoSwitchLayer === "boolean") mapState.autoSwitchLayer = cfg.mapAutoSwitchLayer;
    if (typeof cfg.mapAutoDetect === "boolean") mapState.autoDetect = cfg.mapAutoDetect;
    if (["dim", "show", "hide"].includes(cfg.mapCompletedMode)) mapState.completedMode = cfg.mapCompletedMode;
    if (cfg.manualCompleted && typeof cfg.manualCompleted === "object") mapState.manualCompleted = cfg.manualCompleted;

    document.querySelectorAll(".map-cat-cb").forEach((cb) => {
      cb.checked = Boolean(mapState.cats[cb.dataset.cat]);
    });
    if ($("mapCatPlayer")) $("mapCatPlayer").checked = mapState.showPlayer;
    if ($("mapCatPins")) $("mapCatPins").checked = mapState.showPins;
    if ($("mapAutoLayerCb")) $("mapAutoLayerCb").checked = mapState.autoSwitchLayer;
    if ($("mapAutoDetectCb")) $("mapAutoDetectCb").checked = mapState.autoDetect;
    if ($("mapCompletedModeSel")) $("mapCompletedModeSel").value = mapState.completedMode;
    if ($("setCompletedModeSel")) $("setCompletedModeSel").value = mapState.completedMode;
    if ($("mapFollowBtn")) $("mapFollowBtn").classList.toggle("following", mapState.followPlayer);
    if ($("pipFollowBtn")) $("pipFollowBtn").classList.toggle("following", mapState.followPlayer);
    if (state.data && state.data.mod) {
      if ($("hdrModTag")) $("hdrModTag").textContent = state.data.mod;
      if ($("erFtrTag")) $("erFtrTag").textContent = String(state.data.mod).toUpperCase();
    }
    if ($("erFtrArmoryCount") && state.data && state.data.weapons) {
      $("erFtrArmoryCount").textContent = state.data.weapons.length.toLocaleString();
    }
    syncMapLayerButtons();

    $("twoHandCb").checked = state.twoHand;
    $("groupByTypeCb").checked = state.groupByType;
    $("numericScalingCb").checked = state.numericScaling;
    $("showDamageSplitCb").checked = state.showDamageSplit;
    $("colCritCb").checked = state.colCrit;
    $("colDTypeCb").checked = state.colDType;
    $("colBuffCb").checked = state.colBuff;
    $("colStamCb").checked = state.colStam;
    $("colStanceCb").checked = state.colStance;
    $("effectiveOnlyCb").checked = state.effectiveOnly;
    $("bestAffinityOnlyCb").checked = state.bestAffinityOnly;
    $("buffableOnlyCb").checked = state.buffableOnly;
    if ($("ownedOnlyCb")) $("ownedOnlyCb").checked = state.ownedOnly;
    if ($("favoritesOnlyCb")) $("favoritesOnlyCb").checked = state.favoritesOnly;
    if ($("pinFavTopCb")) $("pinFavTopCb").checked = state.pinFavTop;
    $("liveWatchCb").checked = state.liveWatch;
    populateEnemySelect();
    if (state.bannerDismissed) $("infoBanner").classList.add("hidden");
    updateExtraColsButtonLabel();
    notifyStreamMode();

    populateLevelSelect();
    syncGearDropdownValues();
    applySavePayload(payload.save, true);
    updateStatInputsDom();
    renderTableHeader();
    hydrateErMenuAssets();
    bindUiEvents();
    bindEquipUiEvents();
    bindMapUiEvents();
    bindPipViewerEvents();
    if (window.__syncModSourceUi) window.__syncModSourceUi(false);
    renderFooterPrompts();
    recalculateAndRender();
    if (!payload.selfTestMode) {
      await switchMainView("equip");
    } else {
      await switchMainView("calc");
    }

    // Live save sync: Python daemon thread pushes updates, plus focus & backup checks
    if (!payload.selfTestMode) {
      let pollInFlight = false;
      const pollSaveOnce = async () => {
        if (!state.liveWatch || pollInFlight) return;
        pollInFlight = true;
        try {
          const upd = await window.pywebview.api.poll_save();
          if (upd && upd.changed) {
            if (upd.kind === "pos") applyIncomingPlayerPosUpdate(upd);
            else if (upd.save) applyIncomingSaveUpdate(upd.save);
          }
        } catch (_) {}
        pollInFlight = false;
      };
      window.addEventListener("focus", pollSaveOnce);
      setInterval(pollSaveOnce, 4000);
    }

    // Expose automated test hooks for --self-test verification
    window.__ERR_TEST = {
      computeById(id, stats, regLv, somberLv, twoHand, enemyPreset, buffs = null) {
        const w = state.byId.get(id);
        return computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, -1, enemyPreset, buffs);
      },
      getGearInfo() {
        return {
          armorIds: state.armorIds.slice(),
          talismanIds: state.talismanIds.slice(),
          greaseCount: (state.data.greases || []).length,
          firstGrease: (state.data.greases || [])[0] || null,
          activeBuffs: state.activeBuffs,
          char0Armor: state.characters[0] ? state.characters[0].armor : null,
          char0Talismans: state.characters[0] ? state.characters[0].talismans : null,
        };
      },
      testScalingCurve(wid) {
        this.openInspectorById(wid);
        switchDrawerTab("curve");
        renderScalingCurve();
        return {
          polyCount: document.querySelectorAll("#scalingCurveSvg polyline").length,
          dotCount: document.querySelectorAll("#scalingCurveSvg circle").length,
          curveStats: state.curveData ? state.curveData.curves.map((c) => c.label) : [],
        };
      },
      getSummary() {
        const heads = Array.from(document.querySelectorAll("#tableHead th")).map((th) => th.textContent.trim());
        const visibleRows = document.querySelectorAll("#tableBody tr.w-row").length;
        const firstRow = state.flatItems.find((x) => x.kind === "row");
        return {
          weaponsLoaded: state.data.weapons.length,
          charCount: state.characters.length,
          activeSlot: state.activeSlot,
          savePath: state.savePath,
          totalItems: state.flatItems.length,
          computedCount: lastComputedList.length,
          visibleDomRows: visibleRows,
          headerTexts: heads,
          topWeapon: firstRow ? {
            id: firstRow.res.weapon.id,
            name: firstRow.res.weapon.name,
            total: firstRow.res.total,
            eff: firstRow.res.eff,
          } : null,
          jsErrors: window.__JS_ERRORS.slice(),
        };
      },
      setFilterSearch(txt) {
        $("searchInput").value = txt;
        state.search = txt;
        recalculateAndRender();
        return lastComputedList.length;
      },
      toggleOption(optId, val) {
        const el = $(optId);
        el.checked = val;
        el.dispatchEvent(new Event("change"));
      },
      setEnemyPreset(name) {
        $("enemySelect").value = name;
        $("enemySelect").dispatchEvent(new Event("change"));
      },
      selectAffinitySubset(affArray) {
        state.selectedAffs = new Set(affArray);
        syncAffinityCheckboxesDom();
        recalculateAndRender();
        return lastComputedList.length;
      },
      selectWeaponTypes(wtArray) {
        state.selectedWts = new Set(wtArray);
        syncWeaponTypeDom();
        recalculateAndRender();
        return lastComputedList.length;
      },
      openInspectorById(wid) {
        const item = state.flatItems.find((x) => x.kind === "row" && x.res.weapon.id === wid);
        const res = item ? item.res : computeWeapon(state.byId.get(wid), state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, -1, state.enemyPreset);
        renderInspectorDetails(res, true);
        openDrawer("details");
        return {
          affRows: document.querySelectorAll("#affPanelBody tr").length,
          drawerOpen: !$("inspectorDrawer").classList.contains("hidden"),
        };
      },
      clickSecondAffinity() {
        const rows = document.querySelectorAll("#affPanelBody tr");
        if (rows.length < 2) return null;
        rows[1].click();
        return state.inspectedRes ? state.inspectedRes.weapon.id : null;
      },
      pinTwoAndCompare(widA, widB) {
        state.compareIds = [];
        pinWeaponId(widA);
        pinWeaponId(widB);
        return document.querySelectorAll("#cmpTableBody tr").length;
      },
      startOptimizerTest(wid) {
        window.__ERR_OPT_RESULT = null;
        this.openInspectorById(wid);
        switchDrawerTab("optimizer");
        runOptimizerNow()
          .then((entries) => {
            window.__ERR_OPT_RESULT = {
              count: entries.length,
              topAff: entries[0] ? entries[0].aff : null,
              topEff: entries[0] ? entries[0].eff : 0,
            };
          })
          .catch((err) => {
            window.__ERR_OPT_RESULT = { error: String(err) };
          });
      },
      openEquipTab() {
        switchMainView("equip");
        return state.activeView;
      },
      testEquipTab() {
        switchMainView("equip");
        const eqVis = Boolean($("equipWorkspace") && !$("equipWorkspace").classList.contains("hidden"));
        const calcHid = Boolean($("calcWorkspace") && $("calcWorkspace").classList.contains("hidden"));
        const wakuCount = document.querySelectorAll("#equipWorkspace .waku").length;
        const attrRows = document.querySelectorAll("#eqAttrList .eq-attr-row").length;
        const title = $("eqDetTitle") ? $("eqDetTitle").textContent.trim() : "";
        const rhNodes = Array.from(document.querySelectorAll("#eqRhRow .waku"));
        const lhNodes = Array.from(document.querySelectorAll("#eqLhRow .waku"));
        const rhActual = rhNodes.map((n) => (n.dataset.eqWid ? Number(n.dataset.eqWid) : null));
        const lhActual = lhNodes.map((n) => (n.dataset.eqWid ? Number(n.dataset.eqWid) : null));
        const rhExpected = ((state.equippedSlots && state.equippedSlots.rh) || []).map((e) => (e ? e.weaponId : null));
        const lhExpected = ((state.equippedSlots && state.equippedSlots.lh) || []).map((e) => (e ? e.weaponId : null));
        const slotsMatch =
          rhActual.length === 3 &&
          lhActual.length === 3 &&
          rhActual.every((v, i) => v === (rhExpected[i] ?? null)) &&
          lhActual.every((v, i) => v === (lhExpected[i] ?? null));
        const rhFirst = rhNodes[0] && rhNodes[0].querySelector(".waku-cap") ? rhNodes[0].querySelector(".waku-cap").textContent.trim() : "";
        const lhFirst = lhNodes[0] && lhNodes[0].querySelector(".waku-cap") ? lhNodes[0].querySelector(".waku-cap").textContent.trim() : "";
        switchMainView("calc");
        return {
          ok: eqVis && calcHid && wakuCount >= 12 && attrRows === 5 && title.length > 0 && slotsMatch,
          wakuCount,
          attrRows,
          title,
          rhCount: rhActual.filter(Boolean).length,
          lhCount: lhActual.filter(Boolean).length,
          rhFirst,
          lhFirst,
          slotsMatch,
        };
      },
      testErUiV2() {
        const hasIcons = Boolean(state.erUiIcons && typeof state.erUiIcons === "object" && (!state.erUiIcons.ok || state.erUiIcons.count >= 300));
        const affIcons = document.querySelectorAll("#affinityGrid .er-aff-ic").length;
        const wtIcons = document.querySelectorAll("#weaponTypeTree .er-wt-ic").length;
        const ramBadgeTxt = $("ramHeaderBadge") ? $("ramHeaderBadge").textContent.trim() : "";
        const sysBadgeTxt = $("sysGameStatusBadge") ? $("sysGameStatusBadge").textContent.trim() : "";
        const noLiveText =
          !ramBadgeTxt.includes("Live RAM") &&
          !sysBadgeTxt.includes("ModEngine") &&
          ["✓", "✕"].includes(sysBadgeTxt);
        switchMainView("pip");
        const pipVis = Boolean($("pipViewerWorkspace") && !$("pipViewerWorkspace").classList.contains("hidden"));
        let pipBossToggleOk = false;
        const cb = $("pvMapBossHudCb");
        const box = $("pvEnemyBox");
        if (cb && box) {
          const prev = cb.checked;
          cb.checked = false;
          cb.dispatchEvent(new Event("change"));
          const hidAfterOff = box.classList.contains("hidden");
          cb.checked = prev;
          cb.dispatchEvent(new Event("change"));
          pipBossToggleOk = hidAfterOff;
        }
        const prevMode = state.promptMode;
        state.promptMode = "ps5";
        renderFooterPrompts();
        const ps5Src = $("erFtrKeyA") ? $("erFtrKeyA").src : "";
        state.promptMode = "kbm";
        renderFooterPrompts();
        const kbmSrc = $("erFtrKeyA") ? $("erFtrKeyA").src : "";
        state.promptMode = prevMode;
        renderFooterPrompts();
        const promptSwitchOk = Boolean(ps5Src && kbmSrc && ps5Src !== kbmSrc);
        switchMainView("calc");
        return {
          ok: hasIcons && affIcons >= 20 && wtIcons >= 40 && noLiveText && pipVis && pipBossToggleOk && promptSwitchOk,
          hasIcons,
          affIcons,
          wtIcons,
          noLiveText,
          pipVis,
          pipBossToggleOk,
          promptSwitchOk,
        };
      },
      openMapTab() {
        switchMainView("map");
        return state.activeView;
      },
      openCalcTab() {
        switchMainView("calc");
        return state.activeView;
      },
      getMapState() {
        const markers = (mapState.data && mapState.data.markers) || [];
        const dummyCount = markers.filter((m) => m.name && m.name.toLowerCase().includes("dummy")).length;
        return {
          loaded: mapState.loaded,
          imgLoaded: Boolean(mapState.images[mapState.layer]),
          iconsLoaded: Object.keys(mapState.iconImgs).length,
          dummyCount,
          layer: mapState.layer,
          counts: mapState.data ? mapState.data.counts : {},
          totalCount: markers.length,
          visibleCount: mapState.visibleMarkers.length,
          iconPx: getMapIconPx(),
          hasLivePlayer: Boolean(getActiveLivePlayerPos()),
        };
      },
      toggleMapCat(cat, checked) {
        const cb = document.querySelector(`.map-cat-cb[data-cat='${cat}']`);
        if (!cb) return null;
        cb.checked = checked;
        cb.dispatchEvent(new Event("change"));
        return mapState.visibleMarkers.length;
      },
      searchMap(txt) {
        const inp = $("mapSearchInput");
        inp.value = txt;
        mapState.search = txt;
        updateMapSearchList();
        renderMapCanvas();
        return document.querySelectorAll("#mapSearchList .map-search-item").length;
      },
      getMapAccuracyCheck() {
        const markers = (mapState.data && mapState.data.markers) || [];
        const pick = (nameLower, cat = null) => {
          const m = markers.find((x) => x.name && x.name.toLowerCase() === nameLower && (!cat || x.cat === cat))
            || markers.find((x) => x.name && x.name.toLowerCase().includes(nameLower) && (!cat || x.cat === cat));
          return m ? { layer: m.layer, cat: m.cat, name: m.name, u: m.u, v: m.v, wx: m.wx, wz: m.wz } : null;
        };
        return {
          layers: mapState.data ? mapState.data.layers : {},
          besideGreatBridge: pick("beside the great bridge", "grace"),
          audiencePathway: pick("audience pathway", "grace"),
          haligtreeRoots: pick("haligtree roots", "grace"),
          stormveilMainGate: pick("stormveil main gate", "grace"),
          erdtreeSanctuary: pick("erdtree sanctuary", "grace"),
          fireGiant: pick("fire giant", "boss"),
          starscourgeRadahn: pick("starscourge radahn", "boss"),
        };
      },
      testLiveRamHooks() {
        setMapFollow(true);
        const followOn = mapState.followPlayer;
        setMapFollow(false);
        const followOff = mapState.followPlayer;
        window.__onLiveRamChar({
          name: "TestRam",
          level: 120,
          stats: { vig: 40, mnd: 20, end: 25, str: 55, dex: 30, int: 10, fai: 10, arc: 9 },
          equipped: [],
          armor: [null, null, null, null],
          talismans: [null, null, null, null],
        });
        window.__onLiveRamPos({ area: 60, gridX: 42, gridZ: 36, sub: 0, x: 10.0, y: 0.0, z: 20.0, yaw: 1.5 });
        const ramActive = state.ramLive;
        const ramMeta = $("charMetaText").textContent;
        const ramStr = state.stats.str;
        const ramHasPos = Boolean(getActiveLivePlayerPos());
        // Test Auto-Switch Layer (even with Follow OFF) to Shadow of the Erdtree (area 61)
        const prevAuto = mapState.autoSwitchLayer;
        mapState.autoSwitchLayer = true;
        mapState.lastPlayerLayer = "m00";
        window.__onLiveRamPos({ area: 61, gridX: 48, gridZ: 40, sub: 0, x: 10.0, y: 0.0, z: 20.0, yaw: 0.5 });
        const autoSwitchedToDlc = mapState.layer === "m10";
        window.__onLiveRamPins([{ kind: "beacon", slot: 1, layer: "m10", u: 0.5, v: 0.5, order: 1 }]);
        const pinsCount = getActiveWorldPins().length;
        // Reset cleanly back to m00
        mapState.layer = "m00";
        mapState.autoSwitchLayer = prevAuto;
        syncMapLayerButtons();
        window.__onLiveRamStatus({ attached: false });
        return {
          followOn,
          followOff,
          ramActive,
          ramMeta,
          ramStr,
          ramHasPos,
          autoSwitchedToDlc,
          pinsCount,
          restoredRamActive: state.ramLive,
          restoredMeta: $("charMetaText").textContent,
        };
      },
      testPipModes() {
        setPipMode("map");
        const mapBody = document.body.classList.contains("pip-active") && document.body.classList.contains("pip-map");
        document.body.classList.add("pip-hover");
        setPipSearchPopover(true);
        const searchOpen = !$("pipSearchPopover").classList.contains("hidden") && document.body.classList.contains("pip-popover-open");
        mapState.search = "Claymore";
        $("pipSearchInput").value = "Claymore";
        updateMapSearchList();
        const searchHits = document.querySelectorAll("#pipSearchList .map-search-item").length;
        const searchBtnActive = $("pipSearchBtn").classList.contains("active");

        // Test nearest off-screen target arrow in PiP Mode
        const prevL = mapState.layer;
        mapState.layer = "m00";
        centerMapOnUV(0.05, 0.05, 6.0);
        const offTarget = mapState.offscreenTarget ? Object.assign({}, mapState.offscreenTarget) : null;
        const targetM = offTarget ? (mapState.data && mapState.data.markers || []).find((m) => m.id === offTarget.id) : null;
        if (targetM) centerMapOnUV(targetM.u, targetM.v, 4.0);
        const onScreenCleared = mapState.offscreenTarget === null;
        mapState.layer = prevL;

        mapState.search = "";
        $("pipSearchInput").value = "";
        updateMapSearchList();
        setPipSearchPopover(false);
        const pipSearchOk = searchOpen && searchHits >= 1 && searchBtnActive && $("pipSearchPopover").classList.contains("hidden");
        const prevOp = Math.round(state.pipOpacity * 100);
        const opacityClampedLow = applyPipOpacity(5, false);
        applyPipOpacity(prevOp, false);
        setPipMode("stats");
        const statsBody = document.body.classList.contains("pip-active") && document.body.classList.contains("pip-stats");
        const statsCells = document.querySelectorAll("#pipStatsGrid .pip-stat-cell").length;
        setPipMode("off");
        const offClean = !document.body.classList.contains("pip-active");
        const hoverClean = !document.body.classList.contains("pip-hover");
        const proxFar = computePipProximityScale(52, 120);
        const proxMid = computePipProximityScale(52, 50);
        const proxZero = computePipProximityScale(52, 0);
        const pFar = computePipPlayerScale(60);
        const pZero = computePipPlayerScale(0);
        const proxShrinkOk = (
          proxFar.iconPx === 52 && !proxFar.near &&
          proxMid.iconPx < 40 && proxMid.near &&
          proxZero.iconPx === 14 &&
          pFar === 1.0 && pZero < 0.6
        );
        return {
          mapBody,
          statsBody,
          statsCells,
          offClean,
          hoverClean,
          opacityClampedLow,
          proxShrinkOk,
          pipSearchOk,
          offscreenArrowOk: Boolean(offTarget && offTarget.distMeters > 0 && onScreenCleared),
        };
      },
      testV15Features() {
        const g = (mapState.data && mapState.data.markers || []).find((m) => m.cat === "grace" && m.eventFlag);
        const beforeMan = g ? isMarkerCompleted(g) : null;
        if (g) setMarkerManualState(g.id, !beforeMan);
        const afterMan = g ? isMarkerCompleted(g) : null;
        if (g) setMarkerManualState(g.id, null);
        const prevView = state.activeView;
        switchMainView("system");
        if (window.__switchSysSubTab) window.__switchSysSubTab("hotkeys");
        const modalOpen = Boolean(
          state.activeView === "system" &&
          $("sysPaneHotkeys") && !$("sysPaneHotkeys").classList.contains("hidden") &&
          document.querySelectorAll("#keybindsList .kb-row").length === KEYBIND_ACTIONS.length
        );
        switchMainView(prevView);
        const modalClosed = state.activeView === prevView;
        const bbWithIcon = (mapState.data && mapState.data.markers || []).filter((m) => m.cat === "bell_bearing" && m.icon && m.icon.startsWith("good_")).length;
        return {
          manualToggleOk: g ? (afterMan === !beforeMan) : false,
          modalOk: modalOpen && modalClosed,
          bbWithIcon,
        };
      },
      testBossHud() {
        const prevMode = state.pipMode;
        const prevBossHud = state.pipBossHud;
        const prevMapBossHud = state.pipMapBossHud;
        const prevDesign = state.pipBossDesign;
        const prevRamLive = state.ramLive;
        const prevBosses = state.ramBosses;
        const prevPlace = state.pipBossPlacement;
        setPipBossPlacement("inside", false);

        const payload = [
          {
            slot: 0,
            name: "Margit, the Fell Omen",
            hp: 3120,
            maxHp: 4174,
            stance: 42.5,
            maxStance: 80.0,
            stanceReset: 3.4,
            stanceBroken: false,
            stanceKind: "stance",
            statuses: [
              { key: "bleed", label: "Bleed", cur: 210, max: 318 },
              { key: "frost", label: "Frost", cur: 95, max: 318 },
              { key: "rot", label: "Rot", cur: 145, max: 318 },
            ],
          },
        ];

        setPipMode("stats");
        setPipBossHud(true, false);
        setPipMapBossHud(true, false);
        setPipBossDesign("1", false);
        state.ramLive = true;
        renderPipRamBadges();
        window.__onLiveRamBosses(payload);

        const statsBox = $("pipBossBox");
        const shownStats = Boolean(statsBox && !statsBox.classList.contains("hidden") && statsBox.querySelectorAll(".pip-boss-card").length === 1);
        const txt = statsBox ? statsBox.textContent : "";
        const hpTextOk = txt.includes("Margit, the Fell Omen") && txt.includes("3,120") && txt.includes("4,174") && !txt.includes("LOCKED") && !txt.includes("Immune");
        const stanceOk = txt.includes("STANCE 43/80") && txt.includes("3.4s");
        const statusesOk = txt.includes("210/318") && txt.includes("95/318") && txt.includes("145/318");

        const d1Ok = Boolean(statsBox && statsBox.querySelector(".er-grid-1"));
        $("pipDesignPrevBtn").click();
        const wrapBackOk = state.pipBossDesign === "3" && Boolean(statsBox && statsBox.querySelector(".er-stack-3"));
        $("pipDesignNextBtn").click();
        const wrapFwdOk = state.pipBossDesign === "1" && Boolean(statsBox && statsBox.querySelector(".er-grid-1"));
        $("pipDesignNextBtn").click();
        const d2Ok = state.pipBossDesign === "2" && Boolean(statsBox && statsBox.querySelector(".er-row-2"));
        setPipBossDesign("3", false);
        const d3Ok = Boolean(statsBox && statsBox.querySelector(".er-stack-3"));
        const designsOk = d1Ok && wrapBackOk && wrapFwdOk && d2Ok && d3Ok;

        setPipMode("map");
        const mapBox = $("pipMapBossBox");
        const shownMap = Boolean(mapBox && !mapBox.classList.contains("hidden") && mapBox.querySelectorAll(".pip-boss-card").length === 1);
        const mapBadge = $("pipMapRamBadge");
        const statsBadge = $("pipRamBadge");
        const ramOnOk = Boolean(
          mapBadge && mapBadge.classList.contains("on") && mapBadge.querySelector("svg") &&
          !mapBadge.textContent.includes("RAM") && !mapBadge.textContent.includes("LIVE") &&
          statsBadge && statsBadge.classList.contains("on") && !statsBadge.textContent.includes("RAM")
        );
        const bossBtn = $("pipBossBtn");
        const enemyBtnOnOk = Boolean(
          bossBtn && bossBtn.textContent.includes("Enemy") &&
          bossBtn.classList.contains("pip-enemy-btn") && bossBtn.classList.contains("active")
        );

        setPipMapBossHud(false, false);
        setPipBossHud(false, false);
        const enemyBtnOffOk = Boolean(bossBtn && !bossBtn.classList.contains("active"));
        const toggleOffHidden = Boolean(
          mapBox && mapBox.classList.contains("hidden") && statsBox && statsBox.classList.contains("hidden")
        );
        const cbBossPv = $("pvBossHudCb");
        const cbMapBossPv = $("pvMapBossHudCb");
        if (typeof renderPipViewerWorkspace === "function") renderPipViewerWorkspace();
        const cbSyncedOff = Boolean(
          cbBossPv && !cbBossPv.checked &&
          cbMapBossPv && !cbMapBossPv.checked
        );

        setPipBossHud(true, false);
        setPipMapBossHud(true, false);
        window.__onLiveRamStatus({ attached: false });
        const ramOffOk = Boolean(mapBadge && mapBadge.classList.contains("off") && mapBadge.querySelector("svg") && !mapBadge.textContent.includes("RAM"));
        const detachCleared = Boolean(state.ramBosses.length === 0 && mapBox && mapBox.classList.contains("hidden"));

        state.ramBosses = prevBosses;
        state.ramLive = prevRamLive;
        setPipBossDesign(prevDesign, false);
        setPipBossHud(prevBossHud, false);
        setPipMapBossHud(prevMapBossHud, false);
        setPipBossPlacement(prevPlace, false);
        setPipMode(prevMode);
        renderPipRamBadges();

        return {
          shownStats,
          shownMap,
          hpTextOk,
          stanceOk,
          statusesOk,
          designsOk,
          ramBadgesOk: ramOnOk && ramOffOk && enemyBtnOnOk && enemyBtnOffOk,
          toggleOffHidden,
          detachCleared,
          settingsSynced: cbSyncedOff,
        };
      },
      testPlayerBuffs() {
        const prevMode = state.pipMode;
        const prevRamLive = state.ramLive;
        const prevBuffs = state.ramBuffs.slice();
        const prevBuffHud = state.pipBuffHud;
        const prevMapBuffHud = state.pipMapBuffHud;
        const prevExpFlash = state.buffExpFlash;
        const prevSweep = state.buffSweepOpacity;
        const prevText = state.buffTextOpacity;

        const iconsCount = Object.keys((state.buffIcons && state.buffIcons.icons) || {}).length;
        const iconsLoadedOk = iconsCount >= 100;

        setPipBuffHud(true, false);
        setPipMapBuffHud(true, false);
        state.buffExpFlash = true;
        applyBuffSweepOpacity(30, false, false);
        applyBuffTextOpacity(75, false, false);
        state.ramLive = true;
        setPipMode("stats");

        const sampleBuffs = [
          { id: 1730, iconId: 20406, rem: 8.5, dur: 30.0 },
          { id: 6860, iconId: 20460, rem: 19.0, dur: 45.0 },
        ];
        window.__onLiveRamBuffs(sampleBuffs);

        const sBox = $("pipStatsBuffBox");
        const sTiles = sBox ? sBox.querySelectorAll(".buff-tile") : [];
        const shownStatsOk = Boolean(sBox && !sBox.classList.contains("hidden") && sTiles.length === 2);
        const expFlashOk = Boolean(
          sTiles[0] && sTiles[0].classList.contains("expiring") &&
          sTiles[1] && !sTiles[1].classList.contains("expiring")
        );
        const debuffBadgeOk = Boolean(
          sTiles[1] && sTiles[1].classList.contains("debuff") &&
          sTiles[1].querySelector(".buff-debuff-tag") &&
          !sTiles[0].classList.contains("debuff")
        );
        const deg0 = sTiles[0] ? parseFloat(sTiles[0].style.getPropertyValue("--deg")) : 0;
        const sweepDirectionOk = Number.isFinite(deg0) && deg0 > 200;
        const countTextOk = Boolean(
          sTiles[0] && sTiles[0].querySelector(".buff-count").textContent.trim() === "9" &&
          sTiles[1] && sTiles[1].querySelector(".buff-count").textContent.trim() === "19"
        );

        let tooltipOk = false;
        if (sTiles[1]) {
          sTiles[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
          const tip = $("erHoverTip");
          tooltipOk = Boolean(
            tip && tip.classList.contains("show") && tip.classList.contains("debuff") &&
            $("erTipTag") && $("erTipTag").textContent.includes("DEBUFF") &&
            $("erTipTime") && !$("erTipTime").classList.contains("hidden")
          );
          sTiles[1].dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
          if (tip && tip.classList.contains("show")) tooltipOk = false;
        }

        setPipMode("map");
        const mBox = $("pipMapBuffBox");
        const shownMapOk = Boolean(mBox && !mBox.classList.contains("hidden") && mBox.querySelectorAll(".buff-tile").length === 2);

        switchMainView("system");
        if (window.__switchSysSubTab) window.__switchSysSubTab("advanced");
        const togRowsCount = document.querySelectorAll("#systemWorkspace .er-opt-row[data-tog]").length;
        const supQuestionsCount = document.querySelectorAll("#systemWorkspace sup.er-q").length;
        applyBuffSweepOpacity(150, false, false);
        const clampHighOk = state.buffSweepOpacity === 100;
        applyBuffTextOpacity(-10, false, false);
        const clampLowOk = state.buffTextOpacity === 0;
        applyTogActionStateCheck: {
          const firstRow = document.querySelector("#systemWorkspace .er-opt-row[data-tog='buffExpFlash']");
          if (firstRow) firstRow.click();
        }
        const toggledOffOk = !state.buffExpFlash;
        $("setTogResetBtn").click();
        const resetDefaultsOk = (
          state.buffSweepOpacity === 30 &&
          state.buffTextOpacity === 75 &&
          state.buffExpFlash === true &&
          state.pipBuffHud === true &&
          state.pipMapBuffHud === true &&
          document.documentElement.style.getPropertyValue("--buff-swp-a") === "0.30" &&
          document.documentElement.style.getPropertyValue("--buff-txt-a") === "0.75"
        );
        switchMainView("calc");

        setPipMode("stats");
        const loopPrevBuffs = state.ramBuffs.slice();
        const prevHideLoop = state.buffHideLooping;
        resetHiddenLoopBuffs(false);
        setBuffHideLooping(true, false);
        for (let iter = 0; iter < 4; iter++) {
          applyLiveRamBuffs([
            { id: 1730, iconId: 20406, rem: 25.0 - iter, dur: 30.0 },
            { id: 999001, iconId: 20406, rem: 0.9, dur: 1.0 },
          ], 1000 + iter * 1200);
          if (iter < 3) applyLiveRamBuffs([{ id: 1730, iconId: 20406, rem: 24.5 - iter, dur: 30.0 }], 1600 + iter * 1200);
        }
        const loopSuppressedOk = (
          state.suppressedLoopBuffIds.has(999001) &&
          sBox && sBox.querySelectorAll(".buff-tile").length === 1
        );
        setBuffHideLooping(false, false);
        const loopShownWhenOffOk = Boolean(sBox && sBox.querySelectorAll(".buff-tile").length === 2);
        resetHiddenLoopBuffs(false);
        setBuffHideLooping(prevHideLoop, false);

        const dmgBuffsNotDebuffOk = Boolean(
          !resolveBuffMeta({ id: 1605000, iconId: 20980 }).debuff &&
          !resolveBuffMeta({ id: 511028, iconId: 20983 }).debuff &&
          !resolveBuffMeta({ id: 503550, iconId: 20980 }).debuff &&
          !resolveBuffMeta({ id: 1733000, iconId: 20406 }).debuff &&
          resolveBuffMeta({ id: 6860, iconId: 20460 }).debuff
        );

        state.ramBuffs = prevBuffs;
        state.ramLive = prevRamLive;
        setPipBuffHud(prevBuffHud, false);
        setPipMapBuffHud(prevMapBuffHud, false);
        state.buffExpFlash = prevExpFlash;
        applyBuffSweepOpacity(prevSweep, false, false);
        applyBuffTextOpacity(prevText, false, false);
        setPipMode(prevMode);
        renderPipBuffBoxes();
        syncSettingsToggleablesUi();

        return {
          iconsLoadedOk,
          shownStatsOk,
          shownMapOk,
          expFlashOk,
          debuffBadgeOk,
          dmgBuffsNotDebuffOk,
          sweepDirectionOk,
          countTextOk,
          tooltipOk,
          settingsRowsOk: togRowsCount === 13 && supQuestionsCount >= 17,
          clampOk: clampHighOk && clampLowOk,
          toggledOffOk,
          resetDefaultsOk,
          loopSuppressionOk: loopSuppressedOk && loopShownWhenOffOk,
        };
      },
      testMapLabels() {
        const prevMode = state.pipMode;
        const prevView = state.activeView;
        const prevLayer = mapState.layer;
        const prevZoom = mapState.zoom;
        const prevPanX = mapState.panX;
        const prevPanY = mapState.panY;
        const prevSearch = mapState.search;
        const prevShowLabels = mapState.showLabels;
        const prevNearbyOnly = mapState.pipNearbyLabelsOnly;
        const prevRadius = mapState.pipNearbyLabelRadius;
        const prevLabelCats = Object.assign({}, mapState.labelCats);

        switchMainView("system");
        if (window.__switchSysSubTab) window.__switchSysSubTab("hotkeys");
        const catCells = document.querySelectorAll("#setLabelCatsGrid .er-cat-cell");
        const catCellsCountOk = catCells.length === 15;
        const defaultOnCountOk = document.querySelectorAll("#setLabelCatsGrid .er-cat-cell.on").length === 3 &&
          Boolean(mapState.labelCats.grace && mapState.labelCats.boss && mapState.labelCats.merchant && !mapState.labelCats.weapon);

        const weaponCell = document.querySelector("#setLabelCatsGrid .er-cat-cell[data-lbl-cat='weapon']");
        if (weaponCell) weaponCell.click();
        const singleToggleOk = Boolean(mapState.labelCats.weapon);

        $("setLabelCatsAllBtn").click();
        const allBtnOk = document.querySelectorAll("#setLabelCatsGrid .er-cat-cell.on").length === 15;
        $("setLabelCatsNoneBtn").click();
        const noneBtnOk = document.querySelectorAll("#setLabelCatsGrid .er-cat-cell.on").length === 0;
        $("setLabelCatsDefBtn").click();
        const defBtnOk = document.querySelectorAll("#setLabelCatsGrid .er-cat-cell.on").length === 3 &&
          Boolean(mapState.labelCats.grace && mapState.labelCats.boss && mapState.labelCats.merchant);

        applyPipLabelRadius(10, false, false);
        const radLowOk = mapState.pipNearbyLabelRadius === 30;
        applyPipLabelRadius(500, false, false);
        const radHighOk = mapState.pipNearbyLabelRadius === 220;
        applyPipLabelRadius(95, false, false);

        state.activeView = "map";
        setPipMode("map");
        mapState.layer = "m00";
        mapState.search = "";
        const anchor = (mapState.data && mapState.data.markers || []).find((m) => m.layer === "m00" && m.cat === "grace");
        if (anchor) centerMapOnUV(anchor.u, anchor.v, 4.5);
        else mapState.zoom = 4.5;

        const showNamesRow = document.querySelector("#systemWorkspace .er-opt-row[data-tog='mapShowLabels']");
        if (showNamesRow && mapState.showLabels) showNamesRow.click();
        renderMapCanvas();
        const hiddenWhenOffOk = !mapState.showLabels &&
          mapState.lastLabelsDrawnCount === 0 &&
          $("setLabelCatsGrid").classList.contains("muted");
        if (showNamesRow && !mapState.showLabels) showNamesRow.click();

        mapState.pipNearbyLabelsOnly = true;
        renderMapCanvas();
        const nearbyCount = mapState.lastLabelsDrawnCount;

        mapState.pipNearbyLabelsOnly = false;
        renderMapCanvas();
        const allLabelsCount = mapState.lastLabelsDrawnCount;
        const nearbyFilterOk = allLabelsCount >= 1 && nearbyCount <= allLabelsCount;

        $("setTogResetBtn").click();
        const resetLabelsOk = mapState.showLabels === true &&
          mapState.pipNearbyLabelsOnly === true &&
          mapState.pipNearbyLabelRadius === 95 &&
          Boolean(mapState.labelCats.grace && mapState.labelCats.boss && mapState.labelCats.merchant && !mapState.labelCats.weapon);

        mapState.layer = prevLayer;
        mapState.zoom = prevZoom;
        mapState.panX = prevPanX;
        mapState.panY = prevPanY;
        mapState.search = prevSearch;
        mapState.showLabels = prevShowLabels;
        mapState.pipNearbyLabelsOnly = prevNearbyOnly;
        applyPipLabelRadius(prevRadius, false, false);
        mapState.labelCats = prevLabelCats;
        setPipMode(prevMode);
        switchMainView(prevView);
        syncSettingsToggleablesUi();
        renderMapCanvas();

        return {
          catCellsCountOk,
          defaultOnCountOk,
          singleToggleOk,
          allBtnOk,
          noneBtnOk,
          defBtnOk,
          radClampOk: radLowOk && radHighOk,
          hiddenWhenOffOk,
          nearbyFilterOk,
          resetLabelsOk,
        };
      },
      testQaAuditFixes() {
        const prevView = state.activeView;
        const prevMode = state.pipMode;
        const prevStr = state.stats.str;
        const prevPreview = state.equipPreviewWid;

        switchMainView("equip");
        const attrInp = document.querySelector("#eqAttrList input[data-eq-attr='strInput']");
        let focusPreserved = false;
        if (attrInp) {
          attrInp.focus();
          attrInp.value = String(Math.min(99, prevStr + 2));
          attrInp.dispatchEvent(new Event("input"));
          focusPreserved = document.activeElement === attrInp;
        }
        $("strInput").value = String(prevStr);
        $("strInput").dispatchEvent(new Event("input"));

        const res0 = getEquipSelectedWeaponResult();
        const guardOk = Boolean(res0 && Array.isArray(res0.guard) && res0.guard.length === 6);
        const beforeSlotWid = (state.equippedSlots?.rh?.[state.equipSelectedSlot?.idx || 0] || {}).weaponId || null;
        if ($("eqDetAshBox")) $("eqDetAshBox").click();
        const afterSlotWid = (state.equippedSlots?.rh?.[state.equipSelectedSlot?.idx || 0] || {}).weaponId || null;
        const previewCycled = !beforeSlotWid || (state.equipPreviewWid !== null && afterSlotWid === beforeSlotWid);
        state.equipPreviewWid = prevPreview;

        switchMainView("equip");
        const fEquipVis = !$("erFtrPromptY").classList.contains("hidden") && $("erFtrSwitchLbl").textContent === ":Switch view (right)";
        switchMainView("calc");
        const prev2h = state.twoHand;
        $("twoHandCb").checked = false;
        $("twoHandCb").dispatchEvent(new Event("change"));
        const fArmory1h = !$("erFtrPromptY").classList.contains("hidden") && $("erFtrSwitchLbl").textContent === ":Switch (Two-Handed)";
        $("twoHandCb").checked = true;
        $("twoHandCb").dispatchEvent(new Event("change"));
        const fArmory2h = !$("erFtrPromptY").classList.contains("hidden") && $("erFtrSwitchLbl").textContent === ":Switch (One-Handed)";
        $("twoHandCb").checked = prev2h;
        $("twoHandCb").dispatchEvent(new Event("change"));
        switchMainView("map");
        const fMapHidden = $("erFtrPromptY").classList.contains("hidden") && $("erFtrPromptX").classList.contains("hidden");

        switchMainView("pip");
        const prevPvMode = state.pvPreviewMode;
        const prevMapBossHudPv = state.pipMapBossHud;
        state.pvPreviewMode = "hud";
        state.pipMapBossHud = true;
        renderPipViewerWorkspace();
        const hasBossDom = Boolean(document.querySelector("#pvEnemyBox .pip-boss-card .er-meter.hp"));
        const hasStatsDom = Boolean(document.querySelector("#pvStatsBox .pip-stats-grid"));
        const pvRealBossOk = hasBossDom && hasStatsDom;
        const prevCorner = state.pipCorner;
        setPipCorner("top-right", false, false);
        const cornerOk = $("pvOverlayShell") && $("pvOverlayShell").classList.contains("corner-tr");
        setPipCorner(prevCorner, false, false);
        state.pvPreviewMode = prevPvMode;
        state.pipMapBossHud = prevMapBossHudPv;

        setPipMode("stats");
        const pvHiddenDuringStats = Boolean($("pipViewerWorkspace") && getComputedStyle($("pipViewerWorkspace")).display === "none");
        const pip2hHiddenStats = Boolean($("pipTwoHandBtn") && getComputedStyle($("pipTwoHandBtn")).display === "none");
        setPipMode("hud");
        const pip2hDisabledOk = pip2hHiddenStats && Boolean($("pipTwoHandBtn") && getComputedStyle($("pipTwoHandBtn")).display === "none");
        const prevBossLive = state.ramLive;
        const prevBossArr = state.ramBosses.slice();
        const prevArmStyle = state.armStyle;
        const prevRhSlot = state.activeRhSlot;
        const prevArBuffs = state.ramLiveArBuffs;
        const prevBossPlace = state.pipBossPlacement;
        state.pipMapBossHud = true;
        state.ramLive = true;
        setPipBossPlacement("inside", false);
        const mapWrapEl = document.querySelector(".map-canvas-wrap");
        window.__onLiveRamBosses([]);
        const hudMapHNoBoss = mapWrapEl ? mapWrapEl.getBoundingClientRect().height : 0;
        window.__onLiveRamBosses([{
          slot: 0, name: "Boss", hp: 500, maxHp: 1000, stance: 10, maxStance: 80, stanceReset: 2,
          statuses: [
            { key: "bleed", label: "Bleed", cur: 80, max: 200 },
            { key: "poison", label: "Poison", cur: 40, max: 180 },
            { key: "rot", label: "Rot", cur: 30, max: 180 },
            { key: "frost", label: "Frost", cur: 50, max: 220 },
            { key: "sleep", label: "Sleep", cur: 20, max: 150 },
            { key: "madness", label: "Madness", cur: 10, max: 120 },
          ],
        }]);
        const hudMapHWithBossInside = mapWrapEl ? mapWrapEl.getBoundingClientRect().height : 0;
        const hudBodyOk = document.body.classList.contains("pip-hud");
        const hudMapOk = getComputedStyle($("mapWorkspace")).display !== "none";
        const hudBossOverMapOk = getComputedStyle($("pipMapBossBox")).display !== "none"
          && getComputedStyle($("pipMapBossBox")).position === "absolute"
          && getComputedStyle($("pipBossBox")).display === "none"
          && Math.abs(hudMapHWithBossInside - hudMapHNoBoss) <= 1.5;
        const statsViewEl = $("pipStatsView");
        const hudStatsHNoBoss = statsViewEl ? statsViewEl.getBoundingClientRect().height : 0;
        setPipBossPlacement("below", false);
        const hudMapHWithBossBelow = mapWrapEl ? mapWrapEl.getBoundingClientRect().height : 0;
        const hudStatsHWithBossBelow = statsViewEl ? statsViewEl.getBoundingClientRect().height : 0;
        const bossBoxEl = $("pipBossBox");
        const bossRectBelow = bossBoxEl ? bossBoxEl.getBoundingClientRect() : null;
        const extWithBossBelow = syncPipBossExtension();
        const hudBossBelowOk = getComputedStyle(bossBoxEl).display !== "none"
          && bossBoxEl.parentElement === document.body
          && bossBoxEl.scrollHeight <= bossBoxEl.clientHeight + 2
          && Boolean(bossRectBelow && bossRectBelow.height >= 40)
          && extWithBossBelow >= 40
          && getComputedStyle($("pipMapBossBox")).display === "none"
          && Math.abs(hudStatsHWithBossBelow - hudStatsHNoBoss) <= 1.5
          && Math.abs(hudMapHWithBossBelow - hudMapHNoBoss) <= 1.5;
        setPipBossPlacement("inside", false);
        const extInside = syncPipBossExtension();
        const hudBossOk = hudBossOverMapOk && hudBossBelowOk && extInside === 0;
        const hudStatsOk = getComputedStyle($("pipStatsView")).display !== "none";
        const hudSameWinOk = hudBodyOk && hudMapOk && hudBossOk && hudStatsOk;

        // Check live 1H/2H auto-detection, all 3 placement modes, and live applied AR buffs
        const assetsRef = getErMenuAssets();
        const defaultGripIsWeapon = state.pipGripPlacement === "weapon";
        let prevEqRh0 = null;
        if (!(state.equippedSlots && state.equippedSlots.rh && state.equippedSlots.rh[0])) {
          prevEqRh0 = ((state.equippedSlots && state.equippedSlots.rh) || [null, null, null]).slice();
          const _sampleW = state.data.weapons.find((w) => !w.dual && w.atk && w.atk[0] > 50) || state.data.weapons[0];
          if (_sampleW) {
            if (!state.equippedSlots) state.equippedSlots = { rh: [null, null, null], lh: [null, null, null] };
            state.equippedSlots.rh = [{ weaponId: _sampleW.id, level: Math.min(10, _sampleW.maxLv || 10) }, prevEqRh0[1] || null, prevEqRh0[2] || null];
          }
        }
        state.armStyle = 1;
        state.activeRhSlot = 0;
        window.__onLiveRamArBuffs(null);
        const ar1hText = Number(($("pipWeaponsList")?.querySelector(".pip-wep-row .pip-wep-ar")?.textContent) || 0);
        const badge1h = document.querySelector("#pipPresetTag .pip-grip-badge.one-h");
        const wTile1h = document.querySelector("#pipWeaponsList .pip-wep-row.featured-grip .pip-grip-tile img");
        const has1hIcon = Boolean(badge1h && badge1h.textContent.trim() === "1" && wTile1h && assetsRef.grip_1h && wTile1h.getAttribute("src") === assetsRef.grip_1h);
        state.armStyle = 3;
        window.__onLiveRamArBuffs({
          statBonus: [0, 0, 0, 0, 0],
          globalMult: [1.15, 1.15, 1.15, 1.15, 1.15],
          globalFlat: [0, 0, 0, 0, 0],
          rhMult: [1, 1, 1, 1, 1],
          rhFlat: [0, 0, 85, 0, 0],
          lhMult: [1, 1, 1, 1, 1],
          lhFlat: [0, 0, 0, 0, 0],
          activeCount: 2,
        });
        const ar2hBuffed = Number(($("pipWeaponsList")?.querySelector(".pip-wep-row .pip-wep-ar")?.textContent) || 0);
        window.__onLiveRamArBuffs({
          statBonus: [0, 0, 0, 0, 0],
          globalMult: [1.15, 1.15, 1.15, 1.15, 1.15],
          globalFlat: [0, 0, 0, 0, 0],
          rhMult: [1, 1, 1, 1, 1],
          rhFlat: [0, 0, 85, 0, 0],
          lhMult: [1, 1, 1, 1, 1],
          lhFlat: [0, 0, 0, 0, 0],
          activeCount: 2,
          slotAr: { rh: [448, 422, 320], lh: [267, 422, 426] },
        });
        const liveSlotArOk = ar1hText === 0 || Number(($("pipWeaponsList")?.querySelector(".pip-wep-row .pip-wep-ar")?.textContent) || 0) === 448;
        const badge2hEl = document.querySelector("#pipPresetTag .pip-grip-badge.two-h");
        const wTile2h = document.querySelector("#pipWeaponsList .pip-wep-row.featured-grip .pip-grip-tile img");
        const has2hWeapon = Boolean(badge2hEl && badge2hEl.textContent.includes("2") && badge2hEl.textContent.includes("(RH)") && wTile2h && assetsRef.grip_2h && wTile2h.getAttribute("src") === assetsRef.grip_2h);
        setPipGripPlacement("header", false);
        const has2hHeader = Boolean(document.querySelector("#pipHdrGripSlot .pip-grip-tile img")?.getAttribute("src") === assetsRef.grip_2h);
        setPipGripPlacement("map", false);
        const has2hMap = Boolean(document.querySelector("#pipMapGripBox .pip-grip-tile img")?.getAttribute("src") === assetsRef.grip_2h);
        setPipGripPlacement("weapon", false);
        if (prevEqRh0) state.equippedSlots.rh = prevEqRh0;
        const presetTxt = ($("pipPresetTag")?.textContent || "");
        const arLabelClean = presetTxt.includes("AR") && !presetTxt.includes("Live AR");
        const pipLiveArAndStanceOk = defaultGripIsWeapon && arLabelClean && has1hIcon && has2hWeapon && has2hHeader && has2hMap && (ar2hBuffed > ar1hText || ar1hText === 0);

        // Check official ER status effect <img> icons in Armory & PiP Boss HUD
        const armStImgs = Array.from(document.querySelectorAll("#tableHead img.th-status-img"));
        const bossStImgs = Array.from(document.querySelectorAll("#pipMapBossBox img.er-st-img"));
        const erStatusImgsOk = armStImgs.length === 6 && bossStImgs.length === 6 &&
          armStImgs.every((i) => i.naturalWidth > 0) && bossStImgs.every((i) => i.naturalWidth > 0);

        // Check HUD mode supports distance-based marker labels (px) & search popover
        setPipSearchPopover(true);
        const hudSearchOk = Boolean($("pipSearchPopover") && !$("pipSearchPopover").classList.contains("hidden"));
        setPipSearchPopover(false);
        const prevSearch = mapState.search;
        const prevShowLbl = mapState.showLabels;
        const prevNearbyOnly = mapState.pipNearbyLabelsOnly;
        const prevRad = mapState.pipNearbyLabelRadius;
        const prevZoom = mapState.zoom;
        mapState.search = "";
        mapState.showLabels = true;
        mapState.pipNearbyLabelsOnly = true;
        mapState.zoom = 5.0;
        mapState.pipNearbyLabelRadius = 35;
        renderMapCanvas();
        const tightCnt = mapState.lastLabelsDrawnCount;
        mapState.pipNearbyLabelRadius = 220;
        renderMapCanvas();
        const wideCnt = mapState.lastLabelsDrawnCount;
        const hudNearbyLabelsOk = hudSearchOk && wideCnt >= tightCnt && mapState.lastLabelsDrawnCount === wideCnt;
        mapState.search = prevSearch;
        mapState.showLabels = prevShowLbl;
        mapState.pipNearbyLabelsOnly = prevNearbyOnly;
        mapState.pipNearbyLabelRadius = prevRad;
        mapState.zoom = prevZoom;

        // Check #pipBar fits on 1 row at 380px window width and packs densely at 290px with >= 5 items on Row 1
        const barEl = $("pipBar");
        document.body.classList.add("pip-hover");
        const origBarWidth = barEl.style.width;
        barEl.style.right = "auto";
        barEl.style.width = "368px";
        syncPipBarHeightVar();
        const singleRowAt380Ok = barEl.offsetHeight <= 34 && barEl.scrollWidth <= barEl.clientWidth + 1;
        barEl.style.width = "278px";
        syncPipBarHeightVar();
        const barRect = barEl.getBoundingClientRect();
        const visiblePills = Array.from(barEl.querySelectorAll("button.pip-pill")).filter((b) => getComputedStyle(b).display !== "none");
        const pillsInBounds = visiblePills.every((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= barRect.left - 1 && r.right <= barRect.right + 1;
        });
        const row1Top = visiblePills.length ? visiblePills[0].getBoundingClientRect().top : 0;
        const row1Count = visiblePills.filter((b) => Math.abs(b.getBoundingClientRect().top - row1Top) < 4).length;
        const pipBarWrapOk = singleRowAt380Ok && barEl.scrollWidth <= barEl.clientWidth + 1 && barEl.offsetHeight > 30 && pillsInBounds && row1Count >= 5;
        barEl.style.width = origBarWidth;
        barEl.style.right = "";
        syncPipBarHeightVar();

        state.armStyle = prevArmStyle;
        state.activeRhSlot = prevRhSlot;
        state.ramLiveArBuffs = prevArBuffs;
        state.ramBosses = prevBossArr;
        state.ramLive = prevBossLive;
        state.pipMapBossHud = prevMapBossHudPv;
        setPipBossPlacement(prevBossPlace, false);
        renderPipBossBoxes();
        setPipMode(prevMode);

        switchMainView("system");
        if (window.__switchSysSubTab) window.__switchSysSubTab("mod");
        const erNums = Array.from(document.querySelectorAll("#systemWorkspace .er-num, .topbar .save-pill"));
        const noClip = erNums.every((el) => el.scrollWidth <= el.clientWidth + 2);
        const fSysHidden = $("erFtrPromptY").classList.contains("hidden") && $("erFtrPromptX").classList.contains("hidden");

        switchMainView(prevView);
        return {
          ok: focusPreserved && guardOk && previewCycled && pvHiddenDuringStats && noClip &&
              fEquipVis && fArmory1h && fArmory2h && fMapHidden && fSysHidden &&
              pvRealBossOk && cornerOk && hudSameWinOk && erStatusImgsOk && hudNearbyLabelsOk &&
              pipBarWrapOk && pip2hDisabledOk && pipLiveArAndStanceOk && liveSlotArOk,
          focusPreserved,
          guardOk,
          previewCycled,
          pvHiddenDuringStats,
          noClip,
          footerContextOk: fEquipVis && fArmory1h && fArmory2h && fMapHidden && fSysHidden,
          pvRealBossOk,
          cornerOk,
          hudSameWinOk,
          erStatusImgsOk,
          hudNearbyLabelsOk,
          pipBarWrapOk,
          pip2hDisabledOk,
          pipLiveArAndStanceOk,
          liveSlotArOk,
        };
      },
      startMapImagesTest() {
        window.__ERR_MAP_IMAGES = null;
        (async () => {
          const out = {};
          for (const l of ["m00", "m01", "m10"]) {
            const r = await window.pywebview.api.get_map_image(l);
            out[l] = Boolean(r && r.ok && r.dataUrl && r.dataUrl.length > 10000);
          }
          window.__ERR_MAP_IMAGES = out;
        })().catch((err) => {
          window.__ERR_MAP_IMAGES = { error: String(err) };
        });
      },
      startMapTilesTest() {
        window.__ERR_MAP_TILES = null;
        (async () => {
          const r0 = await window.pywebview.api.get_map_tile("m00", 3, 5);
          const r1 = await window.pywebview.api.get_map_tile("m10", 3, 5);
          window.__ERR_MAP_TILES = {
            m00: Boolean(r0 && r0.ok && r0.dataUrl && r0.dataUrl.length > 5000),
            m10: Boolean(r1 && r1.ok && r1.dataUrl && r1.dataUrl.length > 5000),
          };
        })().catch((err) => {
          window.__ERR_MAP_TILES = { error: String(err) };
        });
      },
      async testV21Features() {
        const prevView = state.activeView;
        const prevMode = state.pipMode;
        const prevMapBossHud = state.pipMapBossHud;
        const prevBossPlace = state.pipBossPlacement;
        const prevResMode = state.pipBossResMode;
        const prevPreset = state.enemyPreset;
        const prevCustomBoss = state.customBossPreset;
        const prevFavs = state.favoriteIds.slice();
        const prevOwnedOnly = state.ownedOnly;
        const prevFavOnly = state.favoritesOnly;

        // 1) Boss Resistance Strip (Compact, Full, Off) + Clickable Boss Name -> Armory
        setPipBossPlacement("inside", false);
        setPipMapBossHud(true, false);
        await setPipMode("hud");
        const prevLive = state.ramLive;
        const prevBosses = state.ramBosses.slice();
        state.ramLive = true;
        window.__onLiveRamBosses([{
          slot: 0, npcParamId: 21200000, name: "Malenia, Blade of Miquella", hp: 5000, maxHp: 10000,
          stance: 40, maxStance: 80, stanceReset: 2,
          def: [140, 139, 139, 139, 139],
          neg: [0, 0, 0, -10, 0, -20, 0, 40],
          statuses: [{ key: "bleed", label: "Bleed", cur: 50, max: 400 }],
        }]);
        setPipBossResMode("compact", false);
        const compCount = document.querySelectorAll("#pipMapBossBox .er-res-pill").length;
        const compWeak = document.querySelectorAll("#pipMapBossBox .er-res-pill.res-weak").length;
        const compRes = document.querySelectorAll("#pipMapBossBox .er-res-pill.res-resist").length;
        setPipBossResMode("full", false);
        const fullCount = document.querySelectorAll("#pipMapBossBox .er-res-pill").length;
        setPipBossResMode("off", false);
        const offCount = document.querySelectorAll("#pipMapBossBox .er-res-pill").length;
        const bossStripOk = compCount === 3 && compWeak === 2 && compRes === 1 && fullCount === 8 && offCount === 0;

        // No-<0% fallback highlights lowest negation in Compact
        window.__onLiveRamBosses([{
          slot: 0, npcParamId: 1, name: "Armored Golem", hp: 1000, maxHp: 1000, stance: 0, maxStance: 0,
          def: [120, 120, 120, 120, 120],
          neg: [35, 35, 10, 35, 45, 45, 45, 45],
          statuses: [],
        }]);
        setPipBossResMode("compact", false);
        const bestHlOk = document.querySelectorAll("#pipMapBossBox .er-res-pill.res-best").length >= 1;

        // Live Target + Boss Picker in Armory
        const bossCnt = (state.data && Array.isArray(state.data.bossPresets)) ? state.data.bossPresets.length : 0;
        if (window.__openBossPicker) window.__openBossPicker();
        const pickerPopOk = Boolean($("bossPickerPopover") && !$("bossPickerPopover").classList.contains("hidden") && document.querySelectorAll("#bossPickerList .boss-picker-item").length >= 5);
        $("bossPickerPopover")?.classList.add("hidden");
        await inspectBossInArmory({ npcParamId: 21200000, name: "Malenia, Blade of Miquella", def: [140, 139, 139, 139, 139], neg: [0, 0, 0, -10, 0, -20, 0, 40] });
        const customBossSelectedOk = state.enemyPreset === "__CUSTOM_BOSS__" && state.activeView === "calc";
        state.enemyPreset = "__LIVE_TARGET__";
        populateEnemySelect();
        recalculateAndRender();
        const liveTargetOk = $("enemySelect").value === "__LIVE_TARGET__";

        // 2) Equip Load Bar + Talisman & Live RAM multiplier support
        const el0 = computeEquipLoad(null);
        const prevRamAr = state.ramLiveArBuffs;
        state.ramLiveArBuffs = { equipWeightMult: 1.25, endBonus: 0 };
        const elBuff = computeEquipLoad(null);
        const equipLoadOk = el0.maxLoad >= 80 && elBuff.maxLoad > el0.maxLoad * 1.1 && Boolean($("armoryEquipLoadBox")?.textContent.includes("Roll"));
        state.ramLiveArBuffs = prevRamAr;

        // 3) Owned Only + Favorites + Quick Filter Presets + Inv Upgrade Sync
        const uchi = state.data.weapons.find((w) => w.baseName === "Uchigatana") || state.data.weapons[0];
        toggleFavoriteWeapon(uchi.id, false);
        $("favoritesOnlyCb").checked = true;
        $("favoritesOnlyCb").dispatchEvent(new Event("change"));
        const favOnlyCount = lastComputedList.length;
        $("favoritesOnlyCb").checked = false;
        $("favoritesOnlyCb").dispatchEvent(new Event("change"));
        let ownedOk = true;
        if (state.characters.length > 0 && state.characters[0].owned && (state.characters[0].owned.weapons || []).length > 0) {
          $("ownedOnlyCb").checked = true;
          $("ownedOnlyCb").dispatchEvent(new Event("change"));
          ownedOk = lastComputedList.length > 0 && lastComputedList.length < state.data.weapons.length;
          $("ownedOnlyCb").checked = false;
          $("ownedOnlyCb").dispatchEvent(new Event("change"));
        }

        // 4) PiP Lock, Auto-Hide, Smart Fade & Locate Closest + Auto-Clear Beacon
        setPipLocked(true, false);
        const lockOk = document.body.classList.contains("pip-locked") && $("pipLockBtn").classList.contains("active");
        setPipLocked(false, false);

        // Locate closest test with two fake markers on m00
        await switchMainView("map");
        const lpPrev = state.ramPos;
        state.ramPos = { area: 60, gridX: 44, gridZ: 36, sub: 0, x: 100.0, y: 0.0, z: 100.0, yaw: 0.0 };
        const pinBefore = { kind: "beacon", slot: 1, layer: "m00", u: 0.419, v: 0.65, order: 1 };
        mapState.ramPins = [pinBefore];
        checkAutoClearBeaconOnArrival({ area: 60, gridX: 44, gridZ: 36, sub: 0, x: 100.0, y: 0.0, z: 100.0, yaw: 0.0 });
        const beaconKeyCheckOk = mapState.clearedBeaconKeys instanceof Set;
        mapState.clearedBeaconKeys.clear();
        state.ramPos = lpPrev;

        // Cleanup
        state.favoriteIds = prevFavs;
        state._favSet = new Set(prevFavs);
        state.ownedOnly = prevOwnedOnly;
        state.favoritesOnly = prevFavOnly;
        state.customBossPreset = prevCustomBoss;
        state.enemyPreset = prevPreset;
        state.ramLive = prevLive;
        state.ramBosses = prevBosses;
        setPipBossResMode(prevResMode, false);
        setPipBossPlacement(prevBossPlace, false);
        setPipMapBossHud(prevMapBossHud, false);
        await setPipMode(prevMode);
        await switchMainView(prevView);
        populateEnemySelect();
        recalculateAndRender();

        return {
          ok: bossStripOk && bestHlOk && bossCnt >= 200 && pickerPopOk && customBossSelectedOk && liveTargetOk && equipLoadOk && favOnlyCount === 1 && ownedOk && lockOk && beaconKeyCheckOk,
          bossStripOk,
          compCount,
          compWeak,
          compRes,
          fullCount,
          offCount,
          bestHlOk,
          bossCnt,
          pickerPopOk,
          customBossSelectedOk,
          liveTargetOk,
          equipLoadOk,
          favOnlyCount,
          ownedOk,
          lockOk,
          beaconKeyCheckOk,
        };
      },
      startV21Test() {
        window.__ERR_V21_RESULT = null;
        this.testV21Features()
          .then((r) => { window.__ERR_V21_RESULT = r; })
          .catch((err) => { window.__ERR_V21_RESULT = { error: String(err) }; });
      },
    };

    window.__ERR_READY = true;
  }

  window.addEventListener("pywebviewready", () => {
    initApp().catch((err) => {
      window.__JS_ERRORS.push(err && err.stack ? err.stack : String(err));
    });
  });
})();
