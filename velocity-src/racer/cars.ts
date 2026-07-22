/**
 * Car roster for the Live Velocity cabinet — ONE consistent voxel art style.
 *
 * Every car is a blocky/voxel GLB shipped in the shared assets catalog under the
 * `vehicles` category (loaded via `loadAsset`, which decodes embedded textures;
 * the vehicles category uses NearestFilter so the pixel-art skins stay crisp).
 * The roster is a three-tier ladder: the player picks one of three Tier-1
 * starters, then earns currency to UPGRADE up the ladder (Tier 1 -> 2 -> 3) in
 * the garage. Each car has a display name, a class tag, a neon accent for the
 * garage card + HUD, driving `stats` (multipliers over the base car physics),
 * and its place in the upgrade ladder.
 *
 * `modelYaw` is an optional per-car correction (radians) applied after the
 * automatic "longest horizontal axis -> forward (+Z)" normalisation, in case a
 * particular model's front faces the wrong way once aligned. The Arcade is
 * Puter-guest-gated so headless WebGL verification is unavailable: the new voxel
 * cars start at modelYaw 0 and are tuned by manual preview if any drives
 * backwards.
 */

/** Per-car driving feel, expressed as multipliers over the base `CONFIG.car`. */
export interface CarStats {
  /** Top-speed multiplier (1 = base). */
  topSpeed: number;
  /** Throttle acceleration multiplier (1 = base). */
  accel: number;
  /** Grip multiplier (1 = base); higher = stickier, lower = slidier/driftier. */
  grip: number;
}

/** Ladder tier; the player upgrades from 1 -> 2 -> 3. */
export type CarTier = 1 | 2 | 3;

export interface CarDef {
  /** Stable id (also the garage selection key). */
  id: string;
  /** Asset catalog id resolved by `loadAsset`. */
  assetId: string;
  /** Display name shown on the select screen + HUD. */
  name: string;
  /** Short class tag for the garage card. */
  klass: string;
  /** Neon accent (CSS string) for the select card glow. */
  accent: string;
  /** Driving feel multipliers (base, before garage tuning + driver perk). */
  stats: CarStats;
  /** Ladder tier. */
  tier: CarTier;
  /** True for the three pic- at - start cars. */
  starter?: boolean;
  /** Id of the car this one upgrades into (undefined at the top of the ladder). */
  upgradeTo?: string;
  /** Currency cost to upgrade into `upgradeTo`. */
  upgradeCost?: number;
  /** Extra yaw correction applied after auto-orientation (radians). */
  modelYaw?: number;
}

