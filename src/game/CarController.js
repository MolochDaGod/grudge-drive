import {
  MeshBuilder, StandardMaterial, Color3, Vector3, Quaternion, Matrix,
  PhysicsAggregate, PhysicsShapeType, PhysicsRaycastResult,
  FollowCamera, TransformNode
} from '@babylonjs/core';
import { RACES, CLASSES } from './CharacterManager.js';
import { getTerrainHeight } from './TerrainGenerator.js';
import { SpringSimulator } from '../physics/SpringSimulator.js';

// ── Vehicle tuning (Sketchbook-inspired) ──
const CAR = {
  mass: 80,
  maxHealth: 100,

  // Suspension
  suspRestLength: 0.65,
  suspTravel: 0.35,
  springStiffness: 550,
  damperCompression: 45,
  damperRelaxation: 35,
  wheelRadius: 0.35,

  // Gear transmission (Sketchbook pattern)
  engineForce: 500,            // base N per gear
  brakeForce: 3000,
  nitroMultiplier: 1.8,
  nitroDrain: 25,
  nitroRegen: 8,

  // Steering
  maxSteerAngle: 0.8,          // radians (wider for drift feel)

  // Traction
  lateralGrip: 0.92,
  rollingResistance: 0.3,
  antiRollStiffness: 120,

  // Air spin (Sketchbook-style)
  airSpinAccel: 0.15,
  maxAirSpin: 2.0,
};

// Sketchbook-style gear table: max speed (m/s) per gear
const GEARS_MAX_SPEED = {
  R: -4,
  0: 0,
  1: 5,
  2: 9,
  3: 14,
  4: 19,
  5: 26,
};

// Wheel local attach points (relative to chassis origin at body centre)
const WHEEL_OFFSETS = [
  new Vector3(-1.3, 0.1, 1.5),   // 0 = FL
  new Vector3( 1.3, 0.1, 1.5),   // 1 = FR
  new Vector3(-1.3, 0.1, -1.5),  // 2 = RL
  new Vector3( 1.3, 0.1, -1.5),  // 3 = RR
];

export class CarController {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.health = CAR.maxHealth;
    this.nitro = 100;
    this.currentSpeed = 0;
    this.forwardSpeed = 0;   // signed speed along chassis forward

    this.keys = {};
    this.mouse = { x: 0, y: 0 };

    this.root = null;
    this.body = null;
    this.physics = null;
    this.camera = null;
    this.gunMount = null;

    // Wheel visual meshes
    this.wheels = [];
    this._susp = [0, 0, 0, 0];

    // Sketchbook-style spring steering (freq=10Hz, damping=0.6)
    this._steerSpring = new SpringSimulator(10, 0.6, 0);

    // Gear state
    this._gear = 1;
    this._shiftTimer = 0;
    this._airSpinTimer = 0;

    // Physics raycast helper (reused each frame)
    this._rayResult = new PhysicsRaycastResult();

