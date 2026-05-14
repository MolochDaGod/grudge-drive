import {
  MeshBuilder, StandardMaterial, Texture, Color3, Color4,
  HemisphericLight, DirectionalLight, Vector3, PhysicsAggregate,
  PhysicsShapeType, GlowLayer
} from '@babylonjs/core';
import { createTerrain, getTerrainHeight } from '../game/TerrainGenerator.js';

const ARENA_SIZE = 200;
const WALL_HEIGHT = 14;  // taller to account for terrain peaks

export async function createArena(scene) {
  // --- Lighting ---
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  hemi.diffuse = new Color3(0.7, 0.65, 0.8);
  hemi.groundColor = new Color3(0.15, 0.1, 0.2);

  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.3), scene);
  sun.intensity = 1.2;
  sun.diffuse = new Color3(1, 0.85, 0.6);

  // Glow for projectiles/effects
  const glow = new GlowLayer('glow', scene);
  glow.intensity = 0.6;

  // --- Skybox ---
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.emissiveTexture = new Texture('/assets/textures/panoramic_toon_sky.png', scene);
  skyMat.emissiveTexture.coordinatesMode = Texture.SPHERICAL_MODE;

  const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 800, segments: 32 }, scene);
  skybox.material = skyMat;
  skybox.infiniteDistance = true;

  // --- Terrain (replaces flat ground) ---
  const terrain = createTerrain(scene);

  // --- Arena Walls (raised to contain hilly terrain) ---
  const wallMat = new StandardMaterial('wallMat', scene);
  try {
    wallMat.diffuseTexture = new Texture('/assets/textures/Wall02.png', scene);
    wallMat.diffuseTexture.uScale = 10;
  } catch (_) { /* fallback */ }
  wallMat.emissiveColor = new Color3(0.05, 0.03, 0.0);

  const half = ARENA_SIZE / 2;
  const wallDefs = [
    { pos: [0, WALL_HEIGHT / 2, half], rot: 0, w: ARENA_SIZE + 4 },
    { pos: [0, WALL_HEIGHT / 2, -half], rot: 0, w: ARENA_SIZE + 4 },
    { pos: [half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2, w: ARENA_SIZE + 4 },
    { pos: [-half, WALL_HEIGHT / 2, 0], rot: Math.PI / 2, w: ARENA_SIZE + 4 },
  ];

  wallDefs.forEach((w, i) => {
    const wall = MeshBuilder.CreateBox(`wall${i}`, {
      width: w.w, height: WALL_HEIGHT, depth: 2
    }, scene);
    wall.position.set(...w.pos);
    wall.rotation.y = w.rot;
    wall.material = wallMat;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0, friction: 0.5, restitution: 0.3 }, scene);
  });

  // --- Ramps (placed on terrain surface) ---
  const rampMat = new StandardMaterial('rampMat', scene);
  rampMat.diffuseColor = new Color3(0.3, 0.25, 0.15);
  rampMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const rampDefs = [
    { x: 30, z: 30, rot: 0 },
    { x: -40, z: -20, rot: Math.PI / 4 },
    { x: 50, z: -50, rot: -Math.PI / 3 },
    { x: -60, z: 40, rot: Math.PI / 6 },
  ];

  rampDefs.forEach((r, i) => {
    const h = getTerrainHeight(r.x, r.z);
    const ramp = MeshBuilder.CreateBox(`ramp${i}`, { width: 12, height: 0.5, depth: 20 }, scene);
    ramp.position.set(r.x, h + 1.2, r.z);
    ramp.rotation.y = r.rot;
    ramp.rotation.x = -0.22;
    ramp.material = rampMat;
    new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, scene);
  });

  // --- Barriers / obstacles (placed on terrain) ---
  const barrierMat = new StandardMaterial('barrierMat', scene);
  try {
    barrierMat.diffuseTexture = new Texture('/assets/textures/TEX_Steel.png', scene);
  } catch (_) { /* fallback */ }
  barrierMat.emissiveColor = new Color3(0.1, 0.06, 0.0);

  // Use a seeded-ish deterministic scatter so barriers don't overlap spawn
  const barrierSeeds = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2 + i * 0.7;
    const dist = 30 + (i % 5) * 15 + (i * 7 % 11);
    barrierSeeds.push({ x: Math.cos(angle) * dist, z: Math.sin(angle) * dist });
  }

  barrierSeeds.forEach((s, i) => {
    const x = Math.max(-85, Math.min(85, s.x));
    const z = Math.max(-85, Math.min(85, s.z));
    const w = 3 + (i * 3 % 6);
    const h = 2 + (i * 2 % 3);
    const terrY = getTerrainHeight(x, z);

    const barrier = MeshBuilder.CreateBox(`barrier${i}`, { width: w, height: h, depth: w * 0.6 }, scene);
    barrier.position.set(x, terrY + h / 2, z);
    barrier.rotation.y = i * 0.8;
    barrier.material = barrierMat;
    new PhysicsAggregate(barrier, PhysicsShapeType.BOX, { mass: 0, friction: 0.5, restitution: 0.4 }, scene);
  });

  // --- Center structure (tower/monument) ---
  const towerMat = new StandardMaterial('towerMat', scene);
  towerMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
  towerMat.emissiveColor = new Color3(0.15, 0.1, 0.02);

  const towerH = 20;
  const towerBaseY = getTerrainHeight(0, 0);
  const tower = MeshBuilder.CreateCylinder('tower', { diameter: 8, height: towerH, tessellation: 8 }, scene);
  tower.position.y = towerBaseY + towerH / 2;
  tower.material = towerMat;
  new PhysicsAggregate(tower, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.3 }, scene);

  const ring = MeshBuilder.CreateTorus('ring', { diameter: 14, thickness: 0.5, tessellation: 32 }, scene);
  ring.position.y = towerBaseY + towerH - 2;
  const ringMat = new StandardMaterial('ringMat', scene);
  ringMat.emissiveColor = new Color3(0.8, 0.6, 0.1);
  ringMat.disableLighting = true;
  ring.material = ringMat;

  // --- Item pickup zones (on terrain) ---
  const pickupMat = new StandardMaterial('pickupMat', scene);
  pickupMat.emissiveColor = new Color3(0.2, 0.6, 0.8);
  pickupMat.alpha = 0.3;
  pickupMat.disableLighting = true;

  const pickupCoords = [
    [40, 0], [-40, 0], [0, 40], [0, -40],
    [60, 60], [-60, -60], [60, -60], [-60, 60],
  ];

  pickupCoords.forEach((p, i) => {
    const py = getTerrainHeight(p[0], p[1]) + 0.15;
    const disc = MeshBuilder.CreateDisc(`pickup${i}`, { radius: 4, tessellation: 6 }, scene);
    disc.position.set(p[0], py, p[1]);
    disc.rotation.x = Math.PI / 2;
    disc.material = pickupMat;
    disc.metadata = { type: 'pickup', index: i };
  });

  // --- Fog ---
  scene.fogMode = 4;
  scene.fogDensity = 0.0025;
  scene.fogColor = new Color3(0.04, 0.04, 0.05);

  return { ground: terrain.ground, ARENA_SIZE };
}
