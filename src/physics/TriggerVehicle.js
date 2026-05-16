/**
 * TriggerVehicle — TriggerRally vehicle physics ported to Babylon.js.
 *
 * Original: github.com/CodeArtemis/TriggerRally (jareiko)
 * Ported: standalone ES module using Babylon.js Vector3/Quaternion/Matrix
 * Ground contact: uses Havok physics engine raycast (scene.getPhysicsEngine())
 *
 * This replaces the Sketchbook-style raycast vehicle with TriggerRally's
 * proven driving model: engine powerband, automatic gearbox, per-wheel
 * spring-damper suspension, static/dynamic tire friction, LSD differential.
 */

import { Vector3, Quaternion, Matrix } from '@babylonjs/core';

// ── Utility functions (from TriggerRally util.js) ───────────────────

const TWOPI = Math.PI * 2;
function PULLTOWARD(val, target, delta) { return target + (val - target) / (1 + delta); }
function MOVETOWARD(val, target, delta) {
  const down = val - delta, up = val + delta;
  return target < down ? down : target > up ? up : target;
}
function INTERP(a, b, f) { return a + (b - a) * f; }
function CLAMP(a, min, max) { return Math.min(Math.max(a, min), max); }

// ── Default kart config ─────────────────────────────────────────────

export const DEFAULT_KART_CONFIG = {
  mass: 350,
  dimensions: [1.4, 0.6, 2.1],  // half-extents [x, y, z]
  center: [0, 0.2, 0],

  engine: {
    powerscale: 80,  // kW
    redline: 8000,   // RPM
    flywheel: 50,
    powerband: [
      { rpm: 2000, power: 0.4 },
      { rpm: 3500, power: 0.7 },
      { rpm: 5000, power: 0.9 },
      { rpm: 6500, power: 1.0 },
      { rpm: 7500, power: 0.95 },
      { rpm: 8000, power: 0.8 },
    ],
  },

  transmission: {
    reverse: 3.2,
    forward: [3.6, 2.3, 1.7, 1.3, 1.0],
    final: 4.1,
  },

  wheels: [
    { pos: [-0.58, -0.1, 0.85],  radius: 0.2, drive: 0, brake: 600, turn: 1,   mass: 12 },
    { pos: [ 0.58, -0.1, 0.85],  radius: 0.2, drive: 0, brake: 600, turn: 1,   mass: 12 },
    { pos: [-0.58, -0.1, -0.75], radius: 0.2, drive: 1, brake: 400, turn: 0,   mass: 12, handbrake: 1200 },
    { pos: [ 0.58, -0.1, -0.75], radius: 0.2, drive: 1, brake: 400, turn: 0,   mass: 12, handbrake: 1200 },
  ],

  clips: [
    { pos: [-0.6, 0.0,  1.0], radius: 0.2 },
    { pos: [ 0.6, 0.0,  1.0], radius: 0.2 },
    { pos: [-0.6, 0.0, -0.9], radius: 0.2 },
    { pos: [ 0.6, 0.0, -0.9], radius: 0.2 },
    { pos: [ 0.0, 0.3,  0.0], radius: 0.3 },
  ],

  recover: {
    triggerTime: 3,
    releaseTime: 0.5,
    posOffset: [0, 2, 0],
  },

  nitroMultiplier: 1.8,
  nitroDrain: 25,
  nitroRegen: 8,
};

// ── Physics constants (from TriggerRally) ───────────────────────────

const CLIP_CONSTANT = 200000;
const CLIP_DAMPING = 8000;
const ENGINE_BRAKE_REGION = 0.5;
const ENGINE_BRAKE_TORQUE = 0.1;
const REDLINE_RECOVER_FRACTION = 0.98;
const LSD_VISCOUS_CONSTANT = 400;
const MIN_TIME_BETWEEN_SHIFTS = 0.2;
const FRICTION_DYNAMIC_CHASSIS = 0.81;
const FRICTION_STATIC_CHASSIS = 1.08;
const FRICTION_DYNAMIC_WHEEL = 1.08;
const FRICTION_STATIC_WHEEL = 1.44;
const WHEEL_LATERAL_FEEDBACK = 0.025;
const SUSP_CONSTANT = 120000;
const SUSP_DAMPING_1 = 100;
const SUSP_DAMPING_2 = 20000;
const SUSP_MAX = 0.14;
const WHEEL_MASS = 15;

