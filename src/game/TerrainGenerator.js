import {
  MeshBuilder, StandardMaterial, Color3, Texture, Vector3,
  VertexBuffer, PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';

/**
 * Simple 2D value-noise (hash-based) — no dependency needed.
 * Returns values in [-1, 1].
 */
function hash2D(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);

  const n00 = hash2D(ix, iy);
  const n10 = hash2D(ix + 1, iy);
  const n01 = hash2D(ix, iy + 1);
  const n11 = hash2D(ix + 1, iy + 1);

  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sy * (nx1 - nx0);
}

/**
 * Fractal Brownian Motion — stacks octaves of noise for natural terrain.
 */
function fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp; // normalized to [-1, 1]
}

// Terrain config
const TERRAIN_CONFIG = {
  size: 200,
  subdivisions: 128,       // mesh resolution
  maxHeight: 12,            // peak hill height
  noiseScale: 0.018,        // how spread out hills are
  flatRadius: 25,           // flat area around center spawn
  flatFalloff: 15,          // blend distance from flat to hilly
  roadWidth: 6,             // half-width of flattened road paths
  roadFalloff: 4,
};

/**
 * Get terrain height at a world (x, z) coordinate.
 * Exported so other systems (AI, spawn) can query it.
 */
export function getTerrainHeight(x, z, config = TERRAIN_CONFIG) {
  const nx = x * config.noiseScale;
  const nz = z * config.noiseScale;

  // Base terrain noise
  let h = fbm(nx, nz, 5, 2.0, 0.45);

  // Add some ridges
  const ridge = 1 - Math.abs(fbm(nx * 1.3 + 50, nz * 1.3 + 50, 3, 2.2, 0.5));
  h = h * 0.7 + ridge * 0.3;

  h *= config.maxHeight;

  // Flatten center spawn area
  const distFromCenter = Math.sqrt(x * x + z * z);
  if (distFromCenter < config.flatRadius + config.flatFalloff) {
    const t = Math.max(0, (distFromCenter - config.flatRadius) / config.flatFalloff);
    const blend = smoothstep(t);
    h *= blend;
  }

  // Flatten along cross-roads (X and Z axes) for driveable paths
  const roadBlendX = Math.max(0, 1 - Math.max(0, Math.abs(z) - config.roadWidth) / config.roadFalloff);
  const roadBlendZ = Math.max(0, 1 - Math.max(0, Math.abs(x) - config.roadWidth) / config.roadFalloff);
  const roadBlend = Math.max(roadBlendX, roadBlendZ);
  h *= (1 - roadBlend * 0.7); // roads are 70% flattened, not fully flat

  return h;
}

/**
 * Generate the terrain mesh with physics.
 */
export function createTerrain(scene) {
  const cfg = TERRAIN_CONFIG;

  // Create subdividable ground
  const ground = MeshBuilder.CreateGround('terrain', {
    width: cfg.size,
    height: cfg.size,
    subdivisions: cfg.subdivisions,
    updatable: true,
  }, scene);

  // Displace vertices using noise
  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  const normals = ground.getVerticesData(VertexBuffer.NormalKind);

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    positions[i + 1] = getTerrainHeight(x, z, cfg);
  }

  ground.updateVerticesData(VertexBuffer.PositionKind, positions);

  // Recompute normals for proper lighting
  const indices = ground.getIndices();
  VertexBuffer.ComputeNormals(positions, indices, normals);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);

  // Material — layered look using vertex color based on height
  const mat = new StandardMaterial('terrainMat', scene);
  mat.diffuseColor = new Color3(0.35, 0.3, 0.2);    // base dirt/sand
  mat.specularColor = new Color3(0.05, 0.05, 0.05);

  // Try loading a texture, fallback to plain color
  try {
    const diffTex = new Texture('/assets/textures/asphalt_02_diff_1k.png', scene);
    diffTex.uScale = 30;
    diffTex.vScale = 30;
    mat.diffuseTexture = diffTex;
  } catch (_) { /* proceed without texture */ }

  ground.material = mat;

  // Physics — MESH type for accurate terrain collision
  new PhysicsAggregate(ground, PhysicsShapeType.MESH, {
    mass: 0,
    friction: 0.8,
    restitution: 0.1,
  }, scene);

  ground.metadata = { type: 'terrain' };

  return { ground, config: cfg, getHeight: getTerrainHeight };
}
