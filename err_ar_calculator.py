import gzip
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional

import webview

import ar_engine
import save_reader


def app_base_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def resource_data_path() -> str:
    local = os.path.join(app_base_dir(), "err_weapon_data.json.gz")
    if os.path.exists(local):
        return local
    meipass = getattr(sys, "_MEIPASS", app_base_dir())
    return os.path.join(meipass, "err_weapon_data.json.gz")


def resource_icon_path() -> Optional[str]:
    for base in (app_base_dir(), getattr(sys, "_MEIPASS", app_base_dir())):
        candidate = os.path.join(base, "err_icon.ico")
        if os.path.exists(candidate):
            return candidate
    return None


def resource_ui_dir() -> str:
    for base in (app_base_dir(), getattr(sys, "_MEIPASS", app_base_dir())):
        candidate = os.path.join(base, "ui")
        if os.path.isdir(candidate):
            return candidate
    raise FileNotFoundError("Could not locate bundled ui/ directory")


def settings_file_path() -> str:
    return os.path.join(app_base_dir(), "err_ar_settings.json")


def load_weapon_data() -> Dict:
    path = resource_data_path()
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    by_id: Dict[int, Dict] = {}
    by_base: Dict[int, List[Dict]] = {}
    for w in data["weapons"]:
        by_id[w["id"]] = w
        by_base.setdefault(w["baseId"], []).append(w)
    data["_byId"] = by_id
    data["_byBase"] = by_base
    return data


def clean_data_for_ui(data: Dict) -> Dict:
    return {k: v for k, v in data.items() if not k.startswith("_")}


def build_inlined_html() -> str:
    ui_dir = resource_ui_dir()
    with open(os.path.join(ui_dir, "index.html"), "r", encoding="utf-8") as fh:
        html = fh.read()
    with open(os.path.join(ui_dir, "styles.css"), "r", encoding="utf-8") as fh:
        css = fh.read()
    with open(os.path.join(ui_dir, "app.js"), "r", encoding="utf-8") as fh:
        js = fh.read().replace("</script", "<\\/script")

    html = html.replace("<!-- INJECT_CSS -->", f"<style>\n{css}\n</style>", 1)
    html = html.replace("<!-- INJECT_JS -->", f"<script>\n{js}\n</script>", 1)
    return html


def _save_summary_key(parsed: Dict[str, Any]) -> str:
    chars = [
        {
            "slot": c["slot"],
            "name": c["name"],
            "level": c["level"],
            "stats": c["stats"],
            "equipped": c.get("equipped", []),
            "armor": c.get("armor", []),
            "talismans": c.get("talismans", []),
        }
        for c in parsed.get("characters", [])
    ]
    return json.dumps({"lastSlot": parsed.get("lastSlot"), "characters": chars}, sort_keys=True)


