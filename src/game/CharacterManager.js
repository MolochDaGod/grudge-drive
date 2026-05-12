/**
 * CharacterManager — Grudge identity, race/class data, Puter KV persistence.
 * Uses the global `puter` object injected by the Puter SDK script tag.
 */

// ── Race definitions ───────────────────────────────────────────────
export const RACES = [
  {
    id: 'wk', name: 'Warkind',
    trait: 'Resilient crusaders forged in war',
    color: { r: 0.80, g: 0.60, b: 0.10 },   // gold
    emissive: { r: 0.15, g: 0.10, b: 0.02 },
    accent: '#c9952a',
  },
  {
    id: 'elf', name: 'Elf',
    trait: 'Swift scouts of the ancient groves',
    color: { r: 0.10, g: 0.54, b: 0.29 },   // emerald
    emissive: { r: 0.02, g: 0.12, b: 0.05 },
    accent: '#1a8a4a',
  },
  {
    id: 'brb', name: 'Barbarian',
    trait: 'Savage berserkers from the frost wastes',
    color: { r: 0.55, g: 0.10, b: 0.10 },   // crimson
    emissive: { r: 0.12, g: 0.02, b: 0.02 },
    accent: '#8b1a1a',
  },
  {
    id: 'orc', name: 'Orc',
    trait: 'Brutal warband of the swamp legions',
    color: { r: 0.29, g: 0.42, b: 0.16 },   // swamp green
    emissive: { r: 0.06, g: 0.10, b: 0.02 },
    accent: '#4a6b2a',
  },
  {
    id: 'ud', name: 'Undead',
    trait: 'Risen horrors bound by dark pacts',
    color: { r: 0.42, g: 0.23, b: 0.54 },   // ghostly purple
    emissive: { r: 0.10, g: 0.04, b: 0.14 },
    accent: '#6a3a8a',
  },
  {
    id: 'dwf', name: 'Dwarf',
    trait: 'Ironclad artisans of the deep holds',
    color: { r: 0.55, g: 0.41, b: 0.08 },   // bronze
    emissive: { r: 0.10, g: 0.07, b: 0.01 },
    accent: '#8b6914',
  },
];

// ── Class definitions ──────────────────────────────────────────────
export const CLASSES = [
  {
    id: 'warrior', name: 'Warrior',
    trait: 'Heavy armor, shield charge, AoE smash',
    secondaryColor: { r: 0.7, g: 0.5, b: 0.1 },
    icon: '⚔️',
  },
  {
    id: 'mage', name: 'Mage',
    trait: 'Arcane blasts, teleport blocks, spell relics',
    secondaryColor: { r: 0.3, g: 0.3, b: 0.9 },
    icon: '🔮',
  },
  {
    id: 'ranger', name: 'Ranger',
    trait: 'Long-range precision, parry counter, dash',
    secondaryColor: { r: 0.2, g: 0.6, b: 0.3 },
    icon: '🏹',
  },
  {
    id: 'worge', name: 'Worge',
    trait: 'Shape-shift forms — Bear, Raptor, Bird',
    secondaryColor: { r: 0.5, g: 0.2, b: 0.2 },
    icon: '🐺',
  },
];

// ── Prompt templates for txt2img ───────────────────────────────────
const PORTRAIT_PROMPTS = {
  wk:  'human knight',
  elf: 'elegant elf with pointed ears',
  brb: 'fierce barbarian with war paint',
  orc: 'muscular orc with tusks',
  ud:  'skeletal undead warrior with glowing eyes',
  dwf: 'stout dwarf with thick braided beard',
};

const CLASS_PROMPTS = {
  warrior: 'wearing heavy plate armor, wielding a sword and shield',
  mage:    'wearing flowing robes, holding a glowing staff',
  ranger:  'wearing leather armor, carrying a longbow',
  worge:   'wearing primal furs, with feral claws and wolf features',
};

export function buildPortraitPrompt(raceId, classId) {
  const race = PORTRAIT_PROMPTS[raceId] || 'fantasy warrior';
  const cls = CLASS_PROMPTS[classId] || 'in battle gear';
  return `Portrait of a ${race} ${cls}, sitting in a dark armored vehicle cockpit, gold accent lighting, digital fantasy art, dramatic lighting, upper body shot, facing viewer`;
}

// ── Character Manager ──────────────────────────────────────────────
const KV_KEY = 'grudge:drive:character';

class CharacterManagerSingleton {
  constructor() {
    this.character = null;  // { grudgeId, name, raceId, classId, portraitDataUrl, createdAt }
    this._ready = false;
  }

  /** Try to load existing character from Puter KV. Returns the character or null. */
  async load() {
    try {
      const saved = await window.puter.kv.get(KV_KEY);
      if (saved && saved.grudgeId) {
        this.character = saved;
        this._ready = true;
        return this.character;
      }
    } catch (e) {
      console.warn('CharacterManager: Puter KV load failed, starting fresh.', e);
    }
    return null;
  }

  /** Create and persist a new character. */
  async create({ name, raceId, classId, portraitDataUrl }) {
    const grudgeId = crypto.randomUUID();
    this.character = {
      grudgeId,
      name: name.trim(),
      raceId,
      classId,
      portraitDataUrl: portraitDataUrl || null,
      createdAt: new Date().toISOString(),
    };

    try {
      await window.puter.kv.set(KV_KEY, this.character);
    } catch (e) {
      console.warn('CharacterManager: Puter KV save failed.', e);
    }

    this._ready = true;
    return this.character;
  }

  /** Delete saved character (re-create flow). */
  async clear() {
    this.character = null;
    this._ready = false;
    try {
      await window.puter.kv.del(KV_KEY);
    } catch (e) { /* ignore */ }
  }

  /** Generate a portrait via Puter AI txt2img. Returns a data URL string or null. */
  async generatePortrait(raceId, classId) {
    const prompt = buildPortraitPrompt(raceId, classId);
    try {
      const result = await window.puter.ai.txt2img(prompt);
      // result is an HTMLImageElement or Blob depending on SDK version
      if (result instanceof Blob) {
        return await this._blobToDataUrl(result);
      }
      if (result?.src) {
        return result.src;  // HTMLImageElement
      }
      if (typeof result === 'string') {
        return result;
      }
      // Some SDK versions return { image: Blob }
      if (result?.image instanceof Blob) {
        return await this._blobToDataUrl(result.image);
      }
    } catch (e) {
      console.warn('CharacterManager: txt2img failed.', e);
    }
    return null;
  }

  _blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  getRace() {
    if (!this.character) return RACES[0];
    return RACES.find(r => r.id === this.character.raceId) || RACES[0];
  }

  getClass() {
    if (!this.character) return CLASSES[0];
    return CLASSES.find(c => c.id === this.character.classId) || CLASSES[0];
  }

  get hasCharacter() {
    return this._ready && this.character !== null;
  }
}

// Export singleton
export const characterManager = new CharacterManagerSingleton();
