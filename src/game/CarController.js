import {
  MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion,
  PhysicsAggregate, PhysicsShapeType, FollowCamera, Texture,
  SceneLoader, TransformNode, ParticleSystem
} from '@babylonjs/core';
import { RACES, CLASSES } from './CharacterManager.js';

const CAR_CONFIG = {
  maxSpeed: 40,
  acceleration: 25,
  brakeForce: 35,
  turnSpeed: 2.5,
  nitroMultiplier: 1.8,
  nitroDrain: 25,    // per second
  nitroRegen: 8,
  maxHealth: 100,
  mass: 80,
  friction: 0.6,
};

export class CarController {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.health = CAR_CONFIG.maxHealth;
    this.nitro = 100;
    this.speed = 0;
    this.steerAngle = 0;
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.root = null;
    this.body = null;
    this.physics = null;
    this.camera = null;
    this.currentSpeed = 0;
    this._setupInput();
  }

  async init() {
    const scene = this.scene;

    // Build car from primitives (styled after the extracted buggy)
    this.root = new TransformNode('playerCar', scene);

    // Main body
    this.body = MeshBuilder.CreateBox('carBody', { width: 2.4, height: 1.0, depth: 4.5 }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.8;
    const bodyMat = new StandardMaterial('carBodyMat', scene);
    bodyMat.diffuseColor = new Color3(0.8, 0.6, 0.1); // Grudge gold
    bodyMat.specularColor = new Color3(0.4, 0.3, 0.1);
    bodyMat.emissiveColor = new Color3(0.15, 0.1, 0.02);
    this.body.material = bodyMat;

    // Cabin
    const cabin = MeshBuilder.CreateBox('cabin', { width: 2.0, height: 0.7, depth: 2.0 }, scene);
    cabin.parent = this.root;
    cabin.position.set(0, 1.55, -0.3);
    const cabinMat = new StandardMaterial('cabinMat', scene);
    cabinMat.diffuseColor = new Color3(0.15, 0.1, 0.2);
    cabinMat.alpha = 0.7;
    cabin.material = cabinMat;

    // Wheels
    const wheelMat = new StandardMaterial('wheelMat', scene);
    wheelMat.diffuseColor = new Color3(0.15, 0.15, 0.15);

    this.wheels = [];
    const wheelPositions = [
      { x: -1.3, y: 0.35, z: 1.5 },  // FL
      { x: 1.3, y: 0.35, z: 1.5 },   // FR
      { x: -1.3, y: 0.35, z: -1.5 },  // RL
      { x: 1.3, y: 0.35, z: -1.5 },   // RR
    ];

    wheelPositions.forEach((wp, i) => {
      const wheel = MeshBuilder.CreateCylinder(`wheel${i}`, {
        diameter: 0.7, height: 0.4, tessellation: 16
      }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wp.x, wp.y, wp.z);
      wheel.parent = this.root;
      wheel.material = wheelMat;
      this.wheels.push(wheel);
    });

    // Nitro exhausts (back)
    const exhaustMat = new StandardMaterial('exhaustMat', scene);
    exhaustMat.emissiveColor = new Color3(0.5, 0.3, 0.0);
    [-0.6, 0.6].forEach((x, i) => {
      const ex = MeshBuilder.CreateCylinder(`exhaust${i}`, { diameter: 0.25, height: 0.6, tessellation: 8 }, scene);
      ex.parent = this.root;
      ex.position.set(x, 0.7, -2.4);
      ex.rotation.x = Math.PI / 2;
      ex.material = exhaustMat;
    });

    // Gun mount on roof
    const gunMount = MeshBuilder.CreateCylinder('gunMount', { diameter: 0.3, height: 1.2, tessellation: 8 }, scene);
    gunMount.parent = this.root;
    gunMount.position.set(0, 2.1, 0.5);
    gunMount.rotation.x = Math.PI / 2;
    const gunMat = new StandardMaterial('gunMat', scene);
    gunMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    gunMount.material = gunMat;
    this.gunMount = gunMount;

    // Physics aggregate on root
    // We use a box physics body centered on the car
    const physicsBody = MeshBuilder.CreateBox('carPhysics', { width: 2.4, height: 1.2, depth: 4.5 }, scene);
    physicsBody.position.y = 0.8;
    physicsBody.parent = this.root;
    physicsBody.isVisible = false;

    this.root.position.set(20, 2, 20);
    this.physics = new PhysicsAggregate(this.root, PhysicsShapeType.BOX, {
      mass: CAR_CONFIG.mass,
      friction: CAR_CONFIG.friction,
      restitution: 0.2,
    }, scene);

    // Damping to prevent infinite sliding
    this.physics.body.setLinearDamping(0.3);
    this.physics.body.setAngularDamping(2.0);

    // Camera
    this.camera = new FollowCamera('followCam', new Vector3(0, 10, -15), scene);
    this.camera.lockedTarget = this.root;
    this.camera.radius = 12;
    this.camera.heightOffset = 5;
    this.camera.rotationOffset = 180;
    this.camera.cameraAcceleration = 0.05;
    this.camera.maxCameraSpeed = 20;
    this.camera.lowerHeightOffsetLimit = 2;
    this.camera.upperHeightOffsetLimit = 10;
    scene.activeCamera = this.camera;
    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

    // Tag car for collision detection
    this.root.metadata = { type: 'player' };
  }

  /** Apply race/class colors to the car body, exhaust, and gun mount. */
  setCharacterColors(raceId, classId) {
    const race = RACES.find(r => r.id === raceId) || RACES[0];
    const cls = CLASSES.find(c => c.id === classId) || CLASSES[0];

    // Body color from race
    if (this.body?.material) {
      this.body.material.diffuseColor = new Color3(race.color.r, race.color.g, race.color.b);
      this.body.material.emissiveColor = new Color3(race.emissive.r, race.emissive.g, race.emissive.b);
      this.body.material.specularColor = new Color3(race.color.r * 0.5, race.color.g * 0.5, race.color.b * 0.5);
    }

    // Exhaust glow from class secondary color
    const exhaustMeshes = this.root?.getChildMeshes()?.filter(m => m.name.startsWith('exhaust'));
    if (exhaustMeshes) {
      exhaustMeshes.forEach(ex => {
        if (ex.material) {
          ex.material.emissiveColor = new Color3(cls.secondaryColor.r, cls.secondaryColor.g, cls.secondaryColor.b);
        }
      });
    }

    // Gun mount tint from class
    if (this.gunMount?.material) {
      this.gunMount.material.diffuseColor = new Color3(
        0.25 + cls.secondaryColor.r * 0.15,
        0.25 + cls.secondaryColor.g * 0.15,
        0.25 + cls.secondaryColor.b * 0.15
      );
    }
  }

  _setupInput() {
    const canvas = document.getElementById('renderCanvas');

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x += e.movementX * 0.002;
      this.mouse.y += e.movementY * 0.002;
    });

    canvas.addEventListener('mousedown', () => { this.keys['Mouse0'] = true; });
    canvas.addEventListener('mouseup', () => { this.keys['Mouse0'] = false; });
  }

  update(dt) {
    if (!this.physics?.body) return;

    const body = this.physics.body;
    const forward = this._getForward();
    const right = this._getRight();

    // --- Acceleration ---
    let accel = 0;
    const isNitro = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const nitroMult = (isNitro && this.nitro > 0) ? CAR_CONFIG.nitroMultiplier : 1;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) accel = CAR_CONFIG.acceleration * nitroMult;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) accel = -CAR_CONFIG.acceleration * 0.6;

    // Apply force
    if (accel !== 0) {
      const force = forward.scale(accel * CAR_CONFIG.mass * dt);
      body.applyForce(force, this.root.getAbsolutePosition());
    }

    // --- Steering ---
    let steer = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steer = 1;

    if (steer !== 0) {
      const vel = body.getLinearVelocity();
      const speed = vel.length();
      if (speed > 1) {
        const torque = new Vector3(0, steer * CAR_CONFIG.turnSpeed * Math.min(speed, 15) * dt * 60, 0);
        body.applyAngularImpulse(torque);
      }
    }

    // --- Handbrake ---
    if (this.keys['Space']) {
      const vel = body.getLinearVelocity();
      body.setLinearVelocity(vel.scale(0.95));
      body.setAngularDamping(0.5); // allow spin
    } else {
      body.setAngularDamping(2.0);
    }

    // --- Speed clamp ---
    const vel = body.getLinearVelocity();
    const maxV = CAR_CONFIG.maxSpeed * nitroMult;
    if (vel.length() > maxV) {
      body.setLinearVelocity(vel.normalize().scale(maxV));
    }

    // --- Nitro ---
    if (isNitro && this.nitro > 0) {
      this.nitro = Math.max(0, this.nitro - CAR_CONFIG.nitroDrain * dt);
    } else if (!isNitro) {
      this.nitro = Math.min(100, this.nitro + CAR_CONFIG.nitroRegen * dt);
    }

    // --- Keep upright ---
    const rot = this.root.rotationQuaternion || Quaternion.Identity();
    const euler = rot.toEulerAngles();
    if (Math.abs(euler.x) > 0.5 || Math.abs(euler.z) > 0.5) {
      const corrected = Quaternion.FromEulerAngles(euler.x * 0.9, euler.y, euler.z * 0.9);
      this.root.rotationQuaternion = corrected;
    }

    // --- Wheel spin ---
    const spd = vel.length();
    this.wheels.forEach((w, i) => {
      w.rotation.x += spd * dt * 3;
      // Front wheels steer
      if (i < 2) w.rotation.y = steer * 0.3;
    });

    // --- Current speed for HUD ---
    this.currentSpeed = Math.round(spd * 3.6); // m/s to km/h
  }

  _getForward() {
    const q = this.root.rotationQuaternion || Quaternion.FromEulerAngles(
      this.root.rotation.x, this.root.rotation.y, this.root.rotation.z
    );
    const fwd = new Vector3(0, 0, 1);
    return Vector3.TransformNormal(fwd, this.root.getWorldMatrix());
  }

  _getRight() {
    const fwd = this._getForward();
    return Vector3.Cross(Vector3.Up(), fwd).normalize();
  }

  getPosition() {
    return this.root.getAbsolutePosition();
  }

  getForward() {
    return this._getForward();
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
  }

  reset() {
    this.health = CAR_CONFIG.maxHealth;
    this.nitro = 100;
    this.root.position.set(
      20 + (Math.random() - 0.5) * 20,
      2,
      20 + (Math.random() - 0.5) * 20
    );
    this.root.rotationQuaternion = Quaternion.Identity();
    this.physics?.body?.setLinearVelocity(Vector3.Zero());
    this.physics?.body?.setAngularVelocity(Vector3.Zero());
  }
}
