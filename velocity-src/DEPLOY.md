# Velocity / Drive — production deploy SSOT

## Topology

```
Browser
  drive.grudge-studio.com     ──REWRITE (same origin)──►  grudge-velocity.pages.dev
  grudge-drive.vercel.app     ──rewrite──►  same Pages SPA
        │
        │  wss://grudox.grudge-studio.com/api/drive
        ▼
  CF Worker grudox-grudge-studio   (LIVE_GAME_API_PREFIXES includes drive)
        │
        ▼
  Railway voxgrudge-grudox-room-production
        └── /api/drive  →  drive-room.js  (houston-velocity)
```

| Role | Canonical | Do **not** use |
|------|-----------|----------------|
| **SPA** | `grudge-velocity.pages.dev` (Three.js cruise) | Babylon `src/` shell as product |
| **Entry** | `drive.grudge-studio.com` **rewrite** → Pages | 307 assets to pages.dev (CORS) |
| **Login return** | `https://drive.grudge-studio.com/?play=1&from=id` | bare pages.dev returnTo only |
| **WS** | `wss://grudox.grudge-studio.com/api/drive` | raw Railway wss from client |
| **Cars** | CDN `models/vehicles/*.glb` | procedural box cars in production |
| **Drivers** | Account **voxel** heroes | grudge6 modular Warlords kits |
| **Map** | `la-gangwar.glb` + BVH colliders | stale uncached GLB after rebake |

## Auth

```
Sign in → id.grudge-studio.com/login
  ?redirect_uri=https://drive.grudge-studio.com/?play=1&from=id
     │
     ▼
drive.grudge-studio.com/?play=1&from=id&sso_token=…
     │ Vercel rewrite (origin stays drive.*)
     ▼
Pages SPA: captureTokenFromUrl → garage → cruise
```

## CORS trap (fixed)

**Never** 307 `/assets/*` to `pages.dev` while HTML stays on `drive.*`.  
ES modules then load cross-origin without ACAO → console CORS flood.

Ship thin Vercel **rewrites** (proxy), **no** local Babylon `index.html`.

## MIME trap (fixed)

SPA catch-all must not return HTML for missing hashed `.js`.  
`functions/_middleware.js` converts that to **404 text/plain**.

## Product: cars / cabin / drivers

| Item | Rule |
|------|------|
| Starters | Datsun 240Z, NSX-V, Supra A80 (CDN voxel) |
| Cabin | Seat from car dims; `seatScale` ~0.58; hide legs while seated |
| Drivers | `loadFleetDriverOptions` prefers era=voxel/open; filters grudge6 |
| Map | `LA_GANGWAR_MAP_VERSION` query busts cache after rebake |

Sources: `velocity-src/racer/*` (snapshot), monorepo `artifacts/arcade/src/games/racer/*` when building.

## Deploy SPA (Pages)

```bash
# monorepo path (preferred build host)
cd artifacts/arcade
BASE_PATH=/ node ./node_modules/vite/bin/vite.js build --config vite.cruise.config.ts
# package → dist/velocity-pages, strip >24MB, _redirects/_headers, functions/
npx wrangler pages deploy dist/velocity-pages --project-name=grudge-velocity --branch=main
```

Or: `node scripts/deploy-velocity-pages.mjs`

## Deploy drive proxy (Vercel)

```bash
cd _drive_proxy_out
npx vercel deploy --prod --yes --scope grudgenexus
# project grudge-drive → alias drive.grudge-studio.com
```

## Assets (R2)

```bash
curl -sI https://assets.grudge-studio.com/games/velocity/manifest.json
curl -sI https://assets.grudge-studio.com/models/vehicles/datsun-240z.glb
curl -sI "https://assets.grudge-studio.com/models/environment/velocity/la-gangwar.glb"
```

Magic-byte: GLB starts `glTF`. Never accept HTML.

## Multiplayer

| Piece | Path |
|-------|------|
| Room | voxgrudge `server/drive-room.js` |
| Edge | grudox Worker `LIVE_GAME_API_PREFIXES` includes `drive` |
| Client | `driveNetClient.ts` → `FLEET_DRIVE_WS` |

## Smoke

```bash
curl -sI https://drive.grudge-studio.com/
# 200, title Velocity — LA Streets 3D
curl -sI https://drive.grudge-studio.com/assets/cruise-CEDk4XaI.js
# application/javascript (hash changes per deploy)
# Missing Babylon hashes → 404 text/plain (not HTML)
```
