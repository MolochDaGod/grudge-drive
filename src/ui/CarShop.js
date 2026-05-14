/**
 * CarShop — in-game shop for vehicle upgrades.
 * Currency (Grudge Coins) earned from kills, persisted via Puter KV.
 */

const KV_SHOP = 'grudge:drive:shop';

// ── Upgrade catalogue ──────────────────────────────────────────────
// Each upgrade has tiers 0–4.  Tier 0 = stock (free), tiers 1–4 cost coins.
export const UPGRADES = {
  engine: {
    label: 'Engine',
    icon: '⚙️',
    desc: 'Increases top speed & acceleration',
    tiers: [
      { name: 'Stock',    cost: 0,   speedMult: 1.0,  accelMult: 1.0  },
      { name: 'Tuned',    cost: 80,  speedMult: 1.12, accelMult: 1.10 },
      { name: 'Forged',   cost: 200, speedMult: 1.22, accelMult: 1.18 },
      { name: 'War',      cost: 400, speedMult: 1.35, accelMult: 1.28 },
      { name: 'Grudge V8',cost: 750, speedMult: 1.50, accelMult: 1.40 },
    ],
  },
  armor: {
    label: 'Armor',
    icon: '🛡️',
    desc: 'Increases max health & damage resistance',
    tiers: [
      { name: 'Bare',     cost: 0,   healthMult: 1.0,  resist: 0    },
      { name: 'Plated',   cost: 60,  healthMult: 1.15, resist: 0.05 },
      { name: 'Reinforced',cost: 180, healthMult: 1.30, resist: 0.10 },
      { name: 'Runed',    cost: 350, healthMult: 1.50, resist: 0.15 },
      { name: 'Grudge Plate',cost: 650, healthMult: 1.75, resist: 0.22 },
    ],
  },
  nitro: {
    label: 'Nitro',
    icon: '🔥',
    desc: 'Increases nitro capacity & boost power',
    tiers: [
      { name: 'Basic',    cost: 0,   capacityMult: 1.0, boostMult: 1.0  },
      { name: 'High-Flow',cost: 70,  capacityMult: 1.2, boostMult: 1.10 },
      { name: 'Racing',   cost: 160, capacityMult: 1.4, boostMult: 1.20 },
      { name: 'Inferno',  cost: 320, capacityMult: 1.6, boostMult: 1.35 },
      { name: 'Grudge Burn',cost: 600, capacityMult: 2.0, boostMult: 1.50 },
    ],
  },
  weapons: {
    label: 'Weapons',
    icon: '💥',
    desc: 'Increases weapon damage & ammo capacity',
    tiers: [
      { name: 'Salvaged', cost: 0,   damageMult: 1.0, ammoMult: 1.0  },
      { name: 'Military', cost: 90,  damageMult: 1.12, ammoMult: 1.2 },
      { name: 'Siege',    cost: 220, damageMult: 1.25, ammoMult: 1.4 },
      { name: 'Warlord',  cost: 420, damageMult: 1.40, ammoMult: 1.6 },
      { name: 'Grudge Cannon',cost: 800, damageMult: 1.60, ammoMult: 2.0 },
    ],
  },
};

const UPGRADE_KEYS = Object.keys(UPGRADES);

// ── Shop state ─────────────────────────────────────────────────────
class ShopState {
  constructor() {
    this.coins = 0;
    this.levels = { engine: 0, armor: 0, nitro: 0, weapons: 0 };
  }

  async load() {
    try {
      const saved = await window.puter.kv.get(KV_SHOP);
      if (saved) {
        this.coins = saved.coins ?? 0;
        this.levels = { ...this.levels, ...(saved.levels ?? {}) };
      }
    } catch (e) {
      console.warn('ShopState: KV load failed', e);
    }
  }

  async save() {
    try {
      await window.puter.kv.set(KV_SHOP, { coins: this.coins, levels: this.levels });
    } catch (e) {
      console.warn('ShopState: KV save failed', e);
    }
  }

  canAfford(category) {
    const nextTier = this.levels[category] + 1;
    const tier = UPGRADES[category].tiers[nextTier];
    return tier ? this.coins >= tier.cost : false;
  }

