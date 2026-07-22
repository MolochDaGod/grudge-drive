/**
 * Fleet account voxel drivers for Velocity street racing.
 *
 * SSOT: Railway /api/characters — prefer **voxel / open** era heroes only.
 * This is NOT grudge6 modular Warlords kits (WK_/ELF_/gear mesh ids).
 * Look palette drives createAnimatedCharacter (Open voxel box-rig).
 */

import type { CharacterLook } from "./lookTypes";
import { CHARACTERS, type CharacterDef } from "./characters";
import { fleetApiUrl } from "./fleetConfig";
import { authHeaders, getActiveCharacterId, getSessionToken } from "./fleetAuth";

export interface FleetDriverOption {
  /** Use as garage driverId (fleet:uuid or crest id). */
  id: string;
  name: string;
  look: CharacterLook;
  accent: string;
  /** True when this is the player's account hero, not a crest preset. */
  isFleet: boolean;
  /** Raw Railway character id when fleet. */
  characterId?: string;
  perkLabel: string;
  blurb: string;
  race?: string;
  level?: number;
  /** true if this entry is a grudge6 modular kit (should not drive Velocity). */
  isGrudge6?: boolean;
}

const CREST_LOOK: Record<string, CharacterLook> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c.look]),
);

function lookFromRace(race?: string | null): CharacterLook {
  const r = (race || "").toLowerCase();
  if (r.includes("elf")) return CREST_LOOK.jade ?? CHARACTERS[3].look;
  if (r.includes("orc")) return CREST_LOOK.void ?? CHARACTERS[4].look;
  if (r.includes("dwarf") || r.includes("dwf")) return CREST_LOOK.gold ?? CHARACTERS[2].look;
  if (r.includes("undead") || r.includes("ud")) return CREST_LOOK.void ?? CHARACTERS[4].look;
  if (r.includes("barb") || r.includes("brb")) return CREST_LOOK.ember ?? CHARACTERS[0].look;
  if (r.includes("human") || r.includes("wk") || r.includes("warrior")) {
    return CREST_LOOK.frost ?? CHARACTERS[1].look;
  }
  return CREST_LOOK.frost ?? CHARACTERS[1].look;
}

/** Detect grudge6 / Toon RTS modular kits — wrong art for street-racing voxel RPG. */
export function isGrudge6Character(raw: Record<string, unknown>): boolean {
  const era = String(raw.gameEra || raw.game_era || raw.era || "").toLowerCase();
  if (era === "warlords" || era === "grudge6" || era === "toon") return true;

  const model = raw.model3d || raw.model_3d || raw.config;
  const blob = JSON.stringify(model || {}).toLowerCase();
  if (
    blob.includes("grudge6") ||
    blob.includes("gear_presets") ||
    blob.includes("mesh_ids") ||
    blob.includes("wk_") ||
    blob.includes("elf_") ||
    blob.includes("orc_") ||
    blob.includes("dwf_") ||
    blob.includes("brb_") ||
    blob.includes("ud_") ||
    blob.includes("toon_rts") ||
    blob.includes("bip001")
  ) {
    return true;
  }

  const race = String(raw.raceId || raw.race || "").toLowerCase();
  // Bare race labels alone are OK for look tint; modular kit prefixes are not
  if (/^(wk|brb|elf|dwf|orc|ud)[_-]/.test(race)) return true;
  return false;
}

/** Prefer Open Dressing Room / voxel look embedded in model3d or saveData. */
function lookFromCharacterPayload(raw: Record<string, unknown>): CharacterLook {
  const model = (raw.model3d || raw.model_3d || {}) as Record<string, unknown>;
  const save = (raw.saveData || raw.save_data || {}) as Record<string, unknown>;
  const lookSrc =
    (model.look as Record<string, unknown>) ||
    (model.voxelLook as Record<string, unknown>) ||
    (save.look as Record<string, unknown>) ||
    (save.voxelLook as Record<string, unknown>) ||
    (save.open as Record<string, unknown>)?.look ||
    null;

  if (lookSrc && typeof lookSrc === "object") {
    const base = lookFromRace(String(raw.race || raw.raceId || ""));
    return {
      ...base,
      skin: String(lookSrc.skin || lookSrc.skinColor || base.skin),
      shirt: String(lookSrc.shirt || lookSrc.shirtColor || base.shirt),
      pants: String(lookSrc.pants || lookSrc.pantsColor || base.pants),
      hat: (lookSrc.hat as CharacterLook["hat"]) || base.hat,
      hatColor: String(lookSrc.hatColor || base.hatColor || "#333"),
      cape: Boolean(lookSrc.cape ?? base.cape),
      capeColor: String(lookSrc.capeColor || base.capeColor || "#1a1e2b"),
    };
  }
  return lookFromRace(String(raw.race || raw.raceId || ""));
}

export function readUrlCharacterId(): string | null {
  try {
    return (
      new URLSearchParams(window.location.search).get("characterId") ||
      new URLSearchParams(window.location.search).get("character_id") ||
      getActiveCharacterId()
    );
  } catch {
    return getActiveCharacterId();
  }
}

export function readUrlCharacterName(): string | null {
  try {
    return (
      new URLSearchParams(window.location.search).get("characterName") ||
      new URLSearchParams(window.location.search).get("character_name")
    );
  } catch {
    return null;
  }
}

