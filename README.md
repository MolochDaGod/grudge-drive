# Grudge Drive / Velocity

**Live street-racing RPG** for Grudge Studio.

| Surface | URL |
|---------|-----|
| **Play** | https://drive.grudge-studio.com/?play=1 |
| **Pages SPA (SSOT)** | https://grudge-velocity.pages.dev/ |
| **WS room** | `wss://grudox.grudge-studio.com/api/drive` |
| **CDN** | https://assets.grudge-studio.com/games/velocity/ |

## Product rules (do not regress)

1. **SPA = Three.js Houston Cruise only** (`CruiseOnlyLauncher` / `cruise-*.js`).
2. **`drive.grudge-studio.com`** = **rewrite proxy → Pages**. Never deploy Babylon `dist/` to the Vercel `grudge-drive` project.
3. **Purge list (not production):** Babylon `src/` lab, procedural box cars as primary, grudge6 modular drivers, dual 307 asset hops.
4. **Cars** = CDN voxel GLBs (`models/vehicles/*`).
5. **Drivers** = account **voxel** heroes (not grudge6 Warlords kits).
6. **Cabin** = GTA-style seat (dims-based, legs hidden).
7. **Map** = LA Gangwar + colliders.

### Deploy production entry (proxy)

```bash
npm run deploy:proxy
# or: node scripts/deploy-drive-proxy.mjs
```

Requires `VERCEL_TOKEN` + linked project `grudge-drive` → alias `drive.grudge-studio.com`.

**Lab Babylon only:** `npm run dev:lab` / `build:lab` — never `vercel --prod` from repo root with `dist/` present.

## Repo layout

```
grudge-drive/
  vercel.json              # production: rewrite-all → grudge-velocity.pages.dev
  proxy-deploy/            # thin Vercel package (no Babylon static files)
  _drive_proxy_out/        # deploy workspace for Vercel CLI
  velocity-src/
    DEPLOY.md              # full topology + deploy steps
    deploy-velocity-pages.mjs
    functions/_middleware.js   # MIME guard for stale hashed chunks
    racer/                 # mirrored production racer sources (SSOT snapshot)
    fleetAuth.ts, fleetConfig.ts
  src/                     # legacy Babylon lab (not production play)
```

## Deploy

### A) Game SPA (Cloudflare Pages)

Build from monorepo arcade (when available) or copy `velocity-src` into arcade:

```bash
# From monorepo artifacts/arcade (production build path)
node scripts/deploy-velocity-pages.mjs
# or:
BASE_PATH=/ node ./node_modules/vite/bin/vite.js build --config vite.cruise.config.ts
# package dist/public → dist/velocity-pages, strip files >24MB, then:
npx wrangler pages deploy dist/velocity-pages --project-name=grudge-velocity --branch=main
```

### B) Drive hostname proxy (Vercel)

```bash
cd _drive_proxy_out   # or proxy-deploy
npx vercel link --project grudge-drive --yes --scope grudgenexus
npx vercel deploy --prod --yes --scope grudgenexus
# alias: drive.grudge-studio.com
```

`vercel.json` rewrites:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "https://grudge-velocity.pages.dev/$1" }] }
```

No local `index.html` / Babylon assets on this project — filesystem would override rewrites.

## Auth

```
id.grudge-studio.com/login
  ?redirect_uri=https://drive.grudge-studio.com/?play=1&from=id
→ drive (proxy) → Pages SPA captures sso_token / grudge_token
→ garage (4-slot voxel) → START cruise
```

## Docs

- `velocity-src/DEPLOY.md` — fleet map, CORS trap, assets, multiplayer
- `velocity-src/racer/DRIVE_PRODUCTION.md` — racer product notes

## Smoke

```bash
curl -sI https://drive.grudge-studio.com/ | head
# expect 200 HTML title Velocity — LA Streets 3D
curl -sI https://drive.grudge-studio.com/assets/cruise-*.js | head
# expect application/javascript same-origin (via rewrite)
curl -sI "https://assets.grudge-studio.com/models/environment/velocity/la-gangwar.glb"
curl -sI "https://assets.grudge-studio.com/models/vehicles/datsun-240z.glb"
```
