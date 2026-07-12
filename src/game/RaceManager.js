/**
 * RaceManager — Countdown, finish line, win/lose for drag / circuit / time trial.
 *
 * Modes:
 *   drag       — first to finishDistance along +Z
 *   race       — first to N laps (progress = distance traveled along track)
 *   timeAttack — solo; finish when player reaches finishDistance or laps
 *   battle     — no race logic (combat handled elsewhere)
 */

export class RaceManager {
  /**
   * @param {object} opts
   * @param {'drag'|'race'|'timeAttack'|'battle'} opts.mode
   * @param {object} opts.track — track def from TrackRegistry
   * @param {object} opts.player — CarController
   * @param {object} opts.aiManager — AIManager
   * @param {(msg: string, ms?: number) => void} [opts.onMessage]
   * @param {(result: object) => void} [opts.onFinish]
   */
  constructor(opts) {
    this.mode = opts.mode;
    this.track = opts.track;
    this.player = opts.player;
    this.aiManager = opts.aiManager;
    this.onMessage = opts.onMessage || (() => {});
    this.onFinish = opts.onFinish || (() => {});

    this.active = this.mode !== 'battle';
    this.phase = 'idle'; // idle | countdown | racing | finished
    this.countdown = 0;
    this.raceTime = 0;
    this.finished = false;

    this.finishDistance = opts.track.finishDistance || 400;
    this.lapsRequired = opts.track.laps || (this.mode === 'race' ? 3 : 1);

    // Progress tracking (drag = Z distance from start)
    this.playerStartZ = 0;
    this.playerProgress = 0;
    this.playerLaps = 0;
    this._lastLapProgress = 0;

    this.botProgress = []; // per-bot progress
    this.winner = null; // 'player' | 'bot' | null
    this.place = 1;
  }

  /** Call after player/bots are spawned at start line. */
  begin() {
    if (!this.active) {
      this.phase = 'racing';
      return;
    }

    this.playerStartZ = this.player.getPosition().z;
    this.playerProgress = 0;
    this.playerLaps = 0;
    this._lastLapProgress = 0;
    this.raceTime = 0;
    this.finished = false;
    this.winner = null;
    this.place = 1;
    this.botProgress = (this.aiManager?.bots || []).map(() => 0);

    // Freeze cars until GO
    this.phase = 'countdown';
    this.countdown = 3.4;
    this._countStage = 3;
    this._lockControls(true);
    this.onMessage('3', 1000);
  }

  update(dt) {
    if (!this.active || this.finished) return;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this._countStage === 3 && this.countdown <= 2.4) {
        this._countStage = 2;
        this.onMessage('2', 1000);
      } else if (this._countStage === 2 && this.countdown <= 1.4) {
        this._countStage = 1;
        this.onMessage('1', 1000);
      } else if (this._countStage === 1 && this.countdown <= 0.35) {
        this._countStage = 0;
        this.onMessage('GO!', 900);
        this.phase = 'racing';
        this._lockControls(false);
      }
      // Hold vehicles in place during countdown
      if (this.player?.vehicle) {
        this.player.vehicle.linVel.set(0, 0, 0);
        this.player.vehicle.angVel.set(0, 0, 0);
        this.player.vehicle.angMom.set(0, 0, 0);
      }
      return;
    }

    if (this.phase !== 'racing') return;

    this.raceTime += dt;
    this._updateProgress();
    this._checkFinish();
  }

  _updateProgress() {
    const pz = this.player.getPosition().z;
    if (this.mode === 'drag' || this.mode === 'timeAttack') {
      this.playerProgress = Math.max(0, pz - this.playerStartZ);
    } else {
      // Circuit: accumulate forward distance as lap progress proxy
      const spd = Math.abs(this.player.forwardSpeed || 0);
      this.playerProgress += spd * (1 / 60); // rough distance
      // Lap every finishDistance worth of travel
      const lapLen = this.finishDistance || 400;
      const newLaps = Math.floor(this.playerProgress / lapLen);
      if (newLaps > this.playerLaps) {
        this.playerLaps = newLaps;
        if (this.playerLaps < this.lapsRequired) {
          this.onMessage(`LAP ${this.playerLaps + 1}/${this.lapsRequired}`, 1200);
        }
      }
    }

    // Bot progress
    const bots = this.aiManager?.bots || [];
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      if (!bot.alive) continue;
      const bz = bot.root.getAbsolutePosition().z;
      if (this.mode === 'drag' || this.mode === 'timeAttack') {
        this.botProgress[i] = Math.max(this.botProgress[i] || 0, bz - this.playerStartZ);
      } else {
        const bspd = bot.currentSpeed || 0;
        this.botProgress[i] = (this.botProgress[i] || 0) + bspd * (1 / 60);
      }
    }
  }

  _checkFinish() {
    if (this.mode === 'drag' || this.mode === 'timeAttack') {
      if (this.playerProgress >= this.finishDistance) {
        this._finish('player');
        return;
      }
      for (let i = 0; i < this.botProgress.length; i++) {
        if (this.botProgress[i] >= this.finishDistance) {
          this._finish('bot');
          return;
        }
      }
    } else if (this.mode === 'race') {
      const lapLen = this.finishDistance || 400;
      if (this.playerProgress >= lapLen * this.lapsRequired) {
        this._finish('player');
        return;
      }
      for (let i = 0; i < this.botProgress.length; i++) {
        if (this.botProgress[i] >= lapLen * this.lapsRequired) {
          this._finish('bot');
          return;
        }
      }
    }
  }

  _finish(winner) {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'finished';
    this.winner = winner;
    this._lockControls(true);

    // Place: count bots ahead of player
    let place = 1;
    for (const bp of this.botProgress) {
      if (bp > this.playerProgress) place++;
    }
    this.place = place;

    const timeStr = this.formatTime(this.raceTime);
    if (winner === 'player') {
      this.onMessage(this.mode === 'drag' ? 'YOU WIN!' : 'FINISH!', 2500);
    } else {
      this.onMessage(this.mode === 'drag' ? 'TOO SLOW' : 'DEFEATED', 2500);
    }

    this.onFinish({
      winner,
      place: this.place,
      time: this.raceTime,
      timeStr,
      mode: this.mode,
      progress: this.playerProgress,
    });
  }

  _lockControls(lock) {
    if (this.player) this.player.controlsLocked = !!lock;
    if (this.aiManager) this.aiManager.frozen = !!lock;
  }

  formatTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }

  /** HUD helpers */
  getHudState() {
    if (!this.active) return null;
    const distLeft = Math.max(0, this.finishDistance - this.playerProgress);
    const lead = this.playerProgress - Math.max(0, ...this.botProgress, 0);
    return {
      phase: this.phase,
      time: this.raceTime,
      timeStr: this.formatTime(this.raceTime),
      progress: this.playerProgress,
      finishDistance: this.finishDistance,
      distLeft,
      lead,
      laps: this.playerLaps,
      lapsRequired: this.lapsRequired,
      place: this._livePlace(),
    };
  }

  _livePlace() {
    let place = 1;
    for (const bp of this.botProgress) {
      if (bp > this.playerProgress) place++;
    }
    return place;
  }
}