/** Crest drivers only for guest fallback — not the production driver SSOT. */
export function crestDriverOptions(): FleetDriverOption[] {
  return CHARACTERS.map((c) => ({
    id: c.id,
    name: c.name,
    look: c.look,
    accent: c.accent,
    isFleet: false,
    perkLabel: c.perk.label,
    blurb: c.perk.description,
  }));
}

type RawChar = Record<string, unknown> & {
  id?: string;
  characterId?: string;
  uuid?: string;
  name?: string;
  displayName?: string;
  race?: string;
  raceId?: string;
  className?: string;
  class?: string;
  level?: number;
};

function mapCharacters(list: RawChar[], allowGrudge6 = false): FleetDriverOption[] {
  return list
    .filter((ch) => allowGrudge6 || !isGrudge6Character(ch))
    .slice(0, 4)
    .map((ch, i) => {
      const id = String(ch.id || ch.characterId || ch.uuid || `fleet-${i}`);
      const name = String(ch.name || ch.displayName || `Hero ${i + 1}`);
      const look = lookFromCharacterPayload(ch);
      const accent = CHARACTERS[i % CHARACTERS.length].accent;
      const cls = String(ch.className || ch.class || "Racer");
      const lvl = typeof ch.level === "number" ? ch.level : undefined;
      const g6 = isGrudge6Character(ch);
      return {
        id: `fleet:${id}`,
        name,
        look,
        accent,
        isFleet: true,
        characterId: id,
        perkLabel: lvl != null ? `${cls} · L${lvl}` : cls,
        blurb: g6
          ? "Grudge6 kit — not used for Velocity (pick a voxel hero)."
          : "Account voxel racer — Open Dressing Room / street RPG.",
        race: String(ch.race || ch.raceId || "") || undefined,
        level: lvl,
        isGrudge6: g6,
      };
    });
}

async function fetchCharacters(path: string, headers: Record<string, string>): Promise<RawChar[]> {
  const res = await fetch(fleetApiUrl(path), {
    credentials: "include",
    headers,
  });
  if (res.status === 401 || res.status === 403) {
    console.info("[fleet] characters require login", path, res.status);
    return [];
  }
  if (!res.ok) return [];
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    console.warn("[fleet] /api/characters returned HTML — REST proxy missing");
    return [];
  }
  const data = (await res.json()) as {
    characters?: RawChar[];
    data?: RawChar[];
    roster?: RawChar[];
  };
  if (Array.isArray(data.characters)) return data.characters;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.roster)) return data.roster;
  if (Array.isArray(data)) return data as RawChar[];
  return [];
}

/**
 * Load up to 4 **voxel** account heroes for Velocity.
 * Prefer era=voxel / open; never treat warlords grudge6 as default drivers.
 */
export async function loadFleetDriverOptions(
  token?: string | null,
): Promise<FleetDriverOption[]> {
  try {
    const t = token ?? getSessionToken();
    if (!t) return [];
    const headers = authHeaders();
    headers.Authorization = `Bearer ${t}`;
    headers["X-Session-Token"] = t;

    // 1) Explicit voxel / open eras first
    for (const era of ["voxel", "open", "nexus"]) {
      const list = await fetchCharacters(`/api/characters?era=${era}&limit=8`, headers);
      const mapped = mapCharacters(list, false);
      if (mapped.length) {
        console.info("[fleet] voxel drivers from era", era, mapped.length);
        return mapped;
      }
    }

    // 2) Unscoped list — filter OUT grudge6 modular
    {
      const list = await fetchCharacters("/api/characters?limit=12", headers);
      const mapped = mapCharacters(list, false);
      if (mapped.length) {
        console.info("[fleet] voxel drivers from unscoped (filtered grudge6)", mapped.length);
        return mapped;
      }
    }

    // 3) warlords era only as last resort IF non-grudge6 look data present
    {
      const list = await fetchCharacters("/api/characters?era=warlords&limit=8", headers);
      const mapped = mapCharacters(list, false);
      if (mapped.length) {
        console.info("[fleet] non-g6 from warlords era", mapped.length);
        return mapped;
      }
    }

    console.info("[fleet] no account voxel characters — use Foundry/Open voxel create or crest guest");
    return [];
  } catch (e) {
    console.warn("[fleet] loadFleetDriverOptions failed", e);
    return [];
  }
}

/** Resolve a garage driverId into a look for createAnimatedCharacter. */
export function resolveDriverLook(
  driverId: string,
  fleetOpts: FleetDriverOption[],
): { look: CharacterLook; name: string; accent: string } {
  const fleet = fleetOpts.find((f) => f.id === driverId && !f.isGrudge6);
  if (fleet) return { look: fleet.look, name: fleet.name, accent: fleet.accent };
  const crest = CHARACTERS.find((c) => c.id === driverId) ?? CHARACTERS[0];
  return { look: crest.look, name: crest.name, accent: crest.accent };
}

export function toCharacterDef(opt: FleetDriverOption): CharacterDef {
  return {
    id: opt.id,
    name: opt.name,
    crest: "ember",
    accent: opt.accent,
    look: opt.look,
    perk: {
      id: "fleet",
      label: opt.perkLabel,
      description: opt.blurb,
    },
  };
}
