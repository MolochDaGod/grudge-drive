/**
 * Velocity fleet origins — production browser load SSOT.
 *
 * CF Pages cannot run Node; REST is proxied via `_redirects` (200) to Railway,
 * or called absolute when same-origin proxy is missing.
 */

export const FLEET = {
  /** Characters / account / wallet (Railway Postgres SSOT) */
  gameData: "https://grudge-api-production-0d46.up.railway.app",
  /** Binaries + velocity library */
  assets: "https://assets.grudge-studio.com",
  /** Live rooms + /api/drive HTTP health */
  grudox: "https://grudox.grudge-studio.com",
  /** Grudge ID auth */
  id: "https://id.grudge-studio.com",
  /**
   * Canonical player entry (brand DNS). 307 → CF Pages SPA; preserves query
   * (incl. grudge_token) so ID login must return here — not raw pages.dev.
   */
  drive: "https://drive.grudge-studio.com",
  /** CF Pages SPA host (runtime after drive redirect) */
  pages: "https://grudge-velocity.pages.dev",
  /** Baked LA map */
  mapGlb: "https://assets.grudge-studio.com/models/environment/velocity/la-gangwar.glb",
  manifest: "https://assets.grudge-studio.com/games/velocity/manifest.json",
  introVideo: "https://assets.grudge-studio.com/media/velocity/drive-grudge.mp4",
  introPoster: "https://assets.grudge-studio.com/media/velocity/drive-grudge-poster.jpg",
  driveRoomHttp: "https://grudox.grudge-studio.com/api/drive",
  driveWs: "wss://grudox.grudge-studio.com/api/drive",
} as const;

/** Local dev hosts — keep same-origin return for vite. */
export function isLocalDevHost(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * URL ID should send the browser back to after login / Foundry.
 * Production always uses drive.grudge-studio.com so players re-enter the brand
 * domain (which 307s to Pages with tokens intact).
 */
export function velocityReturnUrl(opts?: {
  play?: boolean;
  from?: string;
  characterId?: string | null;
}): string {
  const play = opts?.play !== false;
  const from = opts?.from || "id";
  let base = FLEET.drive;
  if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
    base = window.location.origin;
  }
  const u = new URL("/", base.endsWith("/") ? base : `${base}/`);
  if (play) u.searchParams.set("play", "1");
  if (from) u.searchParams.set("from", from);
  if (opts?.characterId) u.searchParams.set("characterId", opts.characterId);
  return u.toString();
}

/** True when hosted on static CDN (no Node API process). */
export function isStaticHost(hostname = typeof window !== "undefined" ? window.location.hostname : ""): boolean {
  return /pages\.dev$|grudge-velocity|drive\.grudge-studio\.com|velocity\.grudge-studio\.com|vercel\.app$/i.test(
    hostname,
  );
}

/**
 * Resolve REST path for fleet APIs.
 * Prefer absolute Railway URL on static hosts so we never parse SPA HTML as JSON
 * when `_redirects` proxy is missing or delayed.
 */
export function fleetApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") return p;
  if (isStaticHost(window.location.hostname)) {
    // Auth stays on id host
    if (p.startsWith("/api/auth") || p.startsWith("/auth") || p === "/login") {
      return `${FLEET.id}${p.startsWith("/api") ? p : `/api${p}`}`;
    }
    return `${FLEET.gameData}${p}`;
  }
  return p;
}

export type LoadProbe = {
  id: string;
  ok: boolean;
  detail: string;
  ms: number;
};

async function timed(
  id: string,
  fn: () => Promise<{ ok: boolean; detail: string }>,
): Promise<LoadProbe> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { id, ok: r.ok, detail: r.detail, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      id,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      ms: Math.round(performance.now() - t0),
    };
  }
}

/**
 * Boot probes for live browser game — CDN map, library, REST health, room.
 * Does not require auth (characters may 401 as guest).
 */
export async function probeVelocityLiveLoad(
  onStep?: (p: LoadProbe) => void,
): Promise<{ ok: boolean; probes: LoadProbe[] }> {
  const probes: LoadProbe[] = [];
  const push = (p: LoadProbe) => {
    probes.push(p);
    onStep?.(p);
  };

  push(
    await timed("cdn-manifest", async () => {
      const r = await fetch(FLEET.manifest, { cache: "no-store" });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const j = (await r.json()) as { game?: string; vehicles?: unknown[] };
      const n = Array.isArray(j.vehicles) ? j.vehicles.length : 0;
      return { ok: j.game === "velocity" && n > 0, detail: `${n} vehicles` };
    }),
  );

  push(
    await timed("cdn-map-glb", async () => {
      const r = await fetch(FLEET.mapGlb, {
        method: "GET",
        headers: { Range: "bytes=0-11" },
      });
      // Some CDNs ignore Range — still 200 with body
      if (!r.ok && r.status !== 206) return { ok: false, detail: `HTTP ${r.status}` };
      const buf = new Uint8Array(await r.arrayBuffer());
      const magic =
        buf.length >= 4 &&
        buf[0] === 0x67 &&
        buf[1] === 0x6c &&
        buf[2] === 0x54 &&
        buf[3] === 0x46;
      return {
        ok: magic,
        detail: magic ? `glTF magic · ${buf.length}+ bytes` : "not a GLB (got HTML?)",
      };
    }),
  );

  push(
    await timed("rest-health", async () => {
      const url = fleetApiUrl("/api/health");
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status} ${url}` };
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) return { ok: false, detail: `non-JSON ${ct}` };
      const j = (await r.json()) as { status?: string; service?: string };
      return {
        ok: j.status === "healthy" || j.service === "grudge-api",
        detail: j.service || j.status || "ok",
      };
    }),
  );

  push(
    await timed("rest-characters", async () => {
      const url = fleetApiUrl("/api/characters?era=warlords&limit=4");
      const headers: Record<string, string> = { Accept: "application/json" };
      try {
        const token =
          localStorage.getItem("grudge_auth_token") ||
          localStorage.getItem("grudge_session_token");
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          headers["X-Session-Token"] = token;
        }
      } catch {
        /* ignore */
      }
      const r = await fetch(url, { credentials: "include", headers });
      // 401 without session is fine for guest play
      if (r.status === 401 || r.status === 403) {
        return { ok: true, detail: "guest (login for Foundry 4-slot)" };
      }
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("html")) return { ok: false, detail: "got HTML — API proxy missing" };
      const j = (await r.json()) as { characters?: unknown[] };
      const n = Array.isArray(j.characters) ? j.characters.length : 0;
      return { ok: true, detail: `${n}/4 Foundry heroes` };
    }),
  );

  push(
    await timed("room-drive", async () => {
      const r = await fetch(FLEET.driveRoomHttp, { cache: "no-store" });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const j = (await r.json()) as { ok?: boolean; path?: string; room?: string };
      return {
        ok: j.ok === true && j.path === "/api/drive",
        detail: j.room || j.path || "ok",
      };
    }),
  );

  const critical = ["cdn-manifest", "cdn-map-glb", "room-drive"];
  const ok = probes.every((p) => !critical.includes(p.id) || p.ok);
  return { ok, probes };
}
