/**
 * Houston Cruise — open-world types + HUD snapshot.
 * Production flow: garage → cruise → walk · talk · enter/exit · race.
 */

import type { AiAgent } from "./aiBrain";
import type { District, WorldPoI } from "./houstonCity";

export type CruisePhase =
  | "onfoot"
  | "combat" // ARPG focus mode on foot (Danger Room guns)
  | "driving"
  | "stopping" // slamming brakes before exit
  | "exiting" // exit-car animation + seat slide
  | "entering" // enter-car animation + seat slide
  | "dialogue"
  | "race"
  | "mission"
  | "busted"
  | "results";

export interface MapBlip {
  id: string;
  x: number;
  z: number;
  kind: "player" | "npc" | "race" | "mission" | "rave" | "garage" | "police" | "car";
  accent?: string;
}

export interface DialogueState {
  npcId: string;
  npcName: string;
  title: string;
  line: string;
  canChallenge: boolean;
  perkLabel: string;
  accent: string;
}

export interface CruiseHudState {
  phase: CruisePhase;
  carName: string;
  driverName: string;
  speed: number;
  gear: number;
  rpm: number;
  autoShift: boolean;
  heat: number;
  overheat: boolean;
  nos: number;
  boosting: boolean;
  district: string;
  districtAccent: string;
  prompt: string;
  nearPoi: WorldPoI | null;
  /** Nearby street NPC name when on foot. */
  nearNpcName: string | null;
  /** True when player is close enough to enter the parked car. */
  nearCar: boolean;
  dialogue: DialogueState | null;
  missionTitle: string | null;
  missionProgress: number;
  missionGoal: number;
  sessionCash: number;
  discoveredDistricts: string[];
  discoveredRaves: string[];
  racesWon: number;
  raceCountdown: number | null;
  raceProgress: number;
  /** Rival race meters (for progress bar). */
  raceRivalProgress: number;
  raceLength: number;
  raceRivalName: string | null;
  /** Drive-by AI offering a race (E to accept). */
  challengeOffer: { id: string; name: string; accent: string } | null;
  /** Nearby AI radio taunt. */
  taunt: { name: string; line: string; accent: string } | null;
  blips: MapBlip[];
  playerX: number;
  playerZ: number;
  playerYaw: number;
  peers: number;
  netStatus: "offline" | "connecting" | "live";
  result: "win" | "lose" | null;
  resultCash: number;
  /** Danger Room ARPG combat HUD */
  focusAim: boolean;
  /** Weapon drawn (RMB toggle) */
  gunDrawn: boolean;
  playerHp: number;
  playerMaxHp: number;
  gunLabel: string;
  mag: number;
  magSize: number;
  targetName: string | null;
  targetHp: number;
  mapCredit: string | null;
  worldName: string;
  /** World-space NPCs projected to screen for identifiers */
  nameplates: Array<{
    id: string;
    name: string;
    role: string;
    accent: string;
    /** 0..1 NDC-ish screen x */
    sx: number;
    sy: number;
    dist: number;
  }>;
  /** Big race countdown banner */
  raceBanner: string | null;
}

export interface CruiseConfig {
  carName: string;
  driverName: string;
  carAccent: string;
  /** Roster car id (cars.ts) — loads real CDN voxel GLB. */
  carId?: string;
  /** Catalog asset id e.g. vehicles/nsx-voxel */
  carAssetId?: string;
  /** Paint hex for body tint */
  paintColor?: string;
  /**
   * Account voxel hero look for createAnimatedCharacter (Open Dressing Room /
   * procedural voxel — NOT grudge6 modular race kits).
   */
  driverLook?: import("./lookTypes").CharacterLook;
  multiplayerUrl?: string | null;
  characterId?: string | null;
}

export function emptyCruiseHud(partial?: Partial<CruiseHudState>): CruiseHudState {
  return {
    phase: "driving",
    carName: "Cube Cruiser",
    driverName: "Driver",
    speed: 0,
    gear: 1,
    rpm: 0,
    autoShift: true,
    heat: 0,
    overheat: false,
    nos: 1,
    boosting: false,
    district: "Open road",
    districtAccent: "#5d8a96",
    prompt: "WASD drive · E exit car / talk · find racers to challenge",
    nearPoi: null,
    nearNpcName: null,
    nearCar: false,
    dialogue: null,
    missionTitle: null,
    missionProgress: 0,
    missionGoal: 0,
    sessionCash: 0,
    discoveredDistricts: [],
    discoveredRaves: [],
    racesWon: 0,
    raceCountdown: null,
    raceProgress: 0,
    raceRivalProgress: 0,
    raceLength: 402,
    raceRivalName: null,
    challengeOffer: null,
    taunt: null,
    blips: [],
    playerX: 0,
    playerZ: 0,
    playerYaw: 0,
    peers: 0,
    netStatus: "offline",
    result: null,
    resultCash: 0,
    focusAim: false,
    gunDrawn: false,
    playerHp: 100,
    playerMaxHp: 100,
    gunLabel: "Street Iron",
    mag: 12,
    magSize: 12,
    targetName: null,
    targetHp: 0,
    mapCredit: null,
    worldName: "Houston / LA Streets",
    nameplates: [],
    raceBanner: null,
    ...partial,
  };
}

export function agentsToBlips(agents: AiAgent[]): MapBlip[] {
  return agents.map((a) => ({
    id: a.id,
    x: a.x,
    z: a.z,
    kind: a.role === "police" ? "police" : "npc",
    accent: a.accent,
  }));
}

export function districtLabel(d: District | null): { name: string; accent: string } {
  if (!d) return { name: "Open road", accent: "#5d8a96" };
  return { name: d.name, accent: d.accent };
}
