# Elden Ring Weapon Calculator & Map (ERR v2.3.9.1)

A standalone Windows companion app for **ELDEN RING Reforged (ERR v2.3.9.1)** combining an exact weapon AR & build calculator, an interactive live map, and an always-on-top in-game overlay.

## Features
- **Exact ERR Weapon & Build Calculator**: Calculates AR, spell scaling, status buildup, and effective damage across all ERR weapons and custom affinities — including armor bonuses, talismans, greases, Physick tears, and buffs.
- **Respec Optimizer, Scaling Curves & Compare**: Find the best stat spread for any weapon, visualize softcaps, and compare weapons side by side.
- **Interactive Live Map (Base Game, Underground & DLC)**: Over 4,200 searchable markers (Sites of Grace, bosses, weapons, talismans, merchants, upgrade materials, and collectibles) with live player tracking, automatic map layer switching, and one-click extraction of native game map tiles & icons from your install.
- **Auto Progress Tracking & In-Game Pins**: Automatically marks collected items, defeated bosses, and discovered Graces from your save or live offline game, and displays your in-game blue beacons and green map stamps.
- **Always-On-Top In-Game Overlay (PiP)**: Borderless corner minimap (with an off-screen arrow pointing to your searched target) or compact live stats & equipped AR HUD, controlled via customizable global hotkeys.
- **Live Boss & Enemy HUD (30 Hz)**: Optional Elden Ring–style enemy bar in the overlay showing live HP, Stance/Poise (including stance-broken state), and status buildup (Bleed, Frost, Rot, Sleep, Poison, Madness) for active bosses or your locked-on target, with 3 switchable layouts. Read-only offline RAM only; automatically disabled when EAC is active.

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
