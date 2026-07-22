# Velocity / Drive — clean production deploy

## SSOT topology (one front, one room — no duplicates)

```
Browser
  drive.grudge-studio.com     ──307──►  grudge-velocity.pages.dev   (CF Pages SPA ONLY)
  grudge-drive.vercel.app     ──307──►  same Pages SPA
        │
        │  wss://grudox.grudge-studio.com/api/drive
        ▼
  CF Worker grudox-grudge-studio   (LIVE_GAME_API_PREFIXES includes drive)
        │
        ▼
  Railway voxgrudge-grudox-room-production
        └── /api/drive  →  drive-room.js  (houston-velocity)
        └── /api/carrier, /api/space, /api/grudox  (siblings, same process)
```

| Role | Canonical | Do **not** use in production |
|------|-----------|------------------------------|
| **SPA** | `grudge-velocity.pages.dev` | Babylon grudge-drive shell, second Vercel game build |
| **Entry DNS** | `drive.grudge-studio.com` → 307 → Pages | Pointing players at raw Railway or `api-server` |
| **Login return** | `https://drive.grudge-studio.com/?play=1&from=id` | Raw `pages.dev` as `returnTo` only (gateway may drop bare returnTo) |
| **WS URL** | `wss://grudox.grudge-studio.com/api/drive` | Hardcoded Railway `wss://…railway.app` from client |
| **Room process** | `voxgrudge/server` on Railway | `artifacts/drive-world-server`, monorepo `attachDriveServer` (local/dev only) |
| **Assets** | `assets.grudge-studio.com/games/velocity/*` | Shipping large GLBs only on Pages |

### Auth return (must stay green)

```
Sign in → id.grudge-studio.com/login
  ?redirect_uri=https://drive.grudge-studio.com/?play=1&from=id
  &returnTo=… (dual-write) &app=velocity
     │
     ▼
drive.grudge-studio.com/?play=1&from=id&grudge_token=…
     │ 307 (query preserved, incl. tokens)
     ▼
grudge-velocity.pages.dev/?play=1&from=id&grudge_token=…
     │ captureTokenFromUrl → localStorage
     ▼
garage / auto-play
```

Code SSOT: `fleetAuth.velocityLoginUrl` + `fleetConfig.velocityReturnUrl` (never use `window.location.origin` on pages.dev for production return).

**Smoke (must stay green):**

```bash
node artifacts/arcade/scripts/smoke-drive-pvp.mjs
```

```
drive.grudge-studio.com          → 307 → grudge-velocity.pages.dev
grudge-velocity.pages.dev        → CF Pages production SPA (Houston Cruise)
assets.grudge-studio.com/*       → R2 grudge-assets (CDN Worker)
api.grudge-studio.com/assets     → D1 grudge-assets-db registry
games/velocity/manifest.json    → fleet library SSOT on CDN
```

**Optional DNS (recommended):**  
Cloudflare Pages custom domain `velocity.grudge-studio.com` → project `grudge-velocity`  
(Dashboard: Pages → grudge-velocity → Custom domains → Add `velocity.grudge-studio.com`)

## Asset library (R2 + D1)

| Layer | What |
|-------|------|
| **R2** `grudge-assets` | `models/vehicles/*.glb`, `models/environment/*`, `media/velocity/*`, `games/velocity/manifest.json` |
| **D1** `grudge-assets-db` | `asset_registry` rows for velocity keys |
| **Code** | `velocityLibrary.ts` resolves `cdnUrl` / catalog `assetId` |

### Bake / re-upload

```bash
cd C:\Users\nugye\vfc-build
node artifacts/arcade/scripts/upload-velocity-library-to-r2.mjs
# optional: apply SQL
cd F:\GitHub\GrudgeBuilder
npx wrangler d1 execute grudge-assets-db --remote --file=C:/Users/nugye/vfc-build/artifacts/arcade/dist/velocity-cdn/games/velocity/seed-d1-velocity.sql
```

### Verify

```bash
curl -sI https://assets.grudge-studio.com/games/velocity/manifest.json
curl -sI https://assets.grudge-studio.com/models/vehicles/minecraft-car.glb
curl -sI https://assets.grudge-studio.com/media/velocity/drive-grudge.mp4
```

Magic-byte: GLB starts `glTF`, MP4 has `ftyp` at offset 4 — never accept HTML.

## SPA deploy (CF Pages) — live browser game

Pages has **no Node**. Live stack:

| Need | Origin |
|------|--------|
| SPA | `grudge-velocity.pages.dev` |
| REST characters/account | `_redirects` 200 → Railway `grudge-api-production-0d46` |
| Auth | `_redirects` → `id.grudge-studio.com` |
| Baked map + cars | `assets.grudge-studio.com` (R2) |
| Multiplayer | `wss://grudox.grudge-studio.com/api/drive` |

```bash
# one-shot build + package + deploy (includes API proxies + map + UI)
node artifacts/arcade/scripts/deploy-velocity-pages.mjs
```

Manual:
```bash
cd artifacts/arcade
$env:BASE_PATH="/"
node ./node_modules/vite/bin/vite.js build --config vite.cruise.config.ts
# package must copy public/_redirects (REST proxy) + models + ui
npx wrangler pages deploy dist/velocity-pages --project-name=grudge-velocity --branch=main
```

Boot screen probes: CDN manifest, map GLB magic, REST `/api/health`, drive room.

## Reference video

Local SSOT: `C:\Users\nugye\Videos\drive grudge.mp4`  
CDN: `https://assets.grudge-studio.com/media/velocity/drive-grudge.mp4`  
Poster: `.../drive-grudge-poster.jpg`  
Used as intro splash in `CruiseOnlyLauncher`.

## Multiplayer PvP (grudoxinfo L2 + L3)

Same as Carrier — **no separate socket box**.

```
Browser (Pages / drive.grudge-studio.com)
  → wss://grudox.grudge-studio.com/api/drive   (CF Worker L3)
    → Railway voxgrudge-grudox-room /api/drive   (L2 co-located room)
```

| Piece | Path |
|-------|------|
| Room | `F:\GitHub\voxgrudge\server\drive-room.js` |
| Edge allowlist | `grudge-studio/infra/cloudflare/grudox/worker.ts` → `LIVE_GAME_API_PREFIXES` includes `drive` |
| Client | `driveNetClient.ts` → `FLEET_DRIVE_WS` |

### Deploy room + edge

```bash
# Railway room (from voxgrudge/server)
cd F:\GitHub\voxgrudge\server
# railway up  OR push if GitHub→Railway linked

# CF Worker
cd C:\Users\nugye\Documents\grudge-studio\infra\cloudflare\grudox
npx wrangler deploy
```

### Smoke

```bash
curl -s https://voxgrudge-grudox-room-production.up.railway.app/api/health
# expect paths.drive
curl -s https://grudox.grudge-studio.com/api/drive
# expect room houston-velocity
```

Opt-out in client: `?mp=0`. Override: `?driveWs=wss://…`

## Do not

- Ship Babylon grudge-drive as product  
- Put large GLBs only on Pages (use R2)  
- Invent model paths without registry/manifest  
- Leave Meshy/capsule as final cars when CDN GLBs exist  
- Hardcode WS host outside `FLEET_DRIVE_WS` / same-origin helper  
- Expect Pages alone to upgrade WebSockets (must go through GRUDOX Worker)  
