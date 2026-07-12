/**
 * TrackRegistry — Production tracks + game modes for Grudge Drive / Velocity.
 *
 * Modes:
 *   drag      — PvP-style 1v1 quarter-mile (AI opponent offline)
 *   race      — Circuit race with AI pack
 *   battle    — Last-kart-standing arena PvE
 *   timeAttack — Solo sprint, beat the clock
 */

// ── Game modes ──────────────────────────────────────────────────────

export const GAME_MODES = {
  drag: {
    id: 'drag',
    name: 'Drag Race',
    desc: '1v1 quarter-mile — nitro timing wins',
    icon: '🔥',
    minPlayers: 2,
    maxPlayers: 2,
    hasLaps: false,
    isPvp: true,
    botCount: 1,
    weapons: false,
  },
  race: {
    id: 'race',
    name: 'Circuit Race',
    desc: 'First across the line after 3 laps',
    icon: '🏁',
    minPlayers: 2,
    maxPlayers: 8,
    hasLaps: true,
    isPvp: true,
    botCount: 4,
    weapons: false,
  },
  battle: {
    id: 'battle',
    name: 'Battle Arena',
    desc: 'Last kart standing — guns hot',
    icon: '⚔️',
    minPlayers: 2,
    maxPlayers: 8,
    hasLaps: false,
    isPvp: false,
    botCount: 5,
    weapons: true,
  },
  timeAttack: {
    id: 'timeAttack',
    name: 'Time Trial',
    desc: 'Solo sprint — beat your best',
    icon: '⏱️',
    minPlayers: 1,
    maxPlayers: 1,
    hasLaps: true,
    isPvp: false,
    botCount: 0,
    weapons: false,
  },
};

// ── Track / Level definitions ───────────────────────────────────────

export const TRACKS = [
  // Drag strip — procedural, always driveable
  {
    id: 'drag_strip',
    name: 'Grudge Strip',
    desc: 'Straight quarter-mile. Staging lights, pure speed.',
    theme: 'drag',
    glbFile: null,
    arenaType: 'drag',
    laps: 0,
    finishDistance: 402, // ~1/4 mile in meters
    modes: ['drag'],
    npcCount: 1,
    maxPlayers: 2,
    spawns: [
      { x: -2.5, y: 1.2, z: 0 },
      { x: 2.5, y: 1.2, z: 0 },
    ],
    checkpoints: [],
  },

  // Flat arena — battle / free drive
  {
    id: 'flat_arena',
    name: 'Grudge Arena',
    desc: 'Flat combat arena — guaranteed ground contact',
    theme: 'arena',
    glbFile: null,
    arenaType: 'flat',
    laps: 0,
    modes: ['battle', 'race', 'timeAttack'],
    npcCount: 5,
    maxPlayers: 8,
    spawns: [
      { x: 10, y: 1.2, z: 10 }, { x: -10, y: 1.2, z: 10 },
      { x: 10, y: 1.2, z: -10 }, { x: -10, y: 1.2, z: -10 },
      { x: 20, y: 1.2, z: 0 }, { x: -20, y: 1.2, z: 0 },
      { x: 0, y: 1.2, z: 20 }, { x: 0, y: 1.2, z: -20 },
    ],
    checkpoints: [],
  },

  // RVP circuit GLB when available
  {
    id: 'rvp_race',
    name: 'RVP Circuit',
    desc: 'Banked turns and elevation — full circuit',
    theme: 'race',
    glbFile: 'race_track.glb',
    arenaType: 'glb',
    laps: 3,
    modes: ['race', 'timeAttack', 'battle'],
    npcCount: 4,
    maxPlayers: 8,
    spawns: [
      { x: 0, y: 2, z: 0 }, { x: 3, y: 2, z: 0 },
      { x: 0, y: 2, z: 4 }, { x: 3, y: 2, z: 4 },
      { x: 0, y: 2, z: 8 }, { x: 3, y: 2, z: 8 },
      { x: -3, y: 2, z: 0 }, { x: -3, y: 2, z: 4 },
    ],
    checkpoints: [],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────

export function getTrackById(id) {
  return TRACKS.find(t => t.id === id) || TRACKS.find(t => t.id === 'flat_arena') || TRACKS[0];
}

export function getTracksForMode(modeId) {
  return TRACKS.filter(t => t.modes.includes(modeId));
}

export function getDefaultTrackForMode(modeId) {
  const tracks = getTracksForMode(modeId);
  if (modeId === 'drag') return tracks.find(t => t.id === 'drag_strip') || tracks[0];
  if (modeId === 'battle') return tracks.find(t => t.id === 'flat_arena') || tracks[0];
  return tracks.find(t => t.id === 'rvp_race') || tracks[0];
}

export function getAllTracks() {
  return TRACKS;
}

export function getModeById(id) {
  return GAME_MODES[id] || GAME_MODES.battle;
}
