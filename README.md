# Portfolio Tracker

A personal app for tracking your stock/ETF portfolio, cash, dividends, watchlist, and research notes. Installable as a **PWA** (including on Android) or as native **Tauri** apps on macOS and Android, with optional file-based sync (e.g. to a Google Drive folder).

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
