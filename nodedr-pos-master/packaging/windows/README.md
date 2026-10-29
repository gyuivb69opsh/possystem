# Windows installer (built by GitHub Actions)

Push to `main` -> GitHub > Actions > "Build Windows EXE" > open the run > **Artifacts** > `Cafe-POS-Installer` (download).
Unzip it: `Cafe-POS-Setup.exe` + `SHA256.txt` (verify with `Get-FileHash Cafe-POS-Setup.exe`).

- Installs per-user into `%LOCALAPPDATA%\Cafe POS` (no admin / UAC).
- Web UI listens on `127.0.0.1:1994` (this PC only). Data stays in `<install folder>\backend\data` and survives upgrades/uninstall.
- No secrets in the build; each install generates its own JWT secret on first start.
