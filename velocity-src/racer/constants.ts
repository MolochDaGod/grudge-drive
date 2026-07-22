/**
 * Tunables, palettes and shared types for the "Voxel Velocity" racing cabinet.
 *
 * Voxel Velocity is a neon arcade drift-racer: the player spawns on foot as the
 * shared voxel character, walks to a parked voxel car, enters it (door swing +
 * Entering_Car animation), then drifts a closed neon circuit for a set number of
 * laps against the clock before stepping back out.
 *
 * Every numeric knob and the engine -> HUD snapshot shape live here so the
 * disposable engine, the mesh factory and the React overlay stay readable and
 * agree on the same vocabulary. All distances are world units; all speeds are
 * per-second (the engine integrates on a fixed timestep).
 */

/** High-level state the cabinet is in; drives which HUD chrome is shown. */
export type RacerPhase =
  | "onfoot"
  | "entering"
  | "driving"
  | "exiting"
  | "finished";

/** A deployable defensive item dropped behind the car (Ctrl). */
export type DefensiveItem = "oil" | "nails" | "flashbang";

/**
 * Quality grade of a manual up-shift, by how close the revs were to the redline
 * at the moment of the shift. Drives the HUD shift-timing flash + a brief accel
 * boost for a well-timed change.
 */
export type ShiftQuality = "perfect" | "good" | "early";

/**
 * One racer's standing in the circuit field (player or an AI rival), used both
 * for the live position readout and the end-of-race finishing-order overlay.
 */
export interface RaceStanding {
  /** Driver name ("You" for the player). */
  name: string;
  /** Car the driver is in. */
  car: string;
  /** True for the player's own row (highlighted in the overlay). */
  isPlayer: boolean;
  /** True once this racer has completed every lap. */
  finished: boolean;
  /** Race time at the moment they crossed the final line, or null if unfinished. */
  finishMs: number | null;
  /** Continuous race progress (completed laps + fraction of the current lap). */
  progress: number;
}

/** Immutable snapshot the engine pushes to the React HUD overlay each tick. */
export interface RacerHudState {
  /** Current high-level phase. */
  phase: RacerPhase;
  /** Display name of the active car (for the corner readout). */
  carName: string;
  /** Display name of the chosen driver (for the corner readout). */
  driverName: string;
  /** Forward speed in km/h (derived; for the speedometer). */
  speed: number;
  /** Current lap number, 1-based, while driving (0 before the first line cross). */
  lap: number;
  /** Total laps in the race. */
  totalLaps: number;
  /** Elapsed time of the current lap, milliseconds. */
  curLapMs: number;
  /** Fastest completed lap so far, or null if none finished yet. */
  bestLapMs: number | null;
  /** Most recently completed lap time, or null. */
  lastLapMs: number | null;
  /** True while the car is sliding sideways (drift indicator). */
  drifting: boolean;
  /** Current forward gear, 1-based; 0 reads as reverse/neutral. */
  gear: number;
  /** Engine revs as a fraction of redline (0..~1.1); drives the tacho + shift cue. */
  rpm: number;
  /** True when the gearbox is in auto-shift assist mode (HUD AUTO/MANUAL chip). */
  autoShift: boolean;
  /** Engine temperature, 0..1 (drives the HEAT gauge). */
  heat: number;
  /** True when heat is in the overheat band (throttle power soft-capped). */
  overheat: boolean;
  /** Grade of the most recent up-shift while its flash is active, else null. */
  shiftQuality: ShiftQuality | null;
  /** Nitrous charge remaining, 0..1. */
  nos: number;
  /** True while NOS is actively firing. */
  boosting: boolean;
  /** Defensive item next to deploy, or null when charges are spent. */
  item: DefensiveItem | null;
  /** Remaining defensive deploys. */
  itemCharges: number;
  /** Contextual hint shown to the player (e.g. enter prompt). */
  prompt: string;
  /**
   * Staging countdown: 3/2/1 while grid holds, 0 = GO flash, -1 = hidden.
   * Circuit races use this after entering the car; drag uses its own tree.
   */
  countdown: number;
  /** Completed lap times, in order (for the results overlay). */
  lapTimes: number[];
  /** Total race time once finished, milliseconds. */
  totalMs: number;
  /** Full field (player + AI rivals) ordered by current/finishing position. */
  standings: RaceStanding[];
  /** The player's current position in the field, 1-based. */
  position: number;
  /** Total number of racers in the field (player + rivals). */
  fieldSize: number;
}

