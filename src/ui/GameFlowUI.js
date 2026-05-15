/**
 * GameFlowUI — Lobby screen for selecting game mode, track, and launching.
 *
 * Flow: Main Menu → "Play" → GameFlowUI (pick mode + track) → Start Game
 * Renders into #lobbyOverlay which must exist in index.html.
 */

import { GAME_MODES, TRACKS, getTracksForMode } from '../game/TrackRegistry.js';

export class GameFlowUI {
  constructor() {
    this._el = null;
    this._resolve = null;
    this._selectedMode = 'battle';
    this._selectedTrack = 'grudge_arena';
  }

  /**
   * Show the lobby screen. Returns a Promise that resolves with
   * { mode, trackId } when the player clicks Start.
   */
  show() {
    this._ensureDOM();
    this._el.classList.add('active');
    this._render();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  hide() {
    this._el?.classList.remove('active');
  }

  // ── DOM setup ─────────────────────────────────────────────────────

  _ensureDOM() {
    if (this._el) return;

    // Create the overlay if it doesn't exist in the HTML
    let el = document.getElementById('lobbyOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lobbyOverlay';
      el.className = 'lobby-overlay';
      document.body.appendChild(el);
    }
    this._el = el;

    // Inject styles if not already present
    if (!document.getElementById('lobbyStyles')) {
      const style = document.createElement('style');
      style.id = 'lobbyStyles';
      style.textContent = `
        .lobby-overlay {
          position: fixed; inset: 0; z-index: 55;
          background: radial-gradient(ellipse at 50% 20%, rgba(20,14,30,0.97), rgba(10,10,12,0.99));
          display: none; flex-direction: column; align-items: center;
          font-family: 'Inter', sans-serif; overflow-y: auto; padding: 24px;
        }
        .lobby-overlay.active { display: flex; }
        .lobby-title {
          font-family: 'Cinzel Decorative', serif; font-size: 2rem; font-weight: 900;
          background: linear-gradient(135deg, #c9952a 0%, #f5d77a 40%, #c9952a 60%, #8b6914 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          letter-spacing: 0.1em; margin-bottom: 8px;
        }
        .lobby-sub { color: #666; font-size: 0.8rem; letter-spacing: 0.15em; margin-bottom: 24px; }
        .lobby-section { width: 100%; max-width: 800px; margin-bottom: 20px; }
        .lobby-section-label {
          font-family: 'Cinzel', serif; font-size: 0.75rem; font-weight: 700;
          color: #888; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 10px;
        }
        .mode-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .mode-chip {
          flex: 1; min-width: 140px; padding: 14px 16px; border: 1px solid #2a2a30;
          background: rgba(15,15,20,0.8); cursor: pointer; text-align: center;
          transition: all 0.25s; border-radius: 4px;
        }
        .mode-chip:hover { border-color: #555; background: rgba(25,25,35,0.9); }
        .mode-chip.selected { border-color: #c9952a; background: rgba(201,149,42,0.08); box-shadow: 0 0 15px rgba(201,149,42,0.15); }
        .mode-chip .m-icon { font-size: 1.5rem; margin-bottom: 4px; }
        .mode-chip .m-name { color: #c9952a; font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 700; }
        .mode-chip .m-desc { color: #666; font-size: 0.6rem; margin-top: 2px; }
        .mode-chip .m-players { color: #444; font-size: 0.55rem; margin-top: 4px; letter-spacing: 0.1em; }

        .track-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
        .track-card {
          padding: 16px; border: 1px solid #2a2a30; background: rgba(15,15,20,0.8);
          cursor: pointer; transition: all 0.25s; border-radius: 6px;
        }
        .track-card:hover { border-color: #555; transform: translateY(-2px); }
        .track-card.selected { border-color: #c9952a; background: rgba(201,149,42,0.06); box-shadow: 0 0 20px rgba(201,149,42,0.12); }
        .track-card.disabled { opacity: 0.3; pointer-events: none; }
        .track-card .t-name { color: #c9952a; font-family: 'Cinzel', serif; font-size: 0.9rem; font-weight: 700; margin-bottom: 4px; }
        .track-card .t-desc { color: #777; font-size: 0.65rem; margin-bottom: 8px; line-height: 1.4; }
        .track-card .t-meta { display: flex; gap: 12px; font-size: 0.6rem; color: #555; }
        .track-card .t-meta span { display: flex; align-items: center; gap: 3px; }
        .track-card .t-theme {
          display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 3px;
          font-size: 0.55rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
          border: 1px solid #333; color: #888;
        }

        .lobby-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }
        .lobby-start {
          font-family: 'Cinzel Decorative', serif; font-size: 1.1rem; font-weight: 700;
          padding: 16px 60px; border: 1px solid #c9952a;
          background: linear-gradient(135deg, rgba(201,149,42,0.25), rgba(201,149,42,0.08));
          color: #c9952a; cursor: pointer; letter-spacing: 0.15em; text-transform: uppercase;
          transition: all 0.3s;
        }
        .lobby-start:hover { background: linear-gradient(135deg, rgba(201,149,42,0.4), rgba(201,149,42,0.15)); box-shadow: 0 0 30px rgba(201,149,42,0.2); transform: translateY(-2px); }
        .lobby-start:disabled { opacity: 0.3; cursor: default; transform: none !important; }
        .lobby-back {
          font-family: 'Cinzel', serif; font-size: 0.85rem; padding: 14px 32px;
          border: 1px solid #333; background: transparent; color: #666;
          cursor: pointer; letter-spacing: 0.1em; text-transform: uppercase; transition: all 0.2s;
        }
        .lobby-back:hover { border-color: #555; color: #aaa; }
      `;
      document.head.appendChild(style);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  _render() {
    const modes = Object.values(GAME_MODES);
    const availableTracks = getTracksForMode(this._selectedMode);

    // If current track isn't available for this mode, auto-select first
    if (!availableTracks.find(t => t.id === this._selectedTrack)) {
      this._selectedTrack = availableTracks[0]?.id || '';
    }

    const themeColors = {
      urban: '#4a9cd4', forest: '#4a8b4a', toy: '#d4a84a',
      arena: '#cc3333', mixed: '#9b59b6',
    };

    this._el.innerHTML = `
      <h1 class="lobby-title">SELECT BATTLEGROUND</h1>
      <p class="lobby-sub">Choose your game mode and track</p>

      <div class="lobby-section">
        <div class="lobby-section-label">Game Mode</div>
        <div class="mode-row">
          ${modes.map(m => `
            <div class="mode-chip ${this._selectedMode === m.id ? 'selected' : ''}" data-mode="${m.id}">
              <div class="m-icon">${m.icon}</div>
              <div class="m-name">${m.name}</div>
              <div class="m-desc">${m.desc}</div>
              <div class="m-players">${m.minPlayers === m.maxPlayers ? m.minPlayers : m.minPlayers + '–' + m.maxPlayers} players</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="lobby-section">
        <div class="lobby-section-label">Track (${availableTracks.length} available)</div>
        <div class="track-grid">
          ${TRACKS.map(t => {
            const available = t.modes.includes(this._selectedMode);
            const selected = this._selectedTrack === t.id;
            const tc = themeColors[t.theme] || '#888';
            return `
            <div class="track-card ${selected ? 'selected' : ''} ${available ? '' : 'disabled'}" data-track="${t.id}">
              <div class="t-name">${t.name}</div>
              <div class="t-desc">${t.desc}</div>
              <div class="t-meta">
                <span>🏁 ${t.laps > 0 ? t.laps + ' laps' : 'No laps'}</span>
                <span>🤖 ${t.npcCount} NPC</span>
                <span>👥 ${t.maxPlayers} max</span>
              </div>
              <span class="t-theme" style="border-color:${tc}40;color:${tc}">${t.theme}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="lobby-actions">
        <button class="lobby-back" id="lobbyBack">← Back</button>
        <button class="lobby-start" id="lobbyStart" ${!this._selectedTrack ? 'disabled' : ''}>
          🏁 Launch
        </button>
      </div>
    `;

    // Wire events
    this._el.querySelectorAll('.mode-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._selectedMode = chip.dataset.mode;
        this._render();
      });
    });

    this._el.querySelectorAll('.track-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => {
        this._selectedTrack = card.dataset.track;
        this._render();
      });
    });

    this._el.querySelector('#lobbyBack').addEventListener('click', () => {
      this.hide();
      this._resolve?.(null); // cancelled
    });

    this._el.querySelector('#lobbyStart').addEventListener('click', () => {
      if (!this._selectedTrack) return;
      this.hide();
      this._resolve?.({
        mode: this._selectedMode,
        trackId: this._selectedTrack,
      });
    });
  }
}
