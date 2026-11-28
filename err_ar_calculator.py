import base64
import ctypes
import gzip
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Set

import webview

import ar_engine
import er_ui_asset_extractor
import game_map_extractor
import memory_reader
import regulation_extractor
import save_reader


def app_base_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def custom_weapon_data_path() -> str:
    return os.path.join(app_base_dir(), "err_custom_weapon_data.json.gz")


def resource_data_path(settings: Optional[Dict[str, Any]] = None) -> str:
    if settings and str(settings.get("regulationPath") or "").strip():
        custom = custom_weapon_data_path()
        if os.path.exists(custom):
            return custom
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


def buff_icons_path() -> Optional[str]:
    for base in (app_base_dir(), getattr(sys, "_MEIPASS", app_base_dir())):
        candidate = os.path.join(base, "err_buff_icons.json.gz")
        if os.path.exists(candidate):
            return candidate
    return None


def er_ui_icons_path() -> str:
    return os.path.join(app_base_dir(), "er_ui_icons.json.gz")


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


def load_weapon_data(settings: Optional[Dict[str, Any]] = None) -> Dict:
    path = resource_data_path(settings)
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


def load_er_menu_assets() -> Dict[str, str]:
    ui_dir = resource_ui_dir()
    er_assets_path = os.path.join(ui_dir, "er_menu_assets.json")
    if not os.path.exists(er_assets_path):
        return {}
    try:
        with open(er_assets_path, "r", encoding="utf-8") as fh:
            loaded = json.load(fh)
        if isinstance(loaded, dict):
            return {str(k): str(v) for k, v in loaded.items() if isinstance(v, str)}
    except Exception:
        pass
    return {}


def build_inlined_html() -> str:
    ui_dir = resource_ui_dir()
    with open(os.path.join(ui_dir, "index.html"), "r", encoding="utf-8") as fh:
        html = fh.read()
    with open(os.path.join(ui_dir, "styles.css"), "r", encoding="utf-8") as fh:
        css = fh.read()
    with open(os.path.join(ui_dir, "app.js"), "r", encoding="utf-8") as fh:
        js = fh.read().replace("</script", "<\\/script")

    html = html.replace("<!-- INJECT_CSS -->", f"<style>\n{css}\n</style>", 1)
    html = html.replace(
        "<!-- INJECT_JS -->",
        f"<script>window.__ER_MENU_ASSETS = window.__ER_MENU_ASSETS || {{}};</script>\n<script>\n{js}\n</script>",
        1,
    )
    return html


DEFAULT_KEYBINDS: Dict[str, str] = {
    "togglePipMap": "Ctrl+Shift+M",
    "togglePipStats": "Ctrl+Shift+S",
    "togglePipClickThrough": "Ctrl+Shift+G",
    "toggleFollow": "Ctrl+Shift+F",
    "focusPipSearch": "Ctrl+Shift+K",
    "toggleOverlayHide": "Ctrl+Shift+H",
    "toggleBossResMode": "",
}

_VK_SPECIAL: Dict[str, int] = {
    "SPACE": 0x20,
    "TAB": 0x09,
    "ENTER": 0x0D,
    "BACKSPACE": 0x08,
    "INSERT": 0x2D,
    "DELETE": 0x2E,
    "HOME": 0x24,
    "END": 0x23,
    "PAGEUP": 0x21,
    "PAGEDOWN": 0x22,
    "UP": 0x26,
    "DOWN": 0x28,
    "LEFT": 0x25,
    "RIGHT": 0x27,
    "PAUSE": 0x13,
    "CAPSLOCK": 0x14,
    "`": 0xC0,
    "~": 0xC0,
    "BACKQUOTE": 0xC0,
    "-": 0xBD,
    "MINUS": 0xBD,
    "=": 0xBB,
    "EQUAL": 0xBB,
    "[": 0xDB,
    "]": 0xDD,
    "\\": 0xDC,
    ";": 0xBA,
    "'": 0xDE,
    ",": 0xBC,
    ".": 0xBE,
    "/": 0xBF,
}


def parse_hotkey_combo(combo: str) -> Optional[tuple]:
    if not combo or not isinstance(combo, str):
        return None
    parts = [p.strip() for p in combo.split("+") if p.strip()]
    if not parts:
        return None
    mods = 0x4000  # MOD_NOREPEAT
    vk = 0
    for tok in parts[:-1]:
        tl = tok.lower()
        if tl in ("ctrl", "control"):
            mods |= 0x0002
        elif tl == "shift":
            mods |= 0x0004
        elif tl == "alt":
            mods |= 0x0001
        elif tl in ("win", "meta", "super"):
            mods |= 0x0008
        else:
            return None
    key = parts[-1].upper()
    if len(key) == 1 and ("A" <= key <= "Z" or "0" <= key <= "9"):
        vk = ord(key)
    elif key.startswith("F") and key[1:].isdigit() and 1 <= int(key[1:]) <= 24:
        vk = 0x70 + int(key[1:]) - 1
    elif key.startswith("NUM") and len(key) == 4 and key[3].isdigit():
        vk = 0x60 + int(key[3])
    elif key in _VK_SPECIAL:
        vk = _VK_SPECIAL[key]
    elif parts[-1] in _VK_SPECIAL:
        vk = _VK_SPECIAL[parts[-1]]
    if not vk:
        return None
    return mods, vk


class GlobalHotkeyManager:
    """Dedicated hidden-window Win32 RegisterHotKey dispatcher (zero hooks)."""

    def __init__(self, on_trigger):
        self._on_trigger = on_trigger
        self._lock = threading.Lock()
        self._tid: int = 0
        self._thread: Optional[threading.Thread] = None
        self._ready = threading.Event()
        self._rebind_done = threading.Event()
        self._desired_binds: Dict[str, str] = {}
        self._id_to_action: Dict[int, str] = {}
        self._last_errors: Dict[str, str] = {}
        self._stop = False

    def start(self, initial_binds: Dict[str, str]) -> Dict[str, str]:
        if self._thread is None:
            self._desired_binds = dict(initial_binds)
            self._thread = threading.Thread(target=self._run, daemon=True, name="GlobalHotkeys")
            self._thread.start()
            self._ready.wait(timeout=2.0)
        return self.update_binds(initial_binds)

    def stop(self):
        self._stop = True
        if self._tid:
            try:
                ctypes.windll.user32.PostThreadMessageW(self._tid, 0x0012, 0, 0)  # WM_QUIT
            except Exception:
                pass

    def update_binds(self, binds: Dict[str, str]) -> Dict[str, str]:
        with self._lock:
            self._desired_binds = {k: str(v or "") for k, v in binds.items()}
            self._rebind_done.clear()
            if self._tid:
                ctypes.windll.user32.PostThreadMessageW(self._tid, 0x8001, 0, 0)
        self._rebind_done.wait(timeout=1.5)
        return dict(self._last_errors)

    def _run(self):
        import ctypes.wintypes as wt

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        user32.CreateWindowExW.restype = wt.HWND
        user32.RegisterHotKey.argtypes = [wt.HWND, ctypes.c_int, wt.UINT, wt.UINT]
        user32.UnregisterHotKey.argtypes = [wt.HWND, ctypes.c_int]
        self._tid = int(kernel32.GetCurrentThreadId())
        hwnd_msg = ctypes.c_void_p(-3)  # HWND_MESSAGE
        hwnd = user32.CreateWindowExW(0, "STATIC", "ERRHotkeySink", 0, 0, 0, 0, 0, hwnd_msg, None, None, None)

        def apply_binds():
            for hid in list(self._id_to_action.keys()):
                user32.UnregisterHotKey(hwnd, hid)
            self._id_to_action.clear()
            errs: Dict[str, str] = {}
            hid = 100
            for action, combo in self._desired_binds.items():
                combo_s = (combo or "").strip()
                if not combo_s:
                    continue
                parsed = parse_hotkey_combo(combo_s)
                if not parsed:
                    errs[action] = f"Invalid hotkey: {combo_s}"
                    continue
                mods, vk = parsed
                if user32.RegisterHotKey(hwnd, hid, mods, vk):
                    self._id_to_action[hid] = action
                else:
                    errs[action] = f"{combo_s} is in use by another app"
                hid += 1
            self._last_errors = errs
            self._rebind_done.set()

        msg = wt.MSG()
        user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 0)
        self._ready.set()
        apply_binds()

        while not self._stop:
            ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret <= 0:
                break
            if msg.message == 0x8001:
                apply_binds()
            elif msg.message == 0x0312:  # WM_HOTKEY
                action = self._id_to_action.get(int(msg.wParam))
                if action:
                    try:
                        self._on_trigger(action)
                    except Exception:
                        pass
        for hid in list(self._id_to_action.keys()):
            user32.UnregisterHotKey(hwnd, hid)
        if hwnd:
            user32.DestroyWindow(hwnd)


def _compute_pip_corner_xy(corner: str, pw: int, ph: int) -> tuple[int, int]:
    c = str(corner or "bottom-right").lower()
    try:
        scr = webview.screens[0]
        sw, sh = int(scr.width), int(scr.height)
    except Exception:
        sw, sh = 1920, 1080
    if c == "top-left":
        return (24, 24)
    if c == "top-right":
        return (max(16, sw - pw - 24), 24)
    if c == "bottom-left":
        return (24, max(16, sh - ph - 56))
    return (max(16, sw - pw - 24), max(16, sh - ph - 56))


def _clamp_pip_bounds_dict(raw: Any) -> Dict[str, List[int]]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, List[int]] = {}
    for mode, def_sz in (("map", (380, 380)), ("stats", (350, 310)), ("hud", (380, 560))):
        vals = raw.get(mode)
        if not isinstance(vals, (list, tuple)) or len(vals) != 4:
            continue
        try:
            px, py, pw, ph = [int(v) for v in vals]
        except Exception:
            continue
        if pw < 220 or ph < 180 or pw > 1100 or ph > 1080:
            pw, ph = def_sz
        if px < -50 or py < -50 or px > 3840 or py > 2160:
            px, py = 24, 24
        out[mode] = [px, py, pw, ph]
    return out


