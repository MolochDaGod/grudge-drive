/**
 * SpringSimulator — damped spring for smooth value interpolation.
 * Ported from Sketchbook's spring_simulation pattern.
 * Used for steering, camera, and any input that needs smooth easing.
 */
export class SpringSimulator {
  /**
   * @param {number} frequency  - Hz oscillation (higher = snappier)
   * @param {number} damping    - 0..1+ (1 = critically damped, <1 = bouncy, >1 = overdamped)
   * @param {number} [initial]  - starting position
   */
  constructor(frequency = 15, damping = 0.8, initial = 0) {
    this.frequency = frequency;
    this.damping = damping;
    this.position = initial;
    this.velocity = 0;
    this.target = 0;
  }

  /**
   * Step the spring toward target by dt seconds.
   * Uses a semi-implicit Euler integration of a damped harmonic oscillator.
   */
  simulate(dt) {
    if (dt <= 0) return;
    // Clamp large dt to avoid instability
    dt = Math.min(dt, 0.05);

    const omega = 2 * Math.PI * this.frequency;
    const damping = this.damping;
    const displacement = this.position - this.target;

    // Spring acceleration: F = -kx - cv
    const springAccel = -omega * omega * displacement;
    const dampingAccel = -2 * damping * omega * this.velocity;

    this.velocity += (springAccel + dampingAccel) * dt;
    this.position += this.velocity * dt;

    // Snap to target when close enough (avoid jitter)
    if (Math.abs(displacement) < 0.0001 && Math.abs(this.velocity) < 0.001) {
      this.position = this.target;
      this.velocity = 0;
    }
  }

  /** Reset to a value instantly. */
  reset(value = 0) {
    this.position = value;
    this.velocity = 0;
    this.target = value;
  }
}
