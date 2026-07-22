/**
 * CF Pages middleware for grudge-velocity.
 *
 * Problem: SPA catch-all `/* → /index.html 200` turns MISSING hashed chunks
 * (stale tab / old Babylon deploy) into text/html. Browsers then throw:
 *   "Expected a JavaScript-or-Wasm module script but the server responded
 *    with a MIME type of text/html"
 *
 * Fix: never serve HTML for static asset extensions — return a real 404.
 * Also force no-store on HTML entry so SSO landings always get the current index.
 */

const STATIC_EXT =
  /\.(js|mjs|cjs|css|map|wasm|json|glb|gltf|bin|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|wav|ogg|mp4|webm)$/i;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const res = await context.next();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  // Missing hashed asset (or any static path) must not be SPA HTML
  if (STATIC_EXT.test(url.pathname) && ct.includes("text/html")) {
    return new Response(
      [
        `404 Missing static asset: ${url.pathname}`,
        "",
        "This usually means a stale browser tab is requesting old Vite chunk hashes",
        "(e.g. a previous Babylon grudge-drive deploy). Current Velocity is the",
        "Three.js cruise SPA (cruise-*.js + three-vendor + react-vendor).",
        "",
        "Fix: hard-refresh (Ctrl+Shift+R) or clear site data for",
        "grudge-velocity.pages.dev / drive.grudge-studio.com, then reload.",
        "Canonical: https://drive.grudge-studio.com/?play=1",
      ].join("\n"),
      {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-velocity-asset": "missing",
        },
      },
    );
  }

  const headers = new Headers(res.headers);

  // Same-origin preferred; if anything still cross-loads modules from pages.dev
  // (stale Vercel 307s), allow drive + pages origins for ES modules / WASM.
  const origin = context.request.headers.get("Origin");
  const allow =
    origin === "https://drive.grudge-studio.com" ||
    origin === "https://grudge-velocity.pages.dev" ||
    origin === "https://velocity.grudge-studio.com" ||
    origin === "https://grudgewarlords.com"
      ? origin
      : "https://drive.grudge-studio.com";
  headers.set("Access-Control-Allow-Origin", allow);
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Vary", "Origin");

  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Always revalidate HTML entry after SSO redirects
  if (
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/cruise.html" ||
    url.pathname.endsWith(".html")
  ) {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("CDN-Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }

  // Hashed assets + anything else that survived the static-ext check
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
