import base64
import gzip
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional

import webview

import ar_engine
import memory_reader
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


def map_data_path() -> Optional[str]:
    for base in (app_base_dir(), getattr(sys, "_MEIPASS", app_base_dir())):
        candidate = os.path.join(base, "err_map_data.json.gz")
        if os.path.exists(candidate):
            return candidate
    return None


def map_icons_path() -> Optional[str]:
    for base in (app_base_dir(), getattr(sys, "_MEIPASS", app_base_dir())):
        candidate = os.path.join(base, "err_map_icons.json.gz")
        if os.path.exists(candidate):
            return candidate
    return None


def map_image_path(layer: str) -> Optional[str]:
    if layer not in ("m00", "m01", "m10"):
        return None
    fname = f"map_{layer}.jpg"
    base = app_base_dir()
    for root in (base, os.path.dirname(base), getattr(sys, "_MEIPASS", base)):
        candidate = os.path.join(root, "map_cache", fname)
        if os.path.exists(candidate):
            return candidate
    return None


def map_tile_path(layer: str, cx: int, cy: int) -> Optional[str]:
    if layer not in ("m00", "m01", "m10"):
        return None
    if not (0 <= cx < 16 and 0 <= cy < 16):
        return None
    fname = f"{cx}_{cy}.jpg"
    base = app_base_dir()
    for root in (base, os.path.dirname(base), getattr(sys, "_MEIPASS", base)):
        candidate = os.path.join(root, "map_cache", "tiles", layer, fname)
        if os.path.exists(candidate):
            return candidate
    return None


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


def _save_pos_key(parsed: Dict[str, Any]) -> str:
    return json.dumps(
        {
            "lastSlot": parsed.get("lastSlot"),
            "positions": {str(c["slot"]): c.get("playerPos") for c in parsed.get("characters", [])},
        },
        sort_keys=True,
    )


