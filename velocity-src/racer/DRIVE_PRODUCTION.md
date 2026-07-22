# Velocity production — GRUDOX garage flow (not the weak drive shell)

## Problem

`https://drive.grudge-studio.com/` currently ships a **simplified drag shell** that
lost the good flow. The product you like is the **arcade Live Velocity** path:

1. Driver select (your voxel heroes + Grudge Six)
2. Starter car
3. **Garage** (paint · mods · tune · upgrade ladder)
4. **Houston Cruise** open world (default) · circuit · drag

## SSOT

| Piece | Location |
|-------|----------|
| Flow UI | `RacerLauncher.tsx` |
| Open world | `CruiseGame.ts` + `houstonCity.ts` + `npcCharacters.ts` |
| Fleet driver | `fleetDriver.ts` — `?characterId=` + `/api/characters` |
| Street cast | Ember, Frost, Gilt, Jade, Void, Rose, Rox, Kira |
| **Map physics** | `cityMapWorld.ts` + `cityColliders.ts` + `roadGraph.ts` |
| City visuals | `cityFactory.ts` (same seed/grid as colliders) |

## Map / colliders / pathfinding

| Layer | System |
|-------|--------|
| Ground / roads / buildings | AABB catalog (`cityColliders`) + invisible BVH raycast skins |
| Vehicle / character resolve | `CityMapWorld.resolveVehicle` / `resolveCharacter` |
| Vehicle NPC streets | Road graph **A\*** (`roadGraph.ts`) — stays on centerlines |
| Foot navmesh | Procedural road surface → `three-pathfinding` when installed; else road graph |
| Rapier statics | Optional `@dimforge/rapier3d-compat` fixed cuboids (buildings + ground + roads) |
| Raycast | `three-mesh-bvh` accelerated, `firstHitOnly` ground probes |

**Units:** 1 unit = 1 metre. Building/road colliders match visual layout seed `houston`.

## Controls (Houston)

| Input | Action |
|-------|--------|
| **E** (in car) | Exit vehicle → on foot |
| **E** (near car) | Enter vehicle |
| **E** (near NPC) | Talk → Continue → **Accept race** |
| WASD | Drive / walk |
| Shift | NOS (drive) / sprint (foot) |
| M | Cycle mission |
| Esc | Close dialogue |

## Deploy (production — Jul 2026)

See **`DEPLOY.md`** for full bake/upload/Pages ops.

### Live now

| URL | Role |
|-----|------|
| **https://grudge-velocity.pages.dev/** | **Houston Cruise production** (CF Pages) |
| **https://drive.grudge-studio.com/** | **307 →** Pages (`?open=1`) |
| **CDN library** | `https://assets.grudge-studio.com/games/velocity/manifest.json` |
| **Intro video** | `https://assets.grudge-studio.com/media/velocity/drive-grudge.mp4` |
| **Cars (R2)** | `models/vehicles/*.glb` (13 fleet GLBs) |
| **D1** | `grudge-assets-db.asset_registry` velocity rows |

Includes: CDN intro (drive grudge.mp4), garage → Houston open world, road graph A\*,
BVH raycast, building colliders, E enter/exit, street talk, map physics.

### Slim build path (avoids full-arcade Vite OOM)

```bash
cd C:\Users\nugye\vfc-build\artifacts\arcade
$env:BASE_PATH="/arcade/"
node ./node_modules/vite/bin/vite.js build --config vite.cruise.config.ts
# promote cruise.html → index.html; stage to grudox dist/arcade
# CF Pages:
npx wrangler pages deploy <velocity-pages-dir> --project-name=grudge-velocity --branch=main
```

### GRUDOX SPA path (when Vercel team token is fixed)

GitHub Action `Deploy dist only` needs repo secrets `VERCEL_TOKEN` + org/project IDs
(currently empty → deploy fails). Dist is already on `feat/grudox-fleet` for when
secrets work: `/arcade/play/racer` rewrite → `dist/arcade/index.html`.

Handoff from Open / characters:

```
https://grudge-velocity.pages.dev/?characterId=UUID&open=1
# later, when GRUDOX SPA redeploys:
https://grudox.grudge-studio.com/arcade/play/racer?characterId=UUID&open=1
```

## Characters as NPCs

`npcCharacters.ts` reuses test crest looks as city walkers you can **talk to and
challenge**. Extend `STREET_CAST` when more player-test looks are ready.
