import { RACES, CLASSES, characterManager } from '../game/CharacterManager.js';

const STEPS = ['name', 'race', 'class', 'portrait', 'confirm'];

/**
 * CharacterCreation — DOM-based multi-step character creation overlay.
 * Call show() to display, returns a Promise that resolves with the character data.
 */
export class CharacterCreation {
  constructor() {
    this._el = document.getElementById('characterCreation');
    this._resolve = null;
    this._step = 0;
    this._data = { name: '', raceId: null, classId: null, portraitDataUrl: null };
    this._generating = false;
  }

  /** Show the creation screen. Returns a promise that resolves with character data on confirm. */
  show() {
    this._step = 0;
    this._data = { name: '', raceId: null, classId: null, portraitDataUrl: null };
    this._el.classList.add('active');
    this._render();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  hide() {
    this._el.classList.remove('active');
  }

  _render() {
    const step = STEPS[this._step];
    const body = this._el.querySelector('.cc-body');
    const dots = this._el.querySelector('.cc-dots');

    // Step dots
    dots.innerHTML = STEPS.map((s, i) =>
      `<span class="cc-dot ${i === this._step ? 'active' : ''} ${i < this._step ? 'done' : ''}"></span>`
    ).join('');

    switch (step) {
      case 'name':    this._renderName(body); break;
      case 'race':    this._renderRace(body); break;
      case 'class':   this._renderClass(body); break;
      case 'portrait': this._renderPortrait(body); break;
      case 'confirm': this._renderConfirm(body); break;
    }
  }

  // ── Step 1: Name ─────────────────────────────────────────────────
  _renderName(body) {
    body.innerHTML = `
      <h2 class="cc-title">NAME YOUR DRIVER</h2>
      <p class="cc-subtitle">Choose a name for the arena</p>
      <input type="text" class="cc-input" id="ccName" maxlength="16"
        placeholder="Enter name..." value="${this._data.name}" autofocus />
      <p class="cc-hint" id="ccNameHint">3-16 characters</p>
      <div class="cc-nav">
        <span></span>
        <button class="menu-btn cc-btn" id="ccNext">Next →</button>
      </div>`;
    const input = body.querySelector('#ccName');
    const hint = body.querySelector('#ccNameHint');
    const next = body.querySelector('#ccNext');

    input.focus();
    const validate = () => {
      const v = input.value.trim();
      const valid = v.length >= 3 && v.length <= 16;
      next.disabled = !valid;
      hint.style.color = v.length > 0 && !valid ? '#cc3333' : '#555';
    };
    input.addEventListener('input', validate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { validate(); if (!next.disabled) next.click(); }
    });
    validate();
    next.addEventListener('click', () => {
      this._data.name = input.value.trim();
      this._step++;
      this._render();
    });
  }

  // ── Step 2: Race ─────────────────────────────────────────────────
  _renderRace(body) {
    body.innerHTML = `
      <h2 class="cc-title">CHOOSE YOUR RACE</h2>
      <p class="cc-subtitle">Your race defines your vehicle's identity</p>
      <div class="cc-grid cc-grid-6">
        ${RACES.map(r => `
          <div class="cc-card ${this._data.raceId === r.id ? 'selected' : ''}" data-id="${r.id}"
               style="--accent:${r.accent}">
            <div class="cc-card-name">${r.name}</div>
            <div class="cc-card-trait">${r.trait}</div>
            <div class="cc-card-swatch" style="background:${r.accent}"></div>
          </div>
        `).join('')}
      </div>
      <div class="cc-nav">
        <button class="menu-btn cc-btn cc-back" id="ccBack">← Back</button>
        <button class="menu-btn cc-btn" id="ccNext" ${!this._data.raceId ? 'disabled' : ''}>Next →</button>
      </div>`;
    this._wireCardSelect(body, 'raceId');
    body.querySelector('#ccBack').addEventListener('click', () => { this._step--; this._render(); });
    body.querySelector('#ccNext').addEventListener('click', () => { this._step++; this._render(); });
  }

  // ── Step 3: Class ────────────────────────────────────────────────
  _renderClass(body) {
    body.innerHTML = `
      <h2 class="cc-title">CHOOSE YOUR CLASS</h2>
      <p class="cc-subtitle">Your class shapes your combat style</p>
      <div class="cc-grid cc-grid-4">
        ${CLASSES.map(c => `
          <div class="cc-card ${this._data.classId === c.id ? 'selected' : ''}" data-id="${c.id}">
            <div class="cc-card-icon">${c.icon}</div>
            <div class="cc-card-name">${c.name}</div>
            <div class="cc-card-trait">${c.trait}</div>
          </div>
        `).join('')}
      </div>
      <div class="cc-nav">
        <button class="menu-btn cc-btn cc-back" id="ccBack">← Back</button>
        <button class="menu-btn cc-btn" id="ccNext" ${!this._data.classId ? 'disabled' : ''}>Next →</button>
      </div>`;
    this._wireCardSelect(body, 'classId');
    body.querySelector('#ccBack').addEventListener('click', () => { this._step--; this._render(); });
    body.querySelector('#ccNext').addEventListener('click', () => { this._step++; this._render(); });
  }

