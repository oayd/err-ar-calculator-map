# Elden Ring Weapon Calculator & Map (ERR v2.3.9.1)

A fast, standalone Windows desktop Attack Rating (AR), effective damage, status buildup, and build optimization calculator built specifically for **ELDEN RING Reforged (ERR v2.3.9.1)**.

## Features
- **Exact ERR v2.3.9.1 Weapon Math**: Computes physical/elemental AR, spell scaling, ERR custom affinity & scaling grades, status buildup, and effective damage against ERR enemy defense presets across all 6,454 weapon/affinity combinations.
- **Interactive Live Map (Base Game, Underground & Shadow of the Erdtree)**: Over 4,200 indexed markers across 15 categories — Sites of Grace (showing Discovered in bright gold vs. Undiscovered in dimmed dashed rings), Bell Bearings, Golden Seeds, Sacred Tears, Scadutree Fragments, Revered Spirit Ashes, Crystal Tears, Memory Stones, Whetblades, Weapons (linked directly to the Calculator), Talismans, Armor, Bosses, Merchants (with full inventories), and Landmarks — across `The Lands Between`, `Underground`, and `Shadow of the Erdtree`, with automatic layer switching (`Surface` / `Underground` / `DLC`). Works out-of-the-box on a calibrated coordinate grid, with a **one-click in-app "Extract Game Maps & Icons"** button to extract native high-res game map tiles & icons directly from your local Elden Ring install.
- **Progress Tracker, Native Blue Pins & Live Sync (30 Hz)**: Auto-detects collected items, bell bearings, defeated bosses, and discovered Sites of Grace from live offline RAM and save files (`InventoryHeld`, `InventoryStorageBox`, and `EventFlags`), with per-character manual completion overrides and Show/Dim/Hide filtering. Also displays your native in-game **Blue Beacons (1–5)** and green map stamps (strictly read-only offline RAM when in-game, plus save-synced fallback).
- **Frameless Auto-Hide PiP Corner Overlay, Off-Screen Target Arrow, Live Boss Bar & Global Keybinds**: Always-on-top borderless mini window (`Overlay` / `PiP`) switchable between a live corner **Minimap** (with an edge-of-screen directional arrow + distance badge to the single nearest off-screen search target) and a compact **Live Stats & Equipped AR HUD** with an optional **Live Boss HP, Stance/Poise & Status Buildup Bar** (Bleed, Frost, Rot, plus Poison/Sleep/Madness when active — strictly read-only offline RAM, automatically disabled under EAC). Features customizable global hotkeys in **Settings** (`Toggle PiP`, `Toggle Ghost / Click-Through`, `Hide / Show Overlay`, `Toggle Follow`) and persists your window position, filters, and settings across sessions.
- **Gear, Greases & Buffs**: Models equipped armor bonuses, talismans (including conditional talismans, ex: Lord of Blood's Exultation), weapon greases, Flask of Wondrous Physick tears, and body/aura buffs.
- **Respec Stat Optimizer**: Finds optimal STR/DEX/INT/FAI/ARC distributions for any weapon & affinity.
- **Scaling & Softcap Curve Chart**: Interactive SVG chart visualizing per-stat scaling gains and softcaps.
- **Compare Tray & Optional Columns**: Side-by-side weapon comparison plus toggleable columns for Crit, Damage Type, Buffable, Stamina Cost, and Stance/Poise damage.

## Download
Download the latest standalone `ERR_AR_Calculator.exe` from the [GitHub Releases](../../releases) page. No Python installation or external files are required (requires Windows 10/11 with Microsoft Edge WebView2, which is built into modern Windows).

> **One-Click In-App Map Texture Extraction**: Due to copyright, pre-rendered Elden Ring map tiles (`map_cache/`) and UI icons (`err_map_icons.json.gz`) are not bundled in the public release. If you own Elden Ring on PC, switch to the **Map** tab and click **Extract Game Maps & Icons** inside the app to extract native high-res L0 map tiles and icons directly from your local Steam/Elden Ring install.

## Building from Source
Requires Python 3.13+ on Windows:

```powershell
pip install -r requirements.txt
python -m PyInstaller --noconfirm --onefile --windowed --name ERR_AR_Calculator `
  --icon "err_icon.ico" `
  --add-data "err_weapon_data.json.gz;." `
  --add-data "err_map_data.json.gz;." `
  --add-data "err_icon.ico;." `
  --add-data "ui;ui" `
  --collect-all clr_loader --collect-all pythonnet --collect-all texture2ddecoder `
  err_ar_calculator.py
```

The standalone executable will be written to `dist\ERR_AR_Calculator.exe`.

To regenerate `err_weapon_data.json.gz` or `err_map_data.json.gz` (and optional `map_cache/` tiles) from an ERR `regulation.bin`, run:

```powershell
python extract_err_data.py --game "<EldenRingGameDir>" --smithbox "<SmithboxDir>" --err-mod "<ERRModDir>"
python extract_err_map.py  --game "<EldenRingGameDir>" --smithbox "<SmithboxDir>" --err-mod "<ERRModDir>" --maps
```

## Privacy Policy
This application runs **100% offline**. When `Live` is enabled, it may inspect a locally running offline `eldenring.exe` process strictly read-only (`PROCESS_VM_READ`) and/or read local Elden Ring save files read-only to display character stats, equipped gear, and map position. It performs **zero memory writes**, **zero DLL injection**, stores only local UI preferences in `err_ar_settings.json` next to the executable, makes **zero network requests**, and does not collect or transmit any telemetry or personal data.

## Code Signing Policy
Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

- **Committers, Reviewers, and Approvers**: Repository maintainers review all changes before release tags are created.
- **Build & Signing Provenance**: Official release binaries (`ERR_AR_Calculator.exe`) are built strictly from tagged commits on GitHub-hosted `windows-latest` runners and submitted to SignPath.io using GitHub artifact provenance verification.
- This program is not affiliated with or endorsed by FromSoftware, Inc. or Bandai Namco Entertainment Inc.

## License
Released under the [MIT License](LICENSE).
