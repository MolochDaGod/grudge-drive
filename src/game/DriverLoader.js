/**
 * DriverLoader — Loads Grudge 6 race character GLBs as seated kart drivers.
 *
 * Character models:
 *   /models/drivers/wk.glb  — Human (Warkind)
 *   /models/drivers/elf.glb — Elf
 *   /models/drivers/brb.glb — Barbarian
 *   /models/drivers/orc.glb — Orc
 *   /models/drivers/ud.glb  — Undead
 *   /models/drivers/dwf.glb — Dwarf
 *
 * Each character is loaded once, cached, then cloned per kart.
 * The driver is scaled and positioned to sit in the kart seat.
 */

import { SceneLoader, TransformNode, Vector3, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';

const DRIVER_PATHS = {
  wk:  '/models/drivers/wk.glb',
  elf: '/models/drivers/elf.glb',
  brb: '/models/drivers/brb.glb',
  orc: '/models/drivers/orc.glb',
  ud:  '/models/drivers/ud.glb',
  dwf: '/models/drivers/dwf.glb',
};

// Cache loaded containers per race
const _driverCache = {};

/**
 * Load a Grudge race character and parent it to a kart root.
 * The character is scaled to fit a seated driving position.
 *
 * @param {Scene} scene
 * @param {string} raceId — one of 'wk','elf','brb','orc','ud','dwf'
 * @param {TransformNode} kartRoot — the kart's root transform to parent to
 * @param {string} [suffix=''] — unique suffix for cloned mesh names
 * @returns {Promise<TransformNode>} — the driver root node (dispose to remove)
 */
export async function loadDriver(scene, raceId, kartRoot, suffix = '') {
  const path = DRIVER_PATHS[raceId] || DRIVER_PATHS.wk;

  // Load or get cached container
  let container = _driverCache[raceId];
  if (!container) {
    try {
      const dir = path.substring(0, path.lastIndexOf('/') + 1);
      const file = path.substring(path.lastIndexOf('/') + 1);
      container = await SceneLoader.LoadAssetContainerAsync(dir, file, scene);
      _driverCache[raceId] = container;
    } catch (e) {
      console.warn(`[DriverLoader] Failed to load ${path}:`, e);
      return _buildFallbackDriver(scene, kartRoot, suffix);
    }
  }

  // Create a driver root parented to the kart
  const driverRoot = new TransformNode(`driver_${raceId}${suffix}`, scene);
  driverRoot.parent = kartRoot;

  // Clone all meshes from the character into the driver root
  for (const mesh of container.meshes) {
    if (!mesh.geometry) continue;
    const clone = mesh.clone(`${mesh.name}_drv${suffix}`, driverRoot);
    if (clone) {
      clone.isPickable = false;
    }
  }

  // Clone skeleton + animations if present
  if (container.skeletons?.length > 0) {
    container.skeletons.forEach(skel => {
      const clonedSkel = skel.clone(`skel_drv${suffix}`);
      // Link to cloned meshes
      driverRoot.getChildMeshes().forEach(m => {
        if (m.skeleton?.name === skel.name) {
          m.skeleton = clonedSkel;
        }
      });
    });
  }

  // Play idle animation if available
  if (container.animationGroups?.length > 0) {
    const idle = container.animationGroups.find(ag =>
      ag.name.toLowerCase().includes('idle')
    ) || container.animationGroups[0];
    if (idle) {
      const clonedAnim = idle.clone(`anim_drv${suffix}`);
      clonedAnim.play(true);
    }
  }

  // Position: seated in kart cockpit
  // Scale down to fit kart proportions (~0.8m tall seated)
  driverRoot.scaling.setAll(0.5);
  driverRoot.position.set(0, 1.0, -0.1);
  // Face forward
  driverRoot.rotation.y = Math.PI;

  return driverRoot;
}

/**
 * Pre-warm the cache for all 6 races.
 * Call during loading screen.
 */
export async function preloadAllDrivers(scene) {
  const promises = Object.entries(DRIVER_PATHS).map(async ([raceId, path]) => {
    if (_driverCache[raceId]) return;
    try {
      const dir = path.substring(0, path.lastIndexOf('/') + 1);
      const file = path.substring(path.lastIndexOf('/') + 1);
      _driverCache[raceId] = await SceneLoader.LoadAssetContainerAsync(dir, file, scene);
    } catch (e) {
      console.warn(`[DriverLoader] Pre-load failed for ${raceId}:`, e);
    }
  });
  await Promise.allSettled(promises);
}

/**
 * Fallback: simple geometric driver if GLB fails to load.
 */
function _buildFallbackDriver(scene, kartRoot, suffix) {
  const root = new TransformNode(`driver_fallback${suffix}`, scene);
  root.parent = kartRoot;
  root.position.set(0, 1.2, -0.2);

  const head = MeshBuilder.CreateSphere(`fbHead${suffix}`, { diameter: 0.35, segments: 6 }, scene);
  head.parent = root;
  head.position.y = 0.7;
  const mat = new StandardMaterial(`fbHeadMat${suffix}`, scene);
  mat.diffuseColor = new Color3(0.7, 0.6, 0.5);
  head.material = mat;

  const torso = MeshBuilder.CreateBox(`fbTorso${suffix}`, { width: 0.5, height: 0.6, depth: 0.4 }, scene);
  torso.parent = root;
  torso.position.y = 0.3;
  const tMat = new StandardMaterial(`fbTorsoMat${suffix}`, scene);
  tMat.diffuseColor = new Color3(0.3, 0.3, 0.35);
  torso.material = tMat;

  return root;
}
