/**
 * GameFlowUI — Full pre-game flow: Race → Kart → Mode/Track → Launch
 *
 * Steps:
 *   1. RACE SELECT  — pick one of 6 Grudge races (determines driver + signature kart)
 *   2. KART SELECT  — pick a kart from available pool (signature + unlocked)
 *   3. LOBBY        — pick game mode (Race/Battle/Time Trial/Team) + track + launch
 *
 * Returns: { raceId, kartId, mode, trackId } or null if cancelled
 */

import { GAME_MODES, TRACKS, getTracksForMode } from '../game/TrackRegistry.js';
import { ALL_KARTS, getAvailableKarts, getKartForRace } from '../game/KartRegistry.js';
import { RACES } from '../game/CharacterManager.js';

export class GameFlowUI {
  constructor() {
    this._el = null;
    this._resolve = null;
    this._step = 0; // 0=race, 1=kart, 2=lobby
    this._data = {
      raceId: null,
      kartId: null,
      mode: 'battle',
      trackId: 'grudge_arena',
    };
    this._stylesInjected = false;
  }

  show() {
    this._ensureDOM();
    this._step = 0;
    this._data = { raceId: null, kartId: null, mode: 'battle', trackId: 'grudge_arena' };
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
#gameFlowOverlay{position:fixed;inset:0;z-index:55;background:radial-gradient(ellipse at 50% 10%,rgba(25,18,35,.97),rgba(8,8,10,.99));display:none;flex-direction:column;align-items:center;overflow-y:auto;font-family:'Inter',sans-serif;padding:20px 16px 40px}
#gameFlowOverlay.active{display:flex}
.gf-title{font-family:'Cinzel Decorative',serif;font-size:1.8rem;font-weight:900;background:linear-gradient(135deg,#c9952a,#f5d77a,#c9952a,#8b6914);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px;text-align:center}
.gf-sub{color:#666;font-size:.75rem;letter-spacing:.15em;margin-bottom:20px;text-align:center}
.gf-steps{display:flex;gap:6px;margin-bottom:18px}
.gf-step{width:10px;height:10px;border-radius:50%;background:#222;border:1px solid #444;transition:.3s}
.gf-step.active{background:#c9952a;border-color:#c9952a;box-shadow:0 0 8px rgba(201,149,42,.5)}
.gf-step.done{background:#5a4a1a;border-color:#8b6914}
.gf-content{width:100%;max-width:860px}
.gf-section{font-family:'Cinzel',serif;font-size:.7rem;font-weight:700;color:#777;letter-spacing:.2em;text-transform:uppercase;margin:16px 0 8px}
/* Race cards */
.gf-race-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.gf-race{padding:14px 10px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;text-align:center;transition:.25s;border-radius:6px}
.gf-race:hover{border-color:#555;transform:translateY(-2px)}
.gf-race.selected{border-color:var(--rc,#c9952a);box-shadow:0 0 20px rgba(201,149,42,.15);background:rgba(201,149,42,.06)}
.gf-race .r-name{font-family:'Cinzel',serif;font-size:.85rem;font-weight:700;margin-bottom:3px}
.gf-race .r-trait{color:#666;font-size:.6rem;line-height:1.3}
.gf-race .r-kart{font-size:.55rem;margin-top:5px;font-weight:600}
.gf-race .r-swatch{width:28px;height:4px;border-radius:2px;margin:6px auto 0}
/* Kart cards */
.gf-kart-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.gf-kart{padding:12px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;transition:.25s;border-radius:4px}
.gf-kart:hover{border-color:#555}
.gf-kart.selected{border-color:#c9952a;background:rgba(201,149,42,.06)}
.gf-kart .k-name{font-family:'Cinzel',serif;font-size:.8rem;font-weight:700;color:#c9952a;margin-bottom:2px}
.gf-kart .k-tier{display:inline-block;padding:1px 6px;border-radius:3px;font-size:.55rem;font-weight:800;letter-spacing:.05em}
.gf-kart .k-tier.S{background:linear-gradient(135deg,#c9952a,#f5d77a);color:#1a1000}
.gf-kart .k-tier.A{color:#b07be0;border:1px solid rgba(155,89,182,.3)}
.gf-kart .k-tier.B{color:#5dade2;border:1px solid rgba(52,152,219,.25)}
.gf-kart .k-tier.C{color:#999;border:1px solid rgba(100,100,100,.25)}
.gf-kart .k-stats{margin-top:6px;font-size:.55rem;color:#555}
.gf-kart .k-bar{height:3px;background:#1a1a1f;border-radius:2px;margin:1px 0 3px;overflow:hidden}
.gf-kart .k-fill{height:100%;border-radius:2px}
/* Mode chips */
.gf-mode-row{display:flex;gap:8px;flex-wrap:wrap}
.gf-mode{flex:1;min-width:130px;padding:12px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;text-align:center;transition:.25s;border-radius:4px}
.gf-mode:hover{border-color:#555}
.gf-mode.selected{border-color:#c9952a;background:rgba(201,149,42,.08)}
.gf-mode .m-icon{font-size:1.3rem;margin-bottom:4px}
.gf-mode .m-name{font-family:'Cinzel',serif;font-size:.8rem;font-weight:700;color:#c9952a}
.gf-mode .m-desc{color:#666;font-size:.55rem;margin-top:2px}
/* Track cards */
.gf-track-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.gf-track{padding:12px;border:1px solid #2a2a30;background:rgba(15,15,20,.85);cursor:pointer;transition:.25s;border-radius:6px}
.gf-track:hover{border-color:#555;transform:translateY(-1px)}
.gf-track.selected{border-color:#c9952a;background:rgba(201,149,42,.06)}
.gf-track.disabled{opacity:.25;pointer-events:none}
.gf-track .t-name{font-family:'Cinzel',serif;font-size:.85rem;font-weight:700;color:#c9952a;margin-bottom:3px}
.gf-track .t-desc{color:#777;font-size:.6rem;margin-bottom:6px;line-height:1.3}
.gf-track .t-meta{display:flex;gap:10px;font-size:.55rem;color:#555}
/* Buttons */
.gf-actions{display:flex;gap:12px;justify-content:center;margin-top:24px}
.gf-btn{font-family:'Cinzel',serif;font-size:.85rem;font-weight:700;padding:13px 40px;border:1px solid rgba(201,149,42,.3);background:rgba(201,149,42,.1);color:#c9952a;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;transition:.25s}
.gf-btn:hover{background:rgba(201,149,42,.2);border-color:#c9952a;transform:translateY(-1px)}
.gf-btn:disabled{opacity:.25;cursor:default;transform:none!important}
.gf-btn.primary{background:linear-gradient(135deg,rgba(201,149,42,.25),rgba(201,149,42,.08));border-color:#c9952a}
.gf-btn.ghost{border-color:#333;color:#666;background:transparent}
@media(max-width:600px){.gf-race-grid{grid-template-columns:repeat(2,1fr)}.gf-kart-grid{grid-template-columns:1fr 1fr}}`;
      document.head.appendChild(s);
    }
  }

  _render() {
    const steps = ['Race', 'Kart', 'Battle'];
    this._el.innerHTML = `
      <div class="gf-steps">${steps.map((s, i) => `<div class="gf-step ${i === this._step ? 'active' : i < this._step ? 'done' : ''}"></div>`).join('')}</div>
      <div class="gf-content" id="gfBody"></div>`;
    const body = this._el.querySelector('#gfBody');
    if (this._step === 0) this._renderRaceSelect(body);
    else if (this._step === 1) this._renderKartSelect(body);
    else this._renderLobby(body);
  }

  // ── Step 1: Race Select ───────────────────────────────────────────
  _renderRaceSelect(body) {
    body.innerHTML = `
      <h1 class="gf-title">CHOOSE YOUR RACE</h1>
      <p class="gf-sub">Your race determines your driver and signature kart</p>
      <div class="gf-race-grid">
        ${RACES.map(r => {
          const sig = getKartForRace(r.id);
          return `<div class="gf-race ${this._data.raceId === r.id ? 'selected' : ''}" data-id="${r.id}" style="--rc:${r.accent}">
            <div class="r-name" style="color:${r.accent}">${r.name}</div>
            <div class="r-trait">${r.trait}</div>
            <div class="r-kart" style="color:${r.accent}">🏎️ ${sig.kartName}</div>
            <div class="r-swatch" style="background:${r.accent}"></div>
          </div>`;
        }).join('')}
      </div>
      <div class="gf-actions">
        <button class="gf-btn ghost" id="gfBack">← Cancel</button>
        <button class="gf-btn primary" id="gfNext" ${!this._data.raceId ? 'disabled' : ''}>Next →</button>
      </div>`;
    body.querySelectorAll('.gf-race').forEach(c => c.addEventListener('click', () => {
      this._data.raceId = c.dataset.id;
      this._data.kartId = getKartForRace(c.dataset.id).id; // default to signature
      this._render();
    }));
    body.querySelector('#gfBack').addEventListener('click', () => { this.hide(); this._resolve?.(null); });
    body.querySelector('#gfNext').addEventListener('click', () => { if (this._data.raceId) { this._step = 1; this._render(); } });
  }

  // ── Step 2: Kart Select ───────────────────────────────────────────
  _renderKartSelect(body) {
    const available = getAvailableKarts(this._data.raceId);
    const tierOrder = { S: 0, A: 1, B: 2, C: 3 };
    const sorted = [...available].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
    const accent = RACES.find(r => r.id === this._data.raceId)?.accent || '#c9952a';

    body.innerHTML = `
      <h1 class="gf-title">SELECT YOUR KART</h1>
      <p class="gf-sub">${sorted.length} vehicles available for ${RACES.find(r => r.id === this._data.raceId)?.name || 'your race'}</p>
      <div class="gf-kart-grid">
        ${sorted.map(k => {
          const s = k.stats;
          return `<div class="gf-kart ${this._data.kartId === k.id ? 'selected' : ''}" data-id="${k.id}">
            <div class="k-name">${k.kartName}</div>
            <span class="k-tier ${k.tier}">${k.tier}</span>
            ${k.weapon ? `<div style="font-size:.5rem;color:${accent};margin-top:4px">⚔️ ${k.weapon.name}</div>` : ''}
            <div class="k-stats">
              <div>Speed <div class="k-bar"><div class="k-fill" style="width:${s.topSpeed}%;background:${accent}"></div></div></div>
              <div>Accel <div class="k-bar"><div class="k-fill" style="width:${s.acceleration}%;background:#5dade2"></div></div></div>
              <div>Handle <div class="k-bar"><div class="k-fill" style="width:${s.handling}%;background:#2ecc71"></div></div></div>
              <div>Armor <div class="k-bar"><div class="k-fill" style="width:${s.armor}%;background:#cc3333"></div></div></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="gf-actions">
        <button class="gf-btn ghost" id="gfBack">← Back</button>
        <button class="gf-btn primary" id="gfNext" ${!this._data.kartId ? 'disabled' : ''}>Next →</button>
      </div>`;
    body.querySelectorAll('.gf-kart').forEach(c => c.addEventListener('click', () => {
      this._data.kartId = c.dataset.id;
      this._render();
    }));
    body.querySelector('#gfBack').addEventListener('click', () => { this._step = 0; this._render(); });
    body.querySelector('#gfNext').addEventListener('click', () => { if (this._data.kartId) { this._step = 2; this._render(); } });
  }

  // ── Step 3: Mode + Track Lobby ────────────────────────────────────
  _renderLobby(body) {
    const modes = Object.values(GAME_MODES);
    const avail = getTracksForMode(this._data.mode);
    if (!avail.find(t => t.id === this._data.trackId)) {
      this._data.trackId = avail[0]?.id || '';
    }
    const tc = { urban: '#4a9cd4', forest: '#4a8b4a', toy: '#d4a84a', arena: '#cc3333', mixed: '#9b59b6' };

    body.innerHTML = `
      <h1 class="gf-title">CHOOSE BATTLEGROUND</h1>
      <p class="gf-sub">Select game mode and track</p>
      <div class="gf-section">Game Mode</div>
      <div class="gf-mode-row">
        ${modes.map(m => `<div class="gf-mode ${this._data.mode === m.id ? 'selected' : ''}" data-mode="${m.id}">
          <div class="m-icon">${m.icon}</div>
          <div class="m-name">${m.name}</div>
          <div class="m-desc">${m.desc}</div>
        </div>`).join('')}
      </div>
      <div class="gf-section">Track (${avail.length} available)</div>
      <div class="gf-track-grid">
        ${TRACKS.map(t => {
          const ok = t.modes.includes(this._data.mode);
          const sel = this._data.trackId === t.id;
          const c = tc[t.theme] || '#888';
          return `<div class="gf-track ${sel ? 'selected' : ''} ${ok ? '' : 'disabled'}" data-track="${t.id}">
            <div class="t-name">${t.name}</div>
            <div class="t-desc">${t.desc}</div>
            <div class="t-meta">
              <span>🏁 ${t.laps > 0 ? t.laps + ' laps' : 'No laps'}</span>
              <span>🤖 ${t.npcCount} NPC</span>
              <span>👥 ${t.maxPlayers}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="gf-actions">
        <button class="gf-btn ghost" id="gfBack">← Back</button>
        <button class="gf-btn primary" id="gfLaunch" ${!this._data.trackId ? 'disabled' : ''}>🏁 LAUNCH</button>
      </div>`;
    body.querySelectorAll('.gf-mode').forEach(c => c.addEventListener('click', () => { this._data.mode = c.dataset.mode; this._render(); }));
    body.querySelectorAll('.gf-track:not(.disabled)').forEach(c => c.addEventListener('click', () => { this._data.trackId = c.dataset.track; this._render(); }));
    body.querySelector('#gfBack').addEventListener('click', () => { this._step = 1; this._render(); });
    body.querySelector('#gfLaunch').addEventListener('click', () => {
      if (!this._data.trackId) return;
      this.hide();
      this._resolve?.({ ...this._data });
    });
  }
}
