import {
  MeshBuilder, StandardMaterial, Texture, Color3, Color4,
  HemisphericLight, DirectionalLight, Vector3, PhysicsAggregate,
  PhysicsShapeType, GlowLayer, SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const ARENA_SIZE = 200;

/**
 * Build arena / track for a match.
 * @param {Scene} scene
 * @param {string|null} trackGlbFile
 * @param {{ arenaType?: string, finishDistance?: number }} [opts]
 */
export async function createArena(scene, trackGlbFile = null, opts = {}) {
  const arenaType = opts.arenaType || (trackGlbFile ? 'glb' : 'flat');

  // --- Lighting ---
  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.5;
  hemi.diffuse = new Color3(0.75, 0.7, 0.85);
  hemi.groundColor = new Color3(0.12, 0.1, 0.15);

  const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.25), scene);
  sun.intensity = 1.25;
  sun.diffuse = new Color3(1, 0.88, 0.65);

  const glow = new GlowLayer('glow', scene);
  glow.intensity = 0.55;

  // --- Skybox ---
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  try {
    skyMat.emissiveTexture = new Texture('/assets/textures/panoramic_toon_sky.png', scene);
    skyMat.emissiveTexture.coordinatesMode = Texture.SPHERICAL_MODE;
  } catch (_) {
    skyMat.emissiveColor = new Color3(0.05, 0.05, 0.1);
  }
  const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 1200, segments: 32 }, scene);
  skybox.material = skyMat;
  skybox.infiniteDistance = true;

  let trackGround = null;

  if (arenaType === 'drag') {
    trackGround = _buildDragStrip(scene, opts.finishDistance || 402);
  } else if (trackGlbFile) {
    try {
      const result = await SceneLoader.ImportMeshAsync('', '/', trackGlbFile, scene);
      const trackMeshes = result.meshes;
      trackMeshes.forEach(mesh => {
        if (!mesh.geometry) return;
        mesh.checkCollisions = true;
        mesh.isPickable = true;
        try {
          new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
            mass: 0, friction: 0.85, restitution: 0.05
          }, scene);
        } catch (_) {
          try {
            new PhysicsAggregate(mesh, PhysicsShapeType.CONVEX_HULL, {
              mass: 0, friction: 0.85, restitution: 0.05
            }, scene);
          } catch (__) { /* skip */ }
        }
      });
      trackGround = trackMeshes[0];
      console.log(`[Arena] Loaded track GLB: ${trackMeshes.length} meshes`);
    } catch (e) {
      console.warn('[Arena] GLB failed, flat fallback:', e);
      trackGround = _buildFlatGround(scene, ARENA_SIZE);
    }
  } else {
    trackGround = _buildFlatGround(scene, ARENA_SIZE);
  }

  // Safety plane under everything
  const safetyGround = MeshBuilder.CreateGround('safetyGround', {
    width: ARENA_SIZE * 4, height: ARENA_SIZE * 4
  }, scene);
  safetyGround.position.y = -4;
  safetyGround.isVisible = false;
  new PhysicsAggregate(safetyGround, PhysicsShapeType.BOX, {
    mass: 0, friction: 0.8, restitution: 0.05
  }, scene);

  // Boundary walls (skip long drag strip — use side rails instead)
  if (arenaType !== 'drag') {
    const half = ARENA_SIZE / 2;
    [{ p: [0, 7, half], r: 0 }, { p: [0, 7, -half], r: 0 },
     { p: [half, 7, 0], r: Math.PI / 2 }, { p: [-half, 7, 0], r: Math.PI / 2 }]
    .forEach((w, i) => {
      const wall = MeshBuilder.CreateBox(`wall${i}`, { width: ARENA_SIZE + 4, height: 14, depth: 2 }, scene);
      wall.position.set(...w.p);
      wall.rotation.y = w.r;
      wall.isVisible = false;
      new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0, friction: 0.3, restitution: 0.4 }, scene);
    });
  }

  scene.fogMode = 4;
  scene.fogDensity = arenaType === 'drag' ? 0.0012 : 0.002;
  scene.fogColor = new Color3(0.04, 0.04, 0.05);

  return { ground: trackGround, ARENA_SIZE, arenaType };
}

function _buildFlatGround(scene, size) {
  const ground = MeshBuilder.CreateGround('flatGround', {
    width: size, height: size, subdivisions: 8
  }, scene);
  const mat = new StandardMaterial('flatGndMat', scene);
  mat.diffuseColor = new Color3(0.18, 0.17, 0.2);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  ground.material = mat;
  ground.checkCollisions = true;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, {
    mass: 0, friction: 0.9, restitution: 0.05
  }, scene);

  // Subtle grid lines via asphalt texture look
  _paintLaneMarkers(scene, size * 0.45, 0);

  return ground;
}

/**
 * Quarter-mile drag strip: asphalt + lanes + finish gate + side rails.
 * Race direction: +Z from z=0 start to z=finishDistance.
 */
