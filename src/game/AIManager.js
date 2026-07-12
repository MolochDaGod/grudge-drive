/**
 * AIManager — Mode-aware bot drivers.
 *
 * battle  — chase + shoot player
 * drag    — straight-line race with staged launch + nitro bursts
 * race    — race toward finish along +Z with light steering
 * timeAttack — no bots
 *
 * Uses simple kinematic movement (reliable) instead of Havok aggregates
 * so bots never fall through or desync from TriggerVehicle players.
 */

import {
  MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion, TransformNode
} from '@babylonjs/core';

const BOT_COLORS = [
  new Color3(0.75, 0.15, 0.15),
  new Color3(0.15, 0.55, 0.2),
  new Color3(0.2, 0.25, 0.75),
  new Color3(0.65, 0.12, 0.65),
  new Color3(0.1, 0.55, 0.55),
  new Color3(0.75, 0.45, 0.1),
  new Color3(0.55, 0.55, 0.12),
  new Color3(0.45, 0.12, 0.35),
];

export class AIManager {
  constructor(scene, player, weapons, audio) {
    this.scene = scene;
    this.player = player;
    this.weapons = weapons;
    this.audio = audio;
    this.bots = [];
    this.mode = 'battle';
    this.frozen = false;
    this.finishDistance = 402;
    this.startZ = 0;
    this._bulletMat = null;
    this._onBotKilled = null;
    this._initMaterials();
  }

  _initMaterials() {
    this._bulletMat = new StandardMaterial('aiBulletMat', this.scene);
    this._bulletMat.emissiveColor = new Color3(1, 0.25, 0.2);
    this._bulletMat.disableLighting = true;
  }

  /**
   * @param {number} count
   * @param {{ mode?: string, spawns?: Array, finishDistance?: number, startZ?: number }} [opts]
   */
  async spawnBots(count, opts = {}) {
    this.mode = opts.mode || 'battle';
    this.finishDistance = opts.finishDistance || 402;
    this.startZ = opts.startZ ?? 0;
    const spawns = opts.spawns || [];

    for (let i = 0; i < count; i++) {
      const spawn = spawns[i + 1] || spawns[i] || null; // i+1 if player took spawn 0
      const bot = this._createBot(i, spawn);
      this.bots.push(bot);
    }
  }

  _createBot(index, spawn) {
    const scene = this.scene;
    const color = BOT_COLORS[index % BOT_COLORS.length];
    const root = new TransformNode(`bot_${index}`, scene);

    const body = MeshBuilder.CreateBox(`botBody_${index}`, { width: 2.0, height: 0.7, depth: 3.6 }, scene);
    body.parent = root;
    body.position.y = 0.55;
    const mat = new StandardMaterial(`botMat_${index}`, scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.12);
    mat.specularColor = new Color3(0.25, 0.25, 0.25);
    body.material = mat;

    const cabin = MeshBuilder.CreateBox(`botCabin_${index}`, { width: 1.5, height: 0.5, depth: 1.4 }, scene);
    cabin.parent = root;
    cabin.position.set(0, 1.05, -0.15);
    const cabMat = new StandardMaterial(`botCabMat_${index}`, scene);
    cabMat.diffuseColor = new Color3(0.08, 0.08, 0.1);
    cabMat.alpha = 0.7;
    cabin.material = cabMat;

    const wMat = new StandardMaterial(`botWheelMat_${index}`, scene);
    wMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    const wheels = [];
    [[-1.0, 0.28, 1.15], [1.0, 0.28, 1.15], [-1.0, 0.28, -1.15], [1.0, 0.28, -1.15]].forEach((pos, wi) => {
      const w = MeshBuilder.CreateCylinder(`botWheel_${index}_${wi}`, {
        diameter: 0.55, height: 0.32, tessellation: 10
      }, scene);
      w.rotation.z = Math.PI / 2;
      w.position.set(...pos);
      w.parent = root;
      w.material = wMat;
      wheels.push(w);
    });

    // Skill variance — some bots are tough
    const skill = 0.72 + Math.random() * 0.28;
    const maxSpeed = this.mode === 'drag'
      ? 38 + skill * 14
      : this.mode === 'race'
        ? 28 + skill * 12
        : 22 + skill * 8;

    if (spawn) {
      root.position.set(spawn.x, spawn.y ?? 1.2, spawn.z);
    } else if (this.mode === 'drag' || this.mode === 'race') {
      root.position.set(2.5 + index * 0.5, 1.2, this.startZ);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 35 + Math.random() * 40;
      root.position.set(Math.cos(angle) * dist, 1.2, Math.sin(angle) * dist);
    }

    // Face +Z for race/drag
    if (this.mode === 'drag' || this.mode === 'race' || this.mode === 'timeAttack') {
      root.rotationQuaternion = Quaternion.Identity();
    }

    root.metadata = { type: 'bot', index };

    return {
      root,
      body,
      wheels,
      health: this.mode === 'battle' ? 80 : 100,
      maxHealth: this.mode === 'battle' ? 80 : 100,
      fireCooldown: Math.random() * 1.5,
      alive: true,
      respawnTimer: 0,
      projectiles: [],
      maxSpeed,
      skill,
      speed: 0,
      currentSpeed: 0,
      nitroTimer: 0.4 + Math.random() * 0.8, // when they punch nitro
      nitroActive: 0,
      yaw: 0,
    };
  }

