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
  // ── RVP Race Track (real GLB map) ──────────────────────────────
  {
    id: 'rvp_race',
    name: 'RVP Race Track',
    desc: 'Full circuit with banked turns, straights, and elevation changes',
    theme: 'race',
    glbFile: 'race_track.glb',
    laps: 3,
    modes: ['race', 'timeAttack', 'battle'],
    npcCount: 5,
    maxPlayers: 8,
    spawns: [
      { x: 0, y: 2, z: 0 }, { x: 3, y: 2, z: 0 },
      { x: 0, y: 2, z: 4 }, { x: 3, y: 2, z: 4 },
      { x: 0, y: 2, z: 8 }, { x: 3, y: 2, z: 8 },
      { x: -3, y: 2, z: 0 }, { x: -3, y: 2, z: 4 },
    ],
    checkpoints: [],
  },

  // ── Flat Arena (battle mode, guaranteed driveable) ──────────────
  {
    id: 'flat_arena',
    name: 'Grudge Arena',
    desc: 'Flat combat arena — guaranteed ground contact for all vehicles',
    theme: 'arena',
    glbFile: null, // uses fallback flat ground in ArenaScene
    laps: 0,
    modes: ['battle', 'teamBattle', 'race', 'timeAttack'],
    npcCount: 5,
    maxPlayers: 8,
    spawns: [
      { x: 10, y: 2, z: 10 }, { x: -10, y: 2, z: 10 },
      { x: 10, y: 2, z: -10 }, { x: -10, y: 2, z: -10 },
      { x: 20, y: 2, z: 0 }, { x: -20, y: 2, z: 0 },
      { x: 0, y: 2, z: 20 }, { x: 0, y: 2, z: -20 },
    ],
    checkpoints: [],
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
