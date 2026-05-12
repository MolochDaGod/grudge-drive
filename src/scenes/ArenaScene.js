import {
  MeshBuilder, StandardMaterial, Texture, Color3, Color4,
  HemisphericLight, DirectionalLight, Vector3, PhysicsAggregate,
  PhysicsShapeType, CubeTexture, GlowLayer, FreeCamera
} from '@babylonjs/core';

const ARENA_SIZE = 200;
const WALL_HEIGHT = 8;

export async function createArena(scene) {
  // --- Lighting ---
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.4;
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

  // --- Ground ---
  const ground = MeshBuilder.CreateGround('ground', {
    width: ARENA_SIZE, height: ARENA_SIZE, subdivisions: 4
  }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseTexture = new Texture('/assets/textures/asphalt_02_diff_1k.png', scene);
  groundMat.diffuseTexture.uScale = 20;
  groundMat.diffuseTexture.vScale = 20;
  groundMat.specularColor = new Color3(0.1, 0.1, 0.1);
  ground.material = groundMat;

  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0.1 }, scene);

  // --- Arena Walls ---
  const wallMat = new StandardMaterial('wallMat', scene);
  wallMat.diffuseTexture = new Texture('/assets/textures/Wall02.png', scene);
  wallMat.diffuseTexture.uScale = 10;
  wallMat.emissiveColor = new Color3(0.05, 0.03, 0.0);

  const wallPositions = [
    { pos: [0, WALL_HEIGHT / 2, ARENA_SIZE / 2], rot: 0, w: ARENA_SIZE },
    { pos: [0, WALL_HEIGHT / 2, -ARENA_SIZE / 2], rot: 0, w: ARENA_SIZE },
    { pos: [ARENA_SIZE / 2, WALL_HEIGHT / 2, 0], rot: Math.PI / 2, w: ARENA_SIZE },
    { pos: [-ARENA_SIZE / 2, WALL_HEIGHT / 2, 0], rot: Math.PI / 2, w: ARENA_SIZE },
  ];

  wallPositions.forEach((w, i) => {
    const wall = MeshBuilder.CreateBox(`wall${i}`, {
      width: w.w, height: WALL_HEIGHT, depth: 2
    }, scene);
    wall.position.set(...w.pos);
    wall.rotation.y = w.rot;
    wall.material = wallMat;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0, friction: 0.5, restitution: 0.3 }, scene);
  });

  // --- Ramps ---
  const rampMat = new StandardMaterial('rampMat', scene);
  rampMat.diffuseColor = new Color3(0.3, 0.25, 0.15);
  rampMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const rampPositions = [
    { pos: [30, 1.5, 30], rot: 0 },
    { pos: [-40, 1.5, -20], rot: Math.PI / 4 },
    { pos: [50, 1.5, -50], rot: -Math.PI / 3 },
    { pos: [-60, 1.5, 40], rot: Math.PI / 6 },
  ];

  rampPositions.forEach((r, i) => {
    const ramp = MeshBuilder.CreateBox(`ramp${i}`, { width: 12, height: 0.5, depth: 20 }, scene);
    ramp.position.set(...r.pos);
    ramp.rotation.y = r.rot;
    ramp.rotation.x = -0.2; // angled up
    ramp.material = rampMat;
    new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0, friction: 0.6 }, scene);
  });

  // --- Barriers / obstacles ---
  const barrierMat = new StandardMaterial('barrierMat', scene);
  barrierMat.diffuseTexture = new Texture('/assets/textures/TEX_Steel.png', scene);
  barrierMat.emissiveColor = new Color3(0.1, 0.06, 0.0);

  for (let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * (ARENA_SIZE - 20);
    const z = (Math.random() - 0.5) * (ARENA_SIZE - 20);
    const w = 3 + Math.random() * 6;
    const h = 2 + Math.random() * 3;

    const barrier = MeshBuilder.CreateBox(`barrier${i}`, { width: w, height: h, depth: w * 0.6 }, scene);
    barrier.position.set(x, h / 2, z);
    barrier.rotation.y = Math.random() * Math.PI;
    barrier.material = barrierMat;
    new PhysicsAggregate(barrier, PhysicsShapeType.BOX, { mass: 0, friction: 0.5, restitution: 0.4 }, scene);
  }

  // --- Center structure (tower/monument) ---
  const towerMat = new StandardMaterial('towerMat', scene);
  towerMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
  towerMat.emissiveColor = new Color3(0.15, 0.1, 0.02);

  const tower = MeshBuilder.CreateCylinder('tower', { diameter: 8, height: 20, tessellation: 8 }, scene);
  tower.position.y = 10;
  tower.material = towerMat;
  new PhysicsAggregate(tower, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.3 }, scene);

  // Gold ring around tower
  const ring = MeshBuilder.CreateTorus('ring', { diameter: 14, thickness: 0.5, tessellation: 32 }, scene);
  ring.position.y = 18;
  const ringMat = new StandardMaterial('ringMat', scene);
  ringMat.emissiveColor = new Color3(0.8, 0.6, 0.1);
  ringMat.disableLighting = true;
  ring.material = ringMat;

  // --- Item pickup zones (visual) ---
  const pickupMat = new StandardMaterial('pickupMat', scene);
  pickupMat.emissiveColor = new Color3(0.2, 0.6, 0.8);
  pickupMat.alpha = 0.3;
  pickupMat.disableLighting = true;

  const pickupSpots = [
    [40, 0.1, 0], [-40, 0.1, 0], [0, 0.1, 40], [0, 0.1, -40],
    [60, 0.1, 60], [-60, 0.1, -60], [60, 0.1, -60], [-60, 0.1, 60],
  ];

  pickupSpots.forEach((p, i) => {
    const disc = MeshBuilder.CreateDisc(`pickup${i}`, { radius: 4, tessellation: 6 }, scene);
    disc.position.set(...p);
    disc.rotation.x = Math.PI / 2;
    disc.material = pickupMat;
    // Store for gameplay pickup detection
    disc.metadata = { type: 'pickup', index: i };
  });

  // --- Fog ---
  scene.fogMode = 4; // exponential2
  scene.fogDensity = 0.003;
  scene.fogColor = new Color3(0.04, 0.04, 0.05);

  return { ground, ARENA_SIZE };
}
