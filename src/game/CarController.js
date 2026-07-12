import {
  MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion, Matrix,
  FollowCamera, TransformNode
} from '@babylonjs/core';
import { RACES, CLASSES } from './CharacterManager.js';
import { loadDriver } from './DriverLoader.js';
import { loadKart } from './KartLoader.js';
import { getKartForRace, getKartById, statsToPhysics } from './KartRegistry.js';
import { TriggerVehicle, DEFAULT_KART_CONFIG } from '../physics/TriggerVehicle.js';

const MAX_HEALTH = 100;

export class CarController {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.nitro = 100;
    this.currentSpeed = 0;
    this.forwardSpeed = 0;
    this.controlsLocked = false;

    this.keys = {};
    this.mouse = { x: 0, y: 0 };

    this.root = null;
    this.camera = null;
    this.vehicle = null; // TriggerVehicle physics sim
    this._kartDef = null;

    this._setupInput();
  }

  // ─── Init ───────────────────────────────────────────────
  async init(spawn = { x: 0, y: 1.2, z: 0 }) {
    const scene = this.scene;

    this.root = new TransformNode('playerCar', scene);

    // ── TriggerRally physics sim (replaces Havok rigid body) ──
    this.vehicle = new TriggerVehicle(scene);
    this.vehicle.setPosition(spawn.x ?? 0, spawn.y ?? 1.2, spawn.z ?? 0);

    // ── Load real kart GLB (default: Warkind signature kart) ──
    const defaultKart = getKartForRace('wk');
    await this._loadKartModel(defaultKart);
    this.applyKartStats(defaultKart);

    // ── Camera ──
    this.camera = new FollowCamera('followCam', new Vector3(0, 8, -14), scene);
    this.camera.lockedTarget = this.root;
    this.camera.radius = 11;
    this.camera.heightOffset = 4.5;
    this.camera.rotationOffset = 180;
    this.camera.cameraAcceleration = 0.08;
    this.camera.maxCameraSpeed = 40;
    this.camera.lowerHeightOffsetLimit = 2;
    this.camera.upperHeightOffsetLimit = 12;
    scene.activeCamera = this.camera;
    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

    this.root.metadata = { type: 'player' };
  }

  /** Map kart registry stats onto TriggerVehicle power/nitro/health. */
  applyKartStats(kartDef) {
    if (!kartDef || !this.vehicle) return;
    this._kartDef = kartDef;
    const p = statsToPhysics(kartDef.stats);
    // Scale engine power: baseline 80 kW → 70–140 from accel/speed
    const powerScale = 55 + (kartDef.stats.acceleration / 100) * 45 + (kartDef.stats.topSpeed / 100) * 40;
    this.vehicle.enginePowerscale = powerScale * 1000;
    this.vehicle.cfg.nitroMultiplier = 1.55 + (kartDef.stats.topSpeed / 100) * 0.55;
    this.vehicle.cfg.nitroDrain = p.nitroDrain;
    this.vehicle.cfg.nitroRegen = p.nitroRegen;
    this.maxHealth = Math.round(p.maxHealth);
    this.health = this.maxHealth;
  }

  // ─── Load a real kart GLB model ──────────────────────────
  async _loadKartModel(kartDef) {
    // Remove old kart mesh if any
    if (this._kartNode) {
      this._kartNode.getChildMeshes().forEach(m => m.dispose());
      this._kartNode.dispose();
      this._kartNode = null;
    }
    try {
      const { root: kartRoot, meshes } = await loadKart(this.scene, kartDef, '_player');
      kartRoot.parent = this.root;
      kartRoot.position.y = 0.3;
      this._kartNode = kartRoot;
      // Keep original materials from the GLB (they look good as-is)
      console.log(`[Car] Loaded kart: ${kartDef.kartName} (${meshes.length} meshes)`);
    } catch (e) {
      console.warn('[Car] Kart GLB failed, building fallback:', e);
      // Minimal visible fallback so player can see something
      this.body = MeshBuilder.CreateBox('carBody', { width: 2.4, height: 1.0, depth: 4.5 }, this.scene);
      this.body.parent = this.root;
      this.body.position.y = 0.8;
      const mat = new StandardMaterial('carBodyMat', this.scene);
      mat.diffuseColor = new Color3(0.8, 0.6, 0.1);
      this.body.material = mat;
    }
  }

  // ─── Switch kart + driver when race/class selected ──────────
  async setCharacterColors(raceId, classId) {
    // Load the race's signature kart
    const kartDef = getKartForRace(raceId);
    await this._loadKartModel(kartDef);

    // Load the Grudge race character as the driver
    if (this._driverNode) {
      this._driverNode.getChildMeshes().forEach(m => m.dispose());
      this._driverNode.dispose();
      this._driverNode = null;
    }
    try {
      this._driverNode = await loadDriver(this.scene, raceId, this.root, '_player');
    } catch (e) {
      console.warn('[Car] Driver GLB failed:', e);
    }
  }

  // ─── Switch to a specific kart by ID (from kart select) ────
  async setKart(kartId) {
    const kartDef = getKartById(kartId);
    if (kartDef) {
      await this._loadKartModel(kartDef);
      this.applyKartStats(kartDef);
    }
  }

  // ─── Input ─────────────────────────────────────────────
  _setupInput() {
    const canvas = document.getElementById('renderCanvas');
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent page scroll on game keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x += e.movementX * 0.002;
      this.mouse.y += e.movementY * 0.002;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.keys['Mouse0'] = true;
      if (e.button === 2) this.keys['Mouse2'] = true;
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.keys['Mouse0'] = false;
      if (e.button === 2) this.keys['Mouse2'] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ─── Main update — TriggerRally physics ────────────────
  update(dt) {
    if (!this.vehicle) return;
    dt = Math.min(dt, 0.05);

    const v = this.vehicle;
    if (this.controlsLocked) {
      v.input.throttle = 0;
      v.input.brake = 1;
      v.input.handbrake = 1;
      v.input.nitro = false;
      v.input.turn = 0;
    } else {
      v.input.throttle = (this.keys['KeyW'] || this.keys['ArrowUp']) ? 1 : 0;
      v.input.brake = (this.keys['KeyS'] || this.keys['ArrowDown']) ? 1 : 0;
      v.input.handbrake = this.keys['Space'] ? 1 : 0;
      // SHIFT or E for nitro (controls text matches both)
      v.input.nitro = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyE']);

      let turn = 0;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) turn = 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) turn = -1;
      v.input.turn = turn;
    }

    // Run physics substeps (fixed ~120Hz for stability)
    const substep = 1 / 120;
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, substep);
      v.tick(step);
      remaining -= step;
    }

    // Sync visual root to physics state
    this.root.position.copyFrom(v.pos);
    this.root.rotationQuaternion = v.ori.clone();

    // Update public state for HUD
    this.currentSpeed = v.currentSpeed;
    this.forwardSpeed = v.forwardSpeed;
    this.nitro = v.nitro;

    // Fall recovery — soft reset above ground
    if (v.pos.y < -15) {
      v.setPosition(this._spawn?.x ?? 0, this._spawn?.y ?? 1.5, this._spawn?.z ?? 0);
    }
  }

  setSpawn(x, y, z) {
    this._spawn = { x, y, z };
    if (this.vehicle) this.vehicle.setPosition(x, y, z);
  }

  // ─── Shop upgrade application ──────────────────────
  applyUpgrades(stats) {
    if (!stats) return;
    this._upgrades = stats;
  }

  // ─── Helpers used by other systems ──────────────────
  _getForward() {
    if (!this.vehicle) return Vector3.Forward();
    return Vector3.TransformNormal(new Vector3(0, 0, 1), this.root.getWorldMatrix()).normalize();
  }

  _getRight() {
    return Vector3.Cross(Vector3.Up(), this._getForward()).normalize();
  }

  getPosition() { return this.root.getAbsolutePosition(); }
  getForward() { return this._getForward(); }

  takeDamage(amount) {
    const resist = this._upgrades?.resist ?? 0;
    this.health = Math.max(0, this.health - amount * (1 - resist));
  }

  reset(opts = {}) {
    this.controlsLocked = false;
    this.health = this.maxHealth || MAX_HEALTH;
    this.nitro = 100;
    if (this.vehicle) {
      this.vehicle.nitro = 100;
      if (opts.useSpawn && this._spawn) {
        this.vehicle.setPosition(this._spawn.x, this._spawn.y, this._spawn.z);
      } else if (opts.x != null) {
        this.vehicle.setPosition(opts.x, opts.y ?? 1.2, opts.z ?? 0);
      } else if (this._spawn) {
        this.vehicle.setPosition(this._spawn.x, this._spawn.y, this._spawn.z);
      } else {
        this.vehicle.setPosition(0, 1.2, 0);
      }
    }
  }
}
