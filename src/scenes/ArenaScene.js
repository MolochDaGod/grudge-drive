import {
  MeshBuilder, StandardMaterial, Texture, Color3, Color4,
  HemisphericLight, DirectionalLight, Vector3, PhysicsAggregate,
  PhysicsShapeType, PhysicsShapeMesh, GlowLayer, SceneLoader
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

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
  try {
    skyMat.emissiveTexture = new Texture('/assets/textures/panoramic_toon_sky.png', scene);
    skyMat.emissiveTexture.coordinatesMode = Texture.SPHERICAL_MODE;
  } catch (_) {
    skyMat.emissiveColor = new Color3(0.05, 0.05, 0.1);
  }
  const skybox = MeshBuilder.CreateSphere('skybox', { diameter: 800, segments: 32 }, scene);
  skybox.material = skyMat;
  skybox.infiniteDistance = true;

  // --- Load the real race track GLB ---
  let trackGround = null;
  try {
    const result = await SceneLoader.ImportMeshAsync('', '/', 'race_track.glb', scene);
    const trackMeshes = result.meshes;

    // Add physics collision to every mesh in the track
    trackMeshes.forEach(mesh => {
      if (!mesh.geometry) return; // skip transform nodes
      mesh.checkCollisions = true;
      mesh.isPickable = true;

      // Use MESH shape for accurate collision with the track geometry
      try {
        new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
          mass: 0, friction: 0.8, restitution: 0.1
        }, scene);
      } catch (_) {
        // Fallback: use convex hull if mesh shape fails
        try {
          new PhysicsAggregate(mesh, PhysicsShapeType.CONVEX_HULL, {
            mass: 0, friction: 0.8, restitution: 0.1
          }, scene);
        } catch (__) {
          // Skip physics for this mesh
        }
      }
    });

    trackGround = trackMeshes[0];
    console.log(`[Arena] Loaded race track: ${trackMeshes.length} meshes`);
  } catch (e) {
    console.warn('[Arena] race_track.glb failed, creating fallback ground:', e);

    // Fallback flat ground
    trackGround = MeshBuilder.CreateGround('fallbackGround', {
      width: ARENA_SIZE, height: ARENA_SIZE, subdivisions: 4
    }, scene);
    const gndMat = new StandardMaterial('gndMat', scene);
    gndMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    trackGround.material = gndMat;
    new PhysicsAggregate(trackGround, PhysicsShapeType.BOX, {
      mass: 0, friction: 0.8, restitution: 0.1
    }, scene);
  }

  // --- Safety ground plane (catches cars that fall through track) ---
  const safetyGround = MeshBuilder.CreateGround('safetyGround', {
    width: ARENA_SIZE * 2, height: ARENA_SIZE * 2
  }, scene);
  safetyGround.position.y = -5;
  safetyGround.isVisible = false;
  new PhysicsAggregate(safetyGround, PhysicsShapeType.BOX, {
    mass: 0, friction: 0.8, restitution: 0.1
  }, scene);

  // --- Invisible boundary walls (keep cars from falling off the map) ---
  const half = ARENA_SIZE / 2;
  [{ p: [0, 7, half], r: 0 }, { p: [0, 7, -half], r: 0 },
   { p: [half, 7, 0], r: Math.PI / 2 }, { p: [-half, 7, 0], r: Math.PI / 2 }]
  .forEach((w, i) => {
    const wall = MeshBuilder.CreateBox(`wall${i}`, { width: ARENA_SIZE + 4, height: 14, depth: 2 }, scene);
    wall.position.set(...w.p);
    wall.rotation.y = w.r;
    wall.isVisible = false;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0, friction: 0.3, restitution: 0.5 }, scene);
  });

  // --- Fog ---
  scene.fogMode = 4;
  scene.fogDensity = 0.002;
  scene.fogColor = new Color3(0.04, 0.04, 0.05);

  return { ground: trackGround, ARENA_SIZE };
}