export const CONFIG = {
  /** Number of laps that make up a race. */
  totalLaps: 3,

  // Standing start: everyone holds until GO, then gets a brief launch window.
  race: {
    countdownSec: 3,
    /** Extra accel multiplier right after the lights go green. */
    launchBoostMult: 1.4,
    /** Seconds the launch boost lasts. */
    launchBoostTime: 2,
    /** AI rivals run at this fraction of the player's tuned top speed. */
    opponentSpeedScale: 0.78,
    /** Extra handicap while the player owns a Tier-1 starter (multiplies rival speed). */
    starterOpponentScale: 0.88,
    /** Launch boost multiplier for Tier-1 starters (helps first races). */
    starterLaunchMult: 1.55,
  },

  // Car driving feel. Speeds in u/s, accelerations in u/s^2, rates in rad/s.
  car: {
    /** Top forward speed. */
    maxSpeed: 58,
    /** Top reverse speed (slower than forward). */
    maxReverse: 18,
    /** Throttle acceleration. */
    accel: 34,
    /** Active braking deceleration (pressing reverse while moving forward). */
    brake: 70,
    /** Passive deceleration while coasting (no throttle). */
    coast: 16,
    /** Peak steering rate at full lock and speed. */
    steerRate: 2.5,
    /** Visual max steer angle of the front wheels (radians). */
    maxSteerVis: Math.PI / 7,
    /**
     * How fast the velocity vector realigns to the car's heading (1/s). High =
     * grippy (kart-like), low = slidey. Drift drops this so the car oversteers.
     */
    gripNormal: 7,
    gripDrift: 1.6,
    /** Extra yaw multiplier applied while drifting so the back end kicks out. */
    driftYawBoost: 1.5,
    /** Lateral slip (rad, angle between heading and velocity) that counts as a drift. */
    driftSlipThreshold: 0.28,
    /** Minimum speed before steering/drift have any effect. */
    minSteerSpeed: 1.5,
    /** Target world length the car model is scaled to (front-to-back). */
    length: 6.2,
    /** Body roll amplitude (radians) at full lateral slip. */
    rollAmount: 0.16,
    /** Body pitch amplitude (radians) under full accel/brake. */
    pitchAmount: 0.07,
    /** Fraction of top speed by which steering authority reaches full. */
    steerLowSpeed: 0.25,
    /** Steering authority multiplier at top speed (tapers top-end twitch). */
    steerHiTaper: 0.55,
    /** Hands-off auto-straighten rate (per second) when coasting forward with no steer input. */
    straightenAssist: 1.1,
  },

  // Chase camera (separate framings for on-foot, circuit, and drag).
  camera: {
    fov: 68,
    /** Extra FOV added at top speed for a sense of velocity. */
    speedFovKick: 8,
    foot: {
      distance: 7,
      height: 3.4,
      targetHeight: 1.4,
      lerp: 0.16,
    },
    /** Street-racer chase: low, close, over-the-shoulder (NFS / CSR feel). */
    drive: {
      distance: 8.2,
      height: 3.6,
      targetHeight: 1.1,
      lerp: 0.2,
      lookAhead: 16,
      speedPull: 2.8,
      heightSpeedLift: 0.6,
      targetSpeedLift: 0.25,
      rollAmount: 0.05,
      maxRoll: 0.07,
      sideOffset: 1.1,
      lookDown: 0.35,
    },
    /** Drag strip: tighter framing for launch + straight-line speed read. */
    drag: {
      distance: 7.4,
      height: 2.9,
      targetHeight: 0.85,
      lerp: 0.22,
      lookAhead: 22,
      speedPull: 1.6,
      heightSpeedLift: 0.35,
      targetSpeedLift: 0.15,
      rollAmount: 0.035,
      maxRoll: 0.05,
      sideOffset: 0.7,
      lookDown: 0.2,
    },
  },

  // On-foot character locomotion (feeds the shared animator).
  foot: {
    walkSpeed: 5.5,
    runSpeed: 9.5,
    turnLerp: 0.2,
    /** How quickly the locomotion intensity ramps toward the input (per second). */
    accel: 9,
    decel: 12,
    /** Avatar target height in metres. */
    height: 2,
  },

  // Enter / exit interaction.
  enter: {
    /** How close (world units) the avatar must be to the car to enter. */
    distance: 5.5,
    /** Seconds the seat-slide carry runs if the FBX clip is missing. */
    fallbackDuration: 1.1,
    /** Door swing open angle (radians). */
    doorAngle: Math.PI / 2.4,
    /** Lateral offset (car-right) where the avatar stands beside the door. */
    doorSide: 3.6,
    /**
     * Driver-seat anchor as fractions of the car's OWN dimensions (prepareCar dims).
     * GTA / voxel-street style: hips sit mid-cabin so only torso+head read above
     * the door line — legs are hidden when seated (see seatCabin in CruiseGame).
     *   -x = left of centre (driver side US), +y = seat height / height, +z = wheel.
     */
    seat: { x: -0.22, y: 0.22, z: 0.08 },
    /**
     * Avatar scale while seated. Lower than on-foot so shoulders stay under the
     * roof line of voxel coupes (NSX / Skyline / 240Z).
     */
    seatScale: 0.58,
  },

  // Neon circuit layout.
  track: {
    /** Drivable road width. */
    roadWidth: 17,
    /** Height of the glowing edge walls. */
    wallHeight: 2.4,
    /** Samples taken along the spline to build the road/wall ribbons. */
    ribbonSamples: 240,
    /** Number of ordered checkpoints (including the start/finish line at index 0). */
    checkpoints: 9,
    /** Radius around a checkpoint centre that counts as "crossed". */
    checkpointRadius: 12,
  },

  // World framing.
  world: {
    skyColor: 0x05060f,
    fogNear: 130,
    fogFar: 460,
    groundColor: 0x0a0c18,
  },

  // Manual gearbox (R/LMB shift up, F/RMB shift down).
  gears: {
    /** Number of forward gears. */
    count: 6,
    /** Powerband overlap between adjacent gears (0..1). */
    overlap: 0.12,
    /** Seconds of cut acceleration right after a shift (clutch dip). */
    shiftCut: 0.18,
    /** Minimum seconds between shifts. */
    cooldown: 0.16,
    /** Auto-shift assist: revs fraction at which it upshifts. */
    autoUpRpm: 0.97,
    /** Auto-shift assist: revs fraction below which it downshifts (anti-lug). */
    autoDownRpm: 0.32,
    /** Downshift is refused if it would push revs past this fraction (money-shift guard). */
    overRevLimit: 1.08,
    /** Up-shift at/above this revs fraction grades as a PERFECT shift. */
    perfectShiftRpm: 0.9,
    /** Up-shift at/above this revs fraction (but below perfect) grades as GOOD. */
    goodShiftRpm: 0.74,
    /** Accel multiplier briefly granted after a perfect/good shift. */
    shiftBoostMult: 1.12,
    /** Seconds a perfect shift's accel boost lasts (good = half). */
    shiftBoostTime: 1.1,
    /** Seconds the shift-quality flash stays on the HUD. */
    shiftFlashTime: 0.8,
  },

  // Engine thermals: a feel/readout layer that mildly soft-caps power when the
  // engine is run hot (sustained redline / over-rev / NOS). All in 0..1.
  heat: {
    /** Heat gained per second while holding throttle at/over the redline. */
    riseRedline: 0.22,
    /** Extra heat per second while over the rev limiter (rpm > 1). */
    riseOverRev: 0.5,
    /** Extra heat per second while NOS is firing. */
    riseNos: 0.4,
    /** Base cooling per second (off-throttle / low-rev cools faster). */
    cool: 0.16,
    /** Heat fraction at/above which the HEAT gauge warns. */
    warnAt: 0.8,
    /** Heat fraction at/above which the engine soft-caps throttle power. */
    overheatAt: 0.97,
    /** Throttle accel multiplier while overheating (mild penalty). */
    overheatAccelMult: 0.78,
  },

  // Nitrous boost (Shift).
  nos: {
    /** Forward speed-cap multiplier while firing (lets you blow past redline). */
    speedMult: 1.32,
    /** Acceleration multiplier while firing. */
    accelMult: 1.9,
    /** Seconds of boost a full tank lasts. */
    drainTime: 3.2,
    /** Seconds to refill an empty tank from cold. */
    refillTime: 9,
  },

  // Deployable defensive items (Ctrl cycles oil -> nails -> flashbang).
  items: {
    /** Total deploys available per race. */
    charges: 4,
    /** Seconds between deploys. */
    cooldown: 1.1,
    /** Seconds a dropped hazard lingers before it fades. */
    hazardLife: 9,
    /** Radius (world units) within which a hazard affects a pursuer. */
    hazardRadius: 5,
    /** Seconds a flashbang whites out the screen. */
    flashTime: 0.85,
  },

  // High-speed "Voxel Velocity" visual treatment.
  speedFx: {
    /** Fraction of top speed where streak lines start to appear. */
    onset: 0.32,
    /** Radial speed-streak count (converge toward screen center). */
    streaks: 36,
    /** Streak plane width / length (camera-local units). */
    lineWidth: 0.022,
    lineLength: 0.62,
    /** Ring placement: streaks sit on the outer edge, not the center. */
    innerRadius: 0.78,
    outerRadius: 1.12,
    /** Per-line opacity at full speed (0.95 = crisp lines; normal blend avoids white-out). */
    maxOpacity: 0.95,
    /** Per-line opacity while NOS is firing. */
    maxOpacityBoost: 0.95,
    /** Extra FOV added at full NOS, on top of speedFovKick. */
    nosFovKick: 12,
  },

  /** Camera shake impulses (see `CameraShake`). */
  shake: {
    launch: 0.35,
    perfectShift: 0.28,
    nos: 0.22,
    drift: 0.12,
    copProximity: 0.18,
  },

  // Skid marks dropped while drifting (pooled flat quads).
  skid: {
    /** Max simultaneous skid quads (ring buffer). */
    pool: 160,
    /** Seconds between drops while drifting. */
    interval: 0.03,
    /** Size of one skid quad. */
    size: 0.9,
  },
} as const;

/** Neon accent palette reused across the circuit and HUD. */
export const NEON = {
  cyan: 0x00e5ff,
  magenta: 0xff2bd6,
  lime: 0x9dff00,
  amber: 0xffb300,
} as const;
