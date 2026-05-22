# Portfolio Tracker

A personal app for tracking your stock/ETF portfolio, cash, dividends, watchlist, and research notes. Installable as a **PWA** (including on Android) or as native **Tauri** apps on macOS, Windows, and Android, with optional file-based sync (e.g. to a Google Drive folder).

## Features

- **Portfolio** — Holdings (stocks/ETFs) with sector/country from Yahoo Finance, P&L, sortable columns, after-hours toggle
- **Cash** — Multiple accounts with optional auto-accruing interest (daily/monthly)
- **Dividends** — Auto-fetched from Yahoo; DRIP and tax-withholding options
- **Watchlist** — Tickers with tags, intrinsic value, analyst target, recommendations, charts
- **Research** — Notes with rich text, ticker links, and tags
- **Dashboard** — Allocation (by ticker, sector, country), expected yearly income, market status
- **Data & Sync** — Optional sync to a JSON file (e.g. on a Drive mount); conflict resolution on startup; manual export/import

## Quick start

### Prerequisites

- **Node.js** 18+ (e.g. via [nvm](https://github.com/nvm-sh/nvm))
- **Rust** (for Tauri builds): [rustup](https://rustup.rs/)
- **macOS:** Xcode Command Line Tools  
- **Windows:** Visual Studio 2022/2026 with C++ desktop workload (see [Windows (Tauri desktop)](#windows-tauri-desktop) below)  
- **Android:** Android SDK/NDK (for Tauri Android)

### Install and run (web / PWA)

```bash
git clone https://github.com/sulabhM/portfolio-tracker.git
cd portfolio-tracker
npm install
npm run dev
```

Open http://localhost:5173. Use “Install” in the browser to add as a PWA.

### Build for production

- **PWA (deploy `dist/` to any static host):**
  ```bash
  npm run build
  ```
  For production CORS to Yahoo, set `VITE_PRICE_PROXY_URL` to your proxy URL at build time.

- **macOS (Tauri):**
  ```bash
  npm run tauri:build
  ```
  Output: `src-tauri/target/release/bundle/` (`.app`, `.dmg`).

- **Android (Tauri):** One-time init, then build:
  ```bash
  npm run tauri:android:init
  npm run tauri:android:build
  ```

- **Windows (Tauri):** See [Windows (Tauri desktop)](#windows-tauri-desktop) for full setup (including Windows 11 on ARM64).

### Windows (Tauri desktop)

These steps build a native **ARM64** desktop app on Windows 11 ARM, and also apply to x64 Windows with the matching Visual Studio components.

#### 1. Install prerequisites

1. **Node.js** 18+ (LTS, ARM64 installer on Windows on Arm): https://nodejs.org/
2. **Rust** via [rustup](https://rustup.rs/). On ARM64 Windows the default toolchain should be `stable-aarch64-pc-windows-msvc`.
3. **Visual Studio 2022 or 2026** (Community or Build Tools) with:
   - Workload: **Desktop development with C++**
   - Individual components (search in the installer):
     - **MSVC … C++ ARM64 build tools** (required on ARM PCs; use x64 build tools on Intel/AMD PCs)
     - **Windows 10/11 SDK**
     - **C++ Clang Compiler for Windows** (install the component offered in the installer; on ARM hosts this often installs under `VC\Tools\Llvm\ARM64\bin` or `VC\Tools\Llvm\x64\bin`)
   - **Not required:** MFC, ATL
4. **WebView2 Runtime** — usually preinstalled on Windows 11; if the app fails to start, install the [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

Verify in a new terminal:

```powershell
node -v
npm -v
rustc -V
rustup show
```

#### 2. Optional: add tools to your user PATH

Persist Clang and Cargo so new terminals can find them (adjust the Visual Studio path if yours differs):

```powershell
$clangBin = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\Llvm\ARM64\bin"
$cargoBin = "$env:USERPROFILE\.cargo\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$clangBin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$clangBin", "User")
}
if ($userPath -notlike "*$cargoBin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$cargoBin", "User")
}
```

Restart the terminal after changing PATH.

#### 3. Clone, install, and build

Use **Developer PowerShell for Visual Studio** (or any shell after loading the VS dev environment — see below).

```powershell
git clone https://github.com/sulabhM/portfolio-tracker.git
cd portfolio-tracker
npm install
```

Load the MSVC ARM64 environment (required for `link.exe` and Windows SDK headers). Run once per session, or add to your PowerShell profile:

```powershell
Import-Module "C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
Enter-VsDevShell -VsInstallPath "C:\Program Files\Microsoft Visual Studio\18\Community" -SkipAutomaticLocation -Arch arm64
```

On Intel/AMD Windows, use `-Arch amd64` instead of `-Arch arm64`, and install the x64 MSVC/Clang components.

**Development (hot reload):**

```powershell
npm run tauri:dev
```

**Production build (standalone app + installers):**

```powershell
npm run tauri:build
```

**Outputs:**

| Artifact | Location |
|----------|----------|
| Executable | `src-tauri\target\release\app.exe` |
| NSIS installer | `src-tauri\target\release\bundle\nsis\*_arm64-setup.exe` |
| MSI installer | `src-tauri\target\release\bundle\msi\*_arm64_en-US.msi` |

On x64 Windows, bundle names use `x64` instead of `arm64`.

#### 4. Clean rebuild

To verify a full from-scratch build:

```powershell
Remove-Item -Recurse -Force src-tauri\target, dist -ErrorAction SilentlyContinue
cargo clean --manifest-path src-tauri\Cargo.toml
npm run tauri:build
```

#### 5. Windows troubleshooting

| Error | Fix |
|-------|-----|
| `link.exe` was not found | Install **C++ ARM64 build tools**, run `Enter-VsDevShell -Arch arm64` before building |
| `clang` is not found | Install **C++ Clang tools for Windows**; add `VC\Tools\Llvm\...\bin` to PATH; avoid MSYS2 `clang` on PATH |
| `EBUSY` watching `.dll` in `src-tauri\target` during `tauri dev` | Vite ignores `src-tauri/target` in `vite.config.ts` (already configured in this repo) |
| `TAURI_BUILD` is not recognized | `beforeBuildCommand` must be `npm run build` (Unix `VAR=1 cmd` syntax fails on Windows) |
| MSI build fails (`light.exe`) | Enable **VBSCRIPT** under Settings → Optional features → More Windows features |
| `Failed to write sync file: forbidden path` (e.g. Google Drive `G:\...`) | Rebuild after pulling latest; use **Settings → Choose folder** (not a single file). Sync writes a `.tmp` sibling then renames — the folder must be in `fs` scope. |

Yahoo Finance in the desktop app uses Tauri’s HTTP plugin; you usually do not need `VITE_PRICE_PROXY_URL` for local desktop use.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for web/PWA |
| `npm run preview` | Preview production build |
| `npm run tauri:dev` | Run Tauri dev (desktop) |
| `npm run tauri:build` | Build Tauri desktop (macOS/Windows/Linux) |
| `npm run tauri:android:init` | Create Android project (once) |
| `npm run tauri:android:build` | Build Android APK |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Dexie (IndexedDB), Recharts, TipTap
- **Data:** IndexedDB via Dexie; optional file sync (Settings) for backup/cross-device
- **Native:** Tauri v2 (fs + dialog plugins) for desktop and Android
- **Data source:** Yahoo Finance (dev: Vite proxy; Tauri/production: direct or `VITE_PRICE_PROXY_URL`)

## License

MIT — see [LICENSE](LICENSE).

## Repository

[https://github.com/sulabhM/portfolio-tracker](https://github.com/sulabhM/portfolio-tracker)
