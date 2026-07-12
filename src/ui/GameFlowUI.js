/**
 * GameFlowUI — Simplified one-screen play setup for production Velocity.
 *
 * Flow: pick MODE (+ optional vehicle) → LAUNCH
 * Defaults: Drag Race with signature kart for saved race (or Warkind).
 * Character creation is optional — quick play works without a driver.
 */

import { GAME_MODES, getTracksForMode, getDefaultTrackForMode } from '../game/TrackRegistry.js';
import { getAvailableKarts, getKartForRace, getKartById } from '../game/KartRegistry.js';
import { RACES } from '../game/CharacterManager.js';

const MODE_ORDER = ['drag', 'race', 'battle', 'timeAttack'];

export class GameFlowUI {
  constructor() {
    this._el = null;
    this._resolve = null;
    this._data = this._defaults();
    this._stylesInjected = false;
  }

  _defaults() {
    return {
      raceId: 'wk',
      kartId: getKartForRace('wk').id,
      mode: 'drag',
      trackId: getDefaultTrackForMode('drag').id,
    };
  }

  /**
   * @param {{ raceId?: string, mode?: string }} [preset]
   * @returns {Promise<{raceId,kartId,mode,trackId}|null>}
   */
  show(preset = {}) {
    this._ensureDOM();
    this._data = this._defaults();
    if (preset.raceId) {
      this._data.raceId = preset.raceId;
      this._data.kartId = getKartForRace(preset.raceId).id;
    }
    if (preset.mode && GAME_MODES[preset.mode]) {
      this._data.mode = preset.mode;
      this._data.trackId = getDefaultTrackForMode(preset.mode).id;
    }
    this._el.classList.add('active');
    this._render();
    return new Promise(resolve => { this._resolve = resolve; });
  }

  hide() { this._el?.classList.remove('active'); }

  _ensureDOM() {
    if (this._el) return;
    let el = document.getElementById('gameFlowOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gameFlowOverlay';
      document.body.appendChild(el);
    }
    this._el = el;
    if (!this._stylesInjected) {
      this._stylesInjected = true;
      const s = document.createElement('style');
      s.textContent = `
#gameFlowOverlay{position:fixed;inset:0;z-index:55;background:radial-gradient(ellipse at 50% 10%,rgba(25,18,35,.97),rgba(8,8,10,.99));display:none;flex-direction:column;align-items:center;overflow-y:auto;font-family:'Inter',sans-serif;padding:28px 16px 48px}
#gameFlowOverlay.active{display:flex}
.gf-title{font-family:'Cinzel Decorative',serif;font-size:1.9rem;font-weight:900;background:linear-gradient(135deg,#c9952a,#f5d77a,#c9952a,#8b6914);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px;text-align:center}
.gf-sub{color:#666;font-size:.75rem;letter-spacing:.15em;margin-bottom:22px;text-align:center}
.gf-content{width:100%;max-width:880px}
.gf-section{font-family:'Cinzel Decorative',serif;font-size:.68rem;font-weight:700;color:#777;letter-spacing:.2em;text-transform:uppercase;margin:18px 0 10px}
.gf-mode-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
@media(max-width:720px){.gf-mode-row{grid-template-columns:repeat(2,1fr)}}
.gf-mode{padding:16px 10px;border:1px solid #2a2a30;background:rgba(15,15,20,.9);cursor:pointer;text-align:center;transition:.2s;border-radius:8px}
.gf-mode:hover{border-color:#666;transform:translateY(-2px)}
.gf-mode.selected{border-color:#c9952a;background:rgba(201,149,42,.1);box-shadow:0 0 22px rgba(201,149,42,.18)}
.gf-mode .m-icon{font-size:1.6rem;margin-bottom:6px}
.gf-mode .m-name{font-family:'Cinzel Decorative',serif;font-size:.85rem;font-weight:700;color:#c9952a}
.gf-mode .m-desc{color:#777;font-size:.58rem;margin-top:4px;line-height:1.35}
.gf-mode .m-tag{display:inline-block;margin-top:8px;font-size:.5rem;letter-spacing:.12em;padding:2px 8px;border-radius:3px;border:1px solid #333;color:#888}
.gf-mode .m-tag.pvp{border-color:#c44;color:#e66}
.gf-mode .m-tag.pve{border-color:#4a8;color:#6c9}
.gf-track-row{display:flex;gap:8px;flex-wrap:wrap}
.gf-track{flex:1;min-width:140px;padding:12px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;border-radius:6px;transition:.2s}
.gf-track:hover{border-color:#555}
.gf-track.selected{border-color:#c9952a;background:rgba(201,149,42,.08)}
.gf-track .t-name{font-family:'Cinzel Decorative',serif;font-size:.8rem;color:#c9952a;font-weight:700}
.gf-track .t-desc{color:#666;font-size:.55rem;margin-top:3px;line-height:1.3}
.gf-kart-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}
.gf-kart{min-width:150px;padding:10px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;border-radius:6px;transition:.2s;flex-shrink:0}
.gf-kart:hover{border-color:#555}
.gf-kart.selected{border-color:#c9952a;background:rgba(201,149,42,.08)}
.gf-kart .k-name{font-size:.75rem;color:#c9952a;font-weight:700;font-family:'Cinzel Decorative',serif}
.gf-kart .k-tier{font-size:.5rem;font-weight:800;margin-top:2px}
.gf-kart .k-tier.S{color:#f5d77a}.gf-kart .k-tier.A{color:#b07be0}.gf-kart .k-tier.B{color:#5dade2}.gf-kart .k-tier.C{color:#999}
.gf-race-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.gf-race-chip{padding:8px 12px;border:1px solid #2a2a30;border-radius:20px;cursor:pointer;font-size:.7rem;color:#888;transition:.2s}
.gf-race-chip:hover{border-color:#555;color:#ccc}
.gf-race-chip.selected{border-color:var(--rc,#c9952a);color:var(--rc,#c9952a);background:rgba(201,149,42,.08)}
.gf-actions{display:flex;gap:12px;justify-content:center;margin-top:28px;flex-wrap:wrap}
.gf-btn{font-family:'Cinzel Decorative',serif;font-size:.9rem;font-weight:700;padding:14px 36px;border:1px solid rgba(201,149,42,.3);background:rgba(201,149,42,.1);color:#c9952a;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;transition:.25s}
.gf-btn:hover{background:rgba(201,149,42,.22);border-color:#c9952a;transform:translateY(-1px)}
.gf-btn.primary{background:linear-gradient(135deg,rgba(201,149,42,.35),rgba(201,149,42,.1));border-color:#c9952a;font-size:1rem;padding:16px 48px}
.gf-btn.ghost{border-color:#333;color:#666;background:transparent}
.gf-hint{text-align:center;color:#444;font-size:.6rem;margin-top:14px;letter-spacing:.08em}
`;
      document.head.appendChild(s);
    }
  }

