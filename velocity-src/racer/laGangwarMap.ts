/**
 * LA Gangwar Simulator 3D — production map shell for Velocity.
 *
 * Source: Sketchfab "Map - LA GANGWAR SIMULATOR 3D" (CC-BY-4.0, Villanueva-Jonatan-32621).
 * CDN: models/environment/velocity/la-gangwar.glb
 *
 * Scale (SSOT): author units are already ~metres (bbox ~1240×608×22). We only
 * center + ground — we do NOT shrink the city (racing needs real street length).
 *
 * Layers / colliders / pathfinding (2026-07-22 purge + redo):
 *  - Multi-hit BVH raycast → street deck preferred (never canal under bridge)
 *  - Bottom floor + water up to under-bridge elevation
 *  - Mesh AABB walls + street-pruned road graph for NPC / vehicle AI
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { buildRoadGraph, type RoadGraph } from "./roadGraph";
import { ColLayer, resolveAgainstBuildings, type AabbCollider } from "./cityColliders";
import {
  createTerrainLayerMeshes,
  pickStreetSpawn,
  probeMapElevations,
  pruneRoadGraphToStreet,
  sampleSurfaceLayers,
  type SurfaceSample,
  type TerrainLayerRuntime,
} from "./mapTerrainLayers";

const CDN_BASE = "https://assets.grudge-studio.com";
/** Bump to purge stale browser / edge caches after rebake. */
export const LA_GANGWAR_MAP_VERSION = "2026-07-22-layers";
export const LA_GANGWAR_CDN =
  `${CDN_BASE}/models/environment/velocity/la-gangwar.glb?v=${LA_GANGWAR_MAP_VERSION}`;
export const LA_GANGWAR_CREDIT =
  'Map based on "LA GANGWAR SIMULATOR 3D" by Villanueva-Jonatan-32621 (CC-BY-4.0)';

/** Prefer road graph block so AI cars get real blocks (~city kit). */
export const GANG_ROAD_BLOCK = 48;

const geoProto = THREE.BufferGeometry.prototype as THREE.BufferGeometry & {
  computeBoundsTree?: typeof computeBoundsTree;
  disposeBoundsTree?: typeof disposeBoundsTree;
};
if (!geoProto.computeBoundsTree) {
  geoProto.computeBoundsTree = computeBoundsTree;
  geoProto.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

export interface LaGangwarMap {
  root: THREE.Group;
  halfX: number;
  halfZ: number;
  groundY: number;
  center: THREE.Vector3;
  raycastMeshes: THREE.Mesh[];
  /** AABB wall proxies for cars/feet (from mesh bounds). */
  wallAabbs: AabbCollider[];
  /** Street-layer pruned graph (pathfinding SSOT). */
  roadGraph: RoadGraph;
  /** Full unpruned grid (diagnostics only). */
  roadGraphFull: RoadGraph;
  roadBlock: number;
  credit: string;
  scaleApplied: number;
  buildingHeightMax: number;
  /** Canal / under-bridge water surface Y. */
  waterY: number;
  /** World floor under water. */
  bottomY: number;
  /** Median street deck Y. */
  streetMedianY: number;
  layers: TerrainLayerRuntime;
  /** Validated garage spawn on street deck. */
  spawn: { x: number; z: number; yaw: number; y: number; label: string };
  dispose: () => void;
  sampleGround: (x: number, z: number) => number;
  sampleSurface: (x: number, z: number) => SurfaceSample;
  resolveCharacter: (x: number, z: number) => { x: number; z: number; y: number; hit: boolean };
  resolveVehicle: (
    x: number,
    z: number,
    yaw: number,
    scale?: number,
  ) => { x: number; z: number; y: number; hit: boolean };
  snapToRoad: (x: number, z: number) => { x: number; z: number; yaw: number };
}

function urlCandidates(): string[] {
  return [
    LA_GANGWAR_CDN,
    `/models/environment/velocity/la-gangwar.glb?v=${LA_GANGWAR_MAP_VERSION}`,
    "/models/environment/velocity/la-gangwar.glb",
  ];
}

/**
 * Center XZ, ground minY→0. Only rescale if clearly wrong units.
 */
function normalizeMap(root: THREE.Object3D): {
  halfX: number;
  halfZ: number;
  groundY: number;
  center: THREE.Vector3;
  scaleApplied: number;
  buildingHeightMax: number;
} {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  let size = new THREE.Vector3();
  let center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(root);
  box.getSize(size);
  const maxXZ = Math.max(size.x, size.z);
  const height = size.y;
  let scale = 1;

  if (maxXZ > 5 && maxXZ < 100 && height < 8) {
    scale = 900 / maxXZ;
  } else if (maxXZ > 4000 || height > 200) {
    scale = 1000 / maxXZ;
  }

  if (Math.abs(scale - 1) > 0.01) {
    root.scale.multiplyScalar(scale);
    root.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(root);
    box.getSize(size);
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
  }

  const final = new THREE.Box3().setFromObject(root);
  const fs = new THREE.Vector3();
  final.getSize(fs);
  return {
    halfX: fs.x * 0.5,
    halfZ: fs.z * 0.5,
    groundY: 0,
    center: new THREE.Vector3(0, 0, 0),
    scaleApplied: scale,
    buildingHeightMax: fs.y,
  };
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const m = o as THREE.Mesh;
    m.castShadow = true;
    m.receiveShadow = true;
    const name = (m.name || m.parent?.name || "").toLowerCase();
    const isRoad =
      name.includes("road") ||
      name.includes("street") ||
      name.includes("asphalt") ||
      name.includes("pavement") ||
      name.includes("highway") ||
      name.includes("freeway") ||
      name.includes("sidewalk");
    const isWater =
      name.includes("water") ||
      name.includes("canal") ||
      name.includes("river");
    m.userData.colKind = isWater ? "water" : isRoad ? "road" : "building";
    m.userData.selectable = isRoad ? "ground" : isWater ? "water" : "hostile";
    try {
      (m.geometry as THREE.BufferGeometry & { computeBoundsTree?: () => void })
        .computeBoundsTree?.();
    } catch {
      /* */
    }
    out.push(m);
  });
  return out;
}

