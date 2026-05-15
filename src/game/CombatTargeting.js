import {
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial,
  ParticleSystem, Texture, Quaternion
} from '@babylonjs/core';

/**
 * CombatTargeting — auto-lock nearest enemy (Tab), spline-guided missiles,
 * particle explosions on impact.
 */

// ── Cubic Hermite spline interpolation ──────────────────────────────
function hermite(t, p0, p1, m0, m1) {
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return p0.scale(h00).add(m0.scale(h10)).add(p1.scale(h01)).add(m1.scale(h11));
}

const MISSILE_CONFIG = {
  speed: 35,           // base travel speed m/s
  lifetime: 4.0,       // max seconds alive
  turnRate: 6.0,       // how fast it curves toward target
  damage: 30,
  lockRange: 80,       // max auto-lock distance
  lockAngle: 0.8,      // max angle (radians) from forward to lock
  cooldown: 1.2,       // seconds between missile fires
  trailRate: 800,      // particles per second
  explosionDuration: 0.6,
  explosionRadius: 5,
};

export class CombatTargeting {
  constructor(scene, player, aiManager) {
    this.scene = scene;
    this.player = player;
    this.aiManager = aiManager;
    this.lockedTarget = null;       // bot object or null
    this.missiles = [];
    this._cooldown = 0;
    this._lockIndicator = null;

    // Materials
    this._missileMat = new StandardMaterial('missileMat', scene);
    this._missileMat.emissiveColor = new Color3(1, 0.6, 0.1);
    this._missileMat.disableLighting = true;

    this._lockMat = new StandardMaterial('lockMat', scene);
    this._lockMat.emissiveColor = new Color3(1, 0.2, 0.2);
    this._lockMat.disableLighting = true;
    this._lockMat.wireframe = true;

    this._setupInput();
  }