// ── Engine powerband interpolation ──────────────────────────────────

function getEnginePower(angVel, powerband) {
  if (angVel <= 0) return 0;
  if (angVel <= powerband[0].radps) return powerband[0].power * angVel / powerband[0].radps;
  for (let p = 1; p < powerband.length; p++) {
    if (angVel <= powerband[p].radps) {
      return INTERP(powerband[p - 1].power, powerband[p].power,
        (angVel - powerband[p - 1].radps) / (powerband[p].radps - powerband[p - 1].radps));
    }
  }
  return powerband[powerband.length - 1].power;
}

// ── TriggerVehicle class ────────────────────────────────────────────

export class TriggerVehicle {
  /**
   * @param {object} scene — Babylon scene (used for Havok raycast)
   * @param {object} [config] — vehicle config (defaults to DEFAULT_KART_CONFIG)
   */
  constructor(scene, config = DEFAULT_KART_CONFIG) {
    this.scene = scene;
    this.cfg = config;

    // ── Rigid body state ──
    this.pos = new Vector3(0, 2, 0);
    this.ori = Quaternion.Identity();
    this.oriMat = Matrix.Identity();
    this.oriMatInv = Matrix.Identity();
    this.linVel = new Vector3();
    this.angVel = new Vector3();
    this.angMom = new Vector3();
    this.accumForce = new Vector3();
    this.accumTorque = new Vector3();

    // Mass properties
    this.mass = config.mass;
    const dim = config.dimensions;
    const fm = this.mass * 1.5;
    const mx = dim[0] * dim[0] * fm / 3;
    const my = dim[1] * dim[1] * fm / 3;
    const mz = dim[2] * dim[2] * fm / 3;
    this.angMass = new Vector3(my + mz, mz + mx, mx + my);
    this.angMassInv = new Vector3(1 / this.angMass.x, 1 / this.angMass.y, 1 / this.angMass.z);
    this.angDamping = 1e-10;

    // ── Wheels ──
    this.totalDrive = 0;
    this.wheels = config.wheels.map(wcfg => {
      const drive = wcfg.drive || 0;
      this.totalDrive += drive;
      return {
        cfg: wcfg,
        pos: new Vector3(wcfg.pos[0] - config.center[0], wcfg.pos[1] - config.center[1], wcfg.pos[2] - config.center[2]),
        ridePos: 0, rideVel: 0, spinPos: 0, spinVel: 0,
        frictionForce: { x: 0, y: 0 },
        MASS: wcfg.mass || WHEEL_MASS,
        SUSP_MAX: wcfg.suspMax || SUSP_MAX,
        SUSP_CONSTANT: wcfg.suspConstant || SUSP_CONSTANT,
        SUSP_DAMPING_1: wcfg.suspDamping1 || SUSP_DAMPING_1,
        SUSP_DAMPING_2: wcfg.suspDamping2 || SUSP_DAMPING_2,
      };
    });

    // ── Clips (chassis collision points) ──
    this.clips = config.clips.map(c => ({
      pos: new Vector3(c.pos[0] - config.center[0], c.pos[1] - config.center[1], c.pos[2] - config.center[2]),
      radius: c.radius,
    }));

    // ── Engine + gearbox ──
    const eng = config.engine;
    this.enginePowerscale = eng.powerscale * 1000;
    this.engineRedline = eng.redline * TWOPI / 60;
    this.engineRecover = this.engineRedline * REDLINE_RECOVER_FRACTION;
    this.engineOverspeed = false;
    this.engineAngVel = 0;

    // Pre-compute powerband radps
    eng.powerband.forEach(p => { p.radps = p.rpm * TWOPI / 60; });
    this.engineIdle = eng.powerband[0].radps;

    const trans = config.transmission;
    const finalR = trans.final;
    this.gearRatios = { '-1': -trans.reverse * finalR, 0: 0 };
    trans.forward.forEach((r, i) => { this.gearRatios[i + 1] = r * finalR; });

    // ── Controller state ──
    this.gear = 1;
    this.shiftTimer = 0;
    this.wheelTurnPos = 0;
    this.wheelTurnVel = 0;
    this.hasContact = false;
    this.skidLevel = 0;
    this.differentialAngVel = 0;
    this.forwardSpeed = 0;
    this.currentSpeed = 0; // km/h for HUD

    // ── Input ──
    this.input = { throttle: 0, brake: 0, handbrake: 0, turn: 0 };

    // ── Nitro ──
    this.nitro = 100;
  }

