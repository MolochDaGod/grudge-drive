/**
 * Velocity campaign SSOT — "Roll em up" street story.
 *
 * Extends CruiseGame + arcade garage. Does not invent a second mission DB.
 * Harvest from car-travel-game (pmndrs racing-game fork): paint picker, map overlay,
 * camera cycle, reset, boost — mapped onto existing drivetrain / garage paints.
 * Do NOT import R3F or Cannon; LA Gangwar remains the city mesh.
 */

import { STARTER_CARS, type CarDef } from "./cars";

export type CampaignBeat =
  | "avatar"
  | "dice"
  | "won_line"
  | "car_pick"
  | "walk_to_car"
  | "cousin_call"
  | "go_shop"
  | "in_shop"
  | "open_world"
  | "cousin_ready"
  | "cousin_race"
  | "mission1_done";

export const DICE_WIN_LINE = "Roll em up and roll em out, I just won a car";

export const COUSIN_CALL = {
  from: "Cousin Dre",
  lines: [
    "Bitch I am gonna get my car back.",
    "Race my cousin for that car against his $1000.",
    "You know we are pull up and lose my car back.",
  ],
};

export const PLAYER_REFUSE =
  "Fuck that I am not racing his cousin till I have made some tune up. I should go to the shop.";

/** Three junk starters — same roster, zero tune (arcade garage emptyTuning). */
export function junkStarters(): CarDef[] {
  return STARTER_CARS.slice(0, 3);
}

export const COUSIN_STAKE = 1000;

/** Side jobs you can take from the phone before the cousin race. */
export const STREET_JOBS = [
  {
    id: "alley_heat",
    title: "Alley Heat",
    pay: 220,
    blurb: "Two blocks, no cops. AI pulls up and talks shit.",
  },
  {
    id: "corner_store",
    title: "Corner Store Run",
    pay: 160,
    blurb: "Drop-off. Easy cash for a first bolt-on.",
  },
  {
    id: "bridge_sprint",
    title: "Bridge Sprint",
    pay: 340,
    blurb: "Open stretch. Don't dump the heap.",
  },
] as const;

/** Shop POI on LA Gangwar / Houston overlay (metres, same world as CruiseGame). */
export const SHOP_POI = {
  id: "tune_shop",
  name: "Midnight Tune",
  x: 48,
  z: -36,
  accent: "#ffca28",
};

export const COUSIN_POI = {
  id: "cousin_lot",
  name: "Cousin's lot",
  x: -62,
  z: 88,
  accent: "#ff5a36",
};

export function gpsBearingDeg(
  fromX: number,
  fromZ: number,
  yaw: number,
  toX: number,
  toZ: number,
): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const target = Math.atan2(dx, dz);
  let d = target - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return (d * 180) / Math.PI;
}

export function gpsDist(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.hypot(toX - fromX, toZ - fromZ);
}

export function canRaceCousin(opts: {
  shopVisited: boolean;
  currency: number;
  tuneLevels: number;
}): boolean {
  return opts.shopVisited && (opts.tuneLevels >= 1 || opts.currency >= 400);
}

export const PHONE_HINT = "↑ phone · M map · GPS arrow is the shop";