    this._setupInput();
  }

  // ─── Init ───────────────────────────────────────────────
  async init() {
    const scene = this.scene;

    this.root = new TransformNode('playerCar', scene);

    // ── Main body ──
    this.body = MeshBuilder.CreateBox('carBody', { width: 2.4, height: 1.0, depth: 4.5 }, scene);
    this.body.parent = this.root;
    this.body.position.y = 0.8;
    const bodyMat = new StandardMaterial('carBodyMat', scene);
    bodyMat.diffuseColor = new Color3(0.8, 0.6, 0.1);
    bodyMat.specularColor = new Color3(0.4, 0.3, 0.1);
    bodyMat.emissiveColor = new Color3(0.15, 0.1, 0.02);
    this.body.material = bodyMat;

    // ── Cabin ──
    const cabin = MeshBuilder.CreateBox('cabin', { width: 2.0, height: 0.7, depth: 2.0 }, scene);
    cabin.parent = this.root;
    cabin.position.set(0, 1.55, -0.3);
    const cabinMat = new StandardMaterial('cabinMat', scene);
    cabinMat.diffuseColor = new Color3(0.15, 0.1, 0.2);
    cabinMat.alpha = 0.7;
    cabin.material = cabinMat;

    // ── Wheels ──
    const wheelMat = new StandardMaterial('wheelMat', scene);
    wheelMat.diffuseColor = new Color3(0.15, 0.15, 0.15);

    this.wheels = [];
    WHEEL_OFFSETS.forEach((wp, i) => {
      const wheel = MeshBuilder.CreateCylinder(`wheel${i}`, {
        diameter: CAR.wheelRadius * 2, height: 0.4, tessellation: 16
      }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.copyFrom(wp);
      wheel.parent = this.root;
      wheel.material = wheelMat;
      this.wheels.push(wheel);
    });

    // ── Exhausts ──
    const exhaustMat = new StandardMaterial('exhaustMat', scene);
    exhaustMat.emissiveColor = new Color3(0.5, 0.3, 0.0);
    [-0.6, 0.6].forEach((x, i) => {
      const ex = MeshBuilder.CreateCylinder(`exhaust${i}`, { diameter: 0.25, height: 0.6, tessellation: 8 }, scene);
      ex.parent = this.root;
      ex.position.set(x, 0.7, -2.4);
      ex.rotation.x = Math.PI / 2;
      ex.material = exhaustMat;
    });

    // ── Gun mount ──
    const gunMount = MeshBuilder.CreateCylinder('gunMount', { diameter: 0.3, height: 1.2, tessellation: 8 }, scene);
    gunMount.parent = this.root;
    gunMount.position.set(0, 2.1, 0.5);
    gunMount.rotation.x = Math.PI / 2;
    const gunMat = new StandardMaterial('gunMat', scene);
    gunMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    gunMount.material = gunMat;
    this.gunMount = gunMount;

    // ── Invisible physics box ──
    const physBox = MeshBuilder.CreateBox('carPhysics', { width: 2.4, height: 1.2, depth: 4.5 }, scene);
    physBox.position.y = 0.8;
    physBox.parent = this.root;
    physBox.isVisible = false;

    // Spawn above terrain at centre spawn area
    const spawnY = getTerrainHeight(5, 5) + 3;
    this.root.position.set(5, spawnY, 5);

    this.physics = new PhysicsAggregate(this.root, PhysicsShapeType.BOX, {
      mass: CAR.mass,
      friction: 0.05,        // low — traction handled by raycast vehicle
      restitution: 0.15,
    }, scene);

    // Low damping — we apply our own drag via traction model
    this.physics.body.setLinearDamping(0.05);
    this.physics.body.setAngularDamping(1.5);

    // ── Camera ──
    this.camera = new FollowCamera('followCam', new Vector3(0, 10, -15), scene);
    this.camera.lockedTarget = this.root;
    this.camera.radius = 14;
    this.camera.heightOffset = 6;
    this.camera.rotationOffset = 180;
    this.camera.cameraAcceleration = 0.04;
    this.camera.maxCameraSpeed = 25;
    this.camera.lowerHeightOffsetLimit = 3;
    this.camera.upperHeightOffsetLimit = 12;
    scene.activeCamera = this.camera;
    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);

    this.root.metadata = { type: 'player' };
  }

  // ─── Character colors ──────────────────────────────────
  setCharacterColors(raceId, classId) {
    const race = RACES.find(r => r.id === raceId) || RACES[0];
    const cls = CLASSES.find(c => c.id === classId) || CLASSES[0];

    if (this.body?.material) {
      this.body.material.diffuseColor = new Color3(race.color.r, race.color.g, race.color.b);
      this.body.material.emissiveColor = new Color3(race.emissive.r, race.emissive.g, race.emissive.b);
      this.body.material.specularColor = new Color3(race.color.r * 0.5, race.color.g * 0.5, race.color.b * 0.5);
    }

    const exhaustMeshes = this.root?.getChildMeshes()?.filter(m => m.name.startsWith('exhaust'));
    if (exhaustMeshes) {
      exhaustMeshes.forEach(ex => {
        if (ex.material) {
          ex.material.emissiveColor = new Color3(cls.secondaryColor.r, cls.secondaryColor.g, cls.secondaryColor.b);
        }
      });
    }

    if (this.gunMount?.material) {
      this.gunMount.material.diffuseColor = new Color3(
        0.25 + cls.secondaryColor.r * 0.15,
        0.25 + cls.secondaryColor.g * 0.15,
        0.25 + cls.secondaryColor.b * 0.15
      );
    }
  }

  // ─── Input ─────────────────────────────────────────────
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

  // ─── Main update — raycast vehicle ─────────────────────
  update(dt) {
    if (!this.physics?.body) return;
    // Clamp dt to avoid physics explosion on tab-out
    dt = Math.min(dt, 0.05);

    const body = this.physics.body;
    const worldMat = this.root.getWorldMatrix();

    // Local axes in world space
    const up = Vector3.TransformNormal(Vector3.Up(), worldMat).normalize();
    const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), worldMat).normalize();
    const right = Vector3.Cross(forward, up).normalize();

    const chassisPos = this.root.getAbsolutePosition();
    const vel = body.getLinearVelocity();
    const speed = vel.length();

    // ── Input ──
    const isNitro = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.nitro > 0;
    const nitroMult = isNitro ? CAR.nitroMultiplier : 1;

    const wantThrottle = this.keys['KeyW'] || this.keys['ArrowUp'];
    const wantReverse = this.keys['KeyS'] || this.keys['ArrowDown'];
    const handbrake = !!this.keys['Space'];

    let steerInput = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) steerInput = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) steerInput = 1;

    // Measure forward speed (signed — positive = moving forward)
    this.forwardSpeed = Vector3.Dot(vel, forward);

    // ── Spring-simulated steering (Sketchbook pattern) ──
    // Compute drift correction angle
    const velNorm = vel.length() > 0.5 ? vel.normalize() : forward;
    const crossY = Vector3.Cross(velNorm, forward).y;
    const driftCorrection = Math.asin(Math.max(-1, Math.min(1, crossY)));

    const speedFactor = Math.max(1, Math.abs(this.forwardSpeed) * 0.3);
    if (steerInput > 0) {
      this._steerSpring.target = Math.min(-CAR.maxSteerAngle / speedFactor, -driftCorrection);
      this._steerSpring.target = Math.max(-CAR.maxSteerAngle, Math.min(CAR.maxSteerAngle, this._steerSpring.target));
    } else if (steerInput < 0) {
      this._steerSpring.target = Math.max(CAR.maxSteerAngle / speedFactor, -driftCorrection);
      this._steerSpring.target = Math.max(-CAR.maxSteerAngle, Math.min(CAR.maxSteerAngle, this._steerSpring.target));
    } else {
      this._steerSpring.target = 0;
    }
    this._steerSpring.simulate(dt);

    // ── Per-wheel raycast suspension ──
    let groundedCount = 0;
    const compressions = [0, 0, 0, 0];
    const physicsEngine = this.scene.getPhysicsEngine();

    for (let i = 0; i < 4; i++) {
      const localAttach = WHEEL_OFFSETS[i];
      const worldAttach = Vector3.TransformCoordinates(localAttach, worldMat);

      // Ray from attach point downward (in chassis local down)
      const rayFrom = worldAttach.clone();
      const rayLen = CAR.suspRestLength + CAR.suspTravel + CAR.wheelRadius;
      const rayTo = worldAttach.subtract(up.scale(rayLen));

      // Havok raycast
      physicsEngine.raycast(rayFrom, rayTo, this._rayResult);

      if (this._rayResult.hasHit) {
        const hitDist = Vector3.Distance(rayFrom, this._rayResult.hitPointWorld);
        const springLen = hitDist - CAR.wheelRadius;
        const compression = CAR.suspRestLength - springLen;

        if (compression > -CAR.suspTravel) {
          groundedCount++;
          const clampedComp = Math.max(0, Math.min(compression, CAR.suspRestLength + CAR.suspTravel));
          compressions[i] = clampedComp;

          // ── Spring force ──
          const springForce = clampedComp * CAR.springStiffness;

          // ── Damper force ── (velocity of suspension point along up axis)
          const pointVel = this._getPointVelocity(body, chassisPos, worldAttach, vel);
          const suspVel = Vector3.Dot(pointVel, up);
          const damperForce = suspVel > 0
            ? -suspVel * CAR.damperRelaxation   // extending
            : -suspVel * CAR.damperCompression;  // compressing

          const totalForce = up.scale((springForce + damperForce) * dt * 60);
          body.applyForce(totalForce, worldAttach);

          // ── Position wheel visual ──
          const wheelY = localAttach.y - (springLen - CAR.suspRestLength);
          this.wheels[i].position.y = Math.max(localAttach.y - CAR.suspTravel, Math.min(localAttach.y + CAR.suspTravel, wheelY));
        }
      }
      // If no hit, wheel hangs at full extension
      else {
        this.wheels[i].position.y = localAttach.y - CAR.suspTravel;
      }
    }

    const grounded = groundedCount >= 2;

    // ── Anti-roll bars (front pair & rear pair) ──
    this._applyAntiRoll(body, worldMat, up, compressions, 0, 1, dt);
    this._applyAntiRoll(body, worldMat, up, compressions, 2, 3, dt);

    // ── Gear transmission (Sketchbook pattern) ──
    const uAccel = this._upgrades?.accelMult ?? 1;
    const uSpeed = this._upgrades?.speedMult ?? 1;
    const maxGears = 5;

    if (this._shiftTimer > 0) {
      this._shiftTimer -= dt;
    } else if (grounded) {
      if (wantReverse) {
        // Reverse gear
        const powerFactor = (GEARS_MAX_SPEED.R * uSpeed - this.forwardSpeed) / Math.abs(GEARS_MAX_SPEED.R * uSpeed);
        const force = (CAR.engineForce / Math.max(this._gear, 1)) * Math.abs(powerFactor) * uAccel;
        this._applyDriveForce(body, forward, force * dt, worldMat);
      } else if (wantThrottle) {
        // Forward gears with auto-shift
        const gearMax = GEARS_MAX_SPEED[this._gear] * uSpeed * nitroMult;
        const prevGearMax = GEARS_MAX_SPEED[this._gear - 1] * uSpeed * nitroMult;
        const powerFactor = (gearMax - this.forwardSpeed) / (gearMax - prevGearMax || 1);

        // Auto shift up / down
        if (powerFactor < 0.1 && this._gear < maxGears) {
          this._gear++;
          this._shiftTimer = 0.2;
        } else if (this._gear > 1 && powerFactor > 1.2) {
          this._gear--;
          this._shiftTimer = 0.2;
        } else {
          const force = (CAR.engineForce / this._gear) * Math.max(powerFactor, 0) * nitroMult * uAccel;
          this._applyDriveForce(body, forward, -force * dt, worldMat);
        }
      }
    }

    // ── Steering torque (using spring sim position) ──
    const steerVal = this._steerSpring.position;
    if (grounded && Math.abs(steerVal) > 0.001 && speed > 0.5) {
      const yawTorque = steerVal * 220 * dt;
      body.applyAngularImpulse(new Vector3(0, yawTorque, 0));
    }

    // ── Lateral grip (kill sideways sliding) ──
    if (grounded) {
      const lateralVel = right.scale(Vector3.Dot(vel, right));
      const grip = handbrake ? 0.35 : CAR.lateralGrip;
      const correction = lateralVel.scale(-grip);
      body.applyForce(correction.scale(CAR.mass / dt * 0.016), chassisPos);
    }

    // ── Rolling resistance ──
    if (grounded && !wantThrottle && !wantReverse && speed > 0.2) {
      const drag = vel.normalize().scale(-CAR.rollingResistance * CAR.mass);
      body.applyForce(drag, chassisPos);
    }

    // ── Handbrake ──
    if (handbrake && grounded) {
      body.setLinearVelocity(vel.scale(0.95));
    }

    // ── Air spin control (Sketchbook pattern) ──
    if (!grounded) {
      this._airSpinTimer += dt;
      const airInfluence = Math.min(this._airSpinTimer / 2, 1) * Math.min(speed, 1);
      const angVel = body.getAngularVelocity();

      // Roll with steer keys
      if (steerInput > 0 && Vector3.Dot(angVel, forward) < CAR.maxAirSpin) {
        body.setAngularVelocity(angVel.add(forward.scale(CAR.airSpinAccel * airInfluence)));
      } else if (steerInput < 0 && Vector3.Dot(angVel, forward) > -CAR.maxAirSpin) {
        body.setAngularVelocity(angVel.subtract(forward.scale(CAR.airSpinAccel * airInfluence)));
      }
      // Pitch with throttle/reverse
      if (wantThrottle && Vector3.Dot(angVel, right) < CAR.maxAirSpin) {
        body.setAngularVelocity(angVel.add(right.scale(CAR.airSpinAccel * airInfluence)));
      } else if (wantReverse && Vector3.Dot(angVel, right) > -CAR.maxAirSpin) {
        body.setAngularVelocity(angVel.subtract(right.scale(CAR.airSpinAccel * airInfluence)));
      }
    } else {
      this._airSpinTimer = 0;
    }

    // ── Speed cap ──
    const maxV = GEARS_MAX_SPEED[5] * nitroMult * uSpeed * 1.1;
    if (speed > maxV) {
      body.setLinearVelocity(vel.normalize().scale(maxV));
    }

    // ── Nitro ──
    if (isNitro) {
      this.nitro = Math.max(0, this.nitro - CAR.nitroDrain * dt);
    } else if (!this.keys['ShiftLeft'] && !this.keys['ShiftRight']) {
      this.nitro = Math.min(100, this.nitro + CAR.nitroRegen * dt);
    }

    // ── Keep mostly upright (gentle correction when grounded) ──
    if (grounded) {
      const rot = this.root.rotationQuaternion || Quaternion.Identity();
      const euler = rot.toEulerAngles();
      if (Math.abs(euler.x) > 0.5 || Math.abs(euler.z) > 0.5) {
        this.root.rotationQuaternion = Quaternion.FromEulerAngles(euler.x * 0.92, euler.y, euler.z * 0.92);
      }
    }

    // ── Wheel spin + spring-steered front wheels ──
    this.wheels.forEach((w, i) => {
      w.rotation.x += speed * dt * 3;
      if (i < 2) w.rotation.y = steerVal * 0.7;
    });

    // ── Fall recovery ──
    if (chassisPos.y < -20) {
      this.root.position.set(0, getTerrainHeight(0, 0) + 4, 0);
      this.root.rotationQuaternion = Quaternion.Identity();
      body.setLinearVelocity(Vector3.Zero());
      body.setAngularVelocity(Vector3.Zero());
    }

    this.currentSpeed = Math.round(speed * 3.6);
  }

  // ─── Drive force helper (applied at rear wheels) ──
  _applyDriveForce(body, forward, forceDt, worldMat) {
    for (let i = 2; i <= 3; i++) {
      const worldPt = Vector3.TransformCoordinates(WHEEL_OFFSETS[i], worldMat);
      body.applyForce(forward.scale(forceDt * 0.5), worldPt);
    }
  }

  // ─── Anti-roll bar between two wheels on the same axle ──
  _applyAntiRoll(body, worldMat, up, compressions, iL, iR, dt) {
    const diff = compressions[iL] - compressions[iR];
    if (Math.abs(diff) < 0.001) return;
    const force = diff * CAR.antiRollStiffness * dt * 60;
    const ptL = Vector3.TransformCoordinates(WHEEL_OFFSETS[iL], worldMat);
    const ptR = Vector3.TransformCoordinates(WHEEL_OFFSETS[iR], worldMat);
    body.applyForce(up.scale(-force), ptL);
    body.applyForce(up.scale(force), ptR);
  }

  // ─── Velocity of a world point on the rigid body ──
  _getPointVelocity(body, comWorld, pointWorld, linVel) {
    const angVel = body.getAngularVelocity();
    const r = pointWorld.subtract(comWorld);
    return linVel.add(Vector3.Cross(angVel, r));
  }

  // ─── Shop upgrade application ──────────────────────────
  applyUpgrades(stats) {
    if (!stats) return;
    this._upgrades = stats;
  }

  // ─── Helpers used by other systems ──────────────────────
  _getForward() {
    return Vector3.TransformNormal(new Vector3(0, 0, 1), this.root.getWorldMatrix()).normalize();
  }

  _getRight() {
    const fwd = this._getForward();
    return Vector3.Cross(Vector3.Up(), fwd).normalize();
  }

  getPosition() { return this.root.getAbsolutePosition(); }
  getForward() { return this._getForward(); }

  takeDamage(amount) {
    const resist = this._upgrades?.resist ?? 0;
    const actual = amount * (1 - resist);
    this.health = Math.max(0, this.health - actual);
  }

  reset() {
    const uHealth = this._upgrades?.healthMult ?? 1;
    const uNitroCap = this._upgrades?.nitroCap ?? 1;
    this.health = CAR.maxHealth * uHealth;
    this.maxHealth = this.health;
    this.nitro = 100 * uNitroCap;
    this._steerSpring.reset(0);
    this._gear = 1;
    this._shiftTimer = 0;
    this._airSpinTimer = 0;
    const rx = 5 + (Math.random() - 0.5) * 20;
    const rz = 5 + (Math.random() - 0.5) * 20;
    const ry = getTerrainHeight(rx, rz) + 3;
    this.root.position.set(rx, ry, rz);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.physics?.body?.setLinearVelocity(Vector3.Zero());
    this.physics?.body?.setAngularVelocity(Vector3.Zero());
  }
}