export const CARS: CarDef[] = [
  // --- Tier 1 — starters (real CDN voxel GLBs only — no procedural boxes) -
  {
    id: "datsun-240z",
    assetId: "vehicles/datsun-240z",
    name: "Datsun 240Z",
    klass: "Classic",
    accent: "#ff5a36",
    stats: { topSpeed: 0.96, accel: 0.9, grip: 1.0 },
    tier: 1,
    starter: true,
    upgradeTo: "skyline-r34",
    upgradeCost: 1200,
  },
  {
    id: "nsx-v",
    assetId: "vehicles/nsx-voxel",
    name: "NSX-V",
    klass: "Coupe",
    accent: "#00e5ff",
    stats: { topSpeed: 0.98, accel: 0.98, grip: 0.92 },
    tier: 1,
    starter: true,
    upgradeTo: "street-demon",
    upgradeCost: 1200,
  },
  {
    id: "supra-a80",
    assetId: "vehicles/toyota-supra",
    name: "Supra A80",
    klass: "Tuner",
    accent: "#e8e8e8",
    stats: { topSpeed: 1.0, accel: 0.96, grip: 0.98 },
    tier: 1,
    starter: true,
    upgradeTo: "m3-gtr",
    upgradeCost: 1200,
  },
  // Legacy blocky pack — kept unlocked for collection, not a default starter
  {
    id: "cube-cruiser",
    assetId: "vehicles/minecraft-car",
    name: "Cube Cruiser",
    klass: "Novelty",
    accent: "#9dff00",
    stats: { topSpeed: 0.9, accel: 0.92, grip: 1.05 },
    tier: 1,
    upgradeTo: "m3-gtr",
    upgradeCost: 800,
  },

  // --- Tier 2 — mid ladder -------------------------------------------------
  {
    id: "m3-gtr",
    assetId: "vehicles/bmw-m3-gtr",
    name: "M3 GTR",
    klass: "GT",
    accent: "#ffb300",
    stats: { topSpeed: 1.1, accel: 1.08, grip: 1.12 },
    tier: 2,
    upgradeTo: "grudge-srt",
    upgradeCost: 2600,
  },
  {
    id: "skyline-r34",
    assetId: "vehicles/skyline-r34",
    name: "Skyline R34",
    klass: "Tuner",
    accent: "#2e6bff",
    stats: { topSpeed: 1.14, accel: 1.12, grip: 1.05 },
    tier: 2,
    upgradeTo: "apex-gt",
    upgradeCost: 2600,
  },
  {
    id: "street-demon",
    assetId: "vehicles/street-racer",
    name: "Street Demon",
    klass: "Street",
    accent: "#ff2bd6",
    stats: { topSpeed: 1.12, accel: 1.15, grip: 0.96 },
    tier: 2,
    upgradeTo: "phantom-911",
    upgradeCost: 2600,
    // Outlier: authored facing is reversed once aligned to +Z.
    modelYaw: Math.PI,
  },

  // --- Tier 3 — top of the ladder -----------------------------------------
  {
    id: "grudge-srt",
    assetId: "vehicles/challenger-srt",
    name: "Grudge SRT",
    klass: "Muscle",
    accent: "#ffb300",
    stats: { topSpeed: 1.22, accel: 1.32, grip: 0.92 },
    tier: 3,
  },
  {
    id: "apex-gt",
    assetId: "vehicles/racing-car",
    name: "Apex GT",
    klass: "Prototype",
    accent: "#9dff00",
    stats: { topSpeed: 1.3, accel: 1.24, grip: 1.08 },
    tier: 3,
  },
  {
    id: "phantom-911",
    assetId: "vehicles/porsche-911",
    name: "Phantom 911",
    klass: "Hypercar",
    accent: "#00e5ff",
    stats: { topSpeed: 1.28, accel: 1.18, grip: 1.2 },
    tier: 3,
  },
];

/** The three pic- at - start cars, in display order. */
export const STARTER_CARS: CarDef[] = CARS.filter((c) => c.starter);

/** Default garage pick — real voxel Datsun, not the novelty cube. */
export const DEFAULT_CAR_ID = STARTER_CARS[0]?.id ?? "datsun-240z";

export function getCar(id: string): CarDef | undefined {
  return CARS.find((c) => c.id === id);
}

/** The car `id` upgrades into, fully resolved, or undefined at the top. */
export function nextCar(id: string): CarDef | undefined {
  const car = getCar(id);
  return car?.upgradeTo ? getCar(car.upgradeTo) : undefined;
}

/**
 * The car that upgrades INTO `id` (its predecessor on the ladder), or undefined
 * for starter cars / unknown ids. The ladder is linear so this predecessor is
 * unique, and its `upgradeCost` is what was paid to reach `id`.
 */
export function prevCar(id: string): CarDef | undefined {
  return CARS.find((c) => c.upgradeTo === id);
}

/** Police chaser model (NPC only — not part of the playable roster). */
/** Race difficulty handicap from car tier — starters get slower AI rivals. */
export function raceHandicapForTier(tier: CarTier): number {
  if (tier === 1) return 0.86;
  if (tier === 2) return 0.93;
  return 1;
}

export const POLICE_CAR_ASSET_ID = "vehicles/police-car";

/**
 * Synthetic car def for the drag-mode police pursuer, so it can reuse the shared
 * `prepareCar` pipeline (footprint fit + wheels). Not shown in the garage.
 */
export const POLICE_DEF: CarDef = {
  id: "police",
  assetId: POLICE_CAR_ASSET_ID,
  name: "Police",
  klass: "Pursuit",
  accent: "#3b6cff",
  stats: { topSpeed: 1.1, accel: 1.1, grip: 1.2 },
  tier: 2,
};

/** Highway environment used as the drag-race backdrop. */
export const DRAG_LEVEL_ASSET_ID = "environment/city/highway-battle";

/** Voxel street environment used to dress the circuit. */
export const CIRCUIT_LEVEL_ASSET_ID = "environment/city/voxel-street";
