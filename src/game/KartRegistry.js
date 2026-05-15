/**
 * KartRegistry — All driveable vehicles across all packs.
 *
 * 45 total vehicles across 4 tiers:
 *   S (6) — Race-locked signature karts from angry_birds GLB
 *   A (13) — Kenney car-kit go-karts + racing-kit race cars
 *   B (17) — Toy-car-kit + car-kit utility vehicles
 *   C (10) — Starter-kit trucks + tractors
 */

export function statsToPhysics(stats) {
  return {
    maxSpeed:     20 + (stats.topSpeed / 100) * 40,
    acceleration: 15 + (stats.acceleration / 100) * 25,
    turnSpeed:    1.5 + (stats.handling / 100) * 2.0,
    nitroDrain:   15 + ((100 - stats.nitroCapacity) / 100) * 20,
    nitroRegen:   5 + (stats.nitroCapacity / 100) * 10,
    maxHealth:    60 + (stats.armor / 100) * 80,
    mass:         50 + ((100 - stats.handling) / 100) * 60,
    friction:     0.5 + (stats.handling / 100) * 0.3,
  };
}

const P = {
  AB:    '/angry_birds_go_kart_pack.glb',
  CAR:   '/assets/kenney/car-kit/Models/GLB format',
  RACE:  '/assets/kenney/racing-kit/Models/GLTF format',
  TOY:   '/assets/kenney/toy-car-kit/Models/GLB format',
  START: '/assets/kenney/starter-kit-racing/models',
  RETRO: '/assets/kenney/retro-urban-kit/Models/GLB format',
};

function kart(id, name, tier, restrict, src, path, prefix, sp, ac, hn, ni, ar, weapon, passive, paint) {
  return {
    id, kartName: name, tier,
    raceRestriction: restrict, classRestriction: 'any',
    source: src, glbPath: path, meshPrefix: prefix,
    stats: { topSpeed: sp, acceleration: ac, handling: hn, nitroCapacity: ni, armor: ar },
    weapon: weapon || null, passive: passive || null,
    paintPrimary: paint?.[0] || null, paintSecondary: paint?.[1] || null,
    paintEmissive: paint?.[2] || null, accentHex: paint?.[3] || '#aaa',
  };
}

