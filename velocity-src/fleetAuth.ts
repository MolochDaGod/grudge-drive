/**
 * Slim fleet auth for Velocity Pages (no Puter SDK required at boot).
 *
 * SSOT matches production-wiring + gameopen readProductionAuthToken:
 *  - Login: /login?redirect_uri=<callback>
 *  - Return: prefer sso_token / token (full session JWT) over grudge_token (60m launch)
 *  - Storage: grudge.open.token first, then fleet aliases (dual-write all)
 *  - Railway /api/characters is requireAuth — never send expired/launch leftovers
 */

import {
  FLEET,
  FLEET_AUTH_TOKEN_KEYS,
  fleetApiUrl,
  velocityReturnUrl,
} from "./fleetConfig";

const TOKEN_KEYS = FLEET_AUTH_TOKEN_KEYS;
const GRUDGE_ID_KEY = "grudge_id";
const USERNAME_KEY = "grudge_username";
const ACTIVE_CHAR_KEY = "grudge_active_character";

/** Full session JWT query/hash keys — NEVER put grudge_token first (short launch). */
const SESSION_TOKEN_PARAMS = [
  "sso_token",
  "token",
  "access_token",
  "sessionToken",
  "authToken",
] as const;

const LAUNCH_TOKEN_PARAMS = ["grudge_token", "launch_token"] as const;

const RETURN_META_PARAMS = [
  "grudge_id",
  "grudgeId",
  "grudge_username",
  "username",
  "characterId",
  "characterName",
  "character_id",
  "character_name",
] as const;

type JwtPayload = {
  exp?: number;
  type?: string;
  userId?: string;
  grudgeId?: string;
  username?: string;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null, skewSec = 60): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  if (!payload.exp) return false;
  return Date.now() / 1000 >= payload.exp - skewSec;
}

export function isLaunchToken(token: string | null): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return payload?.type === "launch";
}

function readStore(storage: Storage, key: string): string | null {
  try {
    const v = storage.getItem(key);
    return v && v.length > 16 ? v : null;
  } catch {
    return null;
  }
}

function allStoredRaw(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string | null) => {
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  try {
    for (const k of TOKEN_KEYS) {
      push(readStore(sessionStorage, k));
      push(readStore(localStorage, k));
    }
  } catch {
    /* private mode */
  }
  return out;
}

/**
 * Session JWT for Bearer calls. Skips expired + launch leftovers so we never
 * 401 /api/characters with a dead grudge_token while a valid sso sits on another key.
 */
export function getSessionToken(): string | null {
  let launchFallback: string | null = null;
  for (const raw of allStoredRaw()) {
    if (!decodeJwtPayload(raw)) continue;
    if (isTokenExpired(raw)) continue;
    if (isLaunchToken(raw)) {
      if (!launchFallback) launchFallback = raw;
      continue;
    }
    return raw;
  }
  return launchFallback;
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
    for (const k of TOKEN_KEYS) {
      localStorage.setItem(k, token);
      sessionStorage.setItem(k, token);
    }
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
    for (const k of TOKEN_KEYS) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

function paramFromSearchOrHash(
  name: string,
  search: string,
  hash: string,
): string | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromQ = q.get(name);
  if (fromQ && fromQ.length > 16) return fromQ;
  if (!hash) return null;
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const hq = new URLSearchParams(h.includes("=") ? h : `token=${h}`);
  const fromH = hq.get(name);
  return fromH && fromH.length > 16 ? fromH : null;
}

function pickParam(
  names: readonly string[],
  search: string,
  hash: string,
): string | null {
  for (const k of names) {
    const v = paramFromSearchOrHash(k, search, hash);
    if (v) return v;
  }
  return null;
}