  purchase(category) {
    const nextTier = this.levels[category] + 1;
    const tier = UPGRADES[category]?.tiers[nextTier];
    if (!tier || this.coins < tier.cost) return false;
    this.coins -= tier.cost;
    this.levels[category] = nextTier;
    this.save();
    return true;
  }

  addCoins(amount) {
    this.coins += amount;
    this.save();
  }

  /** Get the active multipliers for gameplay. */
  getStats() {
    const eng = UPGRADES.engine.tiers[this.levels.engine];
    const arm = UPGRADES.armor.tiers[this.levels.armor];
    const nit = UPGRADES.nitro.tiers[this.levels.nitro];
    const wep = UPGRADES.weapons.tiers[this.levels.weapons];
    return {
      speedMult:    eng.speedMult,
      accelMult:    eng.accelMult,
      healthMult:   arm.healthMult,
      resist:       arm.resist,
      nitroCap:     nit.capacityMult,
      nitroBoost:   nit.boostMult,
      damageMult:   wep.damageMult,
      ammoMult:     wep.ammoMult,
    };
  }
}

export const shopState = new ShopState();

// ── Coins per kill ──
export const COINS_PER_KILL = 25;
export const COINS_SURVIVAL_BONUS = 5; // per 30s survived

// ── Shop UI overlay ────────────────────────────────────────────────
export class CarShop {
  constructor() {
    this._el = document.getElementById('carShop');
    this._active = false;
  }

  show() {
    this._active = true;
    this._el.classList.add('active');
    this._render();
  }

  hide() {
    this._active = false;
    this._el.classList.remove('active');
  }

  _render() {
    const body = this._el.querySelector('.shop-body');
    if (!body) return;

    body.innerHTML = `
      <div class="shop-header">
        <h2 class="shop-title">VEHICLE SHOP</h2>
        <div class="shop-coins">
          <span class="coin-icon">🪙</span>
          <span class="coin-value" id="shopCoins">${shopState.coins}</span>
          <span class="coin-label">GRUDGE COINS</span>
        </div>
      </div>
      <div class="shop-grid">
        ${UPGRADE_KEYS.map(key => this._renderCategory(key)).join('')}
      </div>
      <div class="shop-footer">
        <div class="shop-hint">Earn coins by eliminating opponents (${COINS_PER_KILL} per kill)</div>
        <button class="menu-btn shop-close-btn" id="shopClose">← Back to Menu</button>
      </div>`;

    // Wire events
    body.querySelector('#shopClose').addEventListener('click', () => this.hide());

    body.querySelectorAll('.shop-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        if (shopState.purchase(cat)) {
          this._render();
        }
      });
    });
  }

  _renderCategory(key) {
    const cat = UPGRADES[key];
    const level = shopState.levels[key];
    const maxed = level >= cat.tiers.length - 1;
    const current = cat.tiers[level];
    const next = maxed ? null : cat.tiers[level + 1];
    const canBuy = next ? shopState.coins >= next.cost : false;

    // Tier pips
    const pips = cat.tiers.map((t, i) =>
      `<span class="tier-pip ${i <= level ? 'filled' : ''} ${i === level + 1 ? 'next' : ''}"></span>`
    ).join('');

    return `
      <div class="shop-card ${maxed ? 'maxed' : ''}">
        <div class="shop-card-header">
          <span class="shop-card-icon">${cat.icon}</span>
          <span class="shop-card-label">${cat.label}</span>
        </div>
        <div class="shop-card-desc">${cat.desc}</div>
        <div class="shop-card-current">
          <span class="tier-name">${current.name}</span>
          <span class="tier-level">Tier ${level + 1}/${cat.tiers.length}</span>
        </div>
        <div class="tier-pips">${pips}</div>
        ${maxed
          ? `<div class="shop-maxed">MAX LEVEL</div>`
          : `<button class="menu-btn shop-buy-btn ${canBuy ? '' : 'locked'}"
                data-category="${key}" ${canBuy ? '' : 'disabled'}>
              Upgrade to ${next.name} — 🪙 ${next.cost}
            </button>`
        }
      </div>`;
  }
}
