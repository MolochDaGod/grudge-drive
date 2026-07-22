/**
 * Load production voxel car GLBs for Velocity cruise.
 * Prefer CDN R2 assets (velocityLibrary) — never procedural box cars in prod.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { LoadedModel } from "@workspace/assets";
import { prepareCar, type CarCosmetics, type PreparedCar } from "./factory";
import type { CarDef } from "./cars";
import { vehicleUrl } from "./velocityLibrary";

const loader = new GLTFLoader();
let decoderReady: Promise<void> | null = null;

async function ensureDecoder(): Promise<void> {
  if (decoderReady) return decoderReady;
  decoderReady = (async () => {
    try {
      const dec = MeshoptDecoder as typeof MeshoptDecoder & { ready?: Promise<void> };
      if (dec.ready) await dec.ready;
      loader.setMeshoptDecoder(MeshoptDecoder);
    } catch {
      /* optional */
    }
  })();
  return decoderReady;
}

const modelCache = new Map<string, Promise<LoadedModel | null>>();

/** Load a vehicle GLB from CDN (or /models fallback) as LoadedModel for prepareCar. */
export function loadVelocityCarModel(assetId: string): Promise<LoadedModel | null> {
  const existing = modelCache.get(assetId);
  if (existing) return existing;

  const p = (async () => {
    await ensureDecoder();
    const primary = vehicleUrl(assetId);
    const candidates = [
      primary,
      primary ? `${primary}${primary.includes("?") ? "&" : "?"}v=drive-2026-07-22` : null,
      // local Pages package fallback if present
      `/models/vehicles/${assetId.replace(/^vehicles\//, "")}.glb`,
    ].filter(Boolean) as string[];

    for (const url of candidates) {
      try {
        const gltf = await loader.loadAsync(url);
        const scene = gltf.scene as THREE.Group;
        // Reject empty / HTML masquerade
        let meshCount = 0;
        scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshCount++;
        });
        if (meshCount < 1) continue;
        console.info("[velocity-car] loaded", assetId, url, `meshes=${meshCount}`);
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        return {
          scene,
          animations: gltf.animations ?? [],
          metrics: {
            size,
            center,
            min: box.min.clone(),
            max: box.max.clone(),
          } as LoadedModel["metrics"],
        };
      } catch (err) {
        console.warn("[velocity-car] fail", assetId, url, err);
      }
    }
    return null;
  })();

  modelCache.set(assetId, p);
  return p;
}

/** Prepare a scene-ready player/AI car from roster def. */
export async function prepareVelocityCar(
  def: CarDef,
  cosmetics?: CarCosmetics,
): Promise<PreparedCar | null> {
  const model = await loadVelocityCarModel(def.assetId);
  if (!model) return null;
  try {
    return prepareCar(model, def, cosmetics);
  } catch (err) {
    console.warn("[velocity-car] prepareCar failed", def.id, err);
    return null;
  }
}
