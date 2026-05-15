import {
  MeshBuilder, StandardMaterial, Color3, Vector3,
  PhysicsAggregate, PhysicsShapeType, ParticleSystem, Texture
} from '@babylonjs/core';
import { VFXManager } from './VFXManager.js';

const WEAPONS = [
  { name: 'gun',    damage: 8,  rate: 0.15, speed: 80, ammo: Infinity, projLife: 1.5 },
  { name: 'rocket', damage: 35, rate: 1.0,  speed: 40, ammo: 5,        projLife: 3.0 },
  { name: 'bomb',   damage: 50, rate: 1.5,  speed: 0,  ammo: 3,        projLife: 4.0 },
];

export class WeaponsSystem {
  constructor(scene, player, audio) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.vfx = new VFXManager(scene);
    this.currentIndex = 0;
    this.cooldown = 0;
    this.ammo = WEAPONS.map(w => w.ammo);
    this.projectiles = [];

    this._materials = {};
    this._initMaterials();
    this._setupInput();
  }

  _initMaterials() {
    const s = this.scene;

    const bulletMat = new StandardMaterial('bulletMat', s);
    bulletMat.emissiveColor = new Color3(1, 0.8, 0.2);
    bulletMat.disableLighting = true;
    this._materials.gun = bulletMat;

    const rocketMat = new StandardMaterial('rocketMat', s);
    rocketMat.emissiveColor = new Color3(1, 0.3, 0.1);
    rocketMat.disableLighting = true;
    this._materials.rocket = rocketMat;

    const bombMat = new StandardMaterial('bombMat', s);
    bombMat.emissiveColor = new Color3(0.6, 0.1, 0.1);
    bombMat.disableLighting = true;
    this._materials.bomb = bombMat;
  }

  _setupInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Digit1') this.currentIndex = 0;
      if (e.code === 'Digit2') this.currentIndex = 1;
      if (e.code === 'Digit3') this.currentIndex = 2;
    });
  }

  get current() { return WEAPONS[this.currentIndex]; }

  fire() {
    const w = this.current;
    if (this.cooldown > 0) return;
    if (this.ammo[this.currentIndex] <= 0) return;

    if (this.ammo[this.currentIndex] !== Infinity) {
      this.ammo[this.currentIndex]--;
    }
    this.cooldown = w.rate;

    const pos = this.player.getPosition().clone();
    pos.y += 2.1;

    const fwd = this.player.getForward().normalize();

    if (w.name === 'bomb') {
      this._spawnBomb(pos);
    } else {
      this._spawnProjectile(pos, fwd, w);
    }

    this.audio.playOnce('fire_' + w.name);
  }

  _spawnProjectile(pos, dir, w) {
    const size = w.name === 'rocket' ? 0.4 : 0.15;
    const mesh = MeshBuilder.CreateSphere(`proj_${Date.now()}`, { diameter: size }, this.scene);
    mesh.position = pos.add(dir.scale(3));
    mesh.material = this._materials[w.name];
    const dmgMult = this._upgrades?.damageMult ?? 1;
    mesh.metadata = { type: 'projectile', damage: w.damage * dmgMult, owner: 'player' };

    // Attach VFX trail
    const trail = w.name === 'rocket'
      ? this.vfx.rocketTrail(mesh)
      : this.vfx.bulletTracer(pos, dir, w.speed);

    const proj = {
      mesh,
      velocity: dir.scale(w.speed),
      life: w.life || w.projLife,
      trail,
    };

    this.projectiles.push(proj);
  }

  _spawnBomb(pos) {
    const mesh = MeshBuilder.CreateSphere(`bomb_${Date.now()}`, { diameter: 0.6 }, this.scene);
    mesh.position = pos.clone();
    mesh.position.y = 0.5;
    mesh.material = this._materials.bomb;
    mesh.metadata = { type: 'bomb', damage: WEAPONS[2].damage, owner: 'player' };

    const proj = {
      mesh,
      velocity: Vector3.Zero(),
      life: WEAPONS[2].projLife,
      isBomb: true,
    };

    this.projectiles.push(proj);
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;

    // Fire on mouse down
    if (this.player.keys['Mouse0']) {
      this.fire();
    }

    // Move projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      if (p.life <= 0) {
        if (p.isBomb) this._explode(p.mesh.position, WEAPONS[2].damage);
        p.mesh.dispose();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (!p.isBomb) {
        p.mesh.position.addInPlace(p.velocity.scale(dt));

        // Simple bounds check
        const pos = p.mesh.position;
        if (Math.abs(pos.x) > 110 || Math.abs(pos.z) > 110 || pos.y < -5) {
          p.mesh.dispose();
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  _explode(pos, damage) {
    // Full VFX explosion (fire burst + smoke cloud + shockwave ring)
    this.vfx.explosion(pos, 1.0);
    this.audio.playOnce('explosion');
  }

  /** Check if a projectile hits a target mesh (simple distance check) */
  checkHit(targetPos, radius = 2) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.mesh.isDisposed()) continue;
      const dist = Vector3.Distance(p.mesh.position, targetPos);
      if (dist < radius) {
        const dmg = p.mesh.metadata?.damage || 10;
        if (!p.isBomb) {
          p.mesh.dispose();
          this.projectiles.splice(i, 1);
        }
        return dmg;
      }
    }
    return 0;
  }

  /** Apply shop upgrade multipliers. */
  applyUpgrades(stats) {
    if (!stats) return;
    this._upgrades = stats;
  }

  reset() {
    this.projectiles.forEach(p => p.mesh.dispose());
    this.projectiles = [];
    const ammoMult = this._upgrades?.ammoMult ?? 1;
    this.ammo = WEAPONS.map(w => w.ammo === Infinity ? Infinity : Math.round(w.ammo * ammoMult));
    this.currentIndex = 0;
    this.cooldown = 0;
  }

  getAmmo(index) {
    return this.ammo[index];
  }

  getWeaponName(index) {
    return WEAPONS[index]?.name || '';
  }
}