  _setupInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this._cycleLock();
      }
      // Right-click to fire missile
      if (e.code === 'KeyR' || e.code === 'KeyQ') {
        this.fireMissile();
      }
    });
    // Also fire missile on right-click
    document.getElementById('renderCanvas').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.fireMissile();
    });
  }

  // ── Auto-lock nearest enemy within cone ──
  _cycleLock() {
    const playerPos = this.player.getPosition();
    const playerFwd = this.player.getForward();
    let best = null;
    let bestDist = Infinity;

    for (const bot of this.aiManager.bots) {
      if (!bot.alive) continue;
      const botPos = bot.root.getAbsolutePosition();
      const toBot = botPos.subtract(playerPos);
      const dist = toBot.length();
      if (dist > MISSILE_CONFIG.lockRange) continue;

      // Check angle
      const angle = Math.acos(Math.max(-1, Math.min(1,
        Vector3.Dot(playerFwd.normalize(), toBot.normalize())
      )));
      if (angle > MISSILE_CONFIG.lockAngle) continue;

      // If we already have this one locked, skip to find next
      if (this.lockedTarget === bot) continue;

      if (dist < bestDist) {
        bestDist = dist;
        best = bot;
      }
    }

    // If no new target found, try locking closest regardless
    if (!best) {
      for (const bot of this.aiManager.bots) {
        if (!bot.alive) continue;
        const dist = Vector3.Distance(playerPos, bot.root.getAbsolutePosition());
        if (dist < MISSILE_CONFIG.lockRange && dist < bestDist) {
          bestDist = dist;
          best = bot;
        }
      }
    }

    this.lockedTarget = best;
    this._updateLockIndicator();
  }

  _updateLockIndicator() {
    if (this._lockIndicator) {
      this._lockIndicator.dispose();
      this._lockIndicator = null;
    }
    if (!this.lockedTarget) return;

    this._lockIndicator = MeshBuilder.CreateBox('lockBox', { size: 3.5 }, this.scene);
    this._lockIndicator.material = this._lockMat;
    this._lockIndicator.parent = this.lockedTarget.root;
    this._lockIndicator.position.y = 1;
  }

  // ── Fire a spline-guided missile ──
  fireMissile() {
    if (this._cooldown > 0) return;
    if (!this.lockedTarget || !this.lockedTarget.alive) {
      // Auto-lock if none
      this._cycleLock();
      if (!this.lockedTarget) return;
    }
    this._cooldown = MISSILE_CONFIG.cooldown;

    const startPos = this.player.getPosition().clone();
    startPos.y += 2.2;

    const fwd = this.player.getForward().normalize();

    // Missile mesh
    const mesh = MeshBuilder.CreateCylinder('missile_' + Date.now(), {
      diameter: 0.2, height: 0.8, tessellation: 6
    }, this.scene);
    mesh.position = startPos.add(fwd.scale(3));
    mesh.material = this._missileMat;

    // Particle trail
    const trail = new ParticleSystem('trail_' + Date.now(), 200, this.scene);
    trail.emitter = mesh;
    trail.minSize = 0.1;
    trail.maxSize = 0.3;
    trail.minLifeTime = 0.1;
    trail.maxLifeTime = 0.3;
    trail.emitRate = MISSILE_CONFIG.trailRate;
    trail.color1 = new Color4(1, 0.6, 0.1, 1);
    trail.color2 = new Color4(1, 0.2, 0.0, 0.6);
    trail.colorDead = new Color4(0.3, 0.1, 0.0, 0);
    trail.direction1 = new Vector3(-0.3, -0.3, -0.3);
    trail.direction2 = new Vector3(0.3, 0.3, 0.3);
    trail.minEmitPower = 0.5;
    trail.maxEmitPower = 1.5;
    trail.updateSpeed = 0.02;
    // Use a basic circle texture for particles
    try {
      trail.particleTexture = new Texture('/assets/textures/smoke01.png', this.scene);
    } catch (_) { /* proceed without texture */ }
    trail.start();

    // Spline control: start tangent = forward, end tangent curves toward target
    const missile = {
      mesh,
      trail,
      target: this.lockedTarget,
      velocity: fwd.scale(MISSILE_CONFIG.speed),
      life: MISSILE_CONFIG.lifetime,
      startPos: mesh.position.clone(),
      startTangent: fwd.scale(MISSILE_CONFIG.speed * 0.8),
    };

    this.missiles.push(missile);
  }

  update(dt) {
    if (this._cooldown > 0) this._cooldown -= dt;

    // Validate lock
    if (this.lockedTarget && !this.lockedTarget.alive) {
      this.lockedTarget = null;
      this._updateLockIndicator();
    }

    // Rotate lock indicator
    if (this._lockIndicator && !this._lockIndicator.isDisposed()) {
      this._lockIndicator.rotation.y += dt * 3;
    }

    // Update missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;

      if (m.life <= 0 || m.mesh.isDisposed()) {
        this._disposeMissile(m);
        this.missiles.splice(i, 1);
        continue;
      }

      // Guide toward target using spline-influenced steering
      if (m.target?.alive && m.target.root) {
        const targetPos = m.target.root.getAbsolutePosition().add(new Vector3(0, 1, 0));
        const toTarget = targetPos.subtract(m.mesh.position);
        const dist = toTarget.length();

        // Steer velocity toward target (spline-like curve)
        const desired = toTarget.normalize().scale(MISSILE_CONFIG.speed);
        const steer = desired.subtract(m.velocity).scale(MISSILE_CONFIG.turnRate * dt);
        m.velocity.addInPlace(steer);

        // Clamp speed
        if (m.velocity.length() > MISSILE_CONFIG.speed * 1.2) {
          m.velocity = m.velocity.normalize().scale(MISSILE_CONFIG.speed);
        }

        // Orient missile along velocity
        const velDir = m.velocity.normalize();
        const lookTarget = m.mesh.position.add(velDir);
        m.mesh.lookAt(lookTarget);

        // Hit detection
        if (dist < 3) {
          m.target.health -= MISSILE_CONFIG.damage;
          if (m.target.health <= 0) {
            // Let AIManager handle kill on next frame
          }
          this._spawnExplosion(m.mesh.position);
          this._disposeMissile(m);
          this.missiles.splice(i, 1);
          continue;
        }
      }

      // Move
      m.mesh.position.addInPlace(m.velocity.scale(dt));

      // Out of bounds
      if (m.mesh.position.y < -10 || m.mesh.position.length() > 200) {
        this._disposeMissile(m);
        this.missiles.splice(i, 1);
      }
    }
  }

  _disposeMissile(m) {
    m.trail?.stop();
    m.trail?.dispose();
    m.mesh?.dispose();
  }

  // ── Particle explosion ──
  _spawnExplosion(pos) {
    const explosion = new ParticleSystem('explosion_' + Date.now(), 300, this.scene);
    explosion.emitter = pos.clone();
    explosion.minSize = 0.3;
    explosion.maxSize = 1.5;
    explosion.minLifeTime = 0.2;
    explosion.maxLifeTime = MISSILE_CONFIG.explosionDuration;
    explosion.emitRate = 0; // burst mode
    explosion.manualEmitCount = 150;
    explosion.color1 = new Color4(1, 0.7, 0.2, 1);
    explosion.color2 = new Color4(1, 0.3, 0.0, 1);
    explosion.colorDead = new Color4(0.2, 0.05, 0.0, 0);
    explosion.direction1 = new Vector3(-3, -1, -3);
    explosion.direction2 = new Vector3(3, 4, 3);
    explosion.minEmitPower = 3;
    explosion.maxEmitPower = 8;
    explosion.updateSpeed = 0.02;
    explosion.gravity = new Vector3(0, -5, 0);
    try {
      explosion.particleTexture = new Texture('/assets/textures/smoke01.png', this.scene);
    } catch (_) { /* proceed without */ }
    explosion.targetStopDuration = MISSILE_CONFIG.explosionDuration;
    explosion.disposeOnStop = true;
    explosion.start();

    // Secondary flash
    const flash = MeshBuilder.CreateSphere('explFlash', { diameter: MISSILE_CONFIG.explosionRadius }, this.scene);
    flash.position = pos.clone();
    const mat = new StandardMaterial('explMat', this.scene);
    mat.emissiveColor = new Color3(1, 0.5, 0.1);
    mat.alpha = 0.7;
    mat.disableLighting = true;
    flash.material = mat;

    let life = 0.35;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      life -= this.scene.getEngine().getDeltaTime() / 1000;
      mat.alpha = Math.max(0, life / 0.35) * 0.7;
      flash.scaling.setAll(1 + (0.35 - life) * 6);
      if (life <= 0) {
        flash.dispose();
        mat.dispose();
        this.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  reset() {
    this.missiles.forEach(m => this._disposeMissile(m));
    this.missiles = [];
    this.lockedTarget = null;
    this._updateLockIndicator();
    this._cooldown = 0;
  }
}