  update(dt) {
    if (this.frozen) return;

    const playerPos = this.player.getPosition();

    for (const bot of this.bots) {
      if (!bot.alive) {
        if (this.mode === 'battle') {
          bot.respawnTimer -= dt;
          if (bot.respawnTimer <= 0) this._respawn(bot);
        }
        continue;
      }

      if (this.mode === 'battle' && this.weapons) {
        const dmg = this.weapons.checkHit(bot.root.getAbsolutePosition(), 2.5);
        if (dmg > 0) {
          bot.health -= dmg;
          if (bot.health <= 0) {
            this._killBot(bot);
            continue;
          }
        }
      }

      if (this.mode === 'drag') this._updateDragBot(bot, dt);
      else if (this.mode === 'race') this._updateRaceBot(bot, dt);
      else this._updateBattleBot(bot, dt, playerPos);

      bot.wheels.forEach(w => { w.rotation.x += bot.currentSpeed * dt * 0.15; });
      if (this.mode === 'battle') this._updateBotProjectiles(bot, dt);
    }
  }

  _updateDragBot(bot, dt) {
    // Staged launch: ease into throttle
    bot.nitroTimer -= dt;
    if (bot.nitroTimer <= 0 && bot.nitroActive <= 0) {
      bot.nitroActive = 1.2 + Math.random() * 1.5;
      bot.nitroTimer = 2.5 + Math.random() * 2;
    }
    if (bot.nitroActive > 0) bot.nitroActive -= dt;

    const boost = bot.nitroActive > 0 ? 1.35 : 1.0;
    const target = bot.maxSpeed * boost * bot.skill;
    bot.speed += (target - bot.speed) * Math.min(1, dt * 1.8);
    bot.currentSpeed = bot.speed;

    // Keep in lane (x toward spawn lane)
    const laneX = bot.root.position.x;
    const pos = bot.root.position;
    pos.z += bot.speed * dt;
    pos.x += (laneX - pos.x) * dt * 2; // hold lane
    pos.y = 1.2;
    bot.root.position = pos;
    bot.root.rotationQuaternion = Quaternion.Identity();
  }

  _updateRaceBot(bot, dt) {
    bot.nitroTimer -= dt;
    if (bot.nitroTimer <= 0) {
      bot.nitroActive = 0.8;
      bot.nitroTimer = 3 + Math.random() * 3;
    }
    if (bot.nitroActive > 0) bot.nitroActive -= dt;

    const boost = bot.nitroActive > 0 ? 1.2 : 1.0;
    const target = bot.maxSpeed * boost;
    bot.speed += (target - bot.speed) * Math.min(1, dt * 1.4);
    bot.currentSpeed = bot.speed;

    // Mild weave so they aren't perfectly straight
    bot.yaw += Math.sin(performance.now() * 0.001 + bot.skill * 10) * dt * 0.15;
    const pos = bot.root.position;
    pos.z += Math.cos(bot.yaw) * bot.speed * dt;
    pos.x += Math.sin(bot.yaw) * bot.speed * dt * 0.4;
    pos.x = Math.max(-40, Math.min(40, pos.x));
    pos.y = 1.2;
    bot.root.position = pos;
    bot.root.rotationQuaternion = Quaternion.FromEulerAngles(0, bot.yaw, 0);
  }