function scrubHandoffFromUrl(keep: {
  characterId?: string | null;
  characterName?: string | null;
  tokenPresent: boolean;
}): void {
  try {
    const url = new URL(window.location.href);
    for (const k of [
      ...SESSION_TOKEN_PARAMS,
      ...LAUNCH_TOKEN_PARAMS,
      ...RETURN_META_PARAMS,
      "provider",
    ]) {
      url.searchParams.delete(k);
    }
    if (keep.characterId) url.searchParams.set("characterId", keep.characterId);
    if (keep.characterName) url.searchParams.set("characterName", keep.characterName);
    if (!url.searchParams.has("play") && keep.tokenPresent) url.searchParams.set("play", "1");
    if (url.hash && /token|sso/i.test(url.hash)) url.hash = "";
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

/**
 * Capture Railway JWT from login / Foundry return URL.
 * Prefer full session (sso_token) over short launch (grudge_token).
 */
export function captureTokenFromUrl(
  search = window.location.search,
  hash = window.location.hash,
): string | null {
  try {
    const sso = pickParam(SESSION_TOKEN_PARAMS, search, hash);
    const launch = pickParam(LAUNCH_TOKEN_PARAMS, search, hash);
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const grudgeId = q.get("grudgeId") || q.get("grudge_id") || undefined;
    const username = q.get("username") || q.get("grudge_username") || undefined;
    const characterId = q.get("characterId") || q.get("character_id") || null;
    const characterName = q.get("characterName") || q.get("character_name") || null;

    const token = sso || launch;
    if (token) setSessionToken(token, { grudgeId, username });
    if (characterId) setActiveCharacterId(characterId);

    if (token || characterId) {
      scrubHandoffFromUrl({ characterId, characterName, tokenPresent: !!token });
    }
    if (token) return token;
  } catch {
    /* ignore */
  }
  return getSessionToken();
}

/** Drop expired keys; dual-write the best remaining session JWT onto every fleet key. */
export function sanitizeStoredTokens(): string | null {
  const session: string[] = [];
  const launch: string[] = [];
  for (const raw of allStoredRaw()) {
    if (!decodeJwtPayload(raw)) continue;
    if (isTokenExpired(raw)) continue;
    if (isLaunchToken(raw)) launch.push(raw);
    else session.push(raw);
  }
  const best = session[0] || launch[0] || null;
  if (!best) {
    clearSession();
    return null;
  }
  setSessionToken(best);
  return best;
}

/** Exchange short launch JWT → full session. Same-origin /api/auth on drive.* */
export async function exchangeLaunchToken(launchToken: string): Promise<string | null> {
  if (!launchToken || isTokenExpired(launchToken)) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : FLEET.drive;
  const body = JSON.stringify({
    token: launchToken,
    launchToken,
    grudge_token: launchToken,
    audience: origin,
    origin,
  });
  const urls = [
    fleetApiUrl("/api/auth/session/exchange"),
    `${FLEET.id}/api/auth/session/exchange`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        credentials: "include",
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 401 || r.status === 403 || r.status === 400) return null;
      if (r.status === 429) return null;
      if (!r.ok) continue;
      const data = (await r.json()) as Record<string, unknown>;
      const t = String(
        data.sessionToken || data.token || data.access_token || data.sso_token || "",
      );
      if (!t || t.length < 16) continue;
      const gid = String(
        data.grudgeId || data.grudge_id || (data.user as { grudgeId?: string } | undefined)?.grudgeId || "",
      );
      const username = String(
        data.username || (data.user as { username?: string } | undefined)?.username || "",
      );
      setSessionToken(t, { grudgeId: gid || undefined, username: username || undefined });
      return t;
    } catch {
      /* try next host */
    }
  }
  return null;
}

/**
 * Boot: capture URL → prefer session JWT → exchange launch if that is all we have.
 */
export async function ensureFleetSession(): Promise<string | null> {
  captureTokenFromUrl();
  let token = sanitizeStoredTokens();
  if (token && isLaunchToken(token)) {
    const exchanged = await exchangeLaunchToken(token);
    if (exchanged) token = exchanged;
  }
  token = sanitizeStoredTokens();
  if (token && isTokenExpired(token)) {
    clearSession();
    return null;
  }
  return token;
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
      clearSession();
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