/**
 * Build wall AABBs from mesh world bounds. Skip flat ground (low height) and
 * tiny props; keep buildings/fences for car/foot separation.
 */
function buildWallAabbs(meshes: THREE.Mesh[]): AabbCollider[] {
  const walls: AabbCollider[] = [];
  const box = new THREE.Box3();
  let i = 0;
  for (const m of meshes) {
    if (m.userData.colKind === "water" || m.userData.colKind === "road") continue;
    box.setFromObject(m);
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    if (sy < 0.45 && Math.max(sx, sz) > 8) continue;
    if (sx < 0.6 && sz < 0.6 && sy < 1.2) continue;
    if (sy < 0.25) continue;
    walls.push({
      id: `gw-${i++}`,
      kind: "building",
      layer: ColLayer.BUILDING,
      cx: (box.min.x + box.max.x) * 0.5,
      cy: (box.min.y + box.max.y) * 0.5,
      cz: (box.min.z + box.max.z) * 0.5,
      hx: sx * 0.5,
      hy: sy * 0.5,
      hz: sz * 0.5,
      static: true,
    });
  }
  walls.sort((a, b) => b.hx * b.hz - a.hx * a.hz);
  return walls.slice(0, 520);
}

function nearestRoadYaw(
  graph: RoadGraph,
  x: number,
  z: number,
): { x: number; z: number; yaw: number } {
  let best: { x: number; z: number; yaw: number; d: number } | null = null;
  for (const n of graph.nodes.values()) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (!best || d < best.d) {
      const edges = graph.adj.get(n.id) ?? [];
      const e = edges[0];
      const yaw = e ? Math.atan2(e.dx, e.dz) : 0;
      best = { x: n.x, z: n.z, yaw, d };
    }
  }
  return best ? { x: best.x, z: best.z, yaw: best.yaw } : { x, z, yaw: 0 };
}

