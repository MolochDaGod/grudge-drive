import { characterManager } from '../game/CharacterManager.js';
import { shopState, COINS_PER_KILL } from './CarShop.js';

/**
 * HUDController — updates all DOM-based HUD elements each frame.
 */
export class HUDController {
  constructor(player, weapons) {
    this.player = player;
    this.weapons = weapons;
    this.kills = 0;
    this.survivalTime = 0;

    // DOM refs
    this._speedValue = document.getElementById('speedValue');
    this._healthFill = document.getElementById('healthFill');
    this._nitroFill = document.getElementById('nitroFill');
    this._killCount = document.getElementById('killCount');
    this._hudMessage = document.getElementById('hudMessage');
    this._hudPortrait = document.getElementById('hudPortrait');
    this._hudDriverName = document.getElementById('hudDriverName');
    this._hudDriverId = document.getElementById('hudDriverId');
    this._ammoEls = [
      document.getElementById('ammo0'),
      document.getElementById('ammo1'),
      document.getElementById('ammo2'),
    ];
    this._weaponSlots = [
      document.getElementById('wSlot0'),
      document.getElementById('wSlot1'),
      document.getElementById('wSlot2'),
    ];

    this._messageTimeout = null;
    this._loadDriverInfo();
  }

  _loadDriverInfo() {
    const char = characterManager.character;
    if (!char) return;

    // Portrait
    if (this._hudPortrait) {
      if (char.portraitDataUrl) {
        this._hudPortrait.innerHTML = `<img src="${char.portraitDataUrl}" />`;
      } else {
        this._hudPortrait.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#333;font-size:1.5rem">?</div>`;
      }
    }

    // Name + ID
    if (this._hudDriverName) this._hudDriverName.textContent = char.name;
    if (this._hudDriverId) this._hudDriverId.textContent = char.grudgeId?.slice(0, 8) + '...';
  }

  update() {
    const dt = 1 / 60; // approximate, called each frame
    this.survivalTime += dt;

    // Speed
    if (this._speedValue) {
      this._speedValue.textContent = this.player.currentSpeed || 0;
    }

    // Health (uses per-kart maxHealth from cfg)
    if (this._healthFill) {
      const maxHp = this.player.cfg?.maxHealth || 100;
      const pct = Math.max(0, (this.player.health / maxHp) * 100);
      this._healthFill.style.width = `${pct}%`;
    }

    // Nitro
    if (this._nitroFill) {
      this._nitroFill.style.width = `${this.player.nitro}%`;
    }

    // Ammo
    for (let i = 0; i < 3; i++) {
      if (this._ammoEls[i]) {
        const ammo = this.weapons.getAmmo(i);
        this._ammoEls[i].textContent = ammo === Infinity ? '∞' : ammo;
      }
    }

    // Active weapon slot
    const activeIdx = this.weapons.currentIndex;
    this._weaponSlots.forEach((slot, i) => {
      if (!slot) return;
      if (i === activeIdx) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });

    // Kills
    if (this._killCount) {
      this._killCount.textContent = this.kills;
    }
  }

  addKill() {
    this.kills++;
    shopState.addCoins(COINS_PER_KILL);
    this.showMessage(`ELIMINATED! +${COINS_PER_KILL} 🪙`);
  }

  showMessage(text, duration = 1.5) {
    if (!this._hudMessage) return;
    this._hudMessage.textContent = text;
    this._hudMessage.classList.add('show');

    clearTimeout(this._messageTimeout);
    this._messageTimeout = setTimeout(() => {
      this._hudMessage.classList.remove('show');
    }, duration * 1000);
  }

  reset() {
    this.kills = 0;
    this.survivalTime = 0;
  }
}
