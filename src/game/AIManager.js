import {
  MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion,
  PhysicsAggregate, PhysicsShapeType, TransformNode
} from '@babylonjs/core';
import { getTerrainHeight } from './TerrainGenerator.js';

const BOT_CONFIG = {
  maxSpeed: 28,
  acceleration: 18,
  turnSpeed: 2.0,
  health: 80,
  mass: 70,
  attackRange: 30,
  fireRate: 1.5,
  fireDamage: 6,
  detectionRange: 80,
  respawnDelay: 5,
};

const BOT_COLORS = [
  new Color3(0.7, 0.15, 0.15),  // crimson
  new Color3(0.15, 0.5, 0.15),  // green
  new Color3(0.2, 0.2, 0.7),    // blue
  new Color3(0.6, 0.1, 0.6),    // purple
  new Color3(0.1, 0.5, 0.5),    // teal
  new Color3(0.7, 0.4, 0.1),    // orange
  new Color3(0.5, 0.5, 0.1),    // olive
  new Color3(0.4, 0.1, 0.3),    // maroon
];

export class AIManager {
  constructor(scene, player, weapons, audio) {
    this.scene = scene;
    this.player = player;
    this.weapons = weapons;
    this.audio = audio;
    this.bots = [];
    this._bulletMat = null;
    this._initMaterials();
  }

  _initMaterials() {
    this._bulletMat = new StandardMaterial('aiBulletMat', this.scene);
    this._bulletMat.emissiveColor = new Color3(1, 0.2, 0.2);
    this._bulletMat.disableLighting = true;
  }

  async spawnBots(count) {
    for (let i = 0; i < count; i++) {
      const bot = this._createBot(i);
      this.bots.push(bot);
    }
  }