export async function loadLaGangwarMap(
  onProgress?: (p: number) => void,
): Promise<LaGangwarMap | null> {
  const loader = new GLTFLoader();
  try {
    const dec = MeshoptDecoder as typeof MeshoptDecoder & { ready?: Promise<void> };
    if (dec.ready) await dec.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
  } catch {
    /* */
  }
  let gltf: Awaited<ReturnType<typeof loader.loadAsync>> | null = null;
  let lastErr: unknown;
  for (const url of urlCandidates()) {
    try {
      onProgress?.(0.02);
      gltf = await loader.loadAsync(url, (e) => {
        if (e.total) onProgress?.(0.05 + 0.9 * (e.loaded / e.total));
      });
      console.info("[la-gangwar] loaded", url);
      onProgress?.(1);
      break;
    } catch (err) {
      lastErr = err;
      console.warn("[la-gangwar] try failed", url, err);
    }
  }
  if (!gltf) {
    console.warn("[la-gangwar] failed to load map", lastErr);
    return null;
  }

  const root = new THREE.Group();
  root.name = "laGangwarMap";
  root.add(gltf.scene);
  const dims = normalizeMap(root);
  const raycastMeshes = collectMeshes(root);
  const wallAabbs = buildWallAabbs(raycastMeshes);

  // Full grid graph covering map
  const half = Math.min(dims.halfX, dims.halfZ) * 0.92;
  const block = GANG_ROAD_BLOCK;
  const halfSnap = Math.floor(half / block) * block;
  const roadGraphFull = buildRoadGraph(Math.max(block * 3, halfSnap), block);

  const raycaster = new THREE.Raycaster();
  const maxH = Math.max(80, dims.buildingHeightMax + 40);

  // Phase 1: probe elevations with provisional waterY
  let waterY = 0.2;
  let streetMedianY = 2;
  const sampleRaw = (x: number, z: number): SurfaceSample =>
    sampleSurfaceLayers(raycaster, raycastMeshes, x, z, {
      maxHeight: maxH,
      waterY,
      streetBiasY: streetMedianY,
    });

  const elev = probeMapElevations(sampleRaw, dims.halfX, dims.halfZ, block);
  waterY = elev.waterY;
  streetMedianY = elev.streetMedianY > 0.1 ? elev.streetMedianY : 1.5;
  const bottomY = elev.bottomY;

  // Bottom + water layers (under-bridge water line)
  const layers = createTerrainLayerMeshes(dims.halfX, dims.halfZ, waterY, bottomY);
  layers.streetMedianY = streetMedianY;
  root.add(layers.bottomMesh);
  root.add(layers.waterMesh);
  // Include layers in raycast so water/bottom classify correctly
  raycastMeshes.push(layers.bottomMesh, layers.waterMesh);
  try {
    layers.bottomMesh.geometry.computeBoundsTree?.();
    layers.waterMesh.geometry.computeBoundsTree?.();
  } catch {
    /* */
  }

  const sampleSurface = (x: number, z: number): SurfaceSample =>
    sampleSurfaceLayers(raycaster, raycastMeshes, x, z, {
      maxHeight: maxH,
      waterY,
      streetBiasY: streetMedianY,
    });

  // Street-layer pathfinding graph (purge under-bridge / canal nodes)
  const roadGraph = pruneRoadGraphToStreet(
    roadGraphFull,
    sampleSurface,
    streetMedianY,
    800,
  );

  const sampleGround = (x: number, z: number): number => sampleSurface(x, z).y;

  const resolveCharacter = (x: number, z: number) => {
    const r = resolveAgainstBuildings(x, z, 0.38, 0.38, wallAabbs);
    const s = sampleSurface(r.x, r.z);
    // Keep feet above water
    const y = Math.max(s.y, waterY + 0.05);
    return { x: r.x, z: r.z, y, hit: r.hit };
  };

  const resolveVehicle = (x: number, z: number, yaw: number, scale = 1) => {
    const hx = 1.15 * scale;
    const hz = 2.2 * scale;
    const c = Math.abs(Math.cos(yaw));
    const sAbs = Math.abs(Math.sin(yaw));
    const ox = hx * c + hz * sAbs;
    const oz = hx * sAbs + hz * c;
    const r = resolveAgainstBuildings(x, z, ox, oz, wallAabbs);
    const s = sampleSurface(r.x, r.z);
    const y = Math.max(0.35, s.y + 0.35, waterY + 0.4);
    return { x: r.x, z: r.z, y, hit: r.hit };
  };

  const snapToRoad = (x: number, z: number) => nearestRoadYaw(roadGraph, x, z);

  // Scene start: street deck, never under bridge
  const spawnPick =
    pickStreetSpawn(roadGraph, sampleSurface, streetMedianY) ??
    pickStreetSpawn(roadGraphFull, sampleSurface, streetMedianY) ?? {
      x: block,
      z: block,
      yaw: 0,
      y: Math.max(streetMedianY, waterY + 2),
      label: "fallback street",
    };

  // Re-sample spawn Y one more time on street surface
  const spawnSurf = sampleSurface(spawnPick.x, spawnPick.z);
  const spawn = {
    x: spawnPick.x,
    z: spawnPick.z,
    yaw: spawnPick.yaw,
    y: Math.max(spawnSurf.y, streetMedianY - 1, waterY + 1.5),
    label: spawnPick.label,
  };

  console.info(
    "[la-gangwar] scale",
    dims.scaleApplied,
    "half",
    dims.halfX.toFixed(0),
    "x",
    dims.halfZ.toFixed(0),
    "m height",
    dims.buildingHeightMax.toFixed(1),
    "walls",
    wallAabbs.length,
    "roadNodes",
    roadGraph.nodes.size,
    "/",
    roadGraphFull.nodes.size,
    "waterY",
    waterY.toFixed(2),
    "streetY",
    streetMedianY.toFixed(2),
    "spawn",
    spawn.label,
    `@${spawn.x.toFixed(0)},${spawn.z.toFixed(0)} y=${spawn.y.toFixed(2)}`,
    "underBridgeProbes",
    elev.underBridgeSamples,
  );

  return {
    root,
    halfX: dims.halfX,
    halfZ: dims.halfZ,
    groundY: dims.groundY,
    center: dims.center,
    raycastMeshes,
    wallAabbs,
    roadGraph,
    roadGraphFull,
    roadBlock: block,
    credit: LA_GANGWAR_CREDIT,
    scaleApplied: dims.scaleApplied,
    buildingHeightMax: dims.buildingHeightMax,
    waterY,
    bottomY,
    streetMedianY,
    layers,
    spawn,
    dispose: () => {
      layers.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.disposeBoundsTree?.();
          m.geometry?.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
        }
      });
    },
    sampleGround,
    sampleSurface,
    resolveCharacter,
    resolveVehicle,
    snapToRoad,
  };
}