def _save_summary_key(parsed: Dict[str, Any]) -> str:
    chars = [
        {
            "slot": c["slot"],
            "name": c["name"],
            "level": c["level"],
            "stats": c["stats"],
            "equipped": c.get("equipped", []),
            "rightHand": c.get("rightHand", []),
            "leftHand": c.get("leftHand", []),
            "arrows": c.get("arrows", []),
            "bolts": c.get("bolts", []),
            "spells": c.get("spells", []),
            "armor": c.get("armor", []),
            "talismans": c.get("talismans", []),
            "mapPins": c.get("mapPins", []),
            "flagCount": len(c.get("setFlags", [])),
            "ownedCounts": {k: len(v) for k, v in (c.get("owned") or {}).items()},
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
        cfg0 = self._load_settings()
        self._data = load_weapon_data(cfg0)
        self._known_weapon_ids = set(self._data["_byId"].keys())
        self._save_lock = threading.Lock()
        self._save_path: Optional[str] = None
        self._custom_save_browsed: bool = False
        self._save_mtime: float = 0.0
        self._save_fingerprint: Optional[str] = None
        self._save_stat_offsets: Dict[str, int] = {}
        self._save_summary_key: Optional[str] = None
        self._save_pos_key: Optional[str] = None
        self._live_watch: bool = bool(cfg0.get("liveWatch", True))
        self._watcher_stop = threading.Event()
        self._watcher_thread: Optional[threading.Thread] = None
        self._map_data: Optional[Dict[str, Any]] = None
        self._map_icons: Optional[Dict[str, str]] = None
        self._buff_icons: Optional[Dict[str, Any]] = None
        self._er_ui_icons: Optional[Dict[str, Any]] = None
        self._regulation_path: str = str(cfg0.get("regulationPath") or "").strip()
        self._flag_bst: Dict[int, int] = {}
        self._wanted_flags: Set[int] = set()
        self._npc_meta: Dict[int, tuple] = {}
        self._load_flag_meta()
        self._mem = memory_reader.EldenRingMemoryReader()
        self._known_armor_ids = {int(k) for k in (self._data.get("armors") or {}).keys() if int(k) > 10300}
        self._known_talisman_ids = {int(k) for k in (self._data.get("talismans") or {}).keys()}
        self._ui_view: str = "calc"
        self._map_follow: bool = bool(cfg0.get("mapFollow", False))
        self._ram_active: bool = False
        self._pip_mode: str = "off"
        self._pip_opacity: float = max(0.15, min(1.0, float(cfg0.get("pipOpacity", 100)) / 100.0 if float(cfg0.get("pipOpacity", 1.0)) > 1.0 else float(cfg0.get("pipOpacity", 1.0))))
        self._pip_click_through: bool = False
        self._pip_boss_hud: bool = bool(cfg0.get("pipBossHud", True))
        self._pip_map_boss_hud: bool = bool(cfg0.get("pipMapBossHud", True))
        self._pip_buff_hud: bool = bool(cfg0.get("pipBuffHud", True))
        self._pip_map_buff_hud: bool = bool(cfg0.get("pipMapBuffHud", True))
        d0 = str(cfg0.get("pipBossDesign", "1"))
        self._pip_boss_design: str = d0 if d0 in ("1", "2", "3") else "1"
        self._overlay_hidden: bool = False
        self._pip_locked: bool = bool(cfg0.get("pipLocked", False))
        self._pip_auto_hide: bool = bool(cfg0.get("pipAutoHide", False))
        self._auto_hidden_by_focus: bool = False
        self._minimize_to_tray: bool = bool(cfg0.get("minimizeToTray", False))
        self._enemy_preset_live: bool = str(cfg0.get("enemyPreset", "")) == "__LIVE_TARGET__"
        self._tray_icon = None
        self._tray_init_done: bool = False
        self._normal_bounds = None
        self._pip_bounds: Dict[str, Any] = _clamp_pip_bounds_dict(cfg0.get("pipBounds"))
        self._pip_boss_ext: int = 0
        self._pip_ext_shift_y: int = 0
        self._resize_drag = None
        self._hotkeys = GlobalHotkeyManager(self._on_global_hotkey)
        self._hotkey_errors: Dict[str, str] = {}
        self._extract_lock = threading.Lock()
        self._extract_state: Dict[str, Any] = {
            "running": False,
            "pct": 0,
            "message": "",
            "done": False,
            "ok": False,
            "error": "",
        }

    def _load_flag_meta(self):
        p = map_data_path()
        if not p:
            return
        try:
            with gzip.open(p, "rt", encoding="utf-8") as fh:
                md = json.load(fh)
            self._map_data = md
            self._flag_bst = {int(k): int(v) for k, v in (md.get("flagBst") or {}).items()}
            self._npc_meta = {
                int(k): (str(v[0] or ""), int(v[1] or 0))
                for k, v in (md.get("npcMeta") or {}).items()
                if isinstance(v, (list, tuple)) and len(v) >= 2
            }
            wanted: Set[int] = set()
            for mk in md.get("markers", []):
                ef = mk.get("eventFlag")
                if isinstance(ef, int) and ef > 0:
                    wanted.add(ef)
                for f in mk.get("eventFlags", []) or []:
                    if isinstance(f, int) and f > 0:
                        wanted.add(f)
            self._wanted_flags = wanted
        except Exception:
            pass

    def _on_global_hotkey(self, action: str):
        if self._window and not self._self_test_mode:
            try:
                self._window.evaluate_js(f"window.__onGlobalHotkey && window.__onGlobalHotkey({json.dumps(action)});")
            except Exception:
                pass

    def _read_save(self, path: Optional[str]) -> Dict[str, Any]:
        if not path or not os.path.exists(path):
            return {"characters": [], "error": "No ER save found (manual stats)"}
        try:
            with self._save_lock:
                parsed = save_reader.read_save_characters(
                    path,
                    self._known_weapon_ids,
                    flag_bst=self._flag_bst,
                    wanted_flags=self._wanted_flags,
                )
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

    def get_buff_icons(self) -> Dict[str, Any]:
        if self._buff_icons is not None:
            return self._buff_icons
        p = buff_icons_path()
        if p:
            try:
                with gzip.open(p, "rt", encoding="utf-8") as fh:
                    self._buff_icons = json.load(fh)
                    return self._buff_icons
            except Exception:
                pass
        self._buff_icons = {"icons": {}, "iconMap": {}, "spMeta": {}}
        return self._buff_icons

    def get_initial_payload(self) -> Dict[str, Any]:
        save_path = save_reader.find_default_save()
        cfg = self._load_settings()
        binds = dict(DEFAULT_KEYBINDS)
        if isinstance(cfg.get("keybinds"), dict):
            binds.update({k: str(v or "") for k, v in cfg["keybinds"].items()})
        if not self._self_test_mode:
            self._hotkey_errors = self._hotkeys.start(binds)
        return {
            "data": clean_data_for_ui(self._data),
            "enemyPresets": dict(ar_engine.ENEMY_PRESETS),
            "save": self._read_save(save_path),
            "settings": cfg,
            "defaultKeybinds": dict(DEFAULT_KEYBINDS),
            "hotkeyErrors": dict(self._hotkey_errors),
            "buffIcons": self.get_buff_icons(),
            "erMenuAssets": load_er_menu_assets(),
            "erUiIcons": self.get_er_ui_icons(),
            "modSource": self.get_mod_source_info(),
            "selfTestMode": self._self_test_mode,
        }

    def set_keybinds(self, binds: Dict[str, str]) -> Dict[str, Any]:
        clean = dict(DEFAULT_KEYBINDS)
        if isinstance(binds, dict):
            for k in DEFAULT_KEYBINDS:
                if k in binds:
                    clean[k] = str(binds[k] or "").strip()
        if not self._self_test_mode:
            self._hotkey_errors = self._hotkeys.update_binds(clean)
            cfg = self._load_settings()
            cfg["keybinds"] = clean
            self.save_settings(cfg)
        return {"keybinds": clean, "errors": dict(self._hotkey_errors)}

    def reload_save(self, select_latest: bool = True) -> Dict[str, Any]:
        if self._save_path and os.path.exists(self._save_path) and (not select_latest or self._custom_save_browsed):
            path = self._save_path
        else:
            path = save_reader.find_default_save()
            self._custom_save_browsed = False
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
        if res.get("characters"):
            self._custom_save_browsed = True
        res["cancelled"] = False
        return res

    def _poll_unlocked(self) -> Dict[str, Any]:
        if not self._save_path or not os.path.exists(self._save_path):
            cand = save_reader.find_default_save()
            if cand and os.path.exists(cand):
                parsed = save_reader.read_save_characters(
                    cand,
                    self._known_weapon_ids,
                    flag_bst=self._flag_bst,
                    wanted_flags=self._wanted_flags,
                )
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
            parsed = save_reader.read_save_characters(
                self._save_path,
                self._known_weapon_ids,
                flag_bst=self._flag_bst,
                wanted_flags=self._wanted_flags,
            )
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
        self._ui_view = "map" if view in ("map", "hud") else "calc"
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

    def set_pip_mode(self, mode: str, opacity: Optional[float] = None, corner: Optional[str] = None) -> Dict[str, Any]:
        target = mode if mode in ("off", "map", "stats", "hud") else "off"
        if opacity is not None:
            self._pip_opacity = max(0.15, min(1.0, float(opacity)))
        prev = self._pip_mode
        self._pip_mode = target
        self._resize_drag = None
        if target in ("map", "hud"):
            self._ui_view = "map"
        if self._self_test_mode or target == prev:
            if not self._self_test_mode and target != "off":
                self.set_pip_opacity(self._pip_opacity)
            return {"mode": self._pip_mode, "opacity": self._pip_opacity}

        bv = self._get_winforms_form()
        if bv is not None:
            def _apply():
                import System.Drawing as SD
                import System.Windows.Forms as SWinForms

                if prev == "off":
                    self._normal_bounds = (int(bv.Left), int(bv.Top), int(bv.Width), int(bv.Height))
                else:
                    base_prev_y = int(bv.Top) + self._pip_ext_shift_y
                    base_prev_h = max(180, int(bv.Height) - self._pip_boss_ext)
                    clamped_prev = _clamp_pip_bounds_dict({prev: [int(bv.Left), base_prev_y, int(bv.Width), base_prev_h]})
                    if prev in clamped_prev:
                        self._pip_bounds[prev] = clamped_prev[prev]
                self._pip_boss_ext = 0
                self._pip_ext_shift_y = 0
                self._pip_bounds = _clamp_pip_bounds_dict(self._pip_bounds)

                if target == "off":
                    self._pip_click_through = False
                    self._overlay_hidden = False
                    self._auto_hidden_by_focus = False
                    self._apply_click_through_hwnd(bv, False)
                    bv.Visible = True
                    bv.ShowInTaskbar = True
                    bv.TopMost = False
                    bv.Opacity = 1.0
                    bv.FormBorderStyle = SWinForms.FormBorderStyle.Sizable
                    bv.MinimumSize = SD.Size(1060, 680)
                    if self._normal_bounds:
                        bv.SetBounds(*self._normal_bounds)
                else:
                    if getattr(bv, "WindowState", None) != SWinForms.FormWindowState.Normal:
                        bv.WindowState = SWinForms.FormWindowState.Normal
                    bv.Visible = not self._overlay_hidden
                    bv.FormBorderStyle = getattr(SWinForms.FormBorderStyle, "None")
                    bv.MinimumSize = SD.Size(220, 180)
                    bv.TopMost = True
                    bv.Opacity = self._pip_opacity
                    def_w, def_h = (380, 560) if target == "hud" else ((380, 380) if target == "map" else (350, 310))
                    if target in self._pip_bounds:
                        px, py, pw, ph = self._pip_bounds[target]
                    else:
                        pw, ph = def_w, def_h
                        snap_c = corner or ("bottom-right" if target in ("hud", "stats") else "top-right")
                        px, py = _compute_pip_corner_xy(snap_c, pw, ph)
                    bv.SetBounds(int(px), int(py), int(pw), int(ph))
                    self._apply_click_through_hwnd(bv, self._pip_click_through)

            self._invoke_ui(_apply)
        return {"mode": self._pip_mode, "opacity": self._pip_opacity, "clickThrough": self._pip_click_through, "hidden": self._overlay_hidden}

    def snap_pip_corner(self, mode: str, corner: str) -> Dict[str, Any]:
        target = mode if mode in ("map", "stats", "hud") else "hud"
        def_w, def_h = (380, 560) if target == "hud" else ((380, 380) if target == "map" else (350, 310))
        cur = self._pip_bounds.get(target)
        pw = int(cur[2]) if isinstance(cur, (list, tuple)) and len(cur) == 4 else def_w
        ph = int(cur[3]) if isinstance(cur, (list, tuple)) and len(cur) == 4 else def_h
        px, py = _compute_pip_corner_xy(corner, pw, ph)
        self._pip_bounds[target] = [px, py, pw, ph]
        self._pip_boss_ext = 0
        self._pip_ext_shift_y = 0
        if not self._self_test_mode and self._pip_mode == target:
            bv = self._get_winforms_form()
            if bv is not None:
                self._invoke_ui(lambda: bv.SetBounds(int(px), int(py), int(pw), int(ph)))
        return {"mode": target, "bounds": [px, py, pw, ph]}

    def set_pip_boss_extension(self, ext_px: int) -> Dict[str, Any]:
        """Temporarily extend or restore the PiP window height for external Show Below boss bars."""
        want = 0 if self._pip_mode == "off" else max(0, min(420, int(round(ext_px or 0))))
        if self._self_test_mode or self._pip_mode == "off" or self._resize_drag:
            if self._pip_mode == "off":
                self._pip_boss_ext = 0
                self._pip_ext_shift_y = 0
            return {"ext": self._pip_boss_ext, "shiftY": self._pip_ext_shift_y}

        bv = self._get_winforms_form()
        if bv is None:
            return {"ext": self._pip_boss_ext, "shiftY": self._pip_ext_shift_y}

        def _apply():
            import System.Windows.Forms as SWinForms

            cx, cy, cw, ch = int(bv.Left), int(bv.Top), int(bv.Width), int(bv.Height)
            base_h = max(180, ch - self._pip_boss_ext)
            base_y = cy + self._pip_ext_shift_y
            new_h = base_h + want
            wa = SWinForms.Screen.FromControl(bv).WorkingArea
            if base_y + new_h > int(wa.Bottom):
                shift_y = min(max(0, base_y - int(wa.Top)), (base_y + new_h) - int(wa.Bottom))
            else:
                shift_y = 0
            new_y = base_y - shift_y
            if int(new_y) != cy or int(new_h) != ch:
                bv.SetBounds(cx, int(new_y), cw, int(new_h))
            self._pip_boss_ext = want
            self._pip_ext_shift_y = int(shift_y)

        self._invoke_ui(_apply)
        return {"ext": self._pip_boss_ext, "shiftY": self._pip_ext_shift_y}

    @staticmethod
    def _apply_click_through_hwnd(bv, enabled: bool):
        try:
            user32 = ctypes.windll.user32
            hwnd = ctypes.c_void_p(int(bv.Handle.ToInt64()))
            GWL_EXSTYLE = -20
            WS_EX_TRANSPARENT = 0x00000020
            WS_EX_LAYERED = 0x00080000
            if ctypes.sizeof(ctypes.c_void_p) == 8:
                get_long = user32.GetWindowLongPtrW
                set_long = user32.SetWindowLongPtrW
                get_long.restype = ctypes.c_ssize_t
                set_long.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_ssize_t]
            else:
                get_long = user32.GetWindowLongW
                set_long = user32.SetWindowLongW
            get_long.argtypes = [ctypes.c_void_p, ctypes.c_int]
            style = get_long(hwnd, GWL_EXSTYLE)
            if enabled:
                style = style | WS_EX_TRANSPARENT | WS_EX_LAYERED
            else:
                style = style & (~WS_EX_TRANSPARENT)
            set_long(hwnd, GWL_EXSTYLE, style)
            user32.SetWindowPos(hwnd, None, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0020)
        except Exception:
            pass

    def set_pip_click_through(self, enabled: bool) -> Dict[str, Any]:
        want = bool(enabled) if self._pip_mode != "off" else False
        self._pip_click_through = want
        if not self._self_test_mode:
            bv = self._get_winforms_form()
            if bv is not None:
                self._invoke_ui(lambda: self._apply_click_through_hwnd(bv, want))
        return {"clickThrough": self._pip_click_through}

    def set_overlay_hidden(self, hidden: bool) -> Dict[str, Any]:
        want = bool(hidden) if self._pip_mode != "off" else False
        self._overlay_hidden = want
        if not want:
            self._auto_hidden_by_focus = False
        if not self._self_test_mode:
            bv = self._get_winforms_form()
            if bv is not None:
                def _vis():
                    bv.Visible = not want
                    if not want:
                        bv.TopMost = True
                self._invoke_ui(_vis)
        return {"hidden": self._overlay_hidden}

    def set_pip_locked(self, locked: bool) -> Dict[str, Any]:
        self._pip_locked = bool(locked)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipLocked"] = self._pip_locked
            self.save_settings(cfg)
        return {"pipLocked": self._pip_locked}

    def set_pip_auto_hide(self, enabled: bool) -> Dict[str, Any]:
        self._pip_auto_hide = bool(enabled)
        if not self._pip_auto_hide and self._auto_hidden_by_focus:
            self._auto_hidden_by_focus = False
            if not self._self_test_mode and self._pip_mode != "off" and not self._overlay_hidden:
                self._apply_pip_auto_hide(True)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipAutoHide"] = self._pip_auto_hide
            self.save_settings(cfg)
        return {"pipAutoHide": self._pip_auto_hide}

    def set_minimize_to_tray(self, enabled: bool) -> Dict[str, Any]:
        self._minimize_to_tray = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["minimizeToTray"] = self._minimize_to_tray
            self.save_settings(cfg)
        return {"minimizeToTray": self._minimize_to_tray}

    def set_enemy_preset_live(self, is_live: bool) -> Dict[str, Any]:
        self._enemy_preset_live = bool(is_live)
        return {"liveTarget": self._enemy_preset_live}

    _ALLOWED_AUTO_HIDE_CLASSES = frozenset({
        "MultitaskingViewFrame",
        "TaskSwitcherWnd",
        "XamlExplorerHostIslandWindow",
        "Shell_TrayWnd",
        "NotifyIconOverflowWindow",
        "ForegroundStaging",
        "Shell_SecondaryTrayWnd",
    })

    def _is_foreground_allowed_for_pip(self) -> bool:
        try:
            import ctypes.wintypes as wt

            user32 = ctypes.windll.user32
            fg = user32.GetForegroundWindow()
            if not fg:
                return True
            bv = self._get_winforms_form()
            if bv is not None:
                own_hwnd = int(bv.Handle.ToInt64())
                if int(fg) == own_hwnd:
                    return True
                root_owner = user32.GetAncestor(wt.HWND(fg), 3)  # GA_ROOTOWNER
                if root_owner and int(root_owner) == own_hwnd:
                    return True
            pid = wt.DWORD(0)
            user32.GetWindowThreadProcessId(wt.HWND(fg), ctypes.byref(pid))
            fg_pid = int(pid.value)
            if fg_pid == os.getpid():
                return True
            if self._mem._pid and fg_pid == int(self._mem._pid):
                return True
            cls_buf = ctypes.create_unicode_buffer(128)
            if user32.GetClassNameW(wt.HWND(fg), cls_buf, 128) > 0:
                if cls_buf.value in self._ALLOWED_AUTO_HIDE_CLASSES:
                    return True
            img = memory_reader._get_process_image_path(fg_pid)
            if img and os.path.basename(img).lower() == "eldenring.exe":
                return True
            return False
        except Exception:
            return True

    def _apply_pip_auto_hide(self, show: bool) -> None:
        if self._self_test_mode:
            return
        bv = self._get_winforms_form()
        if bv is None:
            return

        def _do():
            user32 = ctypes.windll.user32
            hwnd = ctypes.c_void_p(int(bv.Handle.ToInt64()))
            if show:
                user32.ShowWindow(hwnd, 4)  # SW_SHOWNOACTIVATE
                user32.SetWindowPos(hwnd, ctypes.c_void_p(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
            else:
                user32.ShowWindow(hwnd, 0)  # SW_HIDE

        self._invoke_ui(_do)

    def _restore_main_window(self) -> None:
        bv = self._get_winforms_form()
        if bv is None:
            return

        def _show():
            import System.Windows.Forms as SWinForms

            bv.Show()
            bv.ShowInTaskbar = True
            if bv.WindowState == SWinForms.FormWindowState.Minimized:
                bv.WindowState = SWinForms.FormWindowState.Normal
            bv.Activate()

        self._invoke_ui(_show)

    def _on_window_shown(self) -> None:
        self._init_tray_icon()
        self._start_watcher()

    def _init_tray_icon(self) -> None:
        if self._self_test_mode or self._tray_init_done:
            return
        bv = self._get_winforms_form()
        if bv is None:
            return
        self._tray_init_done = True

        def _setup():
            try:
                import System.Drawing as SD
                import System.Windows.Forms as SWinForms

                ico_path = resource_icon_path()
                ico_obj = SD.Icon(ico_path) if (ico_path and os.path.isfile(ico_path)) else SD.SystemIcons.Application
                menu = SWinForms.ContextMenuStrip()
                item_show = menu.Items.Add("Show Window")
                item_pip = menu.Items.Add("Toggle PiP Overlay")
                menu.Items.Add(SWinForms.ToolStripSeparator())
                item_exit = menu.Items.Add("Exit")

                item_show.Click += lambda _s, _e: self._restore_main_window()
                item_pip.Click += lambda _s, _e: self._on_global_hotkey("togglePipStats")

                def _exit_click(_s, _e):
                    self.cleanup()
                    if self._window:
                        try:
                            self._window.destroy()
                        except Exception:
                            pass

                item_exit.Click += _exit_click

                ni = SWinForms.NotifyIcon()
                ni.Icon = ico_obj
                ni.Text = "Elden Ring Reforged Calculator"
                ni.ContextMenuStrip = menu
                ni.Visible = True
                ni.DoubleClick += lambda _s, _e: self._restore_main_window()
                self._tray_icon = ni

                def _on_resize(_s, _e):
                    try:
                        if self._minimize_to_tray and self._pip_mode == "off" and bv.WindowState == SWinForms.FormWindowState.Minimized:
                            bv.ShowInTaskbar = False
                            bv.Hide()
                    except Exception:
                        pass

                bv.Resize += _on_resize
            except Exception:
                pass

        self._invoke_ui(_setup)

    def cleanup(self) -> None:
        self._watcher_stop.set()
        self._hotkeys.stop()
        self._mem.close()
        ni = self._tray_icon
        self._tray_icon = None
        if ni is not None:
            def _disp():
                try:
                    ni.Visible = False
                    ni.Dispose()
                except Exception:
                    pass
            self._invoke_ui(_disp)

    def set_pip_opacity(self, opacity: float) -> Dict[str, Any]:
        self._pip_opacity = max(0.15, min(1.0, float(opacity)))
        if not self._self_test_mode and self._pip_mode != "off":
            bv = self._get_winforms_form()
            if bv is not None:
                def _apply_op():
                    bv.Opacity = self._pip_opacity

                self._invoke_ui(_apply_op)
        return {"mode": self._pip_mode, "opacity": self._pip_opacity}

    def set_pip_boss_hud(self, enabled: bool) -> Dict[str, Any]:
        self._pip_boss_hud = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipBossHud"] = self._pip_boss_hud
            self.save_settings(cfg)
        return {"pipBossHud": self._pip_boss_hud}

    def set_pip_map_boss_hud(self, enabled: bool) -> Dict[str, Any]:
        self._pip_map_boss_hud = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipMapBossHud"] = self._pip_map_boss_hud
            self.save_settings(cfg)
        return {"pipMapBossHud": self._pip_map_boss_hud}

    def set_pip_buff_hud(self, enabled: bool) -> Dict[str, Any]:
        self._pip_buff_hud = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipBuffHud"] = self._pip_buff_hud
            self.save_settings(cfg)
        return {"pipBuffHud": self._pip_buff_hud}

    def set_pip_map_buff_hud(self, enabled: bool) -> Dict[str, Any]:
        self._pip_map_buff_hud = bool(enabled)
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipMapBuffHud"] = self._pip_map_buff_hud
            self.save_settings(cfg)
        return {"pipMapBuffHud": self._pip_map_buff_hud}

    def set_pip_boss_design(self, design: str) -> Dict[str, Any]:
        d = str(design or "1")
        self._pip_boss_design = d if d in ("1", "2", "3") else "1"
        if not self._self_test_mode:
            cfg = self._load_settings()
            cfg["pipBossDesign"] = self._pip_boss_design
            self.save_settings(cfg)
        return {"pipBossDesign": self._pip_boss_design}

    def _win32_nc_hit(self, ht_code: int) -> bool:
        if self._self_test_mode or self._pip_mode == "off":
            return False
        bv = self._get_winforms_form()
        if bv is None:
            return False

        def _do():
            user32 = ctypes.windll.user32
            user32.ReleaseCapture()
            hwnd = ctypes.c_void_p(int(bv.Handle.ToInt64()))
            user32.SendMessageW(hwnd, ctypes.c_uint(0x00A1), ctypes.c_size_t(int(ht_code)), ctypes.c_ssize_t(0))

        return self._invoke_ui(_do)

    def start_window_drag(self) -> bool:
        if self._pip_locked and self._pip_mode != "off":
            return False
        return self._win32_nc_hit(2)  # HTCAPTION

    @staticmethod
    def _get_cursor_pos():
        class _POINT(ctypes.Structure):
            _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

        pt = _POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
        return int(pt.x), int(pt.y)

    def begin_pip_resize(self, edge: str) -> bool:
        if self._pip_locked and self._pip_mode != "off":
            return False
        if self._self_test_mode or self._pip_mode == "off" or edge not in ("n", "s", "e", "w", "ne", "nw", "se", "sw"):
            return False
        bv = self._get_winforms_form()
        if bv is None:
            return False
        mx, my = self._get_cursor_pos()
        bounds = []

        def _read():
            bounds.append((int(bv.Left), int(bv.Top), int(bv.Width), int(bv.Height)))

        if not self._invoke_ui(_read) or not bounds:
            return False
        x0, y0, w0, h0 = bounds[0]
        self._resize_drag = (edge, mx, my, x0, y0, w0, h0)
        return True

    def step_pip_resize(self) -> bool:
        if (self._pip_locked and self._pip_mode != "off") or not self._resize_drag or self._self_test_mode or self._pip_mode == "off":
            return False
        bv = self._get_winforms_form()
        if bv is None:
            return False
        edge, mx0, my0, x0, y0, w0, h0 = self._resize_drag
        mx, my = self._get_cursor_pos()
        dx = mx - mx0
        dy = my - my0
        nx, ny, nw, nh = x0, y0, w0, h0
        min_w, min_h = 220, 180
        if "e" in edge:
            nw = max(min_w, w0 + dx)
        if "w" in edge:
            nw = max(min_w, w0 - dx)
            nx = x0 + (w0 - nw)
        if "s" in edge:
            nh = max(min_h, h0 + dy)
        if "n" in edge:
            nh = max(min_h, h0 - dy)
            ny = y0 + (h0 - nh)

        def _apply_bounds():
            bv.SetBounds(int(nx), int(ny), int(nw), int(nh))

        return self._invoke_ui(_apply_bounds)

    def end_pip_resize(self) -> bool:
        if not self._resize_drag:
            return False
        self._resize_drag = None
        if self._self_test_mode or self._pip_mode == "off":
            return False
        bv = self._get_winforms_form()
        if bv is None:
            return False

        def _save():
            self._pip_bounds[self._pip_mode] = [
                int(bv.Left),
                int(bv.Top) + self._pip_ext_shift_y,
                int(bv.Width),
                max(180, int(bv.Height) - self._pip_boss_ext),
            ]

        return self._invoke_ui(_save)

    def get_map_extract_status(self) -> Dict[str, Any]:
        with self._extract_lock:
            st = dict(self._extract_state)
        st["hasMaps"] = all(bool(map_image_path(l)) for l in ("m00", "m01", "m10"))
        st["hasIcons"] = bool(map_icons_path())
        st["detectedGameDir"] = game_map_extractor.detect_elden_ring_game_dir()
        return st

    def _push_extract_status(self):
        if self._self_test_mode or not self._window:
            return
        st = self.get_map_extract_status()
        try:
            self._window.evaluate_js(f"window.__onMapExtractProgress && window.__onMapExtractProgress({json.dumps(st)});")
        except Exception:
            pass

    def start_map_extraction(self, browse: bool = False) -> Dict[str, Any]:
        with self._extract_lock:
            if self._extract_state["running"]:
                return {"started": False, "reason": "already_running"}

        game_dir = None if browse else game_map_extractor.detect_elden_ring_game_dir()
        if not game_dir:
            if not self._window or self._self_test_mode:
                return {"started": False, "error": "Elden Ring game folder not auto-detected."}
            init_dir = game_map_extractor.detect_elden_ring_game_dir() or ""
            chosen = self._window.create_file_dialog(
                webview.FileDialog.FOLDER,
                directory=init_dir,
            )
            if not chosen:
                return {"started": False, "cancelled": True}
            raw_dir = chosen[0] if isinstance(chosen, (list, tuple)) else chosen
            game_dir = game_map_extractor.normalize_game_dir(raw_dir)
            if not game_dir:
                return {
                    "started": False,
                    "error": "Selected folder must contain Data0.bhd, Data0.bdt, and oo2core_6_win64.dll (ELDEN RING\\Game).",
                }

        with self._extract_lock:
            self._extract_state = {
                "running": True,
                "pct": 1,
                "message": f"Starting extraction from {game_dir}...",
                "done": False,
                "ok": False,
                "error": "",
            }
        self._push_extract_status()

        def _worker():
            try:
                def _on_prog(pct: int, msg: str):
                    with self._extract_lock:
                        self._extract_state["pct"] = pct
                        self._extract_state["message"] = msg
                    self._push_extract_status()

                res = game_map_extractor.extract_maps_and_icons(game_dir, app_base_dir(), progress_cb=_on_prog)
                self._map_icons = None
                with self._extract_lock:
                    self._extract_state = {
                        "running": False,
                        "pct": 100,
                        "message": f"Done! Extracted 3 map layers & {res.get('iconCount', 0)} icons.",
                        "done": True,
                        "ok": True,
                        "error": "",
                    }
                self._push_extract_status()
            except Exception as exc:
                with self._extract_lock:
                    self._extract_state = {
                        "running": False,
                        "pct": 0,
                        "message": f"Extraction failed: {exc}",
                        "done": True,
                        "ok": False,
                        "error": str(exc),
                    }
                self._push_extract_status()

        threading.Thread(target=_worker, daemon=True, name="MapExtractor").start()
        return {"started": True, "gameDir": game_dir}

    def _start_watcher(self):
        if self._self_test_mode or self._watcher_thread is not None:
            return

        def _loop():
            last_pos_key = None
            last_char_key = None
            last_pins_key = None
            last_prog_key = None
            last_boss_key = None
            last_buffs_key = None
            last_ar_buffs_key = None
            has_active_boss = False
            last_char_t = 0.0
            last_pins_t = 0.0
            last_prog_t = 0.0
            last_buffs_t = 0.0
            last_ar_buffs_t = 0.0
            last_boss_t = 0.0
            last_save_t = 0.0
            last_focus_t = 0.0
            focus_miss_streak = 0
            miss_streak = 0
            while True:
                want_boss_pip = (
                    (self._pip_mode == "stats" and self._pip_boss_hud)
                    or (self._pip_mode in ("map", "hud") and self._pip_map_boss_hud)
                )
                want_boss = want_boss_pip or (self._ram_active and self._enemy_preset_live)
                want_buffs = (
                    (self._pip_mode == "stats" and self._pip_buff_hud)
                    or (self._pip_mode in ("map", "hud") and self._pip_map_buff_hud)
                )
                want_ar_buffs = (self._pip_mode in ("stats", "hud")) or self._ram_active
                if self._ram_active:
                    if (self._ui_view == "map" and self._map_follow) or want_boss_pip:
                        dt = 0.033
                    elif want_buffs:
                        dt = 0.066
                    elif self._ui_view == "map":
                        dt = 0.10
                    else:
                        dt = 0.25
                else:
                    dt = 0.5
                if self._pip_mode != "off" and self._pip_auto_hide and dt > 0.14:
                    dt = 0.14
                if self._watcher_stop.wait(dt):
                    break
                if not self._window:
                    continue

                now = time.monotonic()
                if self._pip_mode != "off" and self._pip_auto_hide and not self._overlay_hidden:
                    if (now - last_focus_t) >= 0.12:
                        last_focus_t = now
                        if self._is_foreground_allowed_for_pip():
                            focus_miss_streak = 0
                            if self._auto_hidden_by_focus:
                                self._auto_hidden_by_focus = False
                                self._apply_pip_auto_hide(True)
                        else:
                            focus_miss_streak += 1
                            if focus_miss_streak >= 2 and not self._auto_hidden_by_focus:
                                self._auto_hidden_by_focus = True
                                self._apply_pip_auto_hide(False)
                elif self._auto_hidden_by_focus:
                    self._auto_hidden_by_focus = False
                    if self._pip_mode != "off" and not self._overlay_hidden:
                        self._apply_pip_auto_hide(True)

                if not self._live_watch:
                    continue
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
                                    tuple((e or {}).get("rawId") for e in ch.get("rightHand") or []),
                                    tuple((e or {}).get("rawId") for e in ch.get("leftHand") or []),
                                    ch.get("armStyle"),
                                    ch.get("activeRhSlot"),
                                    ch.get("activeLhSlot"),
                                    tuple(ch.get("arrows") or []),
                                    tuple(ch.get("bolts") or []),
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
                            if (self._ui_view == "map" or self._pip_mode in ("map", "hud")) and (not was_active or now - last_pins_t >= 0.45):
                                last_pins_t = now
                                pins = self._mem.read_world_map_pins()
                                if pins is not None:
                                    pins_key = json.dumps(pins, sort_keys=True)
                                    if not was_active or pins_key != last_pins_key:
                                        last_pins_key = pins_key
                                        self._window.evaluate_js(
                                            f"window.__onLiveRamPins && window.__onLiveRamPins({pins_key});"
                                        )
                            if not was_active or (now - last_prog_t >= 1.5):
                                last_prog_t = now
                                inv = self._mem.read_inventory()
                                fl = self._mem.read_event_flags(self._flag_bst, self._wanted_flags)
                                if inv is not None or fl is not None:
                                    prog_payload = {"owned": inv, "setFlags": fl}
                                    prog_key = json.dumps(prog_payload, sort_keys=True)
                                    if not was_active or prog_key != last_prog_key:
                                        last_prog_key = prog_key
                                        self._window.evaluate_js(
                                            f"window.__onLiveRamProgress && window.__onLiveRamProgress({prog_key});"
                                        )
                            if want_boss and (want_boss_pip or not was_active or (now - last_boss_t >= 0.35)):
                                last_boss_t = now
                                bosses = self._mem.read_active_bosses(self._npc_meta, self._data.get("npcDef")) or []
                                has_active_boss = bool(bosses)
                                boss_key = json.dumps(bosses, sort_keys=True)
                                if not was_active or boss_key != last_boss_key:
                                    last_boss_key = boss_key
                                    self._window.evaluate_js(
                                        f"window.__onLiveRamBosses && window.__onLiveRamBosses({boss_key});"
                                    )
                            elif (not want_boss) and last_boss_key not in (None, "[]"):
                                has_active_boss = False
                                last_boss_key = "[]"
                                self._window.evaluate_js(
                                    "window.__onLiveRamBosses && window.__onLiveRamBosses([]);"
                                )
                            if want_buffs and (not was_active or now - last_buffs_t >= 0.065):
                                last_buffs_t = now
                                buffs = self._mem.read_player_buffs() or []
                                buffs_key = json.dumps(buffs, sort_keys=True)
                                if not was_active or buffs_key != last_buffs_key:
                                    last_buffs_key = buffs_key
                                    self._window.evaluate_js(
                                        f"window.__onLiveRamBuffs && window.__onLiveRamBuffs({buffs_key});"
                                    )
                            elif (not want_buffs) and last_buffs_key not in (None, "[]"):
                                last_buffs_key = "[]"
                                self._window.evaluate_js(
                                    "window.__onLiveRamBuffs && window.__onLiveRamBuffs([]);"
                                )
                            ar_cadence = 0.22 if (self._pip_mode in ("stats", "hud")) else 0.50
                            if want_ar_buffs and (not was_active or now - last_ar_buffs_t >= ar_cadence):
                                last_ar_buffs_t = now
                                ar_buffs = self._mem.read_player_live_ar_buffs()
                                if ar_buffs is not None:
                                    ar_buffs_key = json.dumps(ar_buffs, sort_keys=True)
                                    if not was_active or ar_buffs_key != last_ar_buffs_key:
                                        last_ar_buffs_key = ar_buffs_key
                                        self._window.evaluate_js(
                                            f"window.__onLiveRamArBuffs && window.__onLiveRamArBuffs({ar_buffs_key});"
                                        )
                            # Save-file fallback for live pin updates if MenuProfileSaveLoad RAM pointer didn't match
                            if (now - last_save_t >= 2.5):
                                last_save_t = now
                                try:
                                    upd = self.poll_save()
                                    if upd and upd.get("changed") and upd.get("kind") == "full":
                                        chars = upd["save"].get("characters") or []
                                        lslot = upd["save"].get("lastSlot")
                                        mc = next((c for c in chars if c["slot"] == lslot), chars[0] if chars else None)
                                        if mc and self._mem._mp_cache is None:
                                            self._window.evaluate_js(
                                                f"window.__onLiveRamPins && window.__onLiveRamPins({json.dumps(mc.get('mapPins', []))});"
                                            )
                                except Exception:
                                    pass
                            continue
                        miss_streak += 1
                        if self._ram_active and miss_streak >= 6:
                            self._ram_active = False
                            last_pos_key = None
                            last_char_key = None
                            last_pins_key = None
                            last_prog_key = None
                            last_boss_key = None
                            last_buffs_key = None
                            last_ar_buffs_key = None
                            has_active_boss = False
                            self._window.evaluate_js(
                                'window.__onLiveRamStatus && window.__onLiveRamStatus({"attached":false});'
                            )
                    elif self._ram_active:
                        self._ram_active = False
                        last_pos_key = None
                        last_char_key = None
                        last_pins_key = None
                        last_prog_key = None
                        last_boss_key = None
                        last_buffs_key = None
                        last_ar_buffs_key = None
                        has_active_boss = False
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
        out = {k: v for k, v in self._map_data.items() if k != "npcMeta"}
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
        custom_enemy_preset: Optional[Dict[str, Any]] = None,
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
            custom_enemy_preset=custom_enemy_preset,
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

    def _persist_regulation_path(self, path_str: str) -> None:
        self._regulation_path = str(path_str or "").strip()
        if not self._self_test_mode:
            cfg = self._load_settings()
            if self._regulation_path:
                cfg["regulationPath"] = self._regulation_path
            else:
                cfg.pop("regulationPath", None)
            self.save_settings(cfg)

    def _reload_extracted_payload(self, payload: Dict[str, Any]) -> None:
        by_id: Dict[int, Dict] = {}
        by_base: Dict[int, List[Dict]] = {}
        for w in payload["weapons"]:
            by_id[w["id"]] = w
            by_base.setdefault(w["baseId"], []).append(w)
        payload["_byId"] = by_id
        payload["_byBase"] = by_base
        self._data = payload
        self._known_weapon_ids = set(by_id.keys())
        self._known_armor_ids = {int(k) for k in (payload.get("armors") or {}).keys() if int(k) > 10300}
        self._known_talisman_ids = {int(k) for k in (payload.get("talismans") or {}).keys()}

    def get_er_ui_icons(self) -> Dict[str, Any]:
        if self._er_ui_icons is not None:
            return self._er_ui_icons
        p = er_ui_icons_path()
        if os.path.exists(p):
            try:
                with gzip.open(p, "rt", encoding="utf-8") as fh:
                    self._er_ui_icons = json.load(fh)
                    return self._er_ui_icons
            except Exception:
                pass
        if not self._self_test_mode:
            try:
                res = self.reextract_er_ui_icons()
                if res.get("ok") and isinstance(self._er_ui_icons, dict):
                    return self._er_ui_icons
            except Exception:
                pass
        self._er_ui_icons = {"ok": False, "count": 0, "icons": {}, "wep": {}, "arm": {}, "tal": {}, "good": {}, "ammo": {}, "spell": {}}
        return self._er_ui_icons

    def reextract_er_ui_icons(self) -> Dict[str, Any]:
        running_info = memory_reader.detect_running_game_regulation()
        reg_p = self._regulation_path if (self._regulation_path and os.path.isfile(self._regulation_path)) else running_info.get("regulationPath")
        mdir = os.path.dirname(reg_p) if reg_p else running_info.get("modDir")
        gdir = running_info.get("gameDir") or game_map_extractor.detect_elden_ring_game_dir()
        try:
            res = er_ui_asset_extractor.extract_er_ui_assets(
                mod_dir=mdir,
                game_dir=gdir,
                reg_path=reg_p,
                weapon_data=clean_data_for_ui(self._data),
                out_menu_json=None if getattr(sys, "frozen", False) else os.path.join(resource_ui_dir(), "er_menu_assets.json"),
                out_icons_gz=er_ui_icons_path(),
            )
            payload = dict(res.get("iconsPayload") or {})
            payload["ok"] = True
            self._er_ui_icons = payload
            return {
                "ok": True,
                "count": payload.get("count", 0),
                "wtCount": res.get("wtCount", 0),
                "affCount": res.get("affCount", 0),
                "erUiIcons": payload,
                "erMenuAssets": res.get("menuAssets") or load_er_menu_assets(),
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc), "count": 0}

    def get_mod_source_info(self) -> Dict[str, Any]:
        return {
            "regulationPath": self._regulation_path,
            "runningGame": memory_reader.detect_running_game_regulation(),
            "modLabel": str(self._data.get("mod", "")),
            "weaponCount": len(self._data.get("weapons", [])),
        }

    REGULATION_FILE_TYPES = ("Regulation File (*.bin)", "All files (*.*)")

    def browse_regulation(self) -> Dict[str, Any]:
        if not self._window or self._self_test_mode:
            return {"cancelled": True}
        init_dir = ""
        if self._regulation_path and os.path.exists(self._regulation_path):
            init_dir = os.path.dirname(self._regulation_path)
        else:
            rg = memory_reader.detect_running_game_regulation()
            init_dir = rg.get("modDir") or rg.get("gameDir") or game_map_extractor.detect_elden_ring_game_dir() or ""
        chosen = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            directory=init_dir if os.path.isdir(init_dir) else "",
            allow_multiple=False,
            file_types=self.REGULATION_FILE_TYPES,
        )
        if not chosen:
            return {"cancelled": True}
        path = os.path.abspath(chosen[0] if isinstance(chosen, (list, tuple)) else chosen)
        if not os.path.isfile(path):
            return {"ok": False, "cancelled": False, "message": "Selected file does not exist."}
        self._persist_regulation_path(path)
        return {"ok": True, "cancelled": False, "regulationPath": path}

    def clear_regulation_path(self) -> Dict[str, Any]:
        self._persist_regulation_path("")
        cust = custom_weapon_data_path()
        if os.path.exists(cust):
            try:
                os.remove(cust)
            except Exception:
                pass
        try:
            bundled = load_weapon_data({})
            self._reload_extracted_payload(bundled)
        except Exception as exc:
            return {"ok": False, "message": f"Failed to reload bundled data: {exc}", "modSource": self.get_mod_source_info()}
        save_res = self._read_save(self._save_path if (self._save_path and os.path.exists(self._save_path)) else save_reader.find_default_save())
        return {
            "ok": True,
            "source": "Bundled",
            "sourceKind": "bundled",
            "weaponCount": len(self._data.get("weapons", [])),
            "modSource": self.get_mod_source_info(),
            "data": clean_data_for_ui(self._data),
            "save": save_res,
        }

    def refresh_mod_data(self, mode: str = "auto", custom_path: Optional[str] = None) -> Dict[str, Any]:
        out_path = custom_weapon_data_path()
        game_dir = game_map_extractor.detect_elden_ring_game_dir()
        target_path = str(custom_path or "").strip() or self._regulation_path

        use_mode = mode if mode in ("auto", "file", "game") else "auto"
        running_info = memory_reader.detect_running_game_regulation()
        if use_mode == "auto":
            if target_path and os.path.isfile(target_path):
                use_mode = "file"
            elif running_info.get("running"):
                use_mode = "game"
            else:
                return {
                    "ok": False,
                    "needsPicker": True,
                    "message": "Select regulation.bin or launch Elden Ring to refresh mod data.",
                    "modSource": self.get_mod_source_info(),
                }

        try:
            if use_mode == "file":
                if not target_path or not os.path.isfile(target_path):
                    return {
                        "ok": False,
                        "needsPicker": True,
                        "message": "Configured regulation.bin file was not found.",
                        "modSource": self.get_mod_source_info(),
                    }
                payload = regulation_extractor.extract_from_regulation(
                    target_path,
                    out_path,
                    fallback_data=self._data,
                    game_dir=game_dir or running_info.get("gameDir"),
                )
                if len(payload.get("weapons", [])) < 100:
                    return {
                        "ok": False,
                        "message": f"Extracted too few weapons ({len(payload.get('weapons', []))}) from {target_path}.",
                        "modSource": self.get_mod_source_info(),
                    }
                self._persist_regulation_path(os.path.abspath(target_path))
                self._reload_extracted_payload(payload)
                save_res = self._read_save(self._save_path if (self._save_path and os.path.exists(self._save_path)) else save_reader.find_default_save())
                return {
                    "ok": True,
                    "source": os.path.abspath(target_path),
                    "sourceKind": "file",
                    "weaponCount": len(payload["weapons"]),
                    "modSource": self.get_mod_source_info(),
                    "data": clean_data_for_ui(self._data),
                    "save": save_res,
                }

            # use_mode == "game"
            if not running_info.get("running"):
                return {
                    "ok": False,
                    "notRunning": True,
                    "message": "Elden Ring is not currently running. Launch the game first or use Browse regulation.bin.",
                    "modSource": self.get_mod_source_info(),
                }

            gdir = running_info.get("gameDir") or game_dir
            mdir = running_info.get("modDir")
            reg_disk = running_info.get("regulationPath")

            live_params = None
            if not running_info.get("eac"):
                try:
                    live_params = self._mem.read_live_params(
                        set(regulation_extractor.REQUIRED_PARAM_NAMES),
                        optional_names={"magic.param", "npcparam.param"},
                    )
                except Exception:
                    live_params = None

            if live_params:
                payload = regulation_extractor.build_weapon_payload_from_params(
                    live_params,
                    mod_dir=mdir,
                    game_dir=gdir,
                    fallback_data=self._data,
                )
                if len(payload.get("weapons", [])) >= 100:
                    regulation_extractor.write_weapon_payload(payload, out_path)
                    self._reload_extracted_payload(payload)
                    save_res = self._read_save(self._save_path if (self._save_path and os.path.exists(self._save_path)) else save_reader.find_default_save())
                    src_label = f"Live Game RAM ({os.path.basename(mdir) if mdir else 'eldenring.exe'})"
                    return {
                        "ok": True,
                        "source": src_label,
                        "sourceKind": "ram",
                        "weaponCount": len(payload["weapons"]),
                        "modSource": self.get_mod_source_info(),
                        "data": clean_data_for_ui(self._data),
                        "save": save_res,
                    }

            if reg_disk and os.path.isfile(reg_disk):
                payload = regulation_extractor.extract_from_regulation(
                    reg_disk,
                    out_path,
                    fallback_data=self._data,
                    game_dir=gdir,
                )
                if len(payload.get("weapons", [])) < 100:
                    return {
                        "ok": False,
                        "message": f"Extracted too few weapons ({len(payload.get('weapons', []))}) from {reg_disk}.",
                        "modSource": self.get_mod_source_info(),
                    }
                self._reload_extracted_payload(payload)
                save_res = self._read_save(self._save_path if (self._save_path and os.path.exists(self._save_path)) else save_reader.find_default_save())
                return {
                    "ok": True,
                    "source": reg_disk,
                    "sourceKind": running_info.get("source") or "game",
                    "weaponCount": len(payload["weapons"]),
                    "modSource": self.get_mod_source_info(),
                    "data": clean_data_for_ui(self._data),
                    "save": save_res,
                }

            return {
                "ok": False,
                "message": "Elden Ring is running, but active params and regulation.bin could not be located (try Browse regulation.bin).",
                "modSource": self.get_mod_source_info(),
            }
        except Exception as exc:
            return {
                "ok": False,
                "message": f"Failed to extract regulation data: {exc}",
                "modSource": self.get_mod_source_info(),
            }

    def save_settings(self, cfg: Dict[str, Any]) -> bool:
        if self._self_test_mode:
            return False
        try:
            merged = dict(cfg)
            if self._pip_bounds:
                merged["pipBounds"] = dict(self._pip_bounds)
            if self._regulation_path and "regulationPath" not in merged:
                merged["regulationPath"] = self._regulation_path
            elif not self._regulation_path and "regulationPath" not in merged:
                merged.pop("regulationPath", None)
            merged.setdefault("keybinds", dict(DEFAULT_KEYBINDS))
            with open(settings_file_path(), "w", encoding="utf-8") as fh:
                json.dump(merged, fh, indent=2)
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
        "ERR v2.3.10.1 Self-Test",
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
            ready_ev = getattr(w.events, "_pywebviewready", None) or getattr(w.events, "loaded", None)
            if ready_ev is not None:
                ready_ev.wait(75)
            deadline = time.time() + 45.0
            while time.time() < deadline:
                try:
                    if w.evaluate_js("Boolean(window.__ERR_READY)"):
                        break
                except Exception:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Timed out waiting for __ERR_READY in WebView2")

            summary = w.evaluate_js("window.__ERR_TEST.getSummary()")
            assert summary["weaponsLoaded"] == 6478, f"Expected 6478 weapons, got {summary}"
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
            for req_cat in (
                "grace", "weapon", "talisman", "armor", "boss", "merchant", "poi",
                "bell_bearing", "golden_seed", "sacred_tear", "scadutree",
                "revered_ash", "crystal_tear", "memory_stone", "whetblade",
                "smithing_stone", "somber_stone",
            ):
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
            assert w.evaluate_js("document.getElementById('pipResizeGrip') !== null && document.querySelectorAll('.pip-resize-edge').length === 8"), "All 8 PiP resize handles should exist"
            assert w.evaluate_js("document.getElementById('pipFollowBtn').textContent.trim() === 'Follow'"), "pipFollowBtn should say Follow"
            assert w.evaluate_js("document.getElementById('pipSearchBtn') !== null && document.getElementById('pipSearchPopover') !== null && document.getElementById('pipSearchInput') !== null"), "PiP search controls should exist"
            assert w.evaluate_js("document.getElementById('pipOpacityBtn').textContent.includes('Opacity')"), "pipOpacityBtn should include Opacity label"
            assert w.evaluate_js("document.getElementById('pipOpacityPopover') !== null && document.getElementById('pipOpacityRange') !== null && document.getElementById('pipOpacityNum') !== null"), "PiP opacity popover inputs should exist"
            assert w.evaluate_js("document.getElementById('mapExtractBtn') !== null && document.getElementById('mapExtractBanner') !== null"), "Map extractor UI should exist"
            ex_st = api.get_map_extract_status()
            assert "hasMaps" in ex_st and "hasIcons" in ex_st and "detectedGameDir" in ex_st, f"Bad extract status: {ex_st}"
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
            assert ram_test["ramActive"] and "\u2713" in ram_test["ramMeta"] and ram_test["ramStr"] == 55, f"RAM char sync failed: {ram_test}"
            assert ram_test["ramHasPos"] and not ram_test["restoredRamActive"] and "\u2713" not in ram_test["restoredMeta"], f"RAM restore failed: {ram_test}"
            assert ram_test["autoSwitchedToDlc"] and ram_test["pinsCount"] == 1, f"Auto-switch/pins hook failed: {ram_test}"
            pip_res = w.evaluate_js("window.__ERR_TEST.testPipModes()")
            assert pip_res["mapBody"] and pip_res["statsBody"] and pip_res["statsCells"] == 8 and pip_res["offClean"] and pip_res["hoverClean"] and pip_res["opacityClampedLow"] == 15 and pip_res["proxShrinkOk"] and pip_res["pipSearchOk"] and pip_res["offscreenArrowOk"], f"PiP modes failed: {pip_res}"
            v15_res = w.evaluate_js("window.__ERR_TEST.testV15Features()")
            assert v15_res["manualToggleOk"] and v15_res["modalOk"] and v15_res["bbWithIcon"] >= 50, f"v1.5 features failed: {v15_res}"
            stone_res = w.evaluate_js("window.__ERR_TEST.testSmithingStones()")
            assert stone_res and stone_res.get("ok"), f"Smithing stones test failed: {stone_res}"
            assert isinstance(memory_reader._is_eac_running(), bool)
            assert len(api._npc_meta) >= 500, f"Expected ERR npcMeta >= 500, got {len(api._npc_meta)}"
            import struct as _st
            _r_buf = _st.pack(
                "<14i28f",
                88, 88, 59, 88, 132, 132, 88,
                88, 88, 109, 88, 132, 132, 88,
                *([0.89] * 7),
                *([0.0] * 7),
                *([0.0] * 7),
                1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0,
            )
            _r_parsed = {s["key"]: s for s in memory_reader._parse_resist_block(_r_buf, 16)}
            assert set(_r_parsed.keys()) == {"bleed", "frost", "rot", "madness"}, f"Unexpected resist keys: {_r_parsed}"
            assert _r_parsed["bleed"]["cur"] == 50 and _r_parsed["bleed"]["max"] == 109, f"Bad bleed parse: {_r_parsed['bleed']}"
            boss_res = w.evaluate_js("window.__ERR_TEST.testBossHud()")
            assert (
                boss_res["shownStats"]
                and boss_res["shownMap"]
                and boss_res["hpTextOk"]
                and boss_res["stanceOk"]
                and boss_res["statusesOk"]
                and boss_res["designsOk"]
                and boss_res["ramBadgesOk"]
                and boss_res["toggleOffHidden"]
                and boss_res["detachCleared"]
                and boss_res["settingsSynced"]
            ), f"Boss HUD test failed: {boss_res}"
            b_pack = api.get_buff_icons()
            assert buff_icons_path() is not None and len(b_pack.get("icons", {})) >= 100 and len(b_pack.get("iconMap", {})) >= 100, f"Buff icons bundle invalid: {len(b_pack.get('icons', {}))}"
            _sp_parsed = memory_reader._parse_player_sp_effects([
                (5000, 20406, 25.0, 30.0, 0),
                (5001, 20406, -1.0, -1.0, 0),
                (5002, 20406, 4000.0, 4000.0, 0),
                (5003, 20406, 10.0, 30.0, 0x00000001),
                (5004, -1, 10.0, 30.0, 0),
                (5005, 20406, 0.02, 30.0, 0),
            ])
            assert len(_sp_parsed) == 1 and _sp_parsed[0]["id"] == 5000, f"Finite buff filter failed: {_sp_parsed}"

            def _mk_sp(icon_id=-1, wc=0, atk_attr=254, sp_attr=254, si=0, inv=(0, 0, 0), thr=False, msc1=0, r1=1.0, r2=1.0, th_r1=1.0, th_flat=0, str_b=0, sp_cat=0, tgt_bits=0x01, arc_b=0):
                b = bytearray(816)
                _st.pack_into("<i", b, 0, icon_id)
                _st.pack_into("<f", b, 4, -1.0)
                _st.pack_into("<f", b, 496, -1.0)
                for _ro, _rv in ((72, r1), (76, r1), (80, r1), (84, th_r1), (480, r1), (672, r2), (676, r2), (680, r2), (684, r2), (688, r2)):
                    _st.pack_into("<f", b, _ro, _rv)
                _st.pack_into("<i", b, 100, th_flat)
                b[314] = msc1
                _st.pack_into("<H", b, 318, sp_cat)
                b[340] = atk_attr
                b[341] = sp_attr
                _st.pack_into("<H", b, 342, si)
                b[344] = wc
                b[351] = tgt_bits
                if thr:
                    b[356] |= 0x08
                _st.pack_into("<3H", b, 696, *inv)
                _st.pack_into("<b", b, 802, str_b)
                _st.pack_into("<b", b, 806, arc_b)
                return bytes(b)

            _ar_agg = memory_reader._aggregate_live_ar_speffects([
                (1660000, _mk_sp(icon_id=20406, wc=0, r2=1.10), 25.0, 50.0, 0),
                (800, _mk_sp(icon_id=20500, wc=1, th_r1=1.04, th_flat=48), 40.0, 60.0, 0),
                (1302227, _mk_sp(icon_id=20064, wc=0, inv=(39031, 0, 0), r2=2.0), 3.0, 3.0, 0),
                (7407090, _mk_sp(icon_id=-1, wc=0, r1=1.95, tgt_bits=0x05), -1.0, -1.0, 0),
                (320900, _mk_sp(icon_id=20260, wc=0, thr=True, r1=1.24), -1.0, -1.0, 0),
                (321800, _mk_sp(icon_id=20261, wc=0, msc1=102, r1=1.15), -1.0, -1.0, 0),
                (330400, _mk_sp(icon_id=20207, wc=3, r1=1.075), -1.0, -1.0, 0),
                (600, _mk_sp(icon_id=-1, wc=0, str_b=2), -1.0, -1.0, 0),
            ], hp=1000, hp_max=1000)
            assert _ar_agg["statBonus"][0] == 2, f"Expected +2 STR armor bonus, got {_ar_agg}"
            assert abs(_ar_agg["globalMult"][0] - 1.10) < 1e-4, f"Unexpected globalMult (leaked 2x/1.95x/talisman?): {_ar_agg}"
            assert abs(_ar_agg["rhMult"][3] - 1.04) < 1e-4 and _ar_agg["rhFlat"][3] == 48, f"Unexpected rh enchant: {_ar_agg}"
            assert abs(_ar_agg["lhMult"][3] - 1.0) < 1e-4 and _ar_agg["lhFlat"][3] == 0, f"RH enchant leaked to LH: {_ar_agg}"
            assert set(_ar_agg["contributors"]) == {1660000, 800, 600}, f"Unexpected contributors: {_ar_agg}"

            _ar_agg2 = memory_reader._aggregate_live_ar_speffects([
                (5660000, _mk_sp(icon_id=-1, wc=0, si=15660), -1.0, -1.0, 0),
                (5012001, _mk_sp(icon_id=20006, wc=0, inv=(15090, 15660, 0), r1=1.025), 0.005, 0.1, 0),
                (6086000, _mk_sp(icon_id=20979, wc=0, sp_cat=10, r1=1.015), -1.0, -1.0, 0),
                (6086000, _mk_sp(icon_id=20979, wc=0, sp_cat=10, r1=1.015), -1.0, -1.0, 0),
                (9016060, _mk_sp(icon_id=20693, wc=3, arc_b=2), 120.0, 120.0, 0),
                (150640, _mk_sp(icon_id=-1, wc=0, si=1502), 0.1, 0.2, 0),
                (8070530, _mk_sp(icon_id=-1, wc=0, tgt_bits=0x01, inv=(1502, 0, 0), r1=1.03), -1.0, -1.0, 0),
                (20107010, _mk_sp(icon_id=-1, wc=0, sp_cat=132, tgt_bits=0x05, r1=1.025), -1.0, -1.0, 0),
            ], hp=1000, hp_max=1000)
            _exp_gm = 1.025 * (1.015 ** 2) * 1.03 * 1.025
            assert abs(_ar_agg2["globalMult"][0] - _exp_gm) < 1e-4, f"Expected globalMult ~{_exp_gm:.5f}, got {_ar_agg2}"
            assert _ar_agg2["statBonus"][4] == 2, f"Expected +2 ARC from wc=3 fortune, got {_ar_agg2}"
            pb_res = w.evaluate_js("window.__ERR_TEST.testPlayerBuffs()")
            assert pb_res and all(pb_res.values()), f"Player buffs/Toggleables test failed: {pb_res}"
            ml_res = w.evaluate_js("window.__ERR_TEST.testMapLabels()")
            assert ml_res and all(ml_res.values()), f"Map labels test failed: {ml_res}"
            from webview.util import parse_file_type
            for _ft in CalculatorApi.REGULATION_FILE_TYPES:
                _desc, _exts = parse_file_type(_ft)
                assert _desc and _exts, f"Invalid regulation file filter: {_ft}"
            _ms_info = api.get_mod_source_info()
            assert isinstance(_ms_info, dict) and len(_ms_info) >= 2, f"Invalid get_mod_source_info: {_ms_info}"
            _ui_icons = api.get_er_ui_icons()
            if os.path.exists(er_ui_icons_path()):
                assert isinstance(_ui_icons, dict) and int(_ui_icons.get("count", 0)) >= 300, (
                    f"Expected >=300 ER UI icons, got {_ui_icons.get('count') if isinstance(_ui_icons, dict) else _ui_icons}"
                )
            er_assets_n = int(w.evaluate_js("Object.keys(window.__ER_MENU_ASSETS || {}).length") or 0)
            assert er_assets_n >= 100, f"Expected >=100 ER menu assets, got {er_assets_n}"
            eq_res = w.evaluate_js("window.__ERR_TEST.testEquipTab()")
            assert eq_res and eq_res.get("ok"), f"Equip tab test failed: {eq_res}"
            v2_res = w.evaluate_js("window.__ERR_TEST.testErUiV2()")
            assert v2_res and v2_res.get("ok"), f"ER UI v2 test failed: {v2_res}"
            sample_w = next(we for we in api._data["weapons"] if we["baseName"] == "Brass Shield" or "Shield" in we["baseName"])
            assert isinstance(sample_w.get("guard"), list) and len(sample_w["guard"]) == 6, f"Missing guard field: {sample_w}"
            assert len(api._data.get("ammo", {})) >= 30 and len(api._data.get("spells", {})) >= 100, "Missing ammo/spells data"
            _chars = (api.reload_save(False) or {}).get("characters", [])
            for ch_row in _chars:
                assert "arrows" in ch_row and "bolts" in ch_row and "spells" in ch_row, f"Missing ammo/spells on char {ch_row.get('name')}"
            iskir = next((c for c in _chars if c.get("name") == "Iskir"), None)
            if iskir and iskir.get("playerPos"):
                assert abs(iskir["playerPos"].get("y", 0.0)) < 5000.0, f"Unrealistic Iskir playerPos: {iskir['playerPos']}"
            # v2.1.0 Python & JS feature checks
            assert len(api._data.get("npcDef", {})) >= 5000, "Missing npcDef table"
            assert len(api._data.get("bossPresets", [])) >= 200, "Missing bossPresets list"
            assert "220" in (api._data.get("ccg") or {}), "Missing ccg 220 (Equip Load)"
            assert api.set_pip_locked(True).get("pipLocked") is True and api.start_window_drag() is False
            assert api.set_pip_locked(False).get("pipLocked") is False
            assert api.set_pip_auto_hide(True).get("pipAutoHide") is True and api.set_pip_auto_hide(False).get("pipAutoHide") is False
            assert api.set_minimize_to_tray(True).get("minimizeToTray") is True and api.set_minimize_to_tray(False).get("minimizeToTray") is False
            if _chars:
                assert isinstance((_chars[0].get("owned") or {}).get("weaponLevels"), dict), "Missing save weaponLevels"
            _ew_sp = bytearray(816)
            _st.pack_into("<i", _ew_sp, 0, -1)
            _st.pack_into("<f", _ew_sp, 4, -1.0)
            _st.pack_into("<f", _ew_sp, 496, -1.0)
            _st.pack_into("<f", _ew_sp, 228, 1.15)
            _ew_res = memory_reader._aggregate_live_ar_speffects([(310300, bytes(_ew_sp), -1.0, -1.0, 0)])
            assert abs(_ew_res.get("equipWeightMult", 1.0) - 1.15) < 1e-4, f"Expected 1.15 equipWeightMult, got {_ew_res}"
            qa_res = w.evaluate_js("window.__ERR_TEST.testQaAuditFixes()")
            assert qa_res and qa_res.get("ok"), f"QA audit fixes test failed: {qa_res}"
            w.evaluate_js("window.__ERR_TEST.startV21Test()")
            v21_res = None
            v21_deadline = time.time() + 10.0
            while time.time() < v21_deadline:
                v21_res = w.evaluate_js("window.__ERR_V21_RESULT")
                if v21_res is not None:
                    break
                time.sleep(0.03)
            assert v21_res and v21_res.get("ok"), f"v2.1.0 features test failed: {v21_res}"
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
                f"MAP_CATS_OK=17",
                f"STONE_COUNTS={stone_res['regCount']}/{stone_res['somCount']}",
                f"MAP_IMAGES={','.join(k for k, v in img_check.items() if v)}",
                f"MAP_ICONS_LOADED={map_state['iconsLoaded']}",
                f"MAP_TILES_OK={bool(tile_check and tile_check.get('m00') and tile_check.get('m10'))}",
                f"MAP_DUMMY_COUNT={map_state['dummyCount']}",
                f"MAP_CLAYMORE_HITS={clay_hits}",
                f"NPC_META_COUNT={len(api._npc_meta)}",
                f"BOSS_HUD_OK=True",
                f"BUFF_ICONS_COUNT={len(b_pack.get('icons', {}))}",
                f"PLAYER_BUFFS_OK=True",
                f"MAP_LABELS_OK=True",
                f"ER_MENU_ASSETS={er_assets_n}",
                f"EQUIP_TAB_OK=True",
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
        err_msg = f"SELF_TEST_FAILED: {test_result['error']}\n"
        if report_path:
            with open(report_path, "w", encoding="utf-8") as fh:
                fh.write(err_msg)
        else:
            sys.stderr.write(err_msg)
        sys.exit(1)

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
        "Elden Ring Weapon Calculator — ERR v2.3.10.1 (Elden Ring UI)",
        html=html_doc,
        js_api=api,
        width=1500,
        height=920,
        min_size=(1060, 680),
        background_color="#11100c",
        text_select=True,
    )
    api._window = win
    try:
        webview.start(lambda w: api._on_window_shown(), win, gui="edgechromium", icon=resource_icon_path(), private_mode=True)
    finally:
        api.cleanup()


if __name__ == "__main__":
    main()
