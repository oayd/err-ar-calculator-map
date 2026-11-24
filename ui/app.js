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

  function affIconSvg(aff) {
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

  function calcEffectiveDamage(elemAr, enemyPresetName, enemyPresets) {
    const preset = enemyPresets[enemyPresetName];
    if (!preset) {
      const sum = elemAr[0] + elemAr[1] + elemAr[2] + elemAr[3] + elemAr[4];
      return { total: sum, elems: elemAr.slice() };
    }
    const defs = preset.def;
    const negs = preset.neg;
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
      if (buffs.elemMult) {
        for (let el = 0; el < 5; el++) {
          elemAr[el] *= buffs.elemMult[el];
        }
      }
    }
    const stanceMult = (buffs && buffs.stanceMult) ? buffs.stanceMult : 1.0;
    const effStance = (weapon.stance || 0) * stanceMult;

    const totalAr = elemAr[0] + elemAr[1] + elemAr[2] + elemAr[3] + elemAr[4];
    const eff = calcEffectiveDamage(elemAr, enemyPreset, enemyPresets);
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
    enemyPreset: "Raw AR (No Defense)",
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
    compareIds: [],
    activeTab: "details",
    activeView: "calc",
    optResults: [],
    liveWatch: true,
    ramLive: false,
    ramChar: null,
    ramPos: null,
    pipMode: "off",
    pipOpacity: 1.0,
    bannerDismissed: false,
    lastRenderedKey: "",
    domColsSpec: [],
  };

  const MAP_CAT_META = {
    grace: { label: "Site of Grace", color: "#ffe48a", shape: "star" },
    weapon: { label: "Weapon", color: "#f2685a", shape: "diamond" },
    talisman: { label: "Talisman", color: "#5ee08a", shape: "hex" },
    armor: { label: "Armor", color: "#6eb3fa", shape: "square" },
    boss: { label: "Boss", color: "#ff4466", shape: "triangle" },
    merchant: { label: "Merchant", color: "#f0b840", shape: "ring" },
    poi: { label: "Landmark", color: "#c5cbd6", shape: "circle" },
  };

  const mapState = {
    loaded: false,
    loading: false,
    data: null,
    icons: {},
    iconImgs: {},
    images: {},
    imgPromises: {},
    tiles: new Map(),
    tilePromises: new Map(),
    tileInFlight: 0,
    layer: "m00",
    cats: { grace: true, weapon: true, talisman: true, armor: true, boss: true, merchant: true, poi: true },
    showPlayer: true,
    followPlayer: false,
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
  };

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
        const cSpan = document.createElement("span");
        cSpan.textContent = node.label;
        cLbl.appendChild(cCb);
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
    const sel = $("enemySelect");
    sel.innerHTML = "";
    for (const name of Object.keys(state.enemyPresets)) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    sel.value = state.enemyPreset in state.enemyPresets ? state.enemyPreset : "Raw AR (No Defense)";
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

  // Table Columns Definition & Header Builder (exact 2-row grouped tclark.io header + Extra Columns)
  function getExtraColDefs() {
    const extras = [];
    if (state.colCrit) extras.push({ id: "crit", label: "Crit", width: "52px", numeric: true });
    if (state.colDType) extras.push({ id: "ptype", label: "Dmg Type", width: "92px", numeric: false });
    if (state.colBuff) extras.push({ id: "buff", label: "Buff", width: "44px", numeric: true });
    if (state.colStam) extras.push({ id: "r1stam", label: "Stam", width: "52px", numeric: true });
    if (state.colStance) extras.push({ id: "stance", label: "Stance", width: "56px", numeric: true });
    return extras;
  }

  function updateExtraColsButtonLabel() {
    const cnt = [state.colCrit, state.colDType, state.colBuff, state.colStam, state.colStance].filter(Boolean).length;
    $("extraColsBtn").textContent = `Extra Columns (${cnt}) \u25BE`;
  }

  function getColumnsSpec() {
    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    const cols = [{ id: "name", width: "225px", align: "left", numeric: false }];

    if (!state.showDamageSplit) {
      cols.push({ id: "total", width: "76px", numeric: true, arStyle: true });
      if (showEff) cols.push({ id: "eff", width: "68px", numeric: true, effStyle: true });
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
      cols.push({ id: st.key, width: "34px", numeric: true });
    }
    for (let i = 0; i < 5; i++) {
      cols.push({ id: `sc_${i}`, width: "36px", numeric: state.numericScaling });
    }
    for (let i = 0; i < 5; i++) {
      cols.push({ id: `rq_${i}`, width: "34px", numeric: true });
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
      for (const [cid, lbl] of [["phys", "Phys"], ["mag", "Mag"], ["fire", "Fire"], ["thun", "Ltng"], ["holy", "Holy"], ["spell", "Spell"], ["total", "Total"]]) {
        row2 += `<th class="sortable ${state.sortCol === cid ? "sorted" : ""}" data-sort="${cid}">${lbl}${sortIndicator(cid)}</th>`;
      }
      if (showEff) {
        row2 += `<th class="sortable ${state.sortCol === "eff" ? "sorted" : ""}" data-sort="eff">Eff${sortIndicator("eff")}</th>`;
      }
    }

    for (const st of STATUS_COL_SPECS) {
      row2 += `<th class="sortable ${state.sortCol === st.key ? "sorted" : ""}" data-sort="${st.key}" title="${st.title}"><svg class="th-icon" viewBox="0 0 24 24" style="color:${st.color}">${st.svg}</svg>${sortIndicator(st.key)}</th>`;
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
    if (!state.groupByType) {
      const sorted = computed.slice().sort((a, b) => compareResults(a, b, state.sortCol, state.sortDesc));
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
      const arr = byType.get(tName).sort((a, b) => compareResults(a, b, state.sortCol, state.sortDesc));
      flat.push({ kind: "group", label: `${tName} (${arr.length})` });
      for (let i = 0; i < arr.length; i++) {
        flat.push({ kind: "row", res: arr[i], stripe: i % 2 });
      }
    }
    state.flatItems = flat;
  }

  function matchesPreFilter(w, tokens) {
    if (state.equippedOnly && !state.equippedMap.has(w.id)) return false;
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

    let computed = [];
    if (state.equippedOnly) {
      for (const [wid, eqLv] of state.equippedMap.entries()) {
        const w = state.byId.get(wid);
        if (!w || !matchesPreFilter(w, tokens)) continue;
        const r = computeWeapon(w, state.data, state.enemyPresets, stats, regLv, somberLv, twoHand, eqLv, ep, buffs);
        if (effOnly && !r.met) continue;
        computed.push(r);
      }
    } else if (bestOnly) {
      const bestByBase = new Map();
      const metricCol = state.sortCol.startsWith("sc_") || state.sortCol.startsWith("rq_") || state.sortCol === "name" || state.sortCol === "ptype"
        ? (state.enemyPreset !== "Raw AR (No Defense)" ? "eff" : "total")
        : state.sortCol;
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        if (!matchesPreFilter(w, tokens)) continue;
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
        if (!matchesPreFilter(w, tokens)) continue;
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
    if (state.pipMode === "stats") renderPipStats();
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
    const star = isEq ? '<span class="eq-star" title="Equipped">&#9733;</span>' : "";
    const dispName = `${star}${escHtml(w.name)} +${r.lv}`;

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

    const sliceKey = `${start}:${end}:${total}:${state.calcSerial}:${state.showDamageSplit}:${state.numericScaling}:${state.enemyPreset}:${state.colCrit}:${state.colDType}:${state.colBuff}:${state.colStam}:${state.colStance}:${state.inspectedRes ? state.inspectedRes.weapon.id : -1}`;
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
        const sign = res.scale[i] >= 0 ? "+" : "";
        lines.push(`${elemNames[i]}: ${res.ar[i].toFixed(1).padStart(6)}  (Base ${res.base[i].toFixed(1).padStart(5)} ${sign}${res.scale[i].toFixed(1).padStart(5)}) -> Eff ${res.effElems[i].toFixed(1)}`);
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
      state.activeBuffs
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

  function pinWeaponId(wid) {
    if (!state.byId.has(wid)) return;
    if (!state.compareIds.includes(wid)) {
      if (state.compareIds.length >= 6) state.compareIds.shift();
      state.compareIds.push(wid);
    }
    refreshCompareTray();
    openDrawer("compare");
  }

  function refreshCompareTray() {
    const n = state.compareIds.length;
    $("topCompareBtn").textContent = `Compare (${n})`;
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
    state.equippedMap = new Map();
    for (const eq of ch.equipped || []) {
      state.equippedMap.set(eq.weaponId, eq.level);
    }
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
    $("infoBannerText").innerHTML =
      `Using regulation data from <strong>ELDEN RING Reforged v2.3.9.1</strong> &middot; Loaded <strong>${escHtml(ch.name)} (Lv.${ch.level})</strong> from <strong>${escHtml(saveName)}</strong>`;
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
      enemyPreset: state.enemyPreset,
      liveWatch: state.liveWatch,
      bannerDismissed: state.bannerDismissed,
    });
  }

  function bindUiEvents() {
    $("drawerToggleBtn").addEventListener("click", () => {
      $("sidebar").classList.toggle("collapsed");
      setTimeout(() => renderVirtualViewport(true), 200);
    });

    $("topReloadBtn").addEventListener("click", async () => {
      const res = await window.pywebview.api.reload_save(true);
      if (applySavePayload(res, true)) recalculateAndRender();
    });
    $("sideReloadBtn").addEventListener("click", async () => {
      const res = await window.pywebview.api.reload_save(true);
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
      persistSettings();
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_live_watch) {
        window.pywebview.api.set_live_watch(state.liveWatch);
      }
    });

    $("topMatchEqBtn").addEventListener("click", () => matchEquippedLevels(true));
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
    $("topRefreshModBtn").addEventListener("click", async () => {
      const btn = $("topRefreshModBtn");
      btn.disabled = true;
      btn.textContent = "Extracting...";
      try {
        const res = await window.pywebview.api.refresh_mod_data();
        if (res && res.ok) {
          state.data = res.data;
          state.byId.clear();
          state.byBase.clear();
          buildSearchTags(state.data);
          populateGearDropdowns();
          syncGearDropdownValues();
          recalculateAndRender();
        } else {
          alert((res && res.message) || "extract_err_data.py not found alongside executable.");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Refresh Mod";
      }
    });
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
    $("topSearchFocusBtn").addEventListener("click", () => {
      $("sidebar").classList.remove("collapsed");
      const inp = $("searchInput");
      inp.focus();
      inp.select();
    });

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
      renderTableHeader();
      persistSettings();
      recalculateAndRender();
    });

    $("twoHandCb").addEventListener("change", (e) => {
      state.twoHand = e.target.checked;
      update2hHint();
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
      recalculateAndRender();
    });

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
    $("tableBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr.w-row");
      if (!tr) return;
      const wid = Number(tr.dataset.wid);
      const item = state.flatItems.find((x) => x.kind === "row" && x.res.weapon.id === wid);
      if (!item) return;
      renderInspectorDetails(item.res, true);
      openDrawer();
      renderVirtualViewport(true);
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

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        $("sidebar").classList.remove("collapsed");
        $("searchInput").focus();
        $("searchInput").select();
      } else if (e.key === "Escape") {
        if (state.pipMode !== "off") {
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
        window.pywebview.api.reload_save(true).then((res) => {
          if (applySavePayload(res, true)) recalculateAndRender();
        });
      } else if (e.key.toLowerCase() === "p" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        if (state.inspectedRes) pinWeaponId(state.inspectedRes.weapon.id);
      }
    });

    $("tabCalcBtn").addEventListener("click", () => switchMainView("calc"));
    $("tabMapBtn").addEventListener("click", () => switchMainView("map"));
    $("showOnMapBtn").addEventListener("click", () => {
      if (state.inspectedRes) locateWeaponOnMap(state.inspectedRes.weapon);
    });

    window.addEventListener("resize", () => {
      renderVirtualViewport(true);
      if (state.activeTab === "curve" && !$("inspectorDrawer").classList.contains("hidden")) {
        renderScalingCurve();
      }
      if (state.activeView === "map") renderMapCanvas();
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
      if (state.activeView === "map") {
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
    updateMapPlayerReadout();
    if (state.activeView === "map") renderMapCanvas();
  }

  function applyLiveRamCharacter(ch) {
    if (!ch || !ch.stats) return;
    state.ramLive = true;
    state.ramChar = ch;
    state.savedSnapshot = {
      str: ch.stats.str,
      dex: ch.stats.dex,
      int: ch.stats.int,
      fai: ch.stats.fai,
      arc: ch.stats.arc,
    };
    state.stats = Object.assign({}, state.savedSnapshot);
    state.equippedMap = new Map();
    for (const eq of ch.equipped || []) {
      state.equippedMap.set(eq.weaponId, eq.level);
    }
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
    $("charMetaText").textContent = `LIVE RAM · ${ch.name} Lv.${ch.level} · Vig ${ch.stats.vig} Mnd ${ch.stats.mnd} End ${ch.stats.end}`;
    $("saveAcceptedIcon").classList.add("active");
    $("saveStatusPill").classList.add("ram-live");
    $("infoBannerText").innerHTML =
      `Using regulation data from <strong>ELDEN RING Reforged v2.3.9.1</strong> &middot; Syncing <strong>${escHtml(ch.name)} (Lv.${ch.level})</strong> from <strong>LIVE RAM</strong>`;
    recalculateAndRender();
    pulseSavePill();
    updateMapPlayerReadout();
  }

  function applyLiveRamPos(pos) {
    if (!pos) return;
    state.ramLive = true;
    state.ramPos = pos;
    updateMapPlayerReadout();
    if (state.activeView === "map") {
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
    state.ramLive = false;
    state.ramChar = null;
    state.ramPos = null;
    $("saveStatusPill").classList.remove("ram-live");
    const ch = state.characters.find((c) => c.slot === state.activeSlot) || state.characters[0];
    if (ch) {
      applyCharacter(ch);
      recalculateAndRender();
    } else {
      $("charMetaText").textContent = "Manual stats";
      $("saveAcceptedIcon").classList.remove("active");
      $("infoBannerText").innerHTML =
        `Using regulation data from <strong>ELDEN RING Reforged v2.3.9.1</strong>`;
      recalculateAndRender();
    }
    updateMapPlayerReadout();
    if (state.activeView === "map") renderMapCanvas();
  }

  window.__onLiveSavePush = applyIncomingSaveUpdate;
  window.__onLivePlayerPos = applyIncomingPlayerPosUpdate;
  window.__onLiveRamChar = applyLiveRamCharacter;
  window.__onLiveRamPos = applyLiveRamPos;
  window.__onLiveRamStatus = applyLiveRamStatus;

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
    const layer = dstArea === 61 ? "m10" : (pp.area === 12 ? "m01" : "m00");
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
      el.textContent = `LIVE${hz}: ${chName} · ${layerName} (${Math.round(pos.x)}, ${Math.round(pos.z)}) ${yawToCompass(pos.yaw)}`;
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
    await Promise.all(decodes);
    for (const k of ["player", "grace", "weapon", "talisman", "armor", "boss", "merchant", "poi"]) {
      const el = $(`icon-legend-${k}`);
      if (el && rawIcons[k]) {
        el.src = rawIcons[k];
        el.classList.add("loaded");
      }
    }
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
          if (state.activeView === "map" && mapState.layer === layer) renderMapCanvas();
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
      if (!mapState.firstOpenDone) {
        mapState.firstOpenDone = true;
        const lp = getActiveLivePlayerPos();
        if (lp && lp.layer) mapState.layer = lp.layer;
      }
      syncMapLayerButtons();
      await ensureMapImage(mapState.layer);
      updateMapSearchList();
      updateMapPlayerReadout();
      resetMapView(false);
    } finally {
      mapState.loading = false;
      if (ov) ov.classList.add("hidden");
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
    const out = [];
    for (const m of mapState.data.markers) {
      if (m.layer !== mapState.layer) continue;
      if (!mapState.cats[m.cat]) continue;
      if (!markerMatchesSearch(m, q)) continue;
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
    const ikey = getMarkerIconKey(m);
    const sprite = mapState.iconImgs[ikey];
    if (sprite && sprite.naturalWidth > 0) {
      const ratio = sprite.naturalWidth / Math.max(1, sprite.naturalHeight);
      let dw = iconPx;
      let dh = iconPx;
      if (ratio > 1) dh = iconPx / ratio;
      else if (ratio < 1) dw = iconPx * ratio;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(dw, dh) * 0.448, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "rgba(25, 20, 14, 0.88)" : "rgba(12, 11, 10, 0.58)";
      ctx.fill();
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? "#f2cf7e" : "#ffffff";
        ctx.lineWidth = isSelected ? 2.2 : 1.4;
        ctx.stroke();
      }
      ctx.drawImage(sprite, x - dw * 0.5, y - dh * 0.5, dw, dh);
      ctx.restore();
      return;
    }
    const meta = MAP_CAT_META[m.cat] || MAP_CAT_META.poi;
    drawMarkerShape(ctx, meta.shape, x, y, iconPx * 0.34, meta.color, isSelected);
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
    if (state.activeView !== "map") return;
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
      ctx.fillText("Map tiles not cached locally — run extract_err_map.py --maps to extract", ox + 20, oy + 32);
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
    const drawOrder = ["poi", "armor", "talisman", "weapon", "merchant", "boss", "grace"];
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
        drawMarkerPin(ctx, m, sx, sy, iconPx, false, false);
      }
    }

    // Labels when zoomed in cleanly on Graces / Bosses / Landmarks
    if (mapState.zoom >= 3.2 || (isSearching && vis.length <= 40)) {
      ctx.font = "600 11px Segoe UI, sans-serif";
      ctx.textBaseline = "middle";
      let labelsDrawn = 0;
      const lblOff = iconPx * 0.52 + 4;
      for (const m of vis) {
        if (labelsDrawn >= 60) break;
        if (m.cat !== "grace" && m.cat !== "boss" && m.cat !== "merchant" && !mapState.search) continue;
        const sx = ox + m.u * scale;
        const sy = oy + m.v * scale;
        if (sx < 10 || sx > w - 40 || sy < 10 || sy > h - 10) continue;
        labelsDrawn++;
        const txt = m.name;
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = "rgba(15, 13, 11, 0.80)";
        ctx.fillRect(sx + lblOff, sy - 8, tw + 8, 16);
        ctx.fillStyle = "#ece4d8";
        ctx.fillText(txt, sx + lblOff + 4, sy);
      }
    }

    // Highlight hovered and selected pin on top
    for (const special of [mapState.hoveredPin, mapState.selectedPin]) {
      if (!special || special.layer !== mapState.layer) continue;
      const sx = ox + special.u * scale;
      const sy = oy + special.v * scale;
      drawMarkerPin(ctx, special, sx, sy, iconPx + (isSearching ? 6 : 4), special === mapState.selectedPin, special === mapState.hoveredPin);
    }

    // Live Player marker (official player cursor sprite + heading cone)
    const lp = mapState.showPlayer ? getActiveLivePlayerPos() : null;
    if (lp && lp.layer === mapState.layer) {
      const px = ox + lp.u * scale;
      const py = oy + lp.v * scale;
      ctx.save();
      ctx.translate(px, py);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(77, 240, 136, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "#4df088";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.rotate(lp.yaw + Math.PI);
      const pSprite = mapState.iconImgs.player_arrow || mapState.iconImgs.player;
      if (pSprite && pSprite.naturalWidth > 0) {
        const pr = pSprite.naturalWidth / Math.max(1, pSprite.naturalHeight);
        const ph = 28;
        const pw = Math.max(10, ph * pr);
        ctx.drawImage(pSprite, -pw * 0.5, -ph * 0.5, pw, ph);
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fillStyle = "#4df088";
        ctx.fill();
        ctx.strokeStyle = "#0b120e";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
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
    badge.textContent = meta.label;
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
    card.classList.remove("hidden");
    renderMapCanvas();
  }

  function updateMapSearchList() {
    const listEl = $("mapSearchList");
    const metaEl = $("mapSearchMeta");
    if (!listEl || !mapState.data) return;
    const q = mapState.search.trim().toLowerCase();
    const matches = [];
    for (const m of mapState.data.markers) {
      if (!mapState.cats[m.cat]) continue;
      if (q && !markerMatchesSearch(m, q)) continue;
      matches.push(m);
      if (!q && matches.length >= 40) break;
    }
    const total = q ? matches.length : Object.keys(mapState.cats).reduce((a, k) => a + (mapState.cats[k] ? (mapState.data.counts[k] || 0) : 0), 0);
    metaEl.textContent = q ? `${matches.length} matching markers` : `${total} enabled markers (${mapState.layer})`;
    const slice = matches.slice(0, 80);
    listEl.innerHTML = slice.map((m, idx) => {
      const meta = MAP_CAT_META[m.cat] || MAP_CAT_META.poi;
      const layerTag = m.layer === "m10" ? "DLC" : (m.layer === "m01" ? "UG" : "LB");
      const ikey = getMarkerIconKey(m);
      const iurl = mapState.icons[ikey] || mapState.icons[m.cat];
      const iconHtml = iurl
        ? `<img class="map-search-icon" src="${iurl}" alt="" />`
        : `<span class="map-dot ${m.cat}" style="background:${meta.color}"></span>`;
      return `<button type="button" class="map-search-item" data-midx="${idx}">
        ${iconHtml}
        <span class="map-search-item-txt">
          <div class="map-search-item-name">${escHtml(m.name)}</div>
          <div class="map-search-item-sub">[${layerTag}] ${escHtml(m.sub || meta.label)}</div>
        </span>
      </button>`;
    }).join("");
    listEl.querySelectorAll(".map-search-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const m = slice[Number(btn.dataset.midx)];
        if (!m) return;
        await focusMarkerOnMap(m, 4.5);
      });
    });
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
      window.pywebview.api.set_live_stream_mode(state.activeView, mapState.followPlayer).catch(() => {});
    }
  }

  async function setMapFollow(enabled) {
    mapState.followPlayer = Boolean(enabled);
    const btn = $("mapFollowBtn");
    if (btn) btn.classList.toggle("following", mapState.followPlayer);
    const pbtn = $("pipFollowBtn");
    if (pbtn) pbtn.classList.toggle("following", mapState.followPlayer);
    updateMapPlayerReadout();
    notifyStreamMode();
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

  function renderPipStats() {
    const ch = state.ramLive && state.ramChar
      ? state.ramChar
      : (state.characters.find((c) => c.slot === state.activeSlot) || null);
    const chName = ch ? `${ch.name} (Lv.${ch.level})` : "Manual Stats";
    $("pipCharName").textContent = chName;
    const badge = $("pipRamBadge");
    badge.textContent = state.ramLive ? "LIVE RAM" : (ch ? "SAVE" : "MANUAL");
    badge.classList.toggle("live", Boolean(state.ramLive));

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

    const showEff = state.enemyPreset !== "Raw AR (No Defense)";
    $("pipPresetTag").textContent = `${state.twoHand ? "2H · " : "1H · "}${showEff ? state.enemyPreset : "Raw AR"}`;
    const thBtn = $("pipTwoHandBtn");
    if (thBtn) thBtn.classList.toggle("active", state.twoHand);

    const weps = [];
    for (const [wid, eqLv] of state.equippedMap.entries()) {
      const w = state.byId.get(wid);
      if (!w) continue;
      weps.push(computeWeapon(w, state.data, state.enemyPresets, state.stats, state.regLv, state.somberLv, state.twoHand, eqLv, state.enemyPreset, state.activeBuffs));
    }
    weps.sort((a, b) => (showEff ? b.eff - a.eff : b.total - a.total));
    const listEl = $("pipWeaponsList");
    if (!weps.length) {
      listEl.innerHTML = `<div class="pip-wep-row"><span class="pip-wep-name" style="color:var(--text-muted)">No equipped weapons detected</span></div>`;
    } else {
      listEl.innerHTML = weps.slice(0, 6).map((r) => {
        const w = r.weapon;
        const effHtml = showEff ? `<span class="pip-wep-eff">(${Math.round(r.eff)})</span>` : "";
        return `<div class="pip-wep-row">
          <span class="pip-wep-name">${escHtml(w.baseName)} +${r.lv} <span class="pip-wep-aff">${escHtml(w.aff)}</span></span>
          <span class="pip-wep-ar${r.met ? "" : " ar-unmet"}">${Math.round(r.total)}</span>
          ${effHtml}
        </div>`;
      }).join("");
    }

    const armNames = (state.armorIds || []).map((id) => (id && state.data.armors && state.data.armors[String(id)] ? state.data.armors[String(id)].n : null)).filter(Boolean);
    const talNames = (state.talismanIds || []).map((id) => (id && state.data.talismans && state.data.talismans[String(id)] ? state.data.talismans[String(id)].n : null)).filter(Boolean);
    const parts = [];
    if (talNames.length) parts.push(`Talismans: ${talNames.join(", ")}`);
    if (armNames.length) parts.push(`Armor: ${armNames.join(", ")}`);
    $("pipGearLine").textContent = parts.join(" · ") || "Equip armor/talismans or buffs in Gear & Buffs";
  }

  async function setPipMode(mode) {
    const next = (mode === "map" || mode === "stats") ? mode : "off";
    state.pipMode = next;
    document.body.classList.toggle("pip-active", next !== "off");
    document.body.classList.toggle("pip-map", next === "map");
    document.body.classList.toggle("pip-stats", next === "stats");
    $("pipModeMapBtn").classList.toggle("active", next === "map");
    $("pipModeStatsBtn").classList.toggle("active", next === "stats");
    if (next === "stats") renderPipStats();

    if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_mode) {
      await window.pywebview.api.set_pip_mode(next, state.pipOpacity);
    }

    if (next === "map") {
      await switchMainView("map");
      if (getActiveLivePlayerPos() && !mapState.followPlayer) {
        await setMapFollow(true);
      } else {
        setTimeout(() => renderMapCanvas(), 60);
      }
    } else if (next === "stats") {
      renderPipStats();
      notifyStreamMode();
    } else {
      notifyStreamMode();
      setTimeout(() => {
        if (state.activeView === "map") renderMapCanvas();
        else renderVirtualViewport(true);
      }, 60);
    }
  }

  async function switchMainView(view) {
    state.activeView = view === "map" ? "map" : "calc";
    const isMap = state.activeView === "map";
    $("tabCalcBtn").classList.toggle("active", !isMap);
    $("tabMapBtn").classList.toggle("active", isMap);
    $("calcWorkspace").classList.toggle("hidden", isMap);
    $("mapWorkspace").classList.toggle("hidden", !isMap);
    $("drawerToggleBtn").style.visibility = isMap ? "hidden" : "visible";
    notifyStreamMode();
    if (isMap) {
      await ensureMapLoaded();
      renderMapCanvas();
    } else {
      renderVirtualViewport(true);
    }
  }

  async function locateWeaponOnMap(weapon) {
    await switchMainView("map");
    if (!mapState.loaded || !mapState.data) return;
    if (!mapState.cats.weapon) {
      mapState.cats.weapon = true;
      const cb = document.querySelector(".map-cat-cb[data-cat='weapon']");
      if (cb) cb.checked = true;
    }
    const baseLower = (weapon.baseName || weapon.name || "").toLowerCase();
    const hit =
      mapState.data.markers.find((m) => m.cat === "weapon" && m.calcId === weapon.id) ||
      mapState.data.markers.find((m) => m.cat === "weapon" && (m.baseName || "").toLowerCase() === baseLower) ||
      mapState.data.markers.find((m) => m.cat === "weapon" && m.name.toLowerCase().includes(baseLower));
    mapState.search = weapon.baseName || "";
    $("mapSearchInput").value = mapState.search;
    updateMapSearchList();
    if (hit) {
      await focusMarkerOnMap(hit, 4.5);
    } else {
      renderMapCanvas();
    }
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
        await ensureMapImage(layer);
        updateMapSearchList();
        resetMapView(true);
      });
    });

    document.querySelectorAll(".map-cat-cb").forEach((cb) => {
      cb.addEventListener("change", () => {
        mapState.cats[cb.dataset.cat] = cb.checked;
        updateMapSearchList();
        renderMapCanvas();
      });
    });
    $("mapCatPlayer").addEventListener("change", (e) => {
      mapState.showPlayer = e.target.checked;
      renderMapCanvas();
    });
    $("mapCatAllBtn").addEventListener("click", () => {
      document.querySelectorAll(".map-cat-cb").forEach((cb) => {
        cb.checked = true;
        mapState.cats[cb.dataset.cat] = true;
      });
      mapState.showPlayer = true;
      $("mapCatPlayer").checked = true;
      updateMapSearchList();
      renderMapCanvas();
    });
    $("mapCatNoneBtn").addEventListener("click", () => {
      document.querySelectorAll(".map-cat-cb").forEach((cb) => {
        cb.checked = false;
        mapState.cats[cb.dataset.cat] = false;
      });
      updateMapSearchList();
      renderMapCanvas();
    });

    let mapSearchTimer = null;
    $("mapSearchInput").addEventListener("input", (e) => {
      mapState.search = e.target.value;
      clearTimeout(mapSearchTimer);
      mapSearchTimer = setTimeout(() => {
        updateMapSearchList();
        renderMapCanvas();
      }, 60);
    });
    $("mapSearchClearBtn").addEventListener("click", () => {
      $("mapSearchInput").value = "";
      mapState.search = "";
      updateMapSearchList();
      renderMapCanvas();
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
    $("topPipBtn").addEventListener("click", () => setPipMode(state.activeView === "map" ? "map" : "stats"));
    $("pipModeMapBtn").addEventListener("click", () => setPipMode("map"));
    $("pipModeStatsBtn").addEventListener("click", () => setPipMode("stats"));
    $("pipExitBtn").addEventListener("click", () => setPipMode("off"));
    $("pipFollowBtn").addEventListener("click", () => setMapFollow(!mapState.followPlayer));
    $("pipTwoHandBtn").addEventListener("click", () => {
      state.twoHand = !state.twoHand;
      $("twoHandCb").checked = state.twoHand;
      update2hHint();
      persistSettings();
      recalculateAndRender();
    });
    $("pipOpacityBtn").addEventListener("click", () => {
      const nextOp = state.pipOpacity > 0.9 ? 0.85 : (state.pipOpacity > 0.75 ? 0.70 : 1.0);
      state.pipOpacity = nextOp;
      $("pipOpacityBtn").textContent = `${Math.round(nextOp * 100)}%`;
      if (window.pywebview && window.pywebview.api && window.pywebview.api.set_pip_opacity) {
        window.pywebview.api.set_pip_opacity(nextOp);
      }
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
        tip.style.left = `${Math.min(rect.width - 180, e.clientX - rect.left + 12)}px`;
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
    state.data = payload.data;
    state.enemyPresets = payload.enemyPresets || { "Raw AR (No Defense)": null };
    buildSearchTags(state.data);
    buildAffinitySidebar();
    buildWeaponTypeTree();
    populateEnemySelect();
    populateGearDropdowns();

    const cfg = payload.settings || {};
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
    if (typeof cfg.liveWatch === "boolean") state.liveWatch = cfg.liveWatch;
    if (cfg.enemyPreset && cfg.enemyPreset in state.enemyPresets) state.enemyPreset = cfg.enemyPreset;
    if (cfg.bannerDismissed) state.bannerDismissed = true;

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
    $("liveWatchCb").checked = state.liveWatch;
    $("enemySelect").value = state.enemyPreset;
    if (state.bannerDismissed) $("infoBanner").classList.add("hidden");
    updateExtraColsButtonLabel();
    notifyStreamMode();

    populateLevelSelect();
    syncGearDropdownValues();
    applySavePayload(payload.save, true);
    updateStatInputsDom();
    renderTableHeader();
    bindUiEvents();
    bindMapUiEvents();
    recalculateAndRender();

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
        window.__onLiveRamStatus({ attached: false });
        return {
          followOn,
          followOff,
          ramActive,
          ramMeta,
          ramStr,
          ramHasPos,
          restoredRamActive: state.ramLive,
          restoredMeta: $("charMetaText").textContent,
        };
      },
      testPipModes() {
        setPipMode("map");
        const mapBody = document.body.classList.contains("pip-active") && document.body.classList.contains("pip-map");
        setPipMode("stats");
        const statsBody = document.body.classList.contains("pip-active") && document.body.classList.contains("pip-stats");
        const statsCells = document.querySelectorAll("#pipStatsGrid .pip-stat-cell").length;
        setPipMode("off");
        const offClean = !document.body.classList.contains("pip-active");
        return { mapBody, statsBody, statsCells, offClean };
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
    };

    window.__ERR_READY = true;
  }

  window.addEventListener("pywebviewready", () => {
    initApp().catch((err) => {
      window.__JS_ERRORS.push(err && err.stack ? err.stack : String(err));
    });
  });
})();
