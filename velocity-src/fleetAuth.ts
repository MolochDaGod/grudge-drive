/**
 * Slim fleet auth for Velocity Pages (no Puter SDK required at boot).
 *
 * SSOT matches grudge-studio-auth sdk/authConnect:
 *  - Login: /login?redirect_uri=<callback>
 *  - Return: ?grudge_token= / ?sso_token= / ?token=
 *  - Storage: grudge_auth_token (+ legacy keys)
 */

import { FLEET, fleetApiUrl, velocityReturnUrl } from "./fleetConfig";

const TOKEN_KEYS = [
  "grudge_auth_token",
  "grudge_session_token",
  "grudge.token",
  "sso_token",
  "grudge_token",
] as const;

const TOKEN_KEY = TOKEN_KEYS[0];
const LEGACY_TOKEN_KEY = TOKEN_KEYS[1];
const GRUDGE_ID_KEY = "grudge_id";
const USERNAME_KEY = "grudge_username";
const ACTIVE_CHAR_KEY = "grudge_active_character";

/** Query/hash params consumed on return from id.grudge-studio.com */
const RETURN_TOKEN_PARAMS = [
  "grudge_token",
  "sso_token",
  "token",
  "sessionToken",
  "access_token",
  "authToken",
] as const;

const RETURN_META_PARAMS = [
  "grudge_id",
  "grudgeId",
  "grudge_username",
  "username",
  "characterId",
  "characterName",
] as const;

export function getSessionToken(): string | null {
  try {
    for (const k of TOKEN_KEYS) {
      const v = localStorage.getItem(k);
      if (v && v.length > 8) return v;
    }
  } catch {
    /* private mode */
  }
  return null;
}

export function getStoredUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch {
    return null;
  }
}

export function getActiveCharacterId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHAR_KEY) || localStorage.getItem("gruda_active_character");
  } catch {
    return null;
  }
}

export function setActiveCharacterId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CHAR_KEY, id);
      localStorage.setItem("gruda_active_character", id);
    } else {
      localStorage.removeItem(ACTIVE_CHAR_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function setSessionToken(
  token: string,
  meta?: { grudgeId?: string; username?: string },
): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    localStorage.setItem("grudge_token", token);
    if (meta?.grudgeId) {
      localStorage.setItem(GRUDGE_ID_KEY, meta.grudgeId);
      localStorage.setItem("grudge_account_id", meta.grudgeId);
      localStorage.setItem("grudge_user_id", meta.grudgeId);
    }
    if (meta?.username) localStorage.setItem(USERNAME_KEY, meta.username);
  } catch {
    /* private mode */
  }
}

