/**
 * KartLoader — Shared utility to load any kart GLB from KartRegistry.
 *
 * Handles two GLB types:
 *   1. Single-file GLBs (Kenney packs) — each file IS one kart
 *   2. Multi-mesh pack (angry_birds_go_kart_pack.glb) — pick by meshPrefix
 *
 * Caches SceneLoader containers so repeated loads are instant clones.
 */

import { SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';

/** Container cache: glbPath → AssetContainer */
const _cache = {};

/**
 * Load a kart from the registry definition and parent it to the scene.
 *
 * @param {object} scene - Babylon scene
 * @param {object} kartDef - A kart definition from KartRegistry (has glbPath, meshPrefix, source)
 * @param {string} [nameSuffix=''] - Suffix for unique naming (e.g. '_player', '_bot0')
 * @returns {Promise<{ root: TransformNode, meshes: Mesh[] }>}
 */
export async function loadKart(scene, kartDef, nameSuffix = '') {
  const root = new TransformNode(`kart_${kartDef.id}${nameSuffix}`, scene);

  if (kartDef.source === 'angry_birds') {
    // Multi-mesh pack: load the full GLB, clone meshes matching meshPrefix
    return _loadFromPack(scene, kartDef, root, nameSuffix);
  } else {
    // Single-file GLB: load the whole file as a kart
    return _loadSingleGLB(scene, kartDef, root, nameSuffix);
  }
}

// ── Single-file GLB (Kenney packs) ─────────────────────────────────

async function _loadSingleGLB(scene, kartDef, root, suffix) {
  const path = kartDef.glbPath;

  // Split into directory and filename for SceneLoader
  const lastSlash = path.lastIndexOf('/');
  const dir = path.substring(0, lastSlash + 1);
  const file = path.substring(lastSlash + 1);

  let container = _cache[path];
  if (!container) {
    try {
      container = await SceneLoader.LoadAssetContainerAsync(dir, file, scene);
      _cache[path] = container;
    } catch (e) {
      console.warn(`[KartLoader] Failed to load ${path}:`, e);
      return { root, meshes: [] };
    }
  }

  // Clone all meshes from the container into our root
  const meshes = [];
  for (const mesh of container.meshes) {
    if (!mesh.geometry) continue; // skip __root__ transform nodes
    const clone = mesh.clone(`${mesh.name}${suffix}`, root);
    if (clone) {
      clone.isPickable = false;
      meshes.push(clone);
    }
  }

  // Kenney models are already correctly scaled (~1-4 units),
  // but normalize to roughly 4m length for the game
  root.scaling.setAll(1.0);

  return { root, meshes };
}

// ── Multi-mesh pack (angry_birds) ──────────────────────────────────

async function _loadFromPack(scene, kartDef, root, suffix) {
  const path = kartDef.glbPath;

  let container = _cache[path];
  if (!container) {
    try {
      container = await SceneLoader.LoadAssetContainerAsync('', path, scene);
      _cache[path] = container;
    } catch (e) {
      console.warn(`[KartLoader] Failed to load pack ${path}:`, e);
      return { root, meshes: [] };
    }
  }

  const prefix = kartDef.meshPrefix + '_';
  const meshes = [];
  for (const mesh of container.meshes) {
    if (mesh.name.startsWith(prefix)) {
      const clone = mesh.clone(`${mesh.name}${suffix}`, root);
      if (clone) {
        clone.isPickable = false;
        meshes.push(clone);
      }
    }
  }

  // The angry_birds pack uses large coordinates; scale down to game size
  root.scaling.setAll(0.03);

  return { root, meshes };
}

/**
 * Pre-warm the cache for a specific GLB path.
 * Call during loading screen to avoid hitches later.
 */
export async function preloadKartGLB(scene, glbPath) {
  if (_cache[glbPath]) return;
  try {
    const lastSlash = glbPath.lastIndexOf('/');
    const dir = glbPath.substring(0, lastSlash + 1);
    const file = glbPath.substring(lastSlash + 1);
    _cache[glbPath] = await SceneLoader.LoadAssetContainerAsync(dir, file, scene);
  } catch (e) {
    console.warn(`[KartLoader] Pre-load failed for ${glbPath}:`, e);
  }
}
