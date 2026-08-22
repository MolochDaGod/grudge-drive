/**
 * Arcade garage catalog — paints, bolt-ons, tune ladder.
 * Copied into Velocity racer so campaign shop uses the same SSOT as Live Velocity.
 */
import type { CarStats } from "./cars";

export const STAT_KEYS = ["topSpeed", "accel", "grip"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const TUNE_MAX = 5;
export const TUNE_STEP: Record<StatKey, number> = {
  topSpeed: 0.04,
  accel: 0.05,
  grip: 0.06,
};
export const STAT_LABEL: Record<StatKey, string> = {
  topSpeed: "Top Speed",
  accel: "Acceleration",
  grip: "Grip",
};

export interface CarTuning {
  topSpeed: number;
  accel: number;
  grip: number;
}

export function emptyTuning(): CarTuning {
  return { topSpeed: 0, accel: 0, grip: 0 };
}

export function tuneCost(level: number): number {
  return 200 + level * 150;
}

export interface PaintOption {
  id: string;
  name: string;
  color: string;
}

export const PAINTS: PaintOption[] = [
  { id: "stock", name: "Factory", color: "" },
  { id: "ember", name: "Ember Red", color: "#ff3b30" },
  { id: "cyber", name: "Cyber Cyan", color: "#00e5ff" },
  { id: "toxic", name: "Toxic Lime", color: "#9dff00" },
  { id: "magenta", name: "Hot Magenta", color: "#ff2bd6" },
  { id: "gold", name: "Bullion Gold", color: "#ffca28" },
  { id: "void", name: "Void Purple", color: "#7c4dff" },
  { id: "mono", name: "Matte Mono", color: "#2b2f3a" },
];

export const DEFAULT_PAINT_ID = PAINTS[0].id;

export function getPaint(id: string): PaintOption | undefined {
  return PAINTS.find((p) => p.id === id);
}

export interface VisualMod {
  id: string;
  name: string;
  description: string;
  price: number;
}

export const VISUAL_MODS: VisualMod[] = [
  { id: "spoiler", name: "Rear Wing", description: "High-mount spoiler.", price: 600 },
  { id: "underglow", name: "Neon Underglow", description: "Glow under the chassis.", price: 800 },
  { id: "roofscoop", name: "Roof Scoop", description: "Voxel intake on the roof.", price: 700 },
];

export function getMod(id: string): VisualMod | undefined {
  return VISUAL_MODS.find((m) => m.id === id);
}

export const MOD_REFUND_RATE = 0.6;

export function tuneSpend(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) total += tuneCost(i);
  return total;
}

export function computeEffectiveStats(
  base: CarStats,
  tuning: CarTuning,
  perk?: { topSpeed?: number; accel?: number; grip?: number },
): CarStats {
  return {
    topSpeed: base.topSpeed + tuning.topSpeed * TUNE_STEP.topSpeed + (perk?.topSpeed ?? 0),
    accel: base.accel + tuning.accel * TUNE_STEP.accel + (perk?.accel ?? 0),
    grip: base.grip + tuning.grip * TUNE_STEP.grip + (perk?.grip ?? 0),
  };
}

export function tuneLevels(tuning: CarTuning): number {
  return STAT_KEYS.reduce((n, k) => n + tuning[k], 0);
}