export function clearSession(): void {
  try {
    for (const k of TOKEN_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/**
 * Capture Railway JWT from login / Foundry return URL.
 * Fleet SSOT: grudge_token (primary), sso_token, token.
 */
export function captureTokenFromUrl(
  search = window.location.search,
  hash = window.location.hash,
): string | null {
  try {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    let token: string | null = null;
    for (const k of RETURN_TOKEN_PARAMS) {
      const v = q.get(k);
      if (v && v.length > 16) {
        token = v;
        break;
      }
    }
    if (!token && hash) {
      const h = hash.startsWith("#") ? hash.slice(1) : hash;
      const hq = new URLSearchParams(h.includes("=") ? h : `token=${h}`);
      for (const k of RETURN_TOKEN_PARAMS) {
        const v = hq.get(k);
        if (v && v.length > 16) {
          token = v;
          break;
        }
      }
    }

    const grudgeId = q.get("grudgeId") || q.get("grudge_id") || undefined;
    const username = q.get("username") || q.get("grudge_username") || undefined;
    const characterId = q.get("characterId") || q.get("character_id") || null;
    const characterName = q.get("characterName") || q.get("character_name") || null;

    if (token) {
      setSessionToken(token, { grudgeId, username });
    }
    if (characterId) setActiveCharacterId(characterId);

    // Strip secrets from address bar but keep play/from flags
    if (token || characterId) {
      const url = new URL(window.location.href);
      for (const k of [...RETURN_TOKEN_PARAMS, ...RETURN_META_PARAMS, "provider"]) {
        url.searchParams.delete(k);
      }
      // Keep characterId for garage selection if we just received it
      if (characterId) url.searchParams.set("characterId", characterId);
      if (characterName) url.searchParams.set("characterName", characterName);
      if (!url.searchParams.has("play") && token) url.searchParams.set("play", "1");
      if (url.hash && /token|sso/i.test(url.hash)) url.hash = "";
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    if (token) return token;
  } catch {
    /* ignore */
  }
  return getSessionToken();
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getSessionToken();
  const h: Record<string, string> = { Accept: "application/json", ...extra };
  if (token) {
    h.Authorization = `Bearer ${token}`;
    h["X-Session-Token"] = token;
  }
  return h;
}

/**
 * Canonical Grudge ID login.
 *
 * Gateway requires `redirect_uri` (bare `returnTo` alone is dropped by pickRedirectParam).
 * Dual-write redirect / return / returnTo / return_to for older clients + docs.
 *
 * Production return is always drive.grudge-studio.com (not pages.dev) so login
 * re-enters the brand domain; drive 307 preserves token query → Pages SPA.
 */
export function velocityLoginUrl(returnTo?: string): string {
  const dest = returnTo || velocityReturnUrl({ play: true, from: "id" });
  const enc = encodeURIComponent(dest);
  const originEnc = encodeURIComponent(FLEET.drive);
  return (
    `${FLEET.id}/login` +
    `?redirect_uri=${enc}` +
    `&redirect=${enc}` +
    `&return=${enc}` +
    `&returnTo=${enc}` +
    `&return_to=${enc}` +
    `&app=velocity` +
    `&origin=${originEnc}`
  );
}

/**
 * Character Foundry 4-slot hub — return with characterId + optional token.
 */
export function foundryHeroesUrl(returnTo?: string): string {
  const dest = returnTo || velocityReturnUrl({ play: true, from: "foundry" });
  const enc = encodeURIComponent(dest);
  return `https://character.grudge-studio.com/?returnTo=${enc}&redirect_uri=${enc}&return=${enc}`;
}

export function foundryCreateUrl(returnTo?: string): string {
  const dest = returnTo || velocityReturnUrl({ play: true, from: "foundry" });
  const enc = encodeURIComponent(dest);
  return `https://character.grudge-studio.com/foundry?returnTo=${enc}&redirect_uri=${enc}&return=${enc}`;
}

export type AuthAccount = {
  ok: boolean;
  username?: string;
  grudgeId?: string;
  detail: string;
};

/** Lightweight session check against Railway (Bearer). */
export async function probeAuthAccount(): Promise<AuthAccount> {
  const token = getSessionToken();
  if (!token) return { ok: false, detail: "not signed in" };
  try {
    const res = await fetch(fleetApiUrl("/api/account"), {
      credentials: "include",
      headers: authHeaders(),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: "session expired — login again" };
    }
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = (await res.json()) as {
      username?: string;
      grudgeId?: string;
      user?: { username?: string; grudgeId?: string; id?: string };
    };
    const username = j.username || j.user?.username;
    const grudgeId = j.grudgeId || j.user?.grudgeId || j.user?.id;
    if (username) {
      try {
        localStorage.setItem(USERNAME_KEY, username);
      } catch {
        /* ignore */
      }
    }
    if (grudgeId) {
      try {
        localStorage.setItem(GRUDGE_ID_KEY, grudgeId);
        localStorage.setItem("grudge_account_id", grudgeId);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: true,
      username,
      grudgeId,
      detail: username || grudgeId || "signed in",
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "auth probe failed" };
  }
}