class CalculatorApi:
    def __init__(self, self_test_mode: bool = False):
        self._self_test_mode = self_test_mode
        self._window: Optional[webview.Window] = None
        self._data = load_weapon_data()
        self._known_weapon_ids = set(self._data["_byId"].keys())
        self._save_path: Optional[str] = None
        self._save_mtime: float = 0.0
        self._save_fingerprint: Optional[str] = None
        self._save_stat_offsets: Dict[str, int] = {}
        self._save_summary_key: Optional[str] = None

    def _read_save(self, path: Optional[str]) -> Dict[str, Any]:
        if not path or not os.path.exists(path):
            return {"characters": [], "error": "No ER save found (manual stats)"}
        try:
            parsed = save_reader.read_save_characters(path, self._known_weapon_ids)
            if parsed.get("characters"):
                self._save_path = path
                self._save_mtime = parsed["mtime"]
                self._save_stat_offsets = dict(parsed.get("statOffsets") or {})
                self._save_fingerprint = save_reader.read_save_fingerprint(path, self._save_stat_offsets)
                self._save_summary_key = _save_summary_key(parsed)
            return parsed
        except Exception as exc:
            return {"characters": [], "error": f"Save read failed: {exc}"}

    def _load_settings(self) -> Dict[str, Any]:
        if self._self_test_mode:
            return {}
        path = settings_file_path()
        if not os.path.exists(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return {}

    def get_initial_payload(self) -> Dict[str, Any]:
        save_path = save_reader.find_default_save()
        return {
            "data": clean_data_for_ui(self._data),
            "enemyPresets": dict(ar_engine.ENEMY_PRESETS),
            "save": self._read_save(save_path),
            "settings": self._load_settings(),
            "selfTestMode": self._self_test_mode,
        }

    def reload_save(self, select_latest: bool = True) -> Dict[str, Any]:
        path = self._save_path if (not select_latest and self._save_path) else save_reader.find_default_save()
        return self._read_save(path)

    def browse_save(self) -> Dict[str, Any]:
        if not self._window:
            return {"cancelled": True}
        init_dir = os.path.dirname(self._save_path) if self._save_path else save_reader.ER_APPDATA
        chosen = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            directory=init_dir if os.path.isdir(init_dir) else "",
            allow_multiple=False,
            file_types=(
                "Elden Ring Saves (*.err;*.sl2;*.co2;*.cnv;*.cnvco2)",
                "All files (*.*)",
            ),
        )
        if not chosen:
            return {"cancelled": True}
        path = chosen[0] if isinstance(chosen, (list, tuple)) else chosen
        res = self._read_save(path)
        res["cancelled"] = False
        return res

    def poll_save(self) -> Dict[str, Any]:
        if not self._save_path or not os.path.exists(self._save_path):
            cand = save_reader.find_default_save()
            if cand and os.path.exists(cand):
                parsed = self._read_save(cand)
                if parsed.get("characters"):
                    return {"changed": True, "save": parsed}
            return {"changed": False}
        try:
            fp1 = save_reader.read_save_fingerprint(self._save_path, self._save_stat_offsets)
            if fp1 == self._save_fingerprint:
                return {"changed": False}
            time.sleep(0.12)
            fp2 = save_reader.read_save_fingerprint(self._save_path, self._save_stat_offsets)
            if fp2 != fp1:
                return {"changed": False}
            parsed = save_reader.read_save_characters(self._save_path, self._known_weapon_ids)
            if not parsed.get("characters"):
                return {"changed": False}
            new_key = _save_summary_key(parsed)
            self._save_mtime = parsed["mtime"]
            self._save_stat_offsets = dict(parsed.get("statOffsets") or {})
            self._save_fingerprint = save_reader.read_save_fingerprint(self._save_path, self._save_stat_offsets)
            if new_key != self._save_summary_key:
                self._save_summary_key = new_key
                return {"changed": True, "save": parsed}
        except Exception:
            pass
        return {"changed": False}

    def optimize_weapon(
        self,
        base_id: int,
        stats: Dict[str, int],
        reg_lv: int,
        somber_lv: int,
        two_hand: bool,
        extra_points: int,
        floor_mode: str,
        metric: str,
        enemy_preset: str,
        override_lv: int,
        buffs: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        variants = self._data["_byBase"].get(int(base_id))
        if not variants:
            return {"ms": 0.0, "entries": []}
        t0 = time.perf_counter()
        entries = ar_engine.optimize_stats_for_weapon(
            variants,
            self._data,
            stats,
            int(reg_lv),
            int(somber_lv),
            bool(two_hand),
            extra_points=int(extra_points),
            floor_mode=floor_mode,
            min_stat=8,
            metric=metric,
            enemy_preset=enemy_preset,
            override_lv=int(override_lv),
            buffs=buffs,
        )
        ms = (time.perf_counter() - t0) * 1000.0
        out = []
        for ent in entries:
            res = ent["res"]
            w = ent["weapon"]
            out.append(
                {
                    "weaponId": w["id"],
                    "aff": w["aff"],
                    "total": res["total"],
                    "eff": res["eff"],
                    "spell": res["spell"],
                    "stats": ent["stats"],
                    "grades": res["grades"],
                    "met": ent["met"],
                }
            )
        return {"ms": ms, "entries": out}

    def refresh_mod_data(self) -> Dict[str, Any]:
        script_path = os.path.join(app_base_dir(), "extract_err_data.py")
        if not os.path.exists(script_path):
            return {
                "ok": False,
                "message": "extract_err_data.py was not found next to the application.",
            }
        py_exe = None
        if not getattr(sys, "frozen", False):
            py_exe = sys.executable
        else:
            for cand in (shutil.which("python"), shutil.which("py"), r"C:\Python313\python.exe"):
                if cand and os.path.exists(cand):
                    py_exe = cand
                    break
        if not py_exe:
            return {"ok": False, "message": "Python interpreter not found to run extract_err_data.py."}

        proc = subprocess.run([py_exe, script_path], capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or f"Extractor exited with code {proc.returncode}").strip()
            return {"ok": False, "message": msg}

        self._data = load_weapon_data()
        self._known_weapon_ids = set(self._data["_byId"].keys())
        return {"ok": True, "data": clean_data_for_ui(self._data)}

    def save_settings(self, cfg: Dict[str, Any]) -> bool:
        if self._self_test_mode:
            return False
        try:
            with open(settings_file_path(), "w", encoding="utf-8") as fh:
                json.dump(cfg, fh, indent=2)
            return True
        except Exception:
            return False

    def copy_text(self, text: str) -> bool:
        try:
            import pyperclip

            pyperclip.copy(text)
            return True
        except Exception:
            try:
                subprocess.run(["clip"], input=text, text=True, check=True)
                return True
            except Exception:
                return False


def _pick_parity_weapons(weapons: List[Dict]) -> List[Dict]:
    picked = []
    seen = set()

    def add_first(pred, label):
        for w in weapons:
            if w["id"] not in seen and pred(w):
                seen.add(w["id"])
                picked.append((label, w))
                return

    add_first(lambda w: w["baseName"] == "Claymore" and w["aff"] == "Heavy", "Claymore Heavy")
    add_first(lambda w: w["baseName"] == "Claymore" and w["aff"] == "Fire", "Claymore Fire")
    add_first(lambda w: w["dual"], "Dual Blade (skip 1.5x 2H)")
    add_first(lambda w: w["req"][0] >= 40 and w["maxLv"] == 10, "High STR Somber")
    add_first(lambda w: w["cat"] == 1 and w["enMag"] and not w["enMir"], "Glintstone Staff")
    add_first(lambda w: w["cat"] == 1 and w["enMir"], "Sacred Seal")
    add_first(lambda w: sum(1 for a in w["atk"] if a > 0) >= 3, "Triple Split Damage")
    add_first(lambda w: w["aff"] == "Bloody", "Bloody Status Weapon")
    add_first(lambda w: w["aff"] == "Soporific", "Soporific Sleep Weapon")
    add_first(lambda w: w["maxLv"] == 25 and w["aff"] == "Cold", "Cold Standard +25")
    return [w for _, w in picked]


def run_self_test(report_path: Optional[str]):
    api = CalculatorApi(self_test_mode=True)
    html_doc = build_inlined_html()
    win = webview.create_window(
        "ERR v2.3.9.1 Self-Test",
        html=html_doc,
        js_api=api,
        width=1440,
        height=900,
        hidden=True,
        background_color="#191613",
    )
    api._window = win
    test_result = {"ok": False, "lines": [], "error": None}

    def runner(w: webview.Window):
        try:
            deadline = time.time() + 20.0
            while time.time() < deadline:
                if w.evaluate_js("Boolean(window.__ERR_READY)"):
                    break
                time.sleep(0.05)
            else:
                raise RuntimeError("Timed out waiting for __ERR_READY in WebView2")

            summary = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert summary["weaponsLoaded"] == 6454, f"Expected 6454 weapons, got {summary}"
            assert summary["totalItems"] > 5000, f"Expected all-affinity rows > 5000, got {summary}"
            assert summary["visibleDomRows"] > 5, f"Expected rendered virtual rows > 5, got {summary}"
            assert len(summary["jsErrors"]) == 0, f"Initial JS errors: {summary['jsErrors']}"
            assert w.evaluate_js("document.getElementById('liveDot') === null"), "liveDot should be removed"
            has_save = summary["charCount"] > 0
            if has_save:
                assert w.evaluate_js("document.getElementById('saveAcceptedIcon').classList.contains('active')"), "saveAcceptedIcon should be active when save is loaded"
                lw_prev = bool(w.evaluate_js("document.getElementById('liveWatchCb').checked"))
                w.evaluate_js("window.__ERR_TEST.toggleOption('liveWatchCb', false)")
                assert w.evaluate_js("document.getElementById('saveAcceptedIcon').classList.contains('active')"), "saveAcceptedIcon should stay active when Live Watch is off"
                w.evaluate_js(f"window.__ERR_TEST.toggleOption('liveWatchCb', {'true' if lw_prev else 'false'})")
            else:
                assert not w.evaluate_js("document.getElementById('saveAcceptedIcon').classList.contains('active')"), "saveAcceptedIcon should be inactive when no save is loaded"

            # Exact JS vs Python Math Parity Check across 10 diverse weapons (unbuffed + buffed)
            test_weapons = _pick_parity_weapons(api._data["weapons"])
            assert len(test_weapons) == 10, f"Expected 10 parity weapons, got {len(test_weapons)}"
            unbuff = next((tw for tw in api._data["weapons"] if not tw.get("buffable") and sum(tw["atk"]) > 0), None)
            if unbuff and unbuff["id"] not in {x["id"] for x in test_weapons}:
                test_weapons.append(unbuff)

            sample_grease = api._data["greases"][0]
            test_buffs = {
                "statBonus": [6, 3, 2, 0, 6],
                "elemMult": [1.15, 1.32, 1.38, 1.15, 1.15],
                "grease": sample_grease,
                "stanceMult": 1.1,
            }
            parity_stats = {"str": 34, "dex": 26, "int": 28, "fai": 24, "arc": 30}
            max_diff = 0.0
            for buffs_arg in (None, test_buffs):
                for preset in ("Raw AR (No Defense)", ar_engine.DEFAULT_ENEMY_PRESET):
                    for two_h in (True, False):
                        for tw in test_weapons:
                            py_r = ar_engine.compute_weapon(
                                tw, api._data, parity_stats, 25, 10, two_h, enemy_preset=preset, buffs=buffs_arg
                            )
                            js_r = w.evaluate_js(
                                f"window.__ERR_TEST.computeById({tw['id']}, {json.dumps(parity_stats)}, 25, 10, {'true' if two_h else 'false'}, {json.dumps(preset)}, {json.dumps(buffs_arg)})"
                            )
                            max_diff = max(
                                max_diff,
                                abs(py_r["total"] - js_r["total"]),
                                abs(py_r["eff"] - js_r["eff"]),
                                abs(py_r["spell"] - js_r["spell"]),
                                abs(py_r["stance"] - js_r["stance"]),
                            )
                            for idx in range(5):
                                max_diff = max(
                                    max_diff,
                                    abs(py_r["ar"][idx] - js_r["ar"][idx]),
                                    abs(py_r["corr"][idx] - js_r["corr"][idx]),
                                )
                            for idx in range(7):
                                max_diff = max(max_diff, abs(py_r["status"][idx] - js_r["status"][idx]))
                            assert py_r["grades"] == js_r["grades"], f"Grade mismatch on {tw['name']}"
                            assert py_r["met"] == js_r["met"], f"Met mismatch on {tw['name']}"
            assert max_diff < 1e-4, f"Parity diff too high: {max_diff}"

            # Gear / Armor / Talismans save detection check
            gear_info = w.evaluate_js("window.__ERR_TEST.getGearInfo()")
            assert gear_info["greaseCount"] == 19, f"Expected 19 greases, got {gear_info['greaseCount']}"
            if has_save:
                c0_armor = [x for x in (gear_info["char0Armor"] or []) if x is not None]
                c0_tal = [x for x in (gear_info["char0Talismans"] or []) if x is not None]
                assert len(c0_armor) == 4 and len(c0_tal) == 4, f"Unexpected slot 0 gear: {c0_armor} / {c0_tal}"
                eq_armor = [x for x in gear_info["armorIds"] if x is not None]
                eq_tal = [x for x in gear_info["talismanIds"] if x is not None]
                assert len(eq_armor) == 4 and len(eq_tal) >= 3, f"Unexpected active gear: {eq_armor} / {eq_tal}"
            else:
                c0_armor = []
                c0_tal = []
                eq_armor = []
                eq_tal = []

            # Extra Optional Columns check
            for cb_id in ("colCritCb", "colDTypeCb", "colBuffCb", "colStamCb", "colStanceCb"):
                w.evaluate_js(f"window.__ERR_TEST.toggleOption('{cb_id}', true)")
            ex_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            for req_hdr in ("Crit", "Dmg Type", "Buff", "Stam", "Stance"):
                assert any(req_hdr in h for h in ex_sum["headerTexts"]), f"Missing extra col {req_hdr}"
            for cb_id in ("colCritCb", "colDTypeCb", "colBuffCb", "colStamCb", "colStanceCb"):
                w.evaluate_js(f"window.__ERR_TEST.toggleOption('{cb_id}', false)")

            # UI Toggles verification
            w.evaluate_js("window.__ERR_TEST.toggleOption('showDamageSplitCb', true)")
            split_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            for req_hdr in ("Phys", "Mag", "Fire", "Ltng", "Holy", "Spell", "Total"):
                assert any(req_hdr in h for h in split_sum["headerTexts"]), f"Missing split header {req_hdr}"

            w.evaluate_js("window.__ERR_TEST.toggleOption('numericScalingCb', true)")
            w.evaluate_js("window.__ERR_TEST.toggleOption('groupByTypeCb', true)")
            grp_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert grp_sum["totalItems"] > grp_sum["computedCount"], "Group headers not added"

            w.evaluate_js("window.__ERR_TEST.toggleOption('groupByTypeCb', false)")
            w.evaluate_js("window.__ERR_TEST.toggleOption('showDamageSplitCb', false)")
            w.evaluate_js("window.__ERR_TEST.toggleOption('numericScalingCb', false)")

            w.evaluate_js("window.__ERR_TEST.toggleOption('bestAffinityOnlyCb', true)")
            best_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert 450 <= best_sum["computedCount"] <= 700, f"Unexpected best affinity count: {best_sum['computedCount']}"

            w.evaluate_js("window.__ERR_TEST.toggleOption('effectiveOnlyCb', true)")
            eff_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert eff_sum["computedCount"] <= best_sum["computedCount"]
            w.evaluate_js("window.__ERR_TEST.toggleOption('effectiveOnlyCb', false)")
            w.evaluate_js("window.__ERR_TEST.toggleOption('bestAffinityOnlyCb', false)")

            w.evaluate_js(f"window.__ERR_TEST.setEnemyPreset({json.dumps(ar_engine.DEFAULT_ENEMY_PRESET)})")
            boss_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert any("Eff" in h for h in boss_sum["headerTexts"]), "Missing Eff header on Boss preset"
            assert boss_sum["topWeapon"]["eff"] < boss_sum["topWeapon"]["total"]
            w.evaluate_js('window.__ERR_TEST.setEnemyPreset("Raw AR (No Defense)")')

            # Search & Sidebar filters
            search_n = w.evaluate_js('window.__ERR_TEST.setFilterSearch("katana bleed")')
            assert search_n > 0
            w.evaluate_js('window.__ERR_TEST.setFilterSearch("")')

            aff_n = w.evaluate_js('window.__ERR_TEST.selectAffinitySubset(["Heavy", "Bloody"])')
            assert 100 < aff_n < 1500
            w.evaluate_js(f"window.__ERR_TEST.selectAffinitySubset({json.dumps(api._data['affinities'])})")

            wt_n = w.evaluate_js("window.__ERR_TEST.selectWeaponTypes([13])")
            assert 50 < wt_n < 400
            all_wts = [int(k) for k in api._data["weaponTypes"].keys()]
            w.evaluate_js(f"window.__ERR_TEST.selectWeaponTypes({json.dumps(all_wts)})")

            # Inspector Drawer + Affinity Preview + Optimizer + Compare Tray
            clay = next(we for we in api._data["weapons"] if we["baseName"] == "Claymore")
            insp = w.evaluate_js(f"window.__ERR_TEST.openInspectorById({clay['id']})")
            assert insp["drawerOpen"] and insp["affRows"] >= 20, f"Inspector bad: {insp}"
            aff2_wid = w.evaluate_js("window.__ERR_TEST.clickSecondAffinity()")
            assert aff2_wid and aff2_wid != clay["id"]

            w.evaluate_js(f"window.__ERR_TEST.startOptimizerTest({clay['id']})")
            opt_res = None
            opt_deadline = time.time() + 10.0
            while time.time() < opt_deadline:
                opt_res = w.evaluate_js("window.__ERR_OPT_RESULT")
                if opt_res is not None:
                    break
                time.sleep(0.03)
            assert opt_res and opt_res.get("count", 0) >= 20 and "error" not in opt_res, f"Optimizer bad: {opt_res}"

            cmp_n = w.evaluate_js(f"window.__ERR_TEST.pinTwoAndCompare({clay['id']}, {aff2_wid})")
            assert cmp_n == 2, f"Compare count mismatch: {cmp_n}"

            curve_res = w.evaluate_js(f"window.__ERR_TEST.testScalingCurve({clay['id']})")
            assert curve_res["polyCount"] >= 1 and curve_res["dotCount"] >= 1, f"Curve SVG bad: {curve_res}"

            final_sum = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert len(final_sum["jsErrors"]) == 0, f"Runtime JS errors: {final_sum['jsErrors']}"

            test_result["lines"] = [
                f"WEAPONS_LOADED={summary['weaponsLoaded']}",
                f"SAVE_PATH={summary['savePath']}",
                f"CHAR_COUNT={summary['charCount']}",
                f"ACTIVE_SLOT={summary['activeSlot']}",
                f"INITIAL_ITEMS={summary['totalItems']}",
                f"VISIBLE_DOM_ROWS={summary['visibleDomRows']}",
                f"PARITY_MAX_DIFF={max_diff:.2e}",
                f"PARITY_OK={max_diff < 1e-4}",
                f"SAVE_GEAR_SLOT0={len(c0_armor)}arm/{len(c0_tal)}tal",
                f"SAVE_GEAR_ACTIVE={len(eq_armor)}arm/{len(eq_tal)}tal",
                f"GREASE_COUNT={gear_info['greaseCount']}",
                f"EXTRA_COLS_OK=5",
                f"SCALING_CURVE_POLYS={curve_res['polyCount']}|STATS={','.join(curve_res['curveStats'])}",
                f"BEST_AFFINITY_COUNT={best_sum['computedCount']}",
                f"SEARCH_KATANA_BLEED={search_n}",
                f"AFFINITY_SUBSET_COUNT={aff_n}",
                f"KATANA_TYPE_COUNT={wt_n}",
                f"INSPECTOR_AFF_ROWS={insp['affRows']}",
                f"OPTIMIZER_TOP={opt_res['topAff']}|{opt_res['topEff']:.1f}|count={opt_res['count']}",
                f"COMPARE_TRAY_COUNT={cmp_n}",
                f"JS_ERRORS={len(final_sum['jsErrors'])}",
                "ERR_AR_CALCULATOR_V4_SELF_TEST_PASSED",
            ]
            test_result["ok"] = True
        except Exception as exc:
            test_result["error"] = repr(exc)
        finally:
            try:
                w.destroy()
            except Exception:
                pass

    webview.start(runner, win, gui="edgechromium", private_mode=True)
    if not test_result["ok"]:
        raise RuntimeError(f"Self-test failed: {test_result['error']}")

    report = "\n".join(test_result["lines"]) + "\n"
    if report_path:
        with open(report_path, "w", encoding="utf-8") as fh:
            fh.write(report)
    else:
        print(report, end="")


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--self-test":
        report_path = sys.argv[2] if len(sys.argv) >= 3 else None
        run_self_test(report_path)
        return

    api = CalculatorApi(self_test_mode=False)
    html_doc = build_inlined_html()
    win = webview.create_window(
        "Elden Ring Weapon Calculator — ERR v2.3.9.1",
        html=html_doc,
        js_api=api,
        width=1500,
        height=920,
        min_size=(1060, 680),
        background_color="#191613",
        text_select=True,
    )
    api._window = win
    webview.start(gui="edgechromium", icon=resource_icon_path(), private_mode=True)


if __name__ == "__main__":
    main()
