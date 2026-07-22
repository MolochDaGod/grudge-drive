/**
 * Pure mesh / geometry builders for the Voxel Velocity cabinet.
 *
 * Everything visual that the engine assembles is constructed here so `RacerGame`
 * stays focused on simulation and lifecycle. Procedural geometry owns its own
 * GPU resources (freed by `disposeObject3D`); the car model is a catalog clone
 * whose geometry/textures stay shared with the loader cache (only its cloned
 * materials are owned). See `.agents/memory/three-disposal.md`.
 */

import * as THREE from "three";
import type { LoadedModel } from "@workspace/assets";
import { cloneCatalogModel } from "@/games/shared/three";
import { CONFIG, NEON } from "./constants";
import type { CarDef } from "./cars";

/** A drivable wheel: a steer pivot (yaw) wrapping a spinning tyre mesh (x axle). */
export interface Wheel {
  steer: THREE.Group;
  spin: THREE.Mesh;
}

/** The assembled, scene-ready player car. */
export interface PreparedCar {
  /** Engine moves/rotates this (position on xz, heading on rotation.y). */
  root: THREE.Group;
  /** Body wrapper that receives roll/pitch. */
  body: THREE.Group;
  /**
   * Spinnable wheels. Empty by default — the base car uses the model's OWN
   * wheel geometry (no procedural tyres are bolted on). Kept as a stable hook
   * for a future per-mesh wheel-spin feature.
   */
  wheels: Wheel[];
  /** Steerable front wheels. Empty by default (see `wheels`). */
  frontWheels: Wheel[];
  /** Door hinge pivot to swing on enter/exit, if the car has one (none by default). */
  door?: THREE.Group;
  /**
   * Rear-light materials the engine drives each frame, if the car exposes them
   * (none by default — we no longer bolt on procedural tail-light boxes).
   */
  lights?: { brake: THREE.MeshStandardMaterial; reverse: THREE.MeshStandardMaterial };
  /** Car dimensions after normalisation (world units). */
  dims: { width: number; length: number; height: number };
}

/** Optional cosmetic overrides applied to the player car (paint + bolt-ons). */
export interface CarCosmetics {
  /** Hex body tint, or empty/undefined for the factory finish. */
  paintColor?: string;
  /** Owned + enabled visual mod ids (see `VISUAL_MODS` in garage.ts). */
  mods?: string[];
}

/** A single ordered checkpoint centre on the circuit (index 0 = start/finish). */
export interface Checkpoint {
  x: number;
  z: number;
}

/** The built circuit plus the data the engine needs to run the race. */
export interface Circuit {
  group: THREE.Group;
  checkpoints: Checkpoint[];
  start: { x: number; z: number; yaw: number };
}

// --- Car ------------------------------------------------------------------

/**
 * Clone, scale and orient a loaded voxel car: the model is uniformly scaled so
 * its longest horizontal axis equals `CONFIG.car.length`, rotated so that length
 * runs along +Z (forward), recentred horizontally and rested on y = 0. The base
 * car keeps the model's OWN geometry — no procedural wheels, door or tail-light
 * boxes are bolted on; visual upgrades stay opt-in via `cosmetics.mods`.
 */
