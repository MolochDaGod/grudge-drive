/**
 * VFXManager — Particle-based visual effects for Grudge Drive.
 *
 * Uses Babylon.js ParticleSystem with textures from:
 *   - Local: /assets/textures/fireball1.png, smoke01.png, ProjecTile.png
 *   - ObjectStore CDN: https://molochdagod.github.io/ObjectStore/sprites/effects/...
 *
 * Effects: fireball, bullet tracer, rocket trail, explosion, shield bubble,
 *          nitro exhaust, smoke trail, hit sparks, mine glow, toxin cloud,
 *          soul drain beam, thorn burst, flail spin
 */

import {
  ParticleSystem, GPUParticleSystem, Texture, Color4, Color3,
  Vector3, MeshBuilder, StandardMaterial, TransformNode,
  Animation, SpriteManager, Sprite
} from '@babylonjs/core';

// ── Asset URLs ──────────────────────────────────────────────────────

const LOCAL = {
  fireball:   '/assets/textures/fireball1.png',
  flame:      '/assets/textures/flamsheet2.png',
  smoke:      '/assets/textures/smoke01.png',
  projectile: '/assets/textures/ProjecTile.png',
  bomb:       '/assets/textures/BombTexture.png',
};

const CDN = 'https://molochdagod.github.io/ObjectStore';
const REMOTE = {
  fireSprite:   `${CDN}/sprites/effects/pixel/11_fire_spritesheet.png`,
  blueFireSpr:  `${CDN}/sprites/effects/pixel/3_bluefire_spritesheet.png`,
  sparkSpr:     `${CDN}/sprites/effects/pixel/10_weaponhit_spritesheet.png`,
  shieldSpr:    `${CDN}/sprites/effects/pixel/8_protectioncircle_spritesheet.png`,
  phantomSpr:   `${CDN}/sprites/effects/pixel/14_phantom_spritesheet.png`,
  freezingSpr:  `${CDN}/sprites/effects/pixel/19_freezing_spritesheet.png`,
  venomSpr:     `${CDN}/sprites/effects/pixel/20_magicbubbles_spritesheet.png`,
  beamGreen:    `${CDN}/effects/beams/beam_green.png`,
  beamPurple:   `${CDN}/effects/beams/beam_purple.png`,
  beamRed:      `${CDN}/effects/beams/beam_red.png`,
  beamBlue:     `${CDN}/effects/beams/beam_blue.png`,
  beamOrange:   `${CDN}/effects/beams/beam_orange.png`,
  bulletProj:   `${CDN}/sprites/projectiles/bullet.png`,
  fireballProj: `${CDN}/sprites/projectiles/fireball.png`,
};

// ── Shared texture cache ────────────────────────────────────────────

const _texCache = {};
function tex(scene, url) {
  if (!_texCache[url]) {
    _texCache[url] = new Texture(url, scene, false, false);
    _texCache[url].hasAlpha = true;
  }
  return _texCache[url];
}

// ── VFX Manager ─────────────────────────────────────────────────────

export class VFXManager {
  constructor(scene) {
    this.scene = scene;
    this._activeSystems = [];
  }

  // ── FIREBALL ──────────────────────────────────────────────────────
  /** Spawn a fireball projectile trail attached to a mesh. */
  fireballTrail(emitterMesh) {
    const ps = new ParticleSystem('vfx_fireball', 200, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.fireball);
    ps.emitter = emitterMesh;
    ps.minEmitBox = Vector3.Zero();
    ps.maxEmitBox = Vector3.Zero();

    ps.color1 = new Color4(1.0, 0.6, 0.1, 1);
    ps.color2 = new Color4(1.0, 0.3, 0.0, 0.8);
    ps.colorDead = new Color4(0.2, 0.0, 0.0, 0);

    ps.minSize = 0.3;
    ps.maxSize = 0.8;
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.3;
    ps.emitRate = 150;

    ps.direction1 = new Vector3(-0.3, 0, -1);
    ps.direction2 = new Vector3(0.3, 0.2, -0.5);
    ps.minEmitPower = 2;
    ps.maxEmitPower = 5;

    ps.addSizeGradient(0, 0.5);
    ps.addSizeGradient(1, 0.05);

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -1, 0);