  _render() {
    const modes = MODE_ORDER.map(id => GAME_MODES[id]).filter(Boolean);
    const tracks = getTracksForMode(this._data.mode);
    if (!tracks.find(t => t.id === this._data.trackId)) {
      this._data.trackId = getDefaultTrackForMode(this._data.mode)?.id || tracks[0]?.id;
    }
    const karts = getAvailableKarts(this._data.raceId);
    const tierOrder = { S: 0, A: 1, B: 2, C: 3 };
    const sortedKarts = [...karts].sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));
    // Keep list short for UX — signature + top A + drag racer
    const shown = sortedKarts.filter((k, i) =>
      k.tier === 'S' || k.id === 'drag_racer' || k.id === 'race_car' || k.id === 'rc_red' || i < 10
    );

    this._el.innerHTML = `
      <div class="gf-content">
        <h1 class="gf-title">VELOCITY</h1>
        <p class="gf-sub">Pick a mode · jump in · drive</p>

        <div class="gf-section">Mode</div>
        <div class="gf-mode-row">
          ${modes.map(m => `
            <div class="gf-mode ${this._data.mode === m.id ? 'selected' : ''}" data-mode="${m.id}">
              <div class="m-icon">${m.icon}</div>
              <div class="m-name">${m.name}</div>
              <div class="m-desc">${m.desc}</div>
              <div class="m-tag ${m.isPvp ? 'pvp' : 'pve'}">${m.isPvp ? 'PVP / VS AI' : 'PVE'}</div>
            </div>`).join('')}
        </div>

        <div class="gf-section">Track</div>
        <div class="gf-track-row">
          ${tracks.map(t => `
            <div class="gf-track ${this._data.trackId === t.id ? 'selected' : ''}" data-track="${t.id}">
              <div class="t-name">${t.name}</div>
              <div class="t-desc">${t.desc}</div>
            </div>`).join('')}
        </div>

        <div class="gf-section">Driver Faction</div>
        <div class="gf-race-row">
          ${RACES.map(r => `
            <div class="gf-race-chip ${this._data.raceId === r.id ? 'selected' : ''}" data-race="${r.id}" style="--rc:${r.accent}">
              ${r.name}
            </div>`).join('')}
        </div>

        <div class="gf-section">Vehicle</div>
        <div class="gf-kart-scroll">
          ${shown.map(k => `
            <div class="gf-kart ${this._data.kartId === k.id ? 'selected' : ''}" data-kart="${k.id}">
              <div class="k-name">${k.kartName}</div>
              <div class="k-tier ${k.tier}">TIER ${k.tier}</div>
            </div>`).join('')}
        </div>

        <div class="gf-actions">
          <button class="gf-btn ghost" id="gfBack">← Menu</button>
          <button class="gf-btn primary" id="gfLaunch">▶ LAUNCH</button>
        </div>
        <p class="gf-hint">WASD drive · SHIFT / E nitro · SPACE handbrake · Click fire (battle)</p>
      </div>`;

    this._el.querySelectorAll('.gf-mode').forEach(el => {
      el.addEventListener('click', () => {
        this._data.mode = el.dataset.mode;
        this._data.trackId = getDefaultTrackForMode(this._data.mode).id;
        // Prefer drag racer for drag mode
        if (this._data.mode === 'drag') {
          const dr = getKartById('drag_racer');
          if (dr) this._data.kartId = dr.id;
        }
        this._render();
      });
    });
    this._el.querySelectorAll('.gf-track').forEach(el => {
      el.addEventListener('click', () => {
        this._data.trackId = el.dataset.track;
        this._render();
      });
    });
    this._el.querySelectorAll('.gf-race-chip').forEach(el => {
      el.addEventListener('click', () => {
        this._data.raceId = el.dataset.race;
        this._data.kartId = getKartForRace(this._data.raceId).id;
        this._render();
      });
    });
    this._el.querySelectorAll('.gf-kart').forEach(el => {
      el.addEventListener('click', () => {
        this._data.kartId = el.dataset.kart;
        this._render();
      });
    });
    this._el.querySelector('#gfBack').addEventListener('click', () => {
      this.hide();
      this._resolve?.(null);
    });
    this._el.querySelector('#gfLaunch').addEventListener('click', () => {
      this.hide();
      this._resolve?.({ ...this._data });
    });
  }
}
