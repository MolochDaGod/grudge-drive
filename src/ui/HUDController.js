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
  }

  update() {
    const dt = 1 / 60; // approximate, called each frame
    this.survivalTime += dt;

    // Speed
    if (this._speedValue) {
      this._speedValue.textContent = this.player.currentSpeed || 0;
    }

    // Health
    if (this._healthFill) {
      const pct = Math.max(0, (this.player.health / 100) * 100);
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
    this.showMessage('ELIMINATED!');
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
