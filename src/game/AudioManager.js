import { Sound } from '@babylonjs/core';

/**
 * AudioManager — wraps BabylonJS Sound for game audio.
 * Gracefully no-ops if audio files are missing.
 */
export class AudioManager {
  constructor(scene) {
    this.scene = scene;
    this._sounds = {};
    this._muted = false;
  }

  /** Pre-load a named sound. Silently ignores load errors. */
  load(name, url, options = {}) {
    try {
      const snd = new Sound(name, url, this.scene, null, {
        loop: options.loop ?? false,
        autoplay: false,
        volume: options.volume ?? 1.0,
        ...options,
      });
      this._sounds[name] = snd;
    } catch {
      // Audio unavailable — continue without it
    }
  }

  play(name) {
    if (this._muted) return;
    const snd = this._sounds[name];
    if (snd && !snd.isPlaying) snd.play();
  }

  playOnce(name) {
    if (this._muted) return;
    const snd = this._sounds[name];
    if (snd) {
      if (snd.isPlaying) snd.stop();
      snd.play();
    }
  }

  stop(name) {
    this._sounds[name]?.stop();
  }

  stopAll() {
    Object.values(this._sounds).forEach(s => s.stop());
  }

  setMuted(muted) {
    this._muted = muted;
    if (muted) this.stopAll();
  }
}