  _createBot(index) {
    const scene = this.scene;
    const color = BOT_COLORS[index % BOT_COLORS.length];

    const root = new TransformNode(`bot_${index}`, scene);

    // Body
    const body = MeshBuilder.CreateBox(`botBody_${index}`, { width: 2.2, height: 0.9, depth: 4.0 }, scene);
    body.parent = root;
    body.position.y = 0.75;
    const mat = new StandardMaterial(`botMat_${index}`, scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mat.emissiveColor = color.scale(0.15);
    body.material = mat;

    // Cabin
    const cabin = MeshBuilder.CreateBox(`botCabin_${index}`, { width: 1.8, height: 0.6, depth: 1.8 }, scene);
    cabin.parent = root;
    cabin.position.set(0, 1.4, -0.2);
    const cabMat = new StandardMaterial(`botCabMat_${index}`, scene);
    cabMat.diffuseColor = new Color3(0.1, 0.1, 0.12);
    cabMat.alpha = 0.6;
    cabin.material = cabMat;

    // Wheels
    const wMat = new StandardMaterial(`botWheelMat_${index}`, scene);
    wMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
    const wheels = [];
    [[-1.1, 0.3, 1.3], [1.1, 0.3, 1.3], [-1.1, 0.3, -1.3], [1.1, 0.3, -1.3]].forEach((pos, wi) => {
      const w = MeshBuilder.CreateCylinder(`botWheel_${index}_${wi}`, { diameter: 0.65, height: 0.35, tessellation: 12 }, scene);
      w.rotation.z = Math.PI / 2;
      w.position.set(...pos);
      w.parent = root;
      w.material = wMat;
      wheels.push(w);
    });

    // Spawn at random position on terrain
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 40;
    const sx = Math.cos(angle) * dist;
    const sz = Math.sin(angle) * dist;
    const sy = getTerrainHeight(sx, sz) + 3;
    root.position.set(sx, sy, sz);

    const physics = new PhysicsAggregate(root, PhysicsShapeType.BOX, {
      mass: BOT_CONFIG.mass,
      friction: 0.5,
      restitution: 0.2,
    }, scene);
    physics.body.setLinearDamping(0.4);
    physics.body.setAngularDamping(2.5);

    root.metadata = { type: 'bot', index };

    return {
      root,
      body,
      wheels,
      physics,
      health: BOT_CONFIG.health,
      fireCooldown: Math.random() * BOT_CONFIG.fireRate,
      alive: true,
      respawnTimer: 0,
      projectiles: [],
    };
  }

  update(dt) {
    const playerPos = this.player.getPosition();

    for (const bot of this.bots) {
      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) this._respawn(bot);
        continue;
      }

      // Player projectile hit detection
      const dmg = this.weapons.checkHit(bot.root.getAbsolutePosition(), 2.5);
      if (dmg > 0) {
        bot.health -= dmg;
        if (bot.health <= 0) {
          this._killBot(bot);
          continue;
        }
      }

      // AI movement — chase player
      const botPos = bot.root.getAbsolutePosition();
      const toPlayer = playerPos.subtract(botPos);
      const dist = toPlayer.length();

      if (dist < BOT_CONFIG.detectionRange) {
        const dir = toPlayer.normalize();

        // Steer toward player
        const fwd = this._getBotForward(bot);
        const cross = Vector3.Cross(fwd, dir);
        const steerDir = Math.sign(cross.y);

        const speed = bot.physics.body.getLinearVelocity().length();
        if (speed < BOT_CONFIG.maxSpeed) {
          const force = fwd.scale(BOT_CONFIG.acceleration * BOT_CONFIG.mass * dt);
          bot.physics.body.applyForce(force, botPos);
        }

        if (speed > 1) {
          const torque = new Vector3(0, steerDir * BOT_CONFIG.turnSpeed * Math.min(speed, 12) * dt * 40, 0);
          bot.physics.body.applyAngularImpulse(torque);
        }

        // Attack player when in range
        if (dist < BOT_CONFIG.attackRange) {
          bot.fireCooldown -= dt;
          if (bot.fireCooldown <= 0) {
            this._botFire(bot, dir);
            bot.fireCooldown = BOT_CONFIG.fireRate + Math.random() * 0.5;
          }
        }
      }

      // Keep upright
      const rot = bot.root.rotationQuaternion || Quaternion.Identity();
      const euler = rot.toEulerAngles();
      if (Math.abs(euler.x) > 0.4 || Math.abs(euler.z) > 0.4) {
        bot.root.rotationQuaternion = Quaternion.FromEulerAngles(euler.x * 0.85, euler.y, euler.z * 0.85);
      }

      // Fall recovery
      if (botPos.y < -20) {
        this._respawn(bot);
        continue;
      }

      // Wheel spin
      const spd = bot.physics.body.getLinearVelocity().length();
      bot.wheels.forEach(w => { w.rotation.x += spd * dt * 3; });

      // Update bot projectiles
      this._updateBotProjectiles(bot, dt);
    }
  }

  _getBotForward(bot) {
    const fwd = new Vector3(0, 0, 1);
    return Vector3.TransformNormal(fwd, bot.root.getWorldMatrix()).normalize();
  }

  _botFire(bot, dir) {
    const pos = bot.root.getAbsolutePosition().clone();
    pos.y += 1.8;

    const mesh = MeshBuilder.CreateSphere(`aiProj_${Date.now()}`, { diameter: 0.2 }, this.scene);
    mesh.position = pos.add(dir.scale(2.5));
    mesh.material = this._bulletMat;

    bot.projectiles.push({
      mesh,
      velocity: dir.scale(55),
      life: 2.0,
    });
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

      // Hit player?
      const dist = Vector3.Distance(p.mesh.position, this.player.getPosition());
      if (dist < 2.5) {
        this.player.takeDamage(BOT_CONFIG.fireDamage);
        p.mesh.dispose();
        bot.projectiles.splice(i, 1);
        continue;
      }

      // Out of bounds
      const pos = p.mesh.position;
      if (Math.abs(pos.x) > 110 || Math.abs(pos.z) > 110 || pos.y < -5) {
        p.mesh.dispose();
        bot.projectiles.splice(i, 1);
      }
    }
  }

  _killBot(bot) {
    bot.alive = false;
    bot.respawnTimer = BOT_CONFIG.respawnDelay;
    bot.root.position.set(0, -50, 0); // hide
    bot.physics.body.setLinearVelocity(Vector3.Zero());
    bot.projectiles.forEach(p => p.mesh.dispose());
    bot.projectiles = [];

    // Notify HUD (player gets a kill)
    this._onBotKilled?.();
  }

  _respawn(bot) {
    bot.alive = true;
    bot.health = BOT_CONFIG.health;
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 30;
    const rx = Math.cos(angle) * dist;
    const rz = Math.sin(angle) * dist;
    const ry = getTerrainHeight(rx, rz) + 3;
    bot.root.position.set(rx, ry, rz);
    bot.root.rotationQuaternion = Quaternion.Identity();
    bot.physics.body.setLinearVelocity(Vector3.Zero());
    bot.physics.body.setAngularVelocity(Vector3.Zero());
  }

  /** Register a callback for when a bot is killed (used by HUD) */
  onBotKilled(fn) {
    this._onBotKilled = fn;
  }

  reset() {
    for (const bot of this.bots) {
      bot.projectiles.forEach(p => p.mesh.dispose());
      bot.projectiles = [];
      this._respawn(bot);
    }
  }
}