export function prepareCar(
  model: LoadedModel,
  def: CarDef,
  cosmetics?: CarCosmetics,
): PreparedCar {
  const clone = cloneCatalogModel(model);

  // Paint: tint every cloned (per-instance) body material toward the chosen
  // colour. cloneCatalogModel clones materials, so this never touches the
  // shared loader cache.
  const paint = cosmetics?.paintColor;
  if (paint) {
    const col = new THREE.Color(paint);
    clone.traverse((node) => {
      const m = node as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial;
        if (sm.color) sm.color.copy(col);
      }
    });
  }

  // Scale to a consistent footprint using the longest horizontal extent.
  const box0 = new THREE.Box3().setFromObject(clone);
  const size0 = box0.getSize(new THREE.Vector3());
  const longest = Math.max(size0.x, size0.z) || 1;
  clone.scale.multiplyScalar(CONFIG.car.length / longest);

  // Orient the longer horizontal axis to run along Z, flip 180° so the nose
  // points +Z (sim forward). Visual yaw lives on the mesh; sim heading is
  // `root.rotation.y` only. Per-car `modelYaw` handles outliers.
  if (size0.x > size0.z) clone.rotation.y = Math.PI / 2;
  clone.rotation.y += Math.PI + (def.modelYaw ?? 0);

  // Recentre horizontally and rest on the ground.
  const box1 = new THREE.Box3().setFromObject(clone);
  const center = box1.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= box1.min.y;

  const fitted = new THREE.Box3().setFromObject(clone);
  const dims = {
    width: fitted.max.x - fitted.min.x,
    length: fitted.max.z - fitted.min.z,
    height: fitted.max.y - fitted.min.y,
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.add(clone);
  root.add(body);

  // The base car renders as the clean GLB only — we no longer bolt on
  // procedural tyres, a door panel or tail-light boxes. The model's own wheels
  // and lights are used as-is. Upgrades remain fully modular: opt-in via
  // `cosmetics.mods` (owned procedural meshes, freed by disposeObject3D).
  const accent = new THREE.Color(def.accent);
  const mods = cosmetics?.mods ?? [];
  if (mods.length > 0) addVisualMods(body, dims, accent, mods);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });

  return {
    root,
    body,
    wheels: [],
    frontWheels: [],
    dims,
  };
}

/**
 * Attach the player's owned visual mods to the car body as simple voxel-styled
 * procedural geometry (so they stay in the one consistent blocky art style).
 * Everything added here is owned (not catalog-shared) and freed by
 * `disposeObject3D`.
 */
function addVisualMods(
  body: THREE.Group,
  dims: { width: number; length: number; height: number },
  accent: THREE.Color,
  mods: string[],
): void {
  if (mods.includes("spoiler")) {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.6, metalness: 0.3 });
    const wingGeo = new THREE.BoxGeometry(dims.width * 0.92, 0.16, dims.length * 0.18);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, dims.height * 0.92, -dims.length * 0.46);
    body.add(wing);
    const strutGeo = new THREE.BoxGeometry(0.14, dims.height * 0.22, 0.14);
    for (const sx of [dims.width * 0.32, -dims.width * 0.32]) {
      const strut = new THREE.Mesh(strutGeo, wingMat);
      strut.position.set(sx, dims.height * 0.82, -dims.length * 0.44);
      body.add(strut);
    }
  }

  if (mods.includes("roofscoop")) {
    const scoopMat = new THREE.MeshStandardMaterial({ color: 0x202430, roughness: 0.7, metalness: 0.2 });
    const scoopGeo = new THREE.BoxGeometry(dims.width * 0.3, dims.height * 0.16, dims.length * 0.22);
    const scoop = new THREE.Mesh(scoopGeo, scoopMat);
    scoop.position.set(0, dims.height * 0.96, dims.length * 0.04);
    body.add(scoop);
  }

  if (mods.includes("underglow")) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.75,
    });
    const glowGeo = new THREE.BoxGeometry(dims.width * 0.96, 0.06, dims.length * 0.94);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.08, 0);
    body.add(glow);
  }
}

// --- Circuit --------------------------------------------------------------

/** Control points (xz) of the closed neon circuit, in world units. */
const TRACK_POINTS: [number, number][] = [
  [0, 150],
  [95, 120],
  [140, 30],
  [120, -70],
  [55, -120],
  [-30, -135],
  [-110, -95],
  [-150, -10],
  [-120, 80],
  [-55, 130],
];

/** Build the closed Catmull-Rom spline the road follows. */
export function makeTrackCurve(): THREE.CatmullRomCurve3 {
  const pts = TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.5);
}

/** Horizontal left normal of a tangent (rotate +90 about Y). */
function leftNormal(t: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-t.z, 0, t.x).normalize();
}

/**
 * Build a flat ribbon (triangle strip) between two offset edges sampled along
 * the curve at y = `y`. `offsetA`/`offsetB` are signed half-widths.
 */
