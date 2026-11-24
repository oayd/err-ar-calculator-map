# Elden Ring Weapon Calculator (ERR v2.3.9.1)

A fast, standalone Windows desktop Attack Rating (AR), effective damage, status buildup, and build optimization calculator built specifically for **ELDEN RING Reforged (ERR v2.3.9.1)**.

## Features
- **Exact ERR v2.3.9.1 Weapon Math**: Computes physical/elemental AR, spell scaling, ERR custom affinity & scaling grades, status buildup, and effective damage against ERR enemy defense presets across all 6,454 weapon/affinity combinations.
- **Automatic Read-Only Save Sync**: Automatically discovers and reads `%APPDATA%\EldenRing\*\ER0000.err` (plus `.sl2`, `.co2`, `.cnv`, `.cnvco2`) in read-only mode, loading character stats, equipped weapons & upgrade levels, armor, and talismans. Supports optional live file watching.
- **Gear, Greases & Buffs**: Models equipped armor bonuses, talismans (including conditional talismans), ERR weapon greases, Flask of Wondrous Physick tears, and body/aura buffs.
- **Respec Stat Optimizer**: Finds optimal STR/DEX/INT/FAI/ARC distributions for any weapon & affinity.
- **Scaling & Softcap Curve Chart**: Interactive SVG chart visualizing per-stat scaling gains and softcaps.
- **Compare Tray & Optional Columns**: Side-by-side weapon comparison plus toggleable columns for Crit, Damage Type, Buffable, Stamina Cost, and Stance/Poise damage.

## Download
Download the latest standalone `ERR_AR_Calculator.exe` from the [GitHub Releases](../../releases) page. No Python installation or external files are required (requires Windows 10/11 with Microsoft Edge WebView2, which is built into modern Windows).

## Building from Source
Requires Python 3.13+ on Windows:

```powershell
pip install -r requirements.txt
python -m PyInstaller --noconfirm --onefile --windowed --name ERR_AR_Calculator `
  --icon "err_icon.ico" `
  --add-data "err_weapon_data.json.gz;." `
  --add-data "err_icon.ico;." `
  --add-data "ui;ui" `
  --collect-all clr_loader --collect-all pythonnet `
  err_ar_calculator.py
```

The standalone executable will be written to `dist\ERR_AR_Calculator.exe`.

To regenerate `err_weapon_data.json.gz` from an ERR `regulation.bin`, run:

```powershell
python extract_err_data.py --game "<EldenRingGameDir>" --smithbox "<SmithboxDir>" --err-mod "<ERRModDir>"
```

## Privacy Policy
This application runs **100% offline**. It reads local Elden Ring save files strictly read-only to display character stats and equipped gear, stores only local UI preferences in `err_ar_settings.json` next to the executable, makes **zero network requests**, and does not collect or transmit any telemetry or personal data.

## Code Signing Policy
Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

- **Committers, Reviewers, and Approvers**: Repository maintainers review all changes before release tags are created.
- **Build & Signing Provenance**: Official release binaries (`ERR_AR_Calculator.exe`) are built strictly from tagged commits on GitHub-hosted `windows-latest` runners and submitted to SignPath.io using GitHub artifact provenance verification.
- This program is not affiliated with or endorsed by FromSoftware, Inc. or Bandai Namco Entertainment Inc.

## License
Released under the [MIT License](LICENSE).