  // ── Set position and reset velocity ─────────────────────────────

  setPosition(x, y, z) {
    this.pos.set(x, y, z);
    this.linVel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.angMom.set(0, 0, 0);
    this.ori = Quaternion.Identity();
    this._updateMatrices();
  }

  // ── Fixed timestep physics tick ─────────────────────────────────

  tick(dt) {
    dt = Math.min(dt, 0.02); // cap substep

    this._updateMatrices();
    const up = Vector3.TransformNormal(Vector3.Up(), this.oriMat);
    const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), this.oriMat);
    const right = Vector3.TransformNormal(new Vector3(1, 0, 0), this.oriMat);

    this.forwardSpeed = Vector3.Dot(this.linVel, forward);
    this.currentSpeed = Math.round(Math.abs(this.forwardSpeed) * 3.6);

    // ── Automatic gearbox ──
    const isNitro = this.input.nitro && this.nitro > 0;
    const nitroMult = isNitro ? (this.cfg.nitroMultiplier || 1.8) : 1;
    let throttle = this.input.throttle;
    const brake = this.input.brake;
    const handbrake = this.input.handbrake;

    // Auto shift
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    } else if (this.gear >= 1) {
      const curRatio = this.gearRatios[this.gear] || 1;
      const curTorque = this.engineAngVel > 0 ? getEnginePower(this.engineAngVel, this.cfg.engine.powerband) * curRatio / this.engineAngVel : 0;
      if (this.gear > 1) {
        const prevRatio = this.gearRatios[this.gear - 1] || curRatio;
        const prevAV = this.engineAngVel * prevRatio / curRatio;
        const prevTorque = prevAV > 0 ? getEnginePower(prevAV, this.cfg.engine.powerband) * prevRatio / prevAV : 0;
        if (prevTorque > curTorque) { this.gear--; this.shiftTimer = MIN_TIME_BETWEEN_SHIFTS; }
      }
      if (this.gear < Object.keys(this.gearRatios).length - 2) {
        const nextRatio = this.gearRatios[this.gear + 1] || curRatio;
        const nextAV = this.engineAngVel * nextRatio / curRatio;
        const nextTorque = nextAV > 0 ? getEnginePower(nextAV, this.cfg.engine.powerband) * nextRatio / nextAV : 0;
        if (nextTorque > curTorque) { this.gear++; this.shiftTimer = MIN_TIME_BETWEEN_SHIFTS; }
      }
      // Auto reverse
      if (brake > 0.1 && this.differentialAngVel < 1 && this.gear >= 1) {
        this.gear = -1;
        this.shiftTimer = MIN_TIME_BETWEEN_SHIFTS;
      }
    } else if (this.gear === -1 && throttle > 0.1) {
      this.gear = 1;
      this.shiftTimer = MIN_TIME_BETWEEN_SHIFTS;
    }

    // Engine speed
    let diffAngVel = 0;
    this.wheels.forEach(w => { diffAngVel += w.spinVel * (w.cfg.drive || 0); });
    diffAngVel /= Math.max(this.totalDrive, 0.01);
    this.differentialAngVel = diffAngVel;

    const gearRatio = this.gearRatios[this.gear] || 0;
    if (gearRatio !== 0) this.engineAngVel = diffAngVel * gearRatio;
    if (this.engineAngVel < this.engineIdle) this.engineAngVel = this.engineIdle;

    // Overspeed
    if (this.engineOverspeed) {
      this.engineOverspeed = this.engineAngVel > this.engineRecover;
      if (this.engineOverspeed) throttle = 0;
    } else if (this.engineAngVel > this.engineRedline) {
      throttle = 0;
      this.engineOverspeed = true;
    }

    // Engine torque
    const extThrottle = throttle - ENGINE_BRAKE_REGION;
    let engineTorque;
    if (extThrottle >= 0) {
      const norm = extThrottle / (1 - ENGINE_BRAKE_REGION);
      const power = norm * this.enginePowerscale * nitroMult * getEnginePower(this.engineAngVel, this.cfg.engine.powerband);
      engineTorque = power / Math.max(this.engineAngVel, 1);
    } else {
      const norm = extThrottle / ENGINE_BRAKE_REGION;
      engineTorque = ENGINE_BRAKE_TORQUE * norm * (this.engineAngVel - this.engineIdle);
    }

    // Distribute torque to wheels
    const perWheelTorque = gearRatio !== 0 ? engineTorque * gearRatio / Math.max(this.totalDrive, 1) : 0;
    if (gearRatio === 0) {
      this.engineAngVel += 50000 * engineTorque * dt / this.cfg.engine.flywheel;
      if (this.engineAngVel < this.engineIdle) this.engineAngVel = this.engineIdle;
    }

    // ── Per-wheel physics ──
    this.hasContact = false;
    this.skidLevel = 0;
    const physEngine = this.scene.getPhysicsEngine();

    this.wheels.forEach(wheel => {
      // Suspension spring sim
      const suspForce = wheel.ridePos * wheel.SUSP_CONSTANT;
      wheel.frictionForce = { x: 0, y: 0 };
      wheel.rideVel -= suspForce / wheel.MASS * dt;
      wheel.rideVel *= 1 / (1 + wheel.SUSP_DAMPING_1 * dt);
      wheel.ridePos += wheel.rideVel * dt;
      wheel.spinPos += wheel.spinVel * dt;

      // Drive torque + LSD
      if (wheel.cfg.drive) {
        const diffSlip = wheel.spinVel - diffAngVel;
        const wTorque = (perWheelTorque - diffSlip * LSD_VISCOUS_CONSTANT) * wheel.cfg.drive;
        wheel.spinVel += 2 * wTorque / wheel.MASS / wheel.cfg.radius * 0.3 * dt;
      }

      // Braking
      const brakeF = brake * (wheel.cfg.brake || 0) + handbrake * (wheel.cfg.handbrake || 0);
      if (brakeF > 0) wheel.spinVel = MOVETOWARD(wheel.spinVel, 0, brakeF * dt);

      // Raycast down from wheel position
      const localWheelPos = wheel.pos.clone();
      localWheelPos.y += wheel.ridePos;
      const worldWheelPos = Vector3.TransformCoordinates(localWheelPos, this.oriMat).add(this.pos);
      const rayFrom = worldWheelPos.clone();
      const rayTo = worldWheelPos.subtract(up.scale(wheel.cfg.radius + wheel.SUSP_MAX + 0.1));

      if (physEngine) {
        const result = physEngine.raycast(rayFrom, rayTo);
        if (result?.hasHit) {
          this.hasContact = true;
          const hitDist = Vector3.Distance(rayFrom, result.hitPointWorld);
          const contactDepth = (wheel.cfg.radius + wheel.SUSP_MAX) - hitDist;

          if (contactDepth > 0) {
            wheel.ridePos = Math.min(wheel.ridePos + contactDepth, wheel.SUSP_MAX);
            if (wheel.rideVel < 0) wheel.rideVel = 0;

            // Suspension force
            const perpForce = wheel.ridePos * wheel.SUSP_CONSTANT + wheel.rideVel * wheel.SUSP_DAMPING_2;

            if (perpForce > 0) {
              // Normal force
              this._addForceAtPoint(up.scale(perpForce * dt), worldWheelPos);

              // Tire friction
              const pointVel = this._getVelAtPoint(worldWheelPos);
              const lateralVel = Vector3.Dot(pointVel, right);
              const longitudinalVel = Vector3.Dot(pointVel, forward) + wheel.spinVel * wheel.cfg.radius;

              const frictionX = -lateralVel * 3000;
              const frictionY = -longitudinalVel * 3000;
              let fLen = Math.sqrt(frictionX * frictionX + frictionY * frictionY);
              const maxFriction = perpForce * FRICTION_DYNAMIC_WHEEL;
              const testFriction = perpForce * FRICTION_STATIC_WHEEL;

              let fx = frictionX, fy = frictionY;
              if (fLen > testFriction) {
                const scale = maxFriction / fLen;
                fx *= scale;
                fy *= scale;
                this.skidLevel += Math.min(1, fLen / maxFriction - 0.75) * perpForce;
              }

              this._addForceAtPoint(right.scale(fx * dt).add(forward.scale(fy * dt)), worldWheelPos);
              wheel.frictionForce = { x: fx, y: fy };
            }
          }
        }
      }
    });

    // ── Chassis clip collision ──
    this.clips.forEach(clip => {
      const worldPos = Vector3.TransformCoordinates(clip.pos, this.oriMat).add(this.pos);
      const rayFrom = worldPos.clone();
      const rayTo = worldPos.subtract(up.scale(clip.radius));
      if (physEngine) {
        const result = physEngine.raycast(rayFrom, rayTo);
        if (result?.hasHit) {
          this.hasContact = true;
          const depth = clip.radius - Vector3.Distance(rayFrom, result.hitPointWorld);
          if (depth > 0) {
            const contactVel = Vector3.Dot(this._getVelAtPoint(worldPos), up);
            const force = depth * CLIP_CONSTANT - contactVel * CLIP_DAMPING;
            if (force > 0) this._addForceAtPoint(up.scale(force * dt), worldPos);
          }
        }
      }
    });

    // ── Steering ──
    const turnTarget = this.input.turn;
    const wheelLateralForce = this.wheels.reduce((sum, w) => sum + (w.frictionForce.x * (w.cfg.turn || 0)), 0);
    const turnVelTarget = CLAMP((turnTarget - this.wheelTurnPos) * 400 - this.wheelTurnVel * 20 - wheelLateralForce * WHEEL_LATERAL_FEEDBACK, -8, 8);
    this.wheelTurnVel = PULLTOWARD(this.wheelTurnVel, turnVelTarget, dt * 10);
    this.wheelTurnPos += this.wheelTurnVel * dt;
    this.wheelTurnPos = CLAMP(this.wheelTurnPos, -1, 1);

    // ── Nitro ──
    if (isNitro) {
      this.nitro = Math.max(0, this.nitro - (this.cfg.nitroDrain || 25) * dt);
    } else if (!this.input.nitro) {
      this.nitro = Math.min(100, this.nitro + (this.cfg.nitroRegen || 8) * dt);
    }

    // ── Integrate rigid body ──
    this._integrate(dt);
  }

  // ── Rigid body integration (from TriggerRally sim.js) ───────────

  _integrate(dt) {
    // Gravity
    this.accumForce.y -= this.mass * 9.81;

    // Linear
    const linAccel = this.accumForce.scale(1 / this.mass);
    this.linVel.addInPlace(linAccel.scale(dt));
    this.pos.addInPlace(this.linVel.scale(dt));

    // Angular momentum
    this.angMom.addInPlace(this.accumTorque.scale(dt));
    const sf = 1 / (1 + this.angMom.lengthSquared() * dt * this.angDamping);
    this.angMom.scaleInPlace(sf);

    // Angular velocity from momentum
    this._updateMatrices();
    const locMom = Vector3.TransformNormal(this.angMom, this.oriMatInv);
    const locAV = new Vector3(locMom.x * this.angMassInv.x, locMom.y * this.angMassInv.y, locMom.z * this.angMassInv.z);
    this.angVel = Vector3.TransformNormal(locAV, this.oriMat);

    // Integrate orientation
    const hd = 0.5 * dt;
    const spin = new Quaternion(
      this.angVel.x * hd, this.angVel.y * hd, this.angVel.z * hd, 0
    ).multiply(this.ori);
    this.ori.x += spin.x;
    this.ori.y += spin.y;
    this.ori.z += spin.z;
    this.ori.w += spin.w;
    this.ori.normalize();

    // Reset accumulators
    this.accumForce.set(0, 0, 0);
    this.accumTorque.set(0, 0, 0);

    this._updateMatrices();
  }

  _updateMatrices() {
    this.oriMat = Matrix.FromQuaternionToRef(this.ori, this.oriMat || Matrix.Identity());
    Matrix.InvertToRef(this.oriMat, this.oriMatInv || (this.oriMatInv = Matrix.Identity()));
  }

  _addForceAtPoint(force, worldPoint) {
    this.accumForce.addInPlace(force);
    const offset = worldPoint.subtract(this.pos);
    this.accumTorque.addInPlace(Vector3.Cross(offset, force));
  }

  _getVelAtPoint(worldPoint) {
    const offset = worldPoint.subtract(this.pos);
    return this.linVel.add(Vector3.Cross(this.angVel, offset));
  }
}
