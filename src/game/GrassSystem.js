import {
  MeshBuilder, ShaderMaterial, Color3, Vector3, Matrix,
  VertexBuffer, Effect
} from '@babylonjs/core';
import { getTerrainHeight } from './TerrainGenerator.js';

/**
 * GrassSystem — GPU-instanced grass blades scattered across the terrain.
 * Uses a vertex shader for wind animation so it costs nearly zero CPU.
 */

// Register custom shader code
Effect.ShadersStore['grassVertexShader'] = `
  precision highp float;

  // Attributes
  attribute vec3 position;
  attribute vec3 normal;

  // Instance attributes
  attribute vec4 world0;
  attribute vec4 world1;
  attribute vec4 world2;
  attribute vec4 world3;

  // Uniforms
  uniform mat4 viewProjection;
  uniform float time;
  uniform vec3 windDirection;
  uniform float windStrength;

  varying float vHeight;
  varying vec3 vNormal;

  void main() {
    mat4 world = mat4(world0, world1, world2, world3);

    vec3 pos = position;

    // Wind: bend top of blade (y > 0.3) along wind direction
    float bendFactor = smoothstep(0.0, 1.0, pos.y);
    float windPhase = dot((world * vec4(0,0,0,1)).xz, vec2(0.1, 0.15));
    float windWave = sin(time * 2.5 + windPhase * 6.28) * 0.5 + 0.5;
    float gustWave = sin(time * 0.7 + windPhase * 3.14) * 0.3;

    pos.xz += windDirection.xz * bendFactor * (windWave + gustWave) * windStrength;

    vec4 worldPos = world * vec4(pos, 1.0);
    gl_Position = viewProjection * worldPos;

    vHeight = pos.y;
    vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  }
`;

Effect.ShadersStore['grassFragmentShader'] = `
  precision highp float;

  varying float vHeight;
  varying vec3 vNormal;

  uniform vec3 lightDir;

  void main() {
    // Gradient from dark base to bright tip
    vec3 baseColor = vec3(0.12, 0.25, 0.06);
    vec3 tipColor = vec3(0.3, 0.55, 0.15);
    vec3 color = mix(baseColor, tipColor, vHeight);

    // Simple diffuse lighting
    float ndl = max(dot(vNormal, -lightDir), 0.3);
    color *= ndl;

    // Slight transparency at the very tip
    float alpha = 1.0 - smoothstep(0.85, 1.0, vHeight) * 0.3;

    gl_FragColor = vec4(color, alpha);
  }
`;

const GRASS_CONFIG = {
  count: 8000,          // number of grass blades
  areaSize: 160,        // scatter radius
  bladeWidth: 0.12,
  bladeHeight: 0.6,
  heightVariation: 0.3,
  windStrength: 0.35,
  windDir: new Vector3(1, 0, 0.5).normalize(),
  minSpawnHeight: -1,   // don't place grass underwater
  maxSpawnHeight: 15,
  roadAvoidRadius: 8,   // no grass on roads
};

export function createGrass(scene) {
  const cfg = GRASS_CONFIG;

  // Build a single grass blade (thin quad triangle strip)
  const blade = MeshBuilder.CreatePlane('grassBlade', {
    width: cfg.bladeWidth,
    height: cfg.bladeHeight,
    sideOrientation: 2, // double-sided
  }, scene);
  blade.isVisible = false;

  // Prepare instance matrices
  const matrices = [];
  let placed = 0;

  for (let attempt = 0; placed < cfg.count && attempt < cfg.count * 3; attempt++) {
    const x = (Math.random() - 0.5) * cfg.areaSize;
    const z = (Math.random() - 0.5) * cfg.areaSize;

    // Skip roads (near X/Z axis)
    if (Math.abs(x) < cfg.roadAvoidRadius && Math.abs(z) < cfg.roadAvoidRadius) continue;
    if (Math.abs(x) < cfg.roadAvoidRadius / 2 || Math.abs(z) < cfg.roadAvoidRadius / 2) continue;

    const y = getTerrainHeight(x, z);
    if (y < cfg.minSpawnHeight || y > cfg.maxSpawnHeight) continue;

    // Random rotation and height variation
    const rot = Math.random() * Math.PI * 2;
    const scale = 0.7 + Math.random() * cfg.heightVariation * 2;

    const mat = Matrix.Compose(
      new Vector3(1, scale, 1),
      new Vector3(0, rot, 0).toQuaternion(),
      new Vector3(x, y + cfg.bladeHeight * scale * 0.5, z)
    );

    const arr = new Float32Array(16);
    mat.copyToArray(arr);
    matrices.push(...arr);
    placed++;
  }

  // Create the thin instance buffer
  const matBuffer = new Float32Array(matrices);
  blade.thinInstanceSetBuffer('matrix', matBuffer, 16, false);
  blade.isVisible = true;

  // Grass shader material
  const grassMat = new ShaderMaterial('grassMat', scene, {
    vertex: 'grass',
    fragment: 'grass',
  }, {
    attributes: ['position', 'normal', 'world0', 'world1', 'world2', 'world3'],
    uniforms: ['viewProjection', 'time', 'windDirection', 'windStrength', 'lightDir'],
    needAlphaBlending: true,
  });

  grassMat.backFaceCulling = false;
  grassMat.setVector3('windDirection', cfg.windDir);
  grassMat.setFloat('windStrength', cfg.windStrength);
  grassMat.setVector3('lightDir', new Vector3(-0.5, -1, 0.3).normalize());

  blade.material = grassMat;

  // Animate time uniform
  let grassTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    grassTime += scene.getEngine().getDeltaTime() / 1000;
    grassMat.setFloat('time', grassTime);
    grassMat.setMatrix('viewProjection', scene.getTransformMatrix());
  });

  return blade;
}
