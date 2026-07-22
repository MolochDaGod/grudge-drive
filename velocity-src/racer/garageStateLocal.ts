/**
 * localStorage garage — no Puter / grudge-id (slim production builds).
 */
import { DEFAULT_CHARACTER_ID } from "./characters";
import { DEFAULT_CAR_ID } from "./cars";
import { emptyTuning, DEFAULT_PAINT_ID, type CarTuning } from "./garage";

const KEY = "arcade:racer:garage:v1";

export interface GarageState {
  version: number;
  driverId: string;
  driverName: string;
  carId: string;
  paintId: string;
  mods: string[];
  tuning: CarTuning;
  currency: number;
}

export function defaultGarage(): GarageState {
  return {
    version: 1,
    driverId: DEFAULT_CHARACTER_ID,
    driverName: "",
    carId: DEFAULT_CAR_ID,
    paintId: DEFAULT_PAINT_ID,
    mods: [],
    tuning: emptyTuning(),
    currency: 350,
  };
}

export function loadGarage(): GarageState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GarageState>;
    const merged = {
      ...defaultGarage(),
      ...parsed,
      tuning: { ...emptyTuning(), ...parsed.tuning },
    };
    // Migrate novelty cube starter → real voxel default
    if (merged.carId === "cube-cruiser") merged.carId = DEFAULT_CAR_ID;
    return merged;
  } catch {
    return null;
  }
}

export function saveGarage(g: GarageState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* ignore */
  }
}
