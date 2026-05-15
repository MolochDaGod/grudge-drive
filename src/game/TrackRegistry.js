/**
 * TrackRegistry — All track pieces from Kenney packs + 5 race level definitions.
 *
 * Asset sources:
 *   - kenney/racing-kit: 207 road GLBs (straights, corners, intersections, splits)
 *   - kenney/retro-urban-kit: buildings, trucks, urban props
 *   - kenney/starter-kit-racing: track-bump, track-corner, track-finish, track-straight, decorations
 *   - kenney/car-kit: barriers, cones, nature
 *
 * Each level defines: tile layout, spawn grid, checkpoint gates, lap count, theme, NPC count.
 */

// ── Asset path constants ────────────────────────────────────────────

const P = {
  RACE_GLB:  '/assets/kenney/racing-kit/Models/GLTF format',
  RACE_GLTF: '/assets/kenney/racing-kit/Models/GLTF format',
  URBAN:     '/assets/kenney/retro-urban-kit/Models/GLB format',
  START:     '/assets/kenney/starter-kit-racing/models',
  CAR:       '/assets/kenney/car-kit/Models/GLB format',
};

// ── Track tile catalog ──────────────────────────────────────────────
// Organized by category for the track builder.

export const TRACK_TILES = {
  // ── Straights ──
  straights: [
    'road-straight.glb', 'road-straight-crossing.glb', 'road-straight-intersection.glb',
    'road-straight-bridge.glb', 'road-straight-ramp.glb',
  ].map(f => `${P.RACE_GLB}/${f}`),

  // ── Corners ──
  corners: [
    'road-corner.glb', 'road-corner-large.glb', 'road-corner-small.glb',
  ].map(f => `${P.RACE_GLB}/${f}`),

  // ── Intersections ──
  intersections: [
    'road-intersection.glb', 'road-intersection-t.glb', 'road-roundabout.glb',
  ].map(f => `${P.RACE_GLB}/${f}`),

  // ── Ramps & specials ──
  specials: [
    `${P.START}/track-bump.glb`,
    `${P.START}/track-corner.glb`,
    `${P.START}/track-finish.glb`,
    `${P.START}/track-straight.glb`,
    `${P.START}/track-tents.glb`,
  ],

  // ── Barriers & guardrails ──
  barriers: [
    'barrier.glb', 'barrier-opening.glb', 'barrier-large.glb',
    'cone.glb', 'cone-striped.glb',
    'barrier-fence.glb', 'barrier-fence-corner.glb',
  ].map(f => `${P.RACE_GLB}/${f}`),

  // ── Nature / decoration ──
  nature: [
    'tree-default.glb', 'tree-large.glb', 'tree-thin.glb',
    'tree-palm.glb', 'tree-pine.glb',
    'bush.glb', 'rock.glb', 'rock-large.glb',
    'cactus.glb', 'flower-red.glb', 'flower-yellow.glb',
  ].map(f => `${P.RACE_GLB}/${f}`),

  // ── Urban buildings (retro-urban-kit) ──
  buildings: [
    'building-cafe.glb', 'building-house.glb', 'building-house-tall.glb',
    'building-shop.glb', 'building-office.glb', 'building-skyscraper.glb',
    'building-garage.glb', 'building-cinema.glb',
    'lamp.glb', 'lamp-double.glb', 'bench.glb', 'mailbox.glb',
    'sign-stop.glb', 'sign-hospital.glb',
  ].map(f => `${P.URBAN}/${f}`),

  // ── Decoration sets (starter-kit) ──
  decorations: [
    `${P.START}/decoration-empty.glb`,
    `${P.START}/decoration-forest.glb`,
    `${P.START}/decoration-tents.glb`,
  ],
};

// ── Game modes ──────────────────────────────────────────────────────

