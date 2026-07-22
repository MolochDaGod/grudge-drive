# Grudge Drive / Velocity

**Live street-racing RPG** for Grudge Studio.

| Surface | URL |
|---------|-----|
| **Play** | https://drive.grudge-studio.com/?play=1 |
| **Pages SPA** | https://grudge-velocity.pages.dev/ |
| **WS room** | `wss://grudox.grudge-studio.com/api/drive` |
| **CDN** | https://assets.grudge-studio.com/games/velocity/ |

## Product rules (do not regress)

1. **SPA = Three.js Houston Cruise** (not Babylon `src/` shell).
2. **`drive.grudge-studio.com`** is a **same-origin reverse proxy** (Vercel rewrites → Pages). Never 307 `/assets/*` to another origin while serving HTML from drive (CORS module failure).
3. **Cars** load from **CDN voxel GLBs** (`models/vehicles/*`) — not procedural box cars.
4. **Drivers** are **account voxel heroes** (Open Dressing Room / era=voxel). Not grudge6 modular Warlords kits.
5. **Seating** is GTA-style cabin: hips in car, legs hidden, scale ~0.58 so heads do not clip the roof.
6. **Map** = LA Gangwar shell + BVH colliders (`la-gangwar.glb?v=…` cache-bust after rebake).

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