class CalculatorApi:
    def __init__(self, self_test_mode: bool = False):
        self._self_test_mode = self_test_mode
        self._window: Optional[webview.Window] = None
        self._data = load_weapon_data()
        self._known_weapon_ids = set(self._data["_byId"].keys())
        self._save_lock = threading.Lock()
        self._save_path: Optional[str] = None
        self._save_mtime: float = 0.0
        self._save_fingerprint: Optional[str] = None
        self._save_stat_offsets: Dict[str, int] = {}
        self._save_summary_key: Optional[str] = None
        self._save_pos_key: Optional[str] = None
        self._live_watch: bool = bool(self._load_settings().get("liveWatch", True))
        self._watcher_stop = threading.Event()
        self._watcher_thread: Optional[threading.Thread] = None
        self._map_data: Optional[Dict[str, Any]] = None
        self._map_icons: Optional[Dict[str, str]] = None
        self._mem = memory_reader.EldenRingMemoryReader()
        self._known_armor_ids = {int(k) for k in (self._data.get("armors") or {}).keys() if int(k) > 10300}
        self._known_talisman_ids = {int(k) for k in (self._data.get("talismans") or {}).keys()}
        self._ui_view: str = "calc"
        self._map_follow: bool = False
        self._ram_active: bool = False
        self._pip_mode: str = "off"
        self._pip_opacity: float = 1.0
        self._normal_bounds = None
        self._pip_bounds: Dict[str, Any] = {}

    def _read_save(self, path: Optional[str]) -> Dict[str, Any]:
        if not path or not os.path.exists(path):
            return {"characters": [], "error": "No ER save found (manual stats)"}
        try:
            with self._save_lock:
                parsed = save_reader.read_save_characters(path, self._known_weapon_ids)
                if parsed.get("characters"):
                    self._save_path = path
                    self._save_mtime = parsed["mtime"]
                    self._save_stat_offsets = dict(parsed.get("statOffsets") or {})
                    self._save_fingerprint = save_reader.read_save_fingerprint(path, self._save_stat_offsets)
                    self._save_summary_key = _save_summary_key(parsed)
                    self._save_pos_key = _save_pos_key(parsed)
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

    def _poll_unlocked(self) -> Dict[str, Any]:
        if not self._save_path or not os.path.exists(self._save_path):
            cand = save_reader.find_default_save()
            if cand and os.path.exists(cand):
                parsed = save_reader.read_save_characters(cand, self._known_weapon_ids)
                if parsed.get("characters"):
                    self._save_path = cand
                    self._save_mtime = parsed["mtime"]
                    self._save_stat_offsets = dict(parsed.get("statOffsets") or {})
                    self._save_fingerprint = save_reader.read_save_fingerprint(cand, self._save_stat_offsets)
                    self._save_summary_key = _save_summary_key(parsed)
                    self._save_pos_key = _save_pos_key(parsed)
                    return {"changed": True, "kind": "full", "save": parsed}
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
            new_pos_key = _save_pos_key(parsed)
            self._save_mtime = parsed["mtime"]
            self._save_stat_offsets = dict(parsed.get("statOffsets") or {})
            self._save_fingerprint = save_reader.read_save_fingerprint(self._save_path, self._save_stat_offsets)
            if new_key != self._save_summary_key:
                self._save_summary_key = new_key
                self._save_pos_key = new_pos_key
                return {"changed": True, "kind": "full", "save": parsed}
            if new_pos_key != self._save_pos_key:
                self._save_pos_key = new_pos_key
                return {
                    "changed": True,
                    "kind": "pos",
                    "lastSlot": parsed.get("lastSlot"),
                    "positions": {str(c["slot"]): c.get("playerPos") for c in parsed.get("characters", [])},
                }
        except Exception:
            pass
        return {"changed": False}

    def poll_save(self) -> Dict[str, Any]:
        with self._save_lock:
            return self._poll_unlocked()

    def set_live_watch(self, enabled: bool) -> Dict[str, Any]:
        self._live_watch = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["liveWatch"] = self._live_watch
            self.save_settings(cfg)
        return {"liveWatch": self._live_watch}

    def set_live_stream_mode(self, view: str, follow: bool) -> Dict[str, Any]:
        self._ui_view = "map" if view == "map" else "calc"
        self._map_follow = bool(follow)
        return {"view": self._ui_view, "follow": self._map_follow, "ramActive": self._ram_active}

    def _get_winforms_form(self):
        if not self._window or self._self_test_mode:
            return None
        try:
            from webview.platforms.winforms import BrowserView

            return BrowserView.instances.get(self._window.uid)
        except Exception:
            return None

    def _invoke_ui(self, fn):
        bv = self._get_winforms_form()
        if bv is None:
            return False
        try:
            if getattr(bv, "InvokeRequired", False):
                from System import Action

                bv.Invoke(Action(fn))
            else:
                fn()
            return True
        except Exception:
            return False

    def set_pip_mode(self, mode: str, opacity: Optional[float] = None) -> Dict[str, Any]:
        target = mode if mode in ("off", "map", "stats") else "off"
        if opacity is not None:
            self._pip_opacity = max(0.45, min(1.0, float(opacity)))
        prev = self._pip_mode
        self._pip_mode = target
        if target == "map":
            self._ui_view = "map"
        if self._self_test_mode or target == prev:
            if not self._self_test_mode and target != "off":
                self.set_pip_opacity(self._pip_opacity)
            return {"mode": self._pip_mode, "opacity": self._pip_opacity}

        bv = self._get_winforms_form()
        if bv is not None:
            def _apply():
                import System.Drawing as SD

                if prev == "off":
                    self._normal_bounds = (int(bv.Left), int(bv.Top), int(bv.Width), int(bv.Height))
                else:
                    self._pip_bounds[prev] = (int(bv.Left), int(bv.Top), int(bv.Width), int(bv.Height))

                if target == "off":
                    bv.TopMost = False
                    bv.Opacity = 1.0
                    bv.MinimumSize = SD.Size(1060, 680)
                    if self._normal_bounds:
                        bv.SetBounds(*self._normal_bounds)
                else:
                    bv.MinimumSize = SD.Size(260, 200)
                    bv.TopMost = True
                    bv.Opacity = self._pip_opacity
                    def_w, def_h = (380, 380) if target == "map" else (350, 310)
                    if target in self._pip_bounds:
                        px, py, pw, ph = self._pip_bounds[target]
                    elif prev != "off" and prev in self._pip_bounds:
                        ox, oy, ow, _ = self._pip_bounds[prev]
                        px, py, pw, ph = (ox + ow - def_w, oy, def_w, def_h)
                    else:
                        try:
                            scr = webview.screens[0]
                            sw = int(scr.width)
                        except Exception:
                            sw = 1920
                        px, py, pw, ph = (max(16, sw - def_w - 24), 24, def_w, def_h)
                    bv.SetBounds(int(px), int(py), int(pw), int(ph))

            self._invoke_ui(_apply)
        return {"mode": self._pip_mode, "opacity": self._pip_opacity}

    def set_pip_opacity(self, opacity: float) -> Dict[str, Any]:
        self._pip_opacity = max(0.45, min(1.0, float(opacity)))
        if not self._self_test_mode and self._pip_mode != "off":
            bv = self._get_winforms_form()
            if bv is not None:
                def _apply_op():
                    bv.Opacity = self._pip_opacity

                self._invoke_ui(_apply_op)
        return {"mode": self._pip_mode, "opacity": self._pip_opacity}

    def _start_watcher(self):
        if self._self_test_mode or self._watcher_thread is not None:
            return

        def _loop():
            last_pos_key = None
            last_char_key = None
            last_char_t = 0.0
            last_save_t = 0.0
            miss_streak = 0
            while True:
                if self._ram_active:
                    if self._ui_view == "map" and self._map_follow:
                        dt = 0.033
                    elif self._ui_view == "map":
                        dt = 0.10
                    else:
                        dt = 0.25
                else:
                    dt = 0.5
                if self._watcher_stop.wait(dt):
                    break
                if not self._live_watch or not self._window:
                    continue

                now = time.monotonic()
                try:
                    if self._mem.ensure_attached(min_retry_secs=2.0):
                        pos = self._mem.read_player_pos()
                        ch = None
                        if not self._ram_active or (now - last_char_t >= 0.25):
                            last_char_t = now
                            ch = self._mem.read_character_state(
                                self._known_weapon_ids,
                                self._known_armor_ids,
                                self._known_talisman_ids,
                            )
                        if pos is not None or ch is not None:
                            miss_streak = 0
                            was_active = self._ram_active
                            self._ram_active = True
                            if ch is not None:
                                ckey = (
                                    ch["name"],
                                    ch["level"],
                                    tuple(ch["stats"].values()),
                                    tuple(e["rawId"] for e in ch["equipped"]),
                                    tuple(ch["armor"]),
                                    tuple(ch["talismans"]),
                                )
                                if not was_active or ckey != last_char_key:
                                    last_char_key = ckey
                                    self._window.evaluate_js(
                                        f"window.__onLiveRamChar && window.__onLiveRamChar({json.dumps(ch)});"
                                    )
                            if pos is not None:
                                pkey = (
                                    pos["area"],
                                    pos["gridX"],
                                    pos["gridZ"],
                                    pos["sub"],
                                    round(pos["x"], 2),
                                    round(pos["z"], 2),
                                    round(pos["yaw"], 3),
                                )
                                if not was_active or pkey != last_pos_key:
                                    last_pos_key = pkey
                                    self._window.evaluate_js(
                                        f"window.__onLiveRamPos && window.__onLiveRamPos({json.dumps(pos)});"
                                    )
                            continue
                        miss_streak += 1
                        if self._ram_active and miss_streak >= 6:
                            self._ram_active = False
                            last_pos_key = None
                            last_char_key = None
                            self._window.evaluate_js(
                                'window.__onLiveRamStatus && window.__onLiveRamStatus({"attached":false});'
                            )
                    elif self._ram_active:
                        self._ram_active = False
                        last_pos_key = None
                        last_char_key = None
                        self._window.evaluate_js(
                            'window.__onLiveRamStatus && window.__onLiveRamStatus({"attached":false});'
                        )
                except Exception:
                    pass

                if not self._ram_active and (now - last_save_t >= 1.0):
                    last_save_t = now
                    try:
                        upd = self.poll_save()
                        if not upd or not upd.get("changed"):
                            continue
                        if upd.get("kind") == "full":
                            js = f"window.__onLiveSavePush && window.__onLiveSavePush({json.dumps(upd['save'])});"
                        else:
                            payload = {"lastSlot": upd.get("lastSlot"), "positions": upd.get("positions", {})}
                            js = f"window.__onLivePlayerPos && window.__onLivePlayerPos({json.dumps(payload)});"
                        self._window.evaluate_js(js)
                    except Exception:
                        pass

        self._watcher_thread = threading.Thread(target=_loop, daemon=True, name="SaveWatcher")
        self._watcher_thread.start()

    def get_map_data(self) -> Dict[str, Any]:
        if self._map_data is None:
            p = map_data_path()
            if not p:
                return {"error": "err_map_data.json.gz not found", "markers": [], "counts": {}, "layers": {}, "legacyConv": [], "availableImages": {}}
            with gzip.open(p, "rt", encoding="utf-8") as fh:
                self._map_data = json.load(fh)
        out = dict(self._map_data)
        out["availableImages"] = {layer: bool(map_image_path(layer)) for layer in ("m00", "m01", "m10")}
        return out

    def get_map_image(self, layer: str) -> Dict[str, Any]:
        p = map_image_path(layer)
        if not p:
            return {"ok": False, "layer": layer}
        with open(p, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        return {"ok": True, "layer": layer, "dataUrl": f"data:image/jpeg;base64,{b64}"}

    def get_map_tile(self, layer: str, cx: int, cy: int) -> Dict[str, Any]:
        p = map_tile_path(layer, int(cx), int(cy))
        if not p:
            return {"ok": False, "layer": layer, "cx": int(cx), "cy": int(cy)}
        with open(p, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        return {"ok": True, "layer": layer, "cx": int(cx), "cy": int(cy), "dataUrl": f"data:image/jpeg;base64,{b64}"}

    def get_map_icons(self) -> Dict[str, str]:
        if self._map_icons is None:
            p = map_icons_path()
            if not p:
                self._map_icons = {}
            else:
                with gzip.open(p, "rt", encoding="utf-8") as fh:
                    self._map_icons = json.load(fh)
        return dict(self._map_icons)

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
            for cand in (r"C:\Python313\python.exe", shutil.which("python"), shutil.which("py")):
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
            has_save = summary["charCount"] > 0
            assert summary["totalItems"] > 5000, f"Expected all-affinity rows > 5000, got {summary}"
            assert summary["visibleDomRows"] > 5, f"Expected rendered virtual rows > 5, got {summary}"
            assert len(summary["jsErrors"]) == 0, f"Initial JS errors: {summary['jsErrors']}"
            assert w.evaluate_js("document.getElementById('liveDot') === null"), "liveDot should be removed"
            if has_save:
                assert w.evaluate_js("document.getElementById('saveAcceptedIcon').classList.contains('active')"), "saveAcceptedIcon should be active when save is loaded"
            lw_prev = bool(w.evaluate_js("document.getElementById('liveWatchCb').checked"))
            w.evaluate_js("window.__ERR_TEST.toggleOption('liveWatchCb', false)")
            if has_save:
                assert w.evaluate_js("document.getElementById('saveAcceptedIcon').classList.contains('active')"), "saveAcceptedIcon should stay active when Live Watch is off"
            w.evaluate_js(f"window.__ERR_TEST.toggleOption('liveWatchCb', {'true' if lw_prev else 'false'})")

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
                c0_armor, c0_tal, eq_armor, eq_tal = [], [], [], []

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

            # Map tab & 7-category / PiP overlay verification (handles both cached tiles & CI grid fallback)
            map_init = w.evaluate_js("window.__ERR_TEST.openMapTab()")
            has_local_maps = any(bool(map_image_path(l)) for l in ("m00", "m01", "m10"))
            has_local_icons = bool(map_icons_path())
            map_deadline = time.time() + 15.0
            map_state = None
            while time.time() < map_deadline:
                st = w.evaluate_js("window.__ERR_TEST.getMapState()")
                if st and st.get("loaded") and st.get("visibleCount", 0) > 0 and (not has_local_maps or st.get("imgLoaded")):
                    map_state = st
                    break
                time.sleep(0.05)
            assert map_state and map_state.get("loaded"), f"Map failed to load: {map_state}"
            for req_cat in ("grace", "weapon", "talisman", "armor", "boss", "merchant", "poi"):
                assert map_state["counts"].get(req_cat, 0) > 0, f"Empty map category {req_cat}: {map_state['counts']}"
            if has_local_maps:
                w.evaluate_js("window.__ERR_TEST.startMapImagesTest()")
                img_check = None
                img_deadline = time.time() + 10.0
                while time.time() < img_deadline:
                    img_check = w.evaluate_js("window.__ERR_MAP_IMAGES")
                    if img_check is not None:
                        break
                    time.sleep(0.03)
                assert img_check and "error" not in img_check and all(img_check.get(l) for l in ("m00", "m01", "m10")), f"Map images missing: {img_check}"
                w.evaluate_js("window.__ERR_TEST.startMapTilesTest()")
                tile_check = None
                tile_deadline = time.time() + 10.0
                while time.time() < tile_deadline:
                    tile_check = w.evaluate_js("window.__ERR_MAP_TILES")
                    if tile_check is not None:
                        break
                    time.sleep(0.03)
                assert tile_check and tile_check.get("m00") and tile_check.get("m10"), f"Map L0 tiles missing: {tile_check}"
            else:
                img_check = {}
                tile_check = {}
            if has_local_icons:
                assert map_state.get("iconsLoaded", 0) >= 20, f"Expected >=20 game icons, got {map_state.get('iconsLoaded')}"
            assert map_state.get("dummyCount", 1) == 0, f"Unexpected dummy markers: {map_state.get('dummyCount')}"
            assert w.evaluate_js("document.getElementById('mapCenterPlayerBtn') === null"), "Redundant mapCenterPlayerBtn should be removed"
            assert w.evaluate_js("document.getElementById('mapStagePlayerBtn') !== null"), "mapStagePlayerBtn should remain"
            assert w.evaluate_js("document.getElementById('topPipBtn') !== null && document.getElementById('mapPipBtn') !== null"), "PiP toggle buttons should exist"
            normal_px = map_state.get("iconPx", 0)
            assert normal_px >= 21.0, f"Expected enlarged normal iconPx >= 21.0, got {normal_px}"
            clay_hits = w.evaluate_js('window.__ERR_TEST.searchMap("Claymore")')
            assert clay_hits >= 1, f"Claymore not found on map: {clay_hits}"
            st_search = w.evaluate_js("window.__ERR_TEST.getMapState()")
            assert st_search.get("iconPx", 0) >= normal_px * 1.95, f"Expected search iconPx >= 2x normal ({normal_px}), got {st_search.get('iconPx')}"
            w.evaluate_js('window.__ERR_TEST.searchMap("")')
            w.evaluate_js("window.__ERR_TEST.toggleMapCat('grace', false)")
            st_no_grace = w.evaluate_js("window.__ERR_TEST.getMapState()")
            assert st_no_grace["visibleCount"] < map_state["visibleCount"], "Map category toggle did not filter markers"
            w.evaluate_js("window.__ERR_TEST.toggleMapCat('grace', true)")
            acc = w.evaluate_js("window.__ERR_TEST.getMapAccuracyCheck()")
            for lyr in ("m00", "m01", "m10"):
                lc = acc["layers"][lyr]
                assert lc["ox"] == 7040.0 and lc["oz"] == 16512.0 and lc["span"] == 10496.0, f"Bad cal for {lyr}: {lc}"
            assert acc["besideGreatBridge"] and acc["besideGreatBridge"]["layer"] == "m00" and acc["besideGreatBridge"]["u"] > 0.78, f"Bad Beside Great Bridge: {acc['besideGreatBridge']}"
            assert acc["audiencePathway"] and acc["audiencePathway"]["layer"] == "m00" and acc["audiencePathway"]["u"] < 0.25 and acc["audiencePathway"]["v"] < 0.30, f"Bad Audience Pathway: {acc['audiencePathway']}"
            assert acc["haligtreeRoots"] and acc["haligtreeRoots"]["layer"] == "m00" and acc["haligtreeRoots"]["v"] < 0.12, f"Bad Haligtree Roots: {acc['haligtreeRoots']}"
            assert acc["erdtreeSanctuary"] and acc["erdtreeSanctuary"]["layer"] == "m00", f"Missing Erdtree Sanctuary: {acc['erdtreeSanctuary']}"
            assert acc["fireGiant"] and acc["fireGiant"]["layer"] == "m00" and acc["fireGiant"]["u"] > 0.55 and acc["fireGiant"]["v"] < 0.35, f"Bad Fire Giant: {acc['fireGiant']}"
            assert w.evaluate_js("document.getElementById('mapFollowBtn') !== null"), "mapFollowBtn should exist"
            ram_test = w.evaluate_js("window.__ERR_TEST.testLiveRamHooks()")
            assert ram_test["followOn"] and not ram_test["followOff"], f"Follow toggle failed: {ram_test}"
            assert ram_test["ramActive"] and "LIVE RAM" in ram_test["ramMeta"] and ram_test["ramStr"] == 55, f"RAM char sync failed: {ram_test}"
            assert ram_test["ramHasPos"] and not ram_test["restoredRamActive"] and "LIVE RAM" not in ram_test["restoredMeta"], f"RAM restore failed: {ram_test}"
            pip_res = w.evaluate_js("window.__ERR_TEST.testPipModes()")
            assert pip_res["mapBody"] and pip_res["statsBody"] and pip_res["statsCells"] == 8 and pip_res["offClean"], f"PiP modes failed: {pip_res}"
            w.evaluate_js("window.__ERR_TEST.openCalcTab()")

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
                f"MAP_TOTAL_MARKERS={map_state['totalCount']}",
                f"MAP_CATS_OK=7",
                f"MAP_IMAGES={','.join(k for k, v in img_check.items() if v)}",
                f"MAP_ICONS_LOADED={map_state['iconsLoaded']}",
                f"MAP_TILES_OK={bool(tile_check and tile_check.get('m00') and tile_check.get('m10'))}",
                f"MAP_DUMMY_COUNT={map_state['dummyCount']}",
                f"MAP_CLAYMORE_HITS={clay_hits}",
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
    try:
        webview.start(lambda w: api._start_watcher(), win, gui="edgechromium", icon=resource_icon_path(), private_mode=True)
    finally:
        api._watcher_stop.set()
        api._mem.close()


if __name__ == "__main__":
    main()