export const GAME_MODES = {
  race:       { id: 'race',       name: 'Race',        desc: 'First to finish wins',         icon: '🏁', minPlayers: 2, maxPlayers: 8, hasLaps: true },
  battle:     { id: 'battle',     name: 'Battle Arena', desc: 'Last kart standing',           icon: '⚔️', minPlayers: 2, maxPlayers: 8, hasLaps: false },
  timeAttack: { id: 'timeAttack', name: 'Time Trial',  desc: 'Beat the clock solo or ranked', icon: '⏱️', minPlayers: 1, maxPlayers: 1, hasLaps: true },
  teamBattle: { id: 'teamBattle', name: 'Team Battle',  desc: '3v3 faction war',              icon: '🛡️', minPlayers: 4, maxPlayers: 6, hasLaps: false },
};

// ── Track / Level definitions ───────────────────────────────────────
// Each track defines which tile set to use, a grid layout, spawn points, and checkpoints.
// Layouts are simplified as arrays of tile-type+rotation instructions; the TrackBuilder
// system uses these to procedurally place GLBs in the 3D scene.

export const TRACKS = [
  // ── 1. Grudge City Circuit ──────────────────────────────────────
  {
    id: 'city_circuit',
    name: 'Grudge City Circuit',
    desc: 'Urban streets with tight corners and building canyons',
    theme: 'urban',
    tileScale: 4.0,
    laps: 3,
    modes: ['race', 'timeAttack'],
    npcCount: 5,
    maxPlayers: 8,
    // Layout: sequence of tile instructions [type, rotationY_degrees]
    layout: [
      ['straight', 0], ['straight', 0], ['straight', 0], ['corner', 90],
      ['straight', 90], ['straight', 90], ['corner', 180],
      ['straight', 180], ['ramp', 180], ['straight', 180], ['corner', 270],
      ['straight', 270], ['straight', 270], ['corner', 0],
    ],
    spawns: [
      { x: 4, y: 0.5, z: 0 }, { x: 8, y: 0.5, z: 0 },
      { x: 4, y: 0.5, z: 3 }, { x: 8, y: 0.5, z: 3 },
      { x: 4, y: 0.5, z: 6 }, { x: 8, y: 0.5, z: 6 },
      { x: 4, y: 0.5, z: 9 }, { x: 8, y: 0.5, z: 9 },
    ],
    checkpoints: [
      { x: 12, z: 0, width: 8 },
      { x: 24, z: 12, width: 8 },
      { x: 12, z: 24, width: 8 },
      { x: 0, z: 12, width: 8 },
    ],
    decorations: { buildings: true, lamps: true, barriers: true },
  },

  // ── 2. Greenwood Rally ──────────────────────────────────────────
  {
    id: 'greenwood_rally',
    name: 'Greenwood Rally',
    desc: 'Forest trails with jumps, mud, and sharp turns',
    theme: 'forest',
    tileScale: 5.0,
    laps: 3,
    modes: ['race', 'timeAttack'],
    npcCount: 4,
    maxPlayers: 6,
    layout: [
      ['straight', 0], ['straight', 0], ['corner', 90], ['straight', 90],
      ['ramp', 90], ['corner', 180], ['straight', 180], ['straight', 180],
      ['straight', 180], ['corner', 270], ['straight', 270], ['ramp', 270],
      ['corner', 0],
    ],
    spawns: [
      { x: 5, y: 0.5, z: 0 }, { x: 10, y: 0.5, z: 0 },
      { x: 5, y: 0.5, z: 4 }, { x: 10, y: 0.5, z: 4 },
      { x: 5, y: 0.5, z: 8 }, { x: 10, y: 0.5, z: 8 },
    ],
    checkpoints: [
      { x: 10, z: 0, width: 10 },
      { x: 20, z: 15, width: 10 },
      { x: 10, z: 30, width: 10 },
    ],
    decorations: { trees: true, rocks: true, barriers: true },
  },

  // ── 3. Toy Town Speedway ────────────────────────────────────────
  {
    id: 'toy_town',
    name: 'Toy Town Speedway',
    desc: 'Colorful miniature track with toy-scale obstacles',
    theme: 'toy',
    tileScale: 3.0,
    laps: 5,
    modes: ['race', 'timeAttack', 'battle'],
    npcCount: 6,
    maxPlayers: 8,
    layout: [
      ['straight', 0], ['straight', 0], ['straight', 0], ['straight', 0],
      ['corner', 90], ['straight', 90], ['corner', 180],
      ['straight', 180], ['straight', 180], ['straight', 180], ['straight', 180],
      ['corner', 270], ['straight', 270], ['corner', 0],
    ],
    spawns: [
      { x: 3, y: 0.5, z: 0 }, { x: 6, y: 0.5, z: 0 },
      { x: 9, y: 0.5, z: 0 }, { x: 12, y: 0.5, z: 0 },
      { x: 3, y: 0.5, z: 3 }, { x: 6, y: 0.5, z: 3 },
      { x: 9, y: 0.5, z: 3 }, { x: 12, y: 0.5, z: 3 },
    ],
    checkpoints: [
      { x: 12, z: 0, width: 6 },
      { x: 18, z: 6, width: 6 },
      { x: 12, z: 12, width: 6 },
      { x: 0, z: 6, width: 6 },
    ],
    decorations: { cones: true, barriers: true },
  },

  // ── 4. Grudge Arena (Battle Mode) ───────────────────────────────
  {
    id: 'grudge_arena',
    name: 'Grudge Arena',
    desc: 'Open combat arena with ramps, barriers, and weapon pickups',
    theme: 'arena',
    tileScale: 1.0,  // uses existing ArenaScene
    laps: 0,
    modes: ['battle', 'teamBattle'],
    npcCount: 5,
    maxPlayers: 8,
    layout: 'arena',  // special: uses existing ArenaScene.js
    spawns: [
      { x: 20, y: 2, z: 20 }, { x: -20, y: 2, z: 20 },
      { x: 20, y: 2, z: -20 }, { x: -20, y: 2, z: -20 },
      { x: 40, y: 2, z: 0 }, { x: -40, y: 2, z: 0 },
      { x: 0, y: 2, z: 40 }, { x: 0, y: 2, z: -40 },
    ],
    checkpoints: [],
    decorations: {},
  },

  // ── 5. Championship Grand Prix ──────────────────────────────────
  {
    id: 'grand_prix',
    name: 'Grand Prix',
    desc: 'The ultimate 4-lap championship combining urban and forest',
    theme: 'mixed',
    tileScale: 5.0,
    laps: 4,
    modes: ['race'],
    npcCount: 7,
    maxPlayers: 8,
    layout: [
      ['straight', 0], ['straight', 0], ['ramp', 0], ['straight', 0],
      ['corner', 90], ['straight', 90], ['straight', 90], ['straight', 90],
      ['corner', 180], ['straight', 180], ['ramp', 180], ['straight', 180],
      ['straight', 180], ['corner', 270], ['straight', 270], ['straight', 270],
      ['ramp', 270], ['straight', 270], ['corner', 0],
    ],
    spawns: [
      { x: 5, y: 0.5, z: 0 }, { x: 10, y: 0.5, z: 0 },
      { x: 5, y: 0.5, z: 4 }, { x: 10, y: 0.5, z: 4 },
      { x: 5, y: 0.5, z: 8 }, { x: 10, y: 0.5, z: 8 },
      { x: 5, y: 0.5, z: 12 }, { x: 10, y: 0.5, z: 12 },
    ],
    checkpoints: [
      { x: 15, z: 0, width: 10 },
      { x: 35, z: 20, width: 10 },
      { x: 15, z: 40, width: 10 },
      { x: 0, z: 20, width: 10 },
    ],
    decorations: { buildings: true, trees: true, barriers: true, lamps: true },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

export function getTrackById(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}

export function getTracksForMode(modeId) {
  return TRACKS.filter(t => t.modes.includes(modeId));
}

export function getAllTracks() {
  return TRACKS;
}