  _updateBattleBot(bot, dt, playerPos) {
    const botPos = bot.root.getAbsolutePosition();
    const toPlayer = playerPos.subtract(botPos);
    const dist = toPlayer.length();

    if (dist < 90 && dist > 0.1) {
      const dir = toPlayer.normalize();
      const targetYaw = Math.atan2(dir.x, dir.z);
      // Smooth turn
      let dy = targetYaw - bot.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      bot.yaw += dy * Math.min(1, dt * 2.5);

      const target = bot.maxSpeed * (dist < 12 ? 0.4 : 1);
      bot.speed += (target - bot.speed) * Math.min(1, dt * 2);
      bot.currentSpeed = bot.speed;

      bot.root.position.x += Math.sin(bot.yaw) * bot.speed * dt;
      bot.root.position.z += Math.cos(bot.yaw) * bot.speed * dt;
      bot.root.position.y = 1.2;
      bot.root.rotationQuaternion = Quaternion.FromEulerAngles(0, bot.yaw, 0);

      if (dist < 28) {
        bot.fireCooldown -= dt;
        if (bot.fireCooldown <= 0) {
          this._botFire(bot, dir);
          bot.fireCooldown = 1.2 + Math.random() * 0.8;
        }
      }
    } else {
      bot.speed *= 0.95;
      bot.currentSpeed = bot.speed;
    }
  }

  _botFire(bot, dir) {
    const pos = bot.root.getAbsolutePosition().clone();
    pos.y += 1.4;
    const mesh = MeshBuilder.CreateSphere(`aiProj_${Date.now()}_${Math.random()}`, {
      diameter: 0.22
    }, this.scene);
    mesh.position = pos.add(dir.scale(2.2));
    mesh.material = this._bulletMat;
    bot.projectiles.push({ mesh, velocity: dir.scale(52), life: 2.0 });
  }

  _updateBotProjectiles(bot, dt) {
    for (let i = bot.projectiles.length - 1; i >= 0; i--) {
      const p = bot.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.dispose();
        bot.projectiles.splice(i, 1);
        continue;
      }
      p.mesh.position.addInPlace(p.velocity.scale(dt));
      const dist = Vector3.Distance(p.mesh.position, this.player.getPosition());
      if (dist < 2.2) {
        this.player.takeDamage(7);
        p.mesh.dispose();
        bot.projectiles.splice(i, 1);
        continue;
      }
      const pos = p.mesh.position;
      if (Math.abs(pos.x) > 120 || Math.abs(pos.z) > 120 || pos.y < -5) {
        p.mesh.dispose();
        bot.projectiles.splice(i, 1);
      }
    }
  }

  _killBot(bot) {
    bot.alive = false;
    bot.respawnTimer = 5;
    bot.root.position.set(0, -80, 0);
    bot.projectiles.forEach(p => p.mesh.dispose());
    bot.projectiles = [];
    bot.speed = 0;
    this._onBotKilled?.();
  }

  _respawn(bot) {
    bot.alive = true;
    bot.health = bot.maxHealth;
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    bot.root.position.set(Math.cos(angle) * dist, 1.2, Math.sin(angle) * dist);
    bot.yaw = Math.random() * Math.PI * 2;
    bot.root.rotationQuaternion = Quaternion.FromEulerAngles(0, bot.yaw, 0);
    bot.speed = 0;
  }

  onBotKilled(fn) { this._onBotKilled = fn; }

  reset() {
    this.frozen = false;
    for (const bot of this.bots) {
      bot.projectiles.forEach(p => p.mesh.dispose());
      bot.projectiles = [];
      bot.alive = true;
      bot.health = bot.maxHealth;
      bot.speed = 0;
      bot.currentSpeed = 0;
      bot.nitroActive = 0;
      bot.nitroTimer = 0.5 + Math.random();
      if (this.mode === 'drag' || this.mode === 'race') {
        // keep lane x, reset z
        bot.root.position.z = this.startZ;
        bot.root.position.y = 1.2;
        bot.root.rotationQuaternion = Quaternion.Identity();
        bot.yaw = 0;
      } else {
        this._respawn(bot);
      }
    }
  }

  dispose() {
    for (const bot of this.bots) {
      bot.projectiles.forEach(p => p.mesh.dispose());
      bot.root.getChildMeshes().forEach(m => m.dispose());
      bot.root.dispose();
    }
    this.bots = [];
  }
}