  // ── Step 4: Portrait ─────────────────────────────────────────────
  _renderPortrait(body) {
    const hasPortrait = !!this._data.portraitDataUrl;
    body.innerHTML = `
      <h2 class="cc-title">DRIVER PORTRAIT</h2>
      <p class="cc-subtitle">AI-generated portrait powered by Puter</p>
      <div class="cc-portrait-frame" id="ccPortraitFrame">
        ${hasPortrait
          ? `<img src="${this._data.portraitDataUrl}" class="cc-portrait-img" />`
          : `<div class="cc-portrait-placeholder">?</div>`
        }
        <div class="cc-portrait-spinner ${this._generating ? 'active' : ''}" id="ccSpinner">
          <div class="cc-spin-ring"></div>
          <span>Generating...</span>
        </div>
      </div>
      <div class="cc-portrait-actions">
        <button class="menu-btn cc-btn cc-sm" id="ccGenerate" ${this._generating ? 'disabled' : ''}>
          ${hasPortrait ? '🔄 Re-roll' : '🎨 Generate'}
        </button>
        <button class="menu-btn cc-btn cc-sm cc-ghost" id="ccSkip">Skip</button>
      </div>
      <div class="cc-nav">
        <button class="menu-btn cc-btn cc-back" id="ccBack">← Back</button>
        <button class="menu-btn cc-btn" id="ccNext">Next →</button>
      </div>`;

    body.querySelector('#ccGenerate').addEventListener('click', () => this._doGenerate(body));
    body.querySelector('#ccSkip').addEventListener('click', () => {
      this._data.portraitDataUrl = null;
      this._step++;
      this._render();
    });
    body.querySelector('#ccBack').addEventListener('click', () => { this._step--; this._render(); });
    body.querySelector('#ccNext').addEventListener('click', () => { this._step++; this._render(); });
  }

  async _doGenerate(body) {
    if (this._generating) return;
    this._generating = true;
    const spinner = body.querySelector('#ccSpinner');
    const genBtn = body.querySelector('#ccGenerate');
    spinner?.classList.add('active');
    if (genBtn) genBtn.disabled = true;

    const url = await characterManager.generatePortrait(this._data.raceId, this._data.classId);
    this._generating = false;

    if (url) {
      this._data.portraitDataUrl = url;
    }
    this._render(); // re-render to show result
  }

  // ── Step 5: Confirm ──────────────────────────────────────────────
  _renderConfirm(body) {
    const race = RACES.find(r => r.id === this._data.raceId) || RACES[0];
    const cls = CLASSES.find(c => c.id === this._data.classId) || CLASSES[0];
    body.innerHTML = `
      <h2 class="cc-title">CONFIRM DRIVER</h2>
      <div class="cc-summary">
        <div class="cc-summary-portrait">
          ${this._data.portraitDataUrl
            ? `<img src="${this._data.portraitDataUrl}" />`
            : `<div class="cc-portrait-placeholder">?</div>`
          }
        </div>
        <div class="cc-summary-info">
          <div class="cc-summary-name">${this._data.name}</div>
          <div class="cc-summary-row">
            <span class="cc-label">Race</span>
            <span class="cc-value" style="color:${race.accent}">${race.name}</span>
          </div>
          <div class="cc-summary-row">
            <span class="cc-label">Class</span>
            <span class="cc-value">${cls.icon} ${cls.name}</span>
          </div>
          <div class="cc-summary-row">
            <span class="cc-label">Grudge ID</span>
            <span class="cc-value cc-uuid">Generated on create</span>
          </div>
        </div>
      </div>
      <div class="cc-nav">
        <button class="menu-btn cc-btn cc-back" id="ccBack">← Back</button>
        <button class="menu-btn cc-btn cc-primary" id="ccCreate">🏁 Create Driver</button>
      </div>`;

    body.querySelector('#ccBack').addEventListener('click', () => { this._step--; this._render(); });
    body.querySelector('#ccCreate').addEventListener('click', async () => {
      const btn = body.querySelector('#ccCreate');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      const char = await characterManager.create(this._data);
      this.hide();
      this._resolve?.(char);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────
  _wireCardSelect(body, field) {
    const cards = body.querySelectorAll('.cc-card');
    const next = body.querySelector('#ccNext');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._data[field] = card.dataset.id;
        if (next) next.disabled = false;
      });
    });
  }
}