function _buildDragStrip(scene, finishDistance = 402) {
  const length = finishDistance + 80;
  const width = 18;
  const mid = finishDistance / 2;

  // Main asphalt
  const ground = MeshBuilder.CreateGround('dragAsphalt', {
    width, height: length, subdivisions: 4
  }, scene);
  ground.position.set(0, 0, mid - 20);
  const mat = new StandardMaterial('dragAsphaltMat', scene);
  mat.diffuseColor = new Color3(0.12, 0.12, 0.13);
  mat.specularColor = new Color3(0.08, 0.08, 0.08);
  ground.material = mat;
  ground.checkCollisions = true;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, {
    mass: 0, friction: 1.05, restitution: 0.02
  }, scene);

  // Lane divider (center dashed look)
  const center = MeshBuilder.CreateBox('laneCenter', {
    width: 0.25, height: 0.02, depth: finishDistance
  }, scene);
  center.position.set(0, 0.02, finishDistance / 2);
  const lineMat = new StandardMaterial('laneLineMat', scene);
  lineMat.emissiveColor = new Color3(0.95, 0.85, 0.2);
  lineMat.disableLighting = true;
  center.material = lineMat;

  // Start line
  const startLine = MeshBuilder.CreateBox('startLine', {
    width: width - 2, height: 0.03, depth: 0.6
  }, scene);
  startLine.position.set(0, 0.03, 0);
  const startMat = new StandardMaterial('startLineMat', scene);
  startMat.emissiveColor = new Color3(0.9, 0.9, 0.95);
  startMat.disableLighting = true;
  startLine.material = startMat;

  // Finish line (checkered block)
  const finish = MeshBuilder.CreateBox('finishLine', {
    width: width - 2, height: 0.04, depth: 1.2
  }, scene);
  finish.position.set(0, 0.04, finishDistance);
  const finMat = new StandardMaterial('finishLineMat', scene);
  finMat.emissiveColor = new Color3(0.95, 0.55, 0.1);
  finMat.disableLighting = true;
  finish.material = finMat;

  // Finish pylons
  [-7, 7].forEach((x, i) => {
    const pylon = MeshBuilder.CreateBox(`finishPylon${i}`, {
      width: 0.6, height: 6, depth: 0.6
    }, scene);
    pylon.position.set(x, 3, finishDistance);
    const pMat = new StandardMaterial(`pylonMat${i}`, scene);
    pMat.emissiveColor = new Color3(0.9, 0.2, 0.1);
    pMat.disableLighting = true;
    pylon.material = pMat;
  });

  // Side rails
  const railLen = length;
  [-width / 2 - 0.5, width / 2 + 0.5].forEach((x, i) => {
    const rail = MeshBuilder.CreateBox(`dragRail${i}`, {
      width: 0.8, height: 1.2, depth: railLen
    }, scene);
    rail.position.set(x, 0.6, mid - 20);
    const rMat = new StandardMaterial(`railMat${i}`, scene);
    rMat.diffuseColor = new Color3(0.55, 0.12, 0.1);
    rMat.emissiveColor = new Color3(0.15, 0.03, 0.02);
    rail.material = rMat;
    new PhysicsAggregate(rail, PhysicsShapeType.BOX, {
      mass: 0, friction: 0.4, restitution: 0.3
    }, scene);
  });

  // Staging lights tower
  const tower = MeshBuilder.CreateBox('stageTower', {
    width: 1.2, height: 5, depth: 1.2
  }, scene);
  tower.position.set(8, 2.5, -4);
  const tMat = new StandardMaterial('towerMat', scene);
  tMat.diffuseColor = new Color3(0.2, 0.2, 0.22);
  tower.material = tMat;

  // Distance markers every 100m
  for (let d = 100; d < finishDistance; d += 100) {
    const marker = MeshBuilder.CreateBox(`dist_${d}`, {
      width: width - 4, height: 0.02, depth: 0.25
    }, scene);
    marker.position.set(0, 0.02, d);
    const mMat = new StandardMaterial(`distMat_${d}`, scene);
    mMat.emissiveColor = new Color3(0.4, 0.4, 0.45);
    mMat.disableLighting = true;
    marker.material = mMat;
  }

  return ground;
}

function _paintLaneMarkers(scene, radius, y) {
  // Decorative ring for arena
  try {
    const ring = MeshBuilder.CreateTorus('arenaRing', {
      diameter: radius * 1.6, thickness: 0.4, tessellation: 48
    }, scene);
    ring.position.y = y + 0.05;
    ring.rotation.x = Math.PI / 2;
    const mat = new StandardMaterial('ringMat', scene);
    mat.emissiveColor = new Color3(0.5, 0.35, 0.08);
    mat.disableLighting = true;
    mat.alpha = 0.35;
    ring.material = mat;
  } catch (_) { /* optional */ }
}