function ribbonGeometry(
  curve: THREE.CatmullRomCurve3,
  samples: number,
  offsetA: number,
  offsetB: number,
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i % samples) / samples;
    const p = curve.getPointAt(t);
    const n = leftNormal(curve.getTangentAt(t));
    positions.push(p.x + n.x * offsetA, y, p.z + n.z * offsetA);
    positions.push(p.x + n.x * offsetB, y, p.z + n.z * offsetB);
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Build a vertical wall ribbon along one signed edge of the road. */
function wallGeometry(
  curve: THREE.CatmullRomCurve3,
  samples: number,
  offset: number,
  height: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i % samples) / samples;
    const p = curve.getPointAt(t);
    const n = leftNormal(curve.getTangentAt(t));
    const ex = p.x + n.x * offset;
    const ez = p.z + n.z * offset;
    positions.push(ex, 0, ez);
    positions.push(ex, height, ez);
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Assemble the full neon circuit and the race data derived from it. */
export function buildCircuit(curve: THREE.CatmullRomCurve3): Circuit {
  const group = new THREE.Group();
  const hw = CONFIG.track.roadWidth / 2;
  const samples = CONFIG.track.ribbonSamples;

  // Road surface.
  const road = new THREE.Mesh(
    ribbonGeometry(curve, samples, hw, -hw, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x12131f, roughness: 0.85, metalness: 0.1 }),
  );
  road.receiveShadow = true;
  group.add(road);

  // Glowing centre dashes line.
  const centre = new THREE.Mesh(
    ribbonGeometry(curve, samples, 0.4, -0.4, 0.06),
    new THREE.MeshStandardMaterial({
      color: NEON.amber,
      emissive: NEON.amber,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.4,
    }),
  );
  group.add(centre);

  // Neon edge walls (cyan left, magenta right).
  const leftWall = new THREE.Mesh(
    wallGeometry(curve, samples, hw, CONFIG.track.wallHeight),
    new THREE.MeshStandardMaterial({
      color: NEON.cyan,
      emissive: NEON.cyan,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  const rightWall = new THREE.Mesh(
    wallGeometry(curve, samples, -hw, CONFIG.track.wallHeight),
    new THREE.MeshStandardMaterial({
      color: NEON.magenta,
      emissive: NEON.magenta,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  group.add(leftWall, rightWall);

  // Start/finish gate at t = 0.
  const start = curve.getPointAt(0);
  const startTan = curve.getTangentAt(0);
  const yaw = Math.atan2(startTan.x, startTan.z);
  const gate = buildStartGate(hw, CONFIG.track.wallHeight);
  gate.position.set(start.x, 0, start.z);
  gate.rotation.y = yaw;
  group.add(gate);

  // Ordered checkpoint centres (index 0 = the start/finish line).
  const checkpoints: Checkpoint[] = [];
  for (let i = 0; i < CONFIG.track.checkpoints; i++) {
    const t = i / CONFIG.track.checkpoints;
    const p = curve.getPointAt(t);
    checkpoints.push({ x: p.x, z: p.z });
  }

  return { group, checkpoints, start: { x: start.x, z: start.z, yaw } };
}

/** A checkered start/finish arch spanning the road. */
function buildStartGate(halfWidth: number, baseHeight: number): THREE.Group {
  const gate = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(1, baseHeight * 2.4, 1);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
  });
  const span = halfWidth + 1.2;
  for (const sx of [span, -span]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx, baseHeight * 1.2, 0);
    gate.add(post);
  }
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(span * 2 + 1, 1.1, 1),
    postMat,
  );
  bar.position.y = baseHeight * 2.4;
  gate.add(bar);

  // Checkered finish strip painted on the road.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 2, 3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.05;
  gate.add(strip);

  return gate;
}

// --- Skid marks -----------------------------------------------------------

/** A small ring-buffer pool of flat skid quads dropped while drifting. */
export class SkidPool {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly quads: THREE.Mesh[] = [];
  private idx = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(CONFIG.skid.size, CONFIG.skid.size);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    for (let i = 0; i < CONFIG.skid.pool; i++) {
      const q = new THREE.Mesh(this.geo, this.mat);
      q.rotation.x = -Math.PI / 2;
      q.visible = false;
      this.group.add(q);
      this.quads.push(q);
    }
    scene.add(this.group);
  }

  /** Drop a skid quad at a ground position, aligned to the travel yaw. */
  drop(x: number, z: number, yaw: number): void {
    const q = this.quads[this.idx];
    q.position.set(x, 0.04, z);
    q.rotation.set(-Math.PI / 2, 0, yaw);
    q.visible = true;
    this.idx = (this.idx + 1) % this.quads.length;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.geo.dispose();
    this.mat.dispose();
  }
}