export const ALL_KARTS = [
  // ── TIER S: Race signature karts ──
  kart('wk_chariot','War Chariot','S','wk','angry_birds',P.AB,'mesh_33', 75,60,55,80,90,
    { name:'Shield Bash Ram', type:'ram', damage:25, cooldown:4, desc:'Invincible charge knocking enemies aside' },
    { name:'Iron Will', desc:'20% damage reduction', damageReduction:0.20 },
    [[.80,.60,.10],[.20,.15,.05],[.15,.10,.02],'#c9952a']),
  kart('elf_windrunner','Windrunner','S','elf','angry_birds',P.AB,'mesh_31', 95,85,90,70,50,
    { name:'Thorn Volley', type:'projectile_burst', damage:8, projectiles:5, cooldown:3, desc:'Spread of piercing enchanted thorns' },
    { name:'Sylvan Speed', desc:'Nitro recharges 40% faster', nitroRegenBonus:0.40 },
    [[.10,.54,.29],[.05,.30,.15],[.02,.14,.06],'#1a8a4a']),
  kart('brb_crusher','Skull Crusher','S','brb','angry_birds',P.AB,'mesh_3', 70,80,45,100,85,
    { name:'Berserker Flail', type:'melee_spin', damage:18, radius:6, cooldown:5, desc:'AoE flail spin around the kart' },
    { name:'Blood Rage', desc:'30% more damage below 40% HP', lowHpDamageBonus:0.30, lowHpThreshold:0.40 },
    [[.55,.10,.10],[.30,.05,.05],[.14,.02,.02],'#8b1a1a']),
  kart('orc_rig','Swamp Rig','S','orc','angry_birds',P.AB,'mesh_36', 65,70,60,90,95,
    { name:'Toxin Launcher', type:'projectile_aoe', damage:12, splashRadius:8, cooldown:4, desc:'Toxic bomb that poisons and slows' },
    { name:'Thick Hide', desc:'50% more ram knockback', ramKnockbackBonus:0.50 },
    [[.29,.42,.16],[.15,.22,.08],[.06,.10,.02],'#4a6b2a']),
  kart('ud_phantom','Phantom Racer','S','ud','angry_birds',P.AB,'mesh_34', 85,75,80,60,55,
    { name:'Soul Drain', type:'beam', damagePerSec:15, range:20, cooldown:6, desc:'Spectral beam that steals health' },
    { name:'Spectral Drift', desc:'Phase through obstacles for 2s on nitro', phaseOnNitroDuration:2.0 },
    [[.42,.23,.54],[.22,.12,.30],[.12,.05,.16],'#6a3a8a']),
  kart('dwf_forge','Iron Forge','S','dwf','angry_birds',P.AB,'mesh_1', 60,65,70,85,100,
    { name:'Mine Layer', type:'trap', damage:30, maxMines:3, cooldown:3, desc:'Proximity mines that detonate on drive-over' },
    { name:'Runic Shields', desc:'Regen 3 armor/sec after 4s no damage', regenPerSec:3, regenDelay:4 },
    [[.55,.41,.08],[.30,.22,.04],[.12,.08,.01],'#8b6914']),

  // ── TIER A: Kenney car-kit karts + racing-kit ──
  kart('kart_oobi','Oobi Kart','A','any','kenney_car',`${P.CAR}/kart-oobi.glb`,null, 82,78,85,75,55),
  kart('kart_oodi','Oodi Kart','A','any','kenney_car',`${P.CAR}/kart-oodi.glb`,null, 78,82,80,80,58),
  kart('kart_ooli','Ooli Kart','A','any','kenney_car',`${P.CAR}/kart-ooli.glb`,null, 85,75,82,70,52),
  kart('kart_oopi','Oopi Kart','A','any','kenney_car',`${P.CAR}/kart-oopi.glb`,null, 80,80,78,82,56),
  kart('kart_oozi','Oozi Kart','A','any','kenney_car',`${P.CAR}/kart-oozi.glb`,null, 88,72,75,68,60),
  kart('race_car','Race Car','A','any','kenney_car',`${P.CAR}/race.glb`,null, 90,85,70,65,45),
  kart('race_future','Future Racer','A','any','kenney_car',`${P.CAR}/race-future.glb`,null, 95,88,68,60,40),
  kart('hatch_sport','Sport Hatch','A','any','kenney_car',`${P.CAR}/hatchback-sports.glb`,null, 80,82,85,72,55),
  kart('sedan_sport','Sport Sedan','A','any','kenney_car',`${P.CAR}/sedan-sports.glb`,null, 78,76,82,78,62),
  kart('rc_green','Racer Green','A','any','kenney_racing',`${P.RACE}/raceCarGreen.glb`,null, 88,84,72,68,48),
  kart('rc_orange','Racer Orange','A','any','kenney_racing',`${P.RACE}/raceCarOrange.glb`,null, 86,86,74,70,50),
  kart('rc_red','Racer Red','A','any','kenney_racing',`${P.RACE}/raceCarRed.glb`,null, 92,82,70,65,45),
  kart('rc_white','Racer White','A','any','kenney_racing',`${P.RACE}/raceCarWhite.glb`,null, 84,88,76,72,52),

  // ── TIER B: Toy-car-kit + car-kit utility ──
  kart('drag_racer','Drag Racer','B','any','kenney_toy',`${P.TOY}/vehicle-drag-racer.glb`,null, 95,90,40,50,35),
  kart('monster_truck','Monster Truck','B','any','kenney_toy',`${P.TOY}/vehicle-monster-truck.glb`,null, 55,50,45,85,95),
  kart('racer_low','Low Racer','B','any','kenney_toy',`${P.TOY}/vehicle-racer-low.glb`,null, 88,82,75,60,42),
  kart('racer_toy','Toy Racer','B','any','kenney_toy',`${P.TOY}/vehicle-racer.glb`,null, 82,78,80,65,48),
  kart('speedster','Speedster','B','any','kenney_toy',`${P.TOY}/vehicle-speedster.glb`,null, 92,85,65,55,38),
  kart('toy_suv','Toy SUV','B','any','kenney_toy',`${P.TOY}/vehicle-suv.glb`,null, 62,60,72,78,80),
  kart('toy_truck','Toy Truck','B','any','kenney_toy',`${P.TOY}/vehicle-truck.glb`,null, 58,55,65,82,85),
  kart('vintage_racer','Vintage Racer','B','any','kenney_toy',`${P.TOY}/vehicle-vintage-racer.glb`,null, 75,70,78,72,55),
  kart('suv_luxury','Luxury SUV','B','any','kenney_car',`${P.CAR}/suv-luxury.glb`,null, 68,62,70,75,82),
  kart('suv_std','SUV','B','any','kenney_car',`${P.CAR}/suv.glb`,null, 65,60,68,78,85),
  kart('sedan_std','Sedan','B','any','kenney_car',`${P.CAR}/sedan.glb`,null, 72,68,75,80,70),
  kart('taxi','Taxi','B','any','kenney_car',`${P.CAR}/taxi.glb`,null, 70,72,78,82,65),
  kart('police','Police Cruiser','B','any','kenney_car',`${P.CAR}/police.glb`,null, 82,78,72,70,75),
  kart('ambulance','Ambulance','B','any','kenney_car',`${P.CAR}/ambulance.glb`,null, 68,65,62,85,88),
  kart('firetruck','Fire Truck','B','any','kenney_car',`${P.CAR}/firetruck.glb`,null, 55,50,48,90,95),
  kart('van','Van','B','any','kenney_car',`${P.CAR}/van.glb`,null, 60,58,65,85,82),
  kart('garbage_truck','Garbage Truck','B','any','kenney_car',`${P.CAR}/garbage-truck.glb`,null, 45,42,50,95,100),

  // ── TIER C: Starter-kit + tractors ──
  kart('motorcycle','Motorcycle','C','any','kenney_starter',`${P.START}/vehicle-motorcycle.glb`,null, 88,90,92,50,25),
  kart('truck_green','Green Truck','C','any','kenney_starter',`${P.START}/vehicle-truck-green.glb`,null, 55,52,58,85,80),
  kart('truck_purple','Purple Truck','C','any','kenney_starter',`${P.START}/vehicle-truck-purple.glb`,null, 58,55,60,82,78),
  kart('truck_red','Red Truck','C','any','kenney_starter',`${P.START}/vehicle-truck-red.glb`,null, 60,58,55,80,82),
  kart('truck_yellow','Yellow Truck','C','any','kenney_starter',`${P.START}/vehicle-truck-yellow.glb`,null, 56,54,62,84,76),
  kart('tractor','Tractor','C','any','kenney_car',`${P.CAR}/tractor.glb`,null, 35,30,55,95,100),
  kart('tractor_shovel','Shovel Tractor','C','any','kenney_car',`${P.CAR}/tractor-shovel.glb`,null, 32,28,50,98,100),
  kart('tractor_police','Police Tractor','C','any','kenney_car',`${P.CAR}/tractor-police.glb`,null, 38,35,58,90,95),
  kart('truck_flat','Flatbed Truck','C','any','kenney_car',`${P.CAR}/truck-flat.glb`,null, 50,48,52,88,90),
  kart('truck_std','Truck','C','any','kenney_car',`${P.CAR}/truck.glb`,null, 55,50,55,85,88),
];

// ── Lookup helpers ──────────────────────────────────────────────────

export function getKartById(id) { return ALL_KARTS.find(k => k.id === id) || ALL_KARTS[0]; }
export function getKartForRace(raceId) { return ALL_KARTS.find(k => k.raceRestriction === raceId && k.tier === 'S') || ALL_KARTS[0]; }
export function getAvailableKarts(raceId) { return ALL_KARTS.filter(k => k.raceRestriction === 'any' || k.raceRestriction === raceId); }
export function getKartsByTier(tier) { return ALL_KARTS.filter(k => k.tier === tier); }
export function getAllKarts() { return ALL_KARTS; }
export function randomKartFromTier(tier) { const p = getKartsByTier(tier); return p[Math.floor(Math.random() * p.length)]; }
export function paintToColor3(paint) { return paint ? { r: paint[0], g: paint[1], b: paint[2] } : { r: 0.5, g: 0.5, b: 0.5 }; }
