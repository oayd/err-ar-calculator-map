# Elden Ring Weapon Calculator & Map — v2.0.0: UI Update (ERR v2.3.10.1)

A standalone Windows companion app for **ELDEN RING Reforged (ERR v2.3.10.1)** styled in native **Elden Ring UI**, combining a full Equipment screen, exact Armory weapon & AR calculator, interactive live World Map, and an always-on-top in-game HUD overlay.

## What's New in v2.0.0: UI Update
- **Authentic Elden Ring UI Overhaul**: Rebuilt navigation (`Equipment`, `Armory`, `Map`, `PiP Viewer`, `System`), status effect icons, 24 ERR affinity icons, 44 weapon-class icons, prompt-glyph theme switcher (`Auto`, `Keyboard & Mouse`, `Xbox`, `PS5`), and contextual footer prompts.
- **Equipment Tab**: Native 3-column Elden Ring equipment screen showing `R1–R3`, `L1–L3`, Arrows, Bolts, Armor, Talismans, and Memorized Spells with an Armament Detail card (Attack Power, Guarded Damage Negation, Scaling & Passive Effects), Status Summary panel (`F` to cycle), Slot Picker, and one-click `Open in Armory`.
- **Stacked HUD Overlay & Dynamic Boss Bar**:
  - **Stacked `HUD` Mode** combines the live corner minimap (with distance-based marker labels in `px` & off-screen search arrow), floating buff timers, equipped weapons, and attribute summary in one unified borderless window.
  - **Adaptive Multi-Row PiP Bar**: Automatically wraps cleanly into dense rows without wasted whitespace when resized narrow.
  - **Two Clean Boss Bar Placements**: Choose **Show Over Map** (floating overlay with zero map resize) or **Show Below** (pops out cleanly below the window with zero clipping and zero minimap snap).
  - **Live Applied AR & Automatic 1H/2H Detection**: Reads active offline `SpecialEffect`s and weapon enchants/greases in real time, automatically detects `1H` / `2 (RH)` / `2 (LH)` stance from RAM, and offers **3 selectable 1H/2H Grip Icon placements** in **PiP Overlay Controls** (`Active Weapon Emblem`, `Character Header Medallion`, `Minimap Corner Emblem`).

## Core Features
- **Exact ERR Weapon & Build Calculator (Armory)**: Calculates raw AR, effective AR vs. boss defenses, spell scaling, and status buildup across all 6,478 unmodded ERR weapons & 25 affinities — plus Respec Optimizer, Scaling Curves, and side-by-side Compare Tray.
- **Interactive Live Map (Base Game, Underground & DLC)**: Over 4,200 searchable markers across The Lands Between, Underground, and Shadow of the Erdtree with 30 Hz live player tracking, automatic progress dimming/hiding from your save or live RAM, and in-game Blue Beacon & Green Stamp pins.
- **Live Boss & Enemy HUD (30 Hz)**: Elden Ring–style enemy bar displaying live HP, Stance/Poise (including Stance Broken state), and status buildup (Poison, Scarlet Rot, Bleed, Frost, Sleep, Madness) across 3 switchable layouts. Read-only offline RAM only; automatically disabled when EAC is running.
- **Live Player Buff & Debuff Timers**: Strictly finite buffs/debuffs with clockwise sweep timers, crimson `▼` debuff indicators, ≤10s expiring pulse alerts, hover tooltips, and automatic suppression of rapidly looping passive effects (`>3×/10s`).
- **Built-In `regulation.bin` Picker & Live-Game Mod Refresh**: Ships with **unmodded ERR v2.3.10.1** weapon & map data by default, while allowing you to browse any custom/modded `regulation.bin` or pull active params directly from a running Elden Ring session under **System → Mod / Regulation Source**.

## Download
Download `ERR_AR_Calculator.exe` from the [GitHub Releases](../../releases) page. No Python installation or external files are required (requires Windows 10/11 with Microsoft Edge WebView2, which is built into modern Windows).

> **One-Click Local Asset Extraction**: Due to copyright, pre-rendered map tiles (`map_cache/`), map icons (`err_map_icons.json.gz`), and extracted item icons (`er_ui_icons.json.gz`) are not bundled in the public repository or executable. When running locally with a Steam install of Elden Ring, open **Map → Extract Game Maps & Icons** or **System → Mod / Regulation Source → Extract ER UI Icons** to unpack native assets directly from your copy of the game.

## User Guides
- **[Quick-Start Guide (PDF, 6 pages)](docs/ERR_AR_Calculator_Quick_Start_Guide.pdf)** — fast setup, all 5 tabs, Stacked HUD, live 1H/2H AR, hotkeys, and quick fixes.
- **[Complete User Guide (PDF, 14 pages)](docs/ERR_AR_Calculator_Complete_User_Guide.pdf)** — full reference covering Equipment, Armory (24 affinity icons, 44 weapon-class icons, Respec Optimizer, defense math), World Map (15 categories), PiP Viewer & Overlay, Boss HUD, Buff Timers, custom `regulation.bin` extraction, and offline RAM FAQ.

## Building from Source
Requires Python 3.13+ on Windows:

```powershell
pip install -r requirements.txt
python -m PyInstaller --noconfirm ERR_AR_Calculator.spec
```

The standalone executable will be written to `dist\ERR_AR_Calculator.exe`.

## Privacy Policy
This application runs **100% offline**. When `Live` is enabled, it may inspect a locally running offline `eldenring.exe` process strictly read-only (`PROCESS_VM_READ`) and/or read local Elden Ring save files read-only to display character stats, equipped gear, and map position. It performs **zero memory writes**, **zero DLL injection**, stores only local UI preferences in `err_ar_settings.json` next to the executable, makes **zero network requests**, and does not collect or transmit any telemetry or personal data.

## Code Signing Policy
Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

- **Committers, Reviewers, and Approvers**: Repository maintainers review all changes before release tags are created.
- **Build & Signing Provenance**: Official release binaries (`ERR_AR_Calculator.exe`) are built strictly from tagged commits on GitHub-hosted `windows-latest` runners and submitted to SignPath.io using GitHub artifact provenance verification.
- This program is not affiliated with or endorsed by FromSoftware, Inc. or Bandai Namco Entertainment Inc.

## License
Released under the [MIT License](LICENSE).