    ps.start();
    this._track(ps);
    return ps;
  }

  // ── BULLET TRACER ─────────────────────────────────────────────────
  /** Quick tracer for machine gun bullets. */
  bulletTracer(origin, direction, speed = 80) {
    const ps = new ParticleSystem('vfx_tracer', 30, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);

    const emitter = new TransformNode('tracerEmit', this.scene);
    emitter.position = origin.clone();
    ps.emitter = emitter;

    ps.color1 = new Color4(1, 0.9, 0.3, 1);
    ps.color2 = new Color4(1, 0.6, 0.1, 0.6);
    ps.colorDead = new Color4(0.5, 0.2, 0.0, 0);

    ps.minSize = 0.05;
    ps.maxSize = 0.12;
    ps.minLifeTime = 0.05;
    ps.maxLifeTime = 0.12;
    ps.emitRate = 300;

    const d = direction.normalize();
    ps.direction1 = d.scale(-0.5);
    ps.direction2 = d.scale(-0.3);
    ps.minEmitPower = 1;
    ps.maxEmitPower = 3;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();

    // Auto-move and cleanup
    let life = 1.5;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000;
      life -= dt;
      emitter.position.addInPlace(d.scale(speed * dt));
      if (life <= 0) {
        ps.stop();
        ps.dispose();
        emitter.dispose();
        this.scene.onBeforeRenderObservable.remove(obs);
      }
    });

    return ps;
  }

  // ── ROCKET TRAIL ──────────────────────────────────────────────────
  rocketTrail(emitterMesh) {
    const ps = new ParticleSystem('vfx_rocket', 300, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.smoke);
    ps.emitter = emitterMesh;

    ps.color1 = new Color4(0.8, 0.4, 0.1, 0.9);
    ps.color2 = new Color4(0.3, 0.3, 0.3, 0.6);
    ps.colorDead = new Color4(0.1, 0.1, 0.1, 0);

    ps.minSize = 0.2;
    ps.maxSize = 0.6;
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 0.8;
    ps.emitRate = 200;

    ps.direction1 = new Vector3(-0.2, -0.1, -1);
    ps.direction2 = new Vector3(0.2, 0.1, -0.5);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 6;

    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, -2, 0);

    ps.start();
    this._track(ps);
    return ps;
  }

  // ── EXPLOSION ─────────────────────────────────────────────────────
  /** One-shot explosion at a world position. */
  explosion(position, scale = 1.0, color = null) {
    // Fire burst
    const fire = new ParticleSystem('vfx_explFire', 400, this.scene);
    fire.particleTexture = tex(this.scene, LOCAL.fireball);
    fire.emitter = position.clone();
    fire.minEmitBox = new Vector3(-0.5, -0.5, -0.5).scale(scale);
    fire.maxEmitBox = new Vector3(0.5, 0.5, 0.5).scale(scale);

    const c = color || { r: 1, g: 0.5, b: 0.1 };
    fire.color1 = new Color4(c.r, c.g, c.b, 1);
    fire.color2 = new Color4(c.r * 0.8, c.g * 0.3, 0, 0.8);
    fire.colorDead = new Color4(0.1, 0, 0, 0);

    fire.minSize = 0.5 * scale;
    fire.maxSize = 2.0 * scale;
    fire.minLifeTime = 0.2;
    fire.maxLifeTime = 0.6;
    fire.emitRate = 0; // manual burst
    fire.manualEmitCount = 80;

    fire.direction1 = new Vector3(-4, 2, -4).scale(scale);
    fire.direction2 = new Vector3(4, 6, 4).scale(scale);
    fire.minEmitPower = 5 * scale;
    fire.maxEmitPower = 15 * scale;

    fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.gravity = new Vector3(0, -5, 0);
    fire.targetStopDuration = 0.6;
    fire.disposeOnStop = true;
    fire.start();

    // Smoke cloud
    const smoke = new ParticleSystem('vfx_explSmoke', 200, this.scene);
    smoke.particleTexture = tex(this.scene, LOCAL.smoke);
    smoke.emitter = position.clone();
    smoke.minEmitBox = new Vector3(-1, 0, -1).scale(scale);
    smoke.maxEmitBox = new Vector3(1, 0.5, 1).scale(scale);

    smoke.color1 = new Color4(0.3, 0.3, 0.3, 0.7);
    smoke.color2 = new Color4(0.15, 0.15, 0.15, 0.5);
    smoke.colorDead = new Color4(0.05, 0.05, 0.05, 0);

    smoke.minSize = 1.0 * scale;
    smoke.maxSize = 3.5 * scale;
    smoke.minLifeTime = 0.5;
    smoke.maxLifeTime = 1.5;
    smoke.emitRate = 0;
    smoke.manualEmitCount = 40;

    smoke.direction1 = new Vector3(-2, 3, -2);
    smoke.direction2 = new Vector3(2, 8, 2);
    smoke.minEmitPower = 2;
    smoke.maxEmitPower = 6;

    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.gravity = new Vector3(0, 1, 0);
    smoke.targetStopDuration = 1.5;
    smoke.disposeOnStop = true;
    smoke.start();

    // Shockwave ring (mesh-based)
    this._shockwaveRing(position, scale);
  }

  _shockwaveRing(pos, scale) {
    const ring = MeshBuilder.CreateTorus('shockwave', {
      diameter: 0.5 * scale, thickness: 0.15 * scale, tessellation: 24
    }, this.scene);
    ring.position = pos.clone();
    ring.position.y += 0.2;
    const mat = new StandardMaterial('shockMat', this.scene);
    mat.emissiveColor = new Color3(1, 0.6, 0.1);
    mat.alpha = 0.8;
    mat.disableLighting = true;
    ring.material = mat;

    let t = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      t += this.scene.getEngine().getDeltaTime() / 1000;
      const s = 1 + t * 20 * scale;
      ring.scaling.set(s, 1, s);
      mat.alpha = Math.max(0, 0.8 - t * 2);
      if (t > 0.5) {
        ring.dispose(); mat.dispose();
        this.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  // ── SHIELD BUBBLE ─────────────────────────────────────────────────
  /** Spawn a protective shield sphere around a mesh. Returns dispose fn. */
  shieldBubble(parentMesh, color = new Color3(0.3, 0.6, 1)) {
    const shield = MeshBuilder.CreateSphere('vfx_shield', { diameter: 5, segments: 16 }, this.scene);
    shield.parent = parentMesh;
    shield.position.y = 1;

    const mat = new StandardMaterial('shieldMat', this.scene);
    mat.emissiveColor = color;
    mat.alpha = 0.18;
    mat.disableLighting = true;
    mat.wireframe = true;
    shield.material = mat;

    // Shimmer particles
    const ps = new ParticleSystem('vfx_shieldParts', 60, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = parentMesh;
    ps.minEmitBox = new Vector3(-2, 0, -2);
    ps.maxEmitBox = new Vector3(2, 3, 2);

    ps.color1 = new Color4(color.r, color.g, color.b, 0.6);
    ps.color2 = new Color4(color.r * 0.5, color.g * 0.5, color.b * 0.5, 0.3);
    ps.colorDead = new Color4(0, 0, 0, 0);

    ps.minSize = 0.03;
    ps.maxSize = 0.08;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.5;
    ps.emitRate = 30;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.5, 0);
    ps.start();

    // Pulse animation
    let pulse = 0;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      pulse += this.scene.getEngine().getDeltaTime() / 1000;
      const s = 1 + Math.sin(pulse * 3) * 0.05;
      shield.scaling.setAll(s);
      mat.alpha = 0.12 + Math.sin(pulse * 2) * 0.06;
    });

    return () => {
      ps.stop(); ps.dispose();
      shield.dispose(); mat.dispose();
      this.scene.onBeforeRenderObservable.remove(obs);
    };
  }

  // ── NITRO EXHAUST ─────────────────────────────────────────────────
  /** Persistent exhaust flames while nitro is active. Attach to kart. */
  nitroExhaust(emitterMesh) {
    const ps = new ParticleSystem('vfx_nitro', 150, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.fireball);
    ps.emitter = emitterMesh;

    ps.color1 = new Color4(0.2, 0.5, 1.0, 1);
    ps.color2 = new Color4(0.1, 0.2, 0.8, 0.7);
    ps.colorDead = new Color4(0.0, 0.0, 0.3, 0);

    ps.minSize = 0.15;
    ps.maxSize = 0.4;
    ps.minLifeTime = 0.05;
    ps.maxLifeTime = 0.15;
    ps.emitRate = 120;

    ps.direction1 = new Vector3(-0.2, 0, -2);
    ps.direction2 = new Vector3(0.2, 0.3, -1);
    ps.minEmitPower = 8;
    ps.maxEmitPower = 15;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    this._track(ps);
    return ps;
  }

  // ── SMOKE TRAIL ───────────────────────────────────────────────────
  /** Drift/damage smoke behind a kart. */
  smokeTrail(emitterMesh) {
    const ps = new ParticleSystem('vfx_smoke', 100, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.smoke);
    ps.emitter = emitterMesh;

    ps.color1 = new Color4(0.4, 0.4, 0.4, 0.5);
    ps.color2 = new Color4(0.2, 0.2, 0.2, 0.3);
    ps.colorDead = new Color4(0.1, 0.1, 0.1, 0);

    ps.minSize = 0.3;
    ps.maxSize = 1.0;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.5;
    ps.emitRate = 40;

    ps.direction1 = new Vector3(-0.5, 0.5, -0.5);
    ps.direction2 = new Vector3(0.5, 1.5, 0.5);
    ps.minEmitPower = 1;
    ps.maxEmitPower = 3;

    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, 1, 0);
    ps.start();
    this._track(ps);
    return ps;
  }

  // ── HIT SPARKS ────────────────────────────────────────────────────
  /** One-shot spark burst on impact. */
  hitSparks(position, color = null) {
    const ps = new ParticleSystem('vfx_sparks', 60, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = position.clone();

    const c = color || { r: 1, g: 0.8, b: 0.2 };
    ps.color1 = new Color4(c.r, c.g, c.b, 1);
    ps.color2 = new Color4(c.r * 0.5, c.g * 0.3, 0, 0.6);
    ps.colorDead = new Color4(0, 0, 0, 0);

    ps.minSize = 0.02;
    ps.maxSize = 0.08;
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.4;
    ps.emitRate = 0;
    ps.manualEmitCount = 40;

    ps.direction1 = new Vector3(-3, 1, -3);
    ps.direction2 = new Vector3(3, 5, 3);
    ps.minEmitPower = 5;
    ps.maxEmitPower = 15;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -15, 0);
    ps.targetStopDuration = 0.4;
    ps.disposeOnStop = true;
    ps.start();
  }

  // ── MINE GLOW ─────────────────────────────────────────────────────
  /** Pulsing glow for proximity mines on the ground. */
  mineGlow(emitterMesh) {
    const ps = new ParticleSystem('vfx_mine', 30, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = emitterMesh;

    ps.color1 = new Color4(1, 0.2, 0.2, 0.5);
    ps.color2 = new Color4(0.8, 0.1, 0.1, 0.3);
    ps.colorDead = new Color4(0.3, 0, 0, 0);

    ps.minSize = 0.1;
    ps.maxSize = 0.25;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.0;
    ps.emitRate = 15;

    ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
    ps.maxEmitBox = new Vector3(0.3, 0.2, 0.3);
    ps.direction1 = new Vector3(0, 0.5, 0);
    ps.direction2 = new Vector3(0, 1, 0);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 1;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    this._track(ps);
    return ps;
  }

  // ── TOXIN CLOUD ───────────────────────────────────────────────────
  /** Lingering poison area from Orc's Toxin Launcher. */
  toxinCloud(position, radius = 8, duration = 4) {
    const ps = new ParticleSystem('vfx_toxin', 200, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.smoke);
    ps.emitter = position.clone();
    ps.minEmitBox = new Vector3(-radius * 0.5, 0, -radius * 0.5);
    ps.maxEmitBox = new Vector3(radius * 0.5, 1, radius * 0.5);

    ps.color1 = new Color4(0.2, 0.6, 0.1, 0.4);
    ps.color2 = new Color4(0.3, 0.4, 0.1, 0.25);
    ps.colorDead = new Color4(0.1, 0.2, 0.0, 0);

    ps.minSize = 1.0;
    ps.maxSize = 3.0;
    ps.minLifeTime = 1;
    ps.maxLifeTime = 2.5;
    ps.emitRate = 40;

    ps.direction1 = new Vector3(-0.5, 0.5, -0.5);
    ps.direction2 = new Vector3(0.5, 2, 0.5);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 2;

    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, 0.3, 0);
    ps.start();

    // Auto-stop after duration
    setTimeout(() => {
      ps.stop();
      setTimeout(() => ps.dispose(), 3000);
    }, duration * 1000);

    return ps;
  }

  // ── SOUL DRAIN BEAM ───────────────────────────────────────────────
  /** Undead's lifesteal beam between two points. */
  soulDrainBeam(fromMesh, toPosition) {
    const ps = new ParticleSystem('vfx_soul', 100, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = fromMesh;

    ps.color1 = new Color4(0.6, 0.2, 0.8, 0.8);
    ps.color2 = new Color4(0.3, 0.1, 0.5, 0.5);
    ps.colorDead = new Color4(0.1, 0, 0.2, 0);

    ps.minSize = 0.05;
    ps.maxSize = 0.15;
    ps.minLifeTime = 0.1;
    ps.maxLifeTime = 0.3;
    ps.emitRate = 100;

    // Direction toward target
    const dir = toPosition.subtract(fromMesh.getAbsolutePosition()).normalize();
    ps.direction1 = dir.scale(0.8);
    ps.direction2 = dir.scale(1.2);
    ps.minEmitPower = 15;
    ps.maxEmitPower = 25;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    this._track(ps);
    return ps;
  }

  // ── THORN BURST ───────────────────────────────────────────────────
  /** Elf's Thorn Volley — spread of green projectile particles. */
  thornBurst(origin, direction, count = 5) {
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * 0.2;
      const dir = direction.clone();
      dir.x += spread;
      dir.normalize();

      const ps = new ParticleSystem(`vfx_thorn_${i}`, 20, this.scene);
      ps.particleTexture = tex(this.scene, LOCAL.projectile);

      const emitter = new TransformNode(`thornE_${i}`, this.scene);
      emitter.position = origin.clone();
      ps.emitter = emitter;

      ps.color1 = new Color4(0.2, 0.8, 0.3, 1);
      ps.color2 = new Color4(0.1, 0.5, 0.2, 0.6);
      ps.colorDead = new Color4(0, 0.2, 0, 0);

      ps.minSize = 0.06;
      ps.maxSize = 0.12;
      ps.minLifeTime = 0.05;
      ps.maxLifeTime = 0.1;
      ps.emitRate = 80;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;

      ps.direction1 = dir.scale(-0.3);
      ps.direction2 = dir.scale(-0.1);
      ps.minEmitPower = 1;
      ps.maxEmitPower = 2;

      ps.start();

      // Move and cleanup
      let life = 1.2;
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        life -= dt;
        emitter.position.addInPlace(dir.scale(50 * dt));
        if (life <= 0) {
          ps.stop(); ps.dispose(); emitter.dispose();
          this.scene.onBeforeRenderObservable.remove(obs);
        }
      });
    }
  }

  // ── FLAIL SPIN ────────────────────────────────────────────────────
  /** Barbarian's melee spin — ring of sparks around the kart. */
  flailSpin(parentMesh, radius = 6, duration = 1.5) {
    const ps = new ParticleSystem('vfx_flail', 200, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = parentMesh;

    ps.color1 = new Color4(1, 0.5, 0.1, 1);
    ps.color2 = new Color4(0.8, 0.2, 0.0, 0.7);
    ps.colorDead = new Color4(0.3, 0, 0, 0);

    ps.minSize = 0.1;
    ps.maxSize = 0.25;
    ps.minLifeTime = 0.15;
    ps.maxLifeTime = 0.4;
    ps.emitRate = 150;

    ps.minEmitBox = new Vector3(-radius, 0.5, -radius);
    ps.maxEmitBox = new Vector3(radius, 1.5, radius);

    ps.direction1 = new Vector3(-2, 1, -2);
    ps.direction2 = new Vector3(2, 3, 2);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 8;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();

    setTimeout(() => {
      ps.stop();
      setTimeout(() => ps.dispose(), 1000);
    }, duration * 1000);

    return ps;
  }

  // ── RAM IMPACT ────────────────────────────────────────────────────
  /** Warkind's Shield Bash Ram impact — shockwave + sparks. */
  ramImpact(position) {
    this.hitSparks(position, { r: 0.9, g: 0.7, b: 0.2 });
    this._shockwaveRing(position, 1.5);

    // Golden flash
    const ps = new ParticleSystem('vfx_ram', 100, this.scene);
    ps.particleTexture = tex(this.scene, LOCAL.projectile);
    ps.emitter = position.clone();

    ps.color1 = new Color4(1, 0.8, 0.3, 1);
    ps.color2 = new Color4(0.8, 0.6, 0.1, 0.5);
    ps.colorDead = new Color4(0, 0, 0, 0);

    ps.minSize = 0.15;
    ps.maxSize = 0.4;
    ps.emitRate = 0;
    ps.manualEmitCount = 60;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.5;

    ps.direction1 = new Vector3(-5, 2, -5);
    ps.direction2 = new Vector3(5, 6, 5);
    ps.minEmitPower = 8;
    ps.maxEmitPower = 20;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -10, 0);
    ps.targetStopDuration = 0.5;
    ps.disposeOnStop = true;
    ps.start();
  }

  // ── CLEANUP ───────────────────────────────────────────────────────

  _track(ps) {
    this._activeSystems.push(ps);
  }

  /** Stop and dispose a specific particle system. */
  kill(ps) {
    if (!ps) return;
    ps.stop();
    setTimeout(() => {
      ps.dispose();
      this._activeSystems = this._activeSystems.filter(s => s !== ps);
    }, 500);
  }

  /** Dispose all active VFX. */
  disposeAll() {
    this._activeSystems.forEach(ps => {
      try { ps.stop(); ps.dispose(); } catch {}
    });
    this._activeSystems = [];
  }
}
