/**
 * Deploy drive.grudge-studio.com as a thin Vercel REWRITE proxy →
 * grudge-velocity.pages.dev (Three.js Cruise only).
 *
 * NEVER upload Babylon dist/index.html — that overrides rewrites and
 * brings back index-DOZ-*.js + CORS asset hell.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  cpSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "_drive_proxy_out");

/** Railway game-data + Grudge ID + Drive room. Catch-all alone returns HTML for /api/* and breaks ?play=1. */
const API = "https://grudge-api-production-0d46.up.railway.app";
const ID = "https://id.grudge-studio.com";
const GRUDOX = "https://grudox.grudge-studio.com";

const vercelJson = {
  cleanUrls: true,
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Velocity-Entry", value: "proxy-to-pages" },
      ],
    },
  ],
  rewrites: [
    { source: "/api/auth/:path*", destination: `${ID}/api/auth/:path*` },
    { source: "/api/characters", destination: `${API}/api/characters` },
    { source: "/api/characters/:path*", destination: `${API}/api/characters/:path*` },
    { source: "/api/account", destination: `${API}/api/account` },
    { source: "/api/account/:path*", destination: `${API}/api/account/:path*` },
    { source: "/api/wallet", destination: `${API}/api/wallet` },
    { source: "/api/wallet/:path*", destination: `${API}/api/wallet/:path*` },
    { source: "/api/inventory", destination: `${API}/api/inventory` },
    { source: "/api/inventory/:path*", destination: `${API}/api/inventory/:path*` },
    { source: "/api/health", destination: `${API}/api/health` },
    { source: "/api/healthz", destination: `${API}/api/health` },
    // HTTP health for room; browser WS should use wss://grudox…/api/drive (Worker upgrades)
    { source: "/api/drive", destination: `${GRUDOX}/api/drive` },
    { source: "/api/drive/:path*", destination: `${GRUDOX}/api/drive/:path*` },
    { source: "/api/:path*", destination: `${API}/api/:path*` },
    {
      source: "/(.*)",
      destination: "https://grudge-velocity.pages.dev/$1",
    },
  ],
};

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "vercel.json"), JSON.stringify(vercelJson, null, 2));
writeFileSync(path.join(out, ".gitkeep"), "");

const CDN = "https://assets.grudge-studio.com/models";
const MODELS_ROOTS = [
  "C:\\Users\\nugye\\vfc-build\\lib\\assets\\models",
  path.join(process.env.USERPROFILE || "", "vfc-build", "lib", "assets", "models"),
];

/** Prefer vehicles, then bow loco (Velocity unarmed), then sword, then the rest. */
const FOLDER_PRIORITY = [
  "vehicles",
  "animations/bow",
  "animations/sword",
  "animations/knife",
  "animations/rifle",
  "animations/pistol",
  "animations/ghostrider",
  "animations/zombie",
];

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function addStem(map, stem, url) {
  if (!stem) return;
  if (!map[stem]) map[stem] = url;
  const dashed = stem.replace(/\s+/g, "-").replace(/_/g, "-");
  if (dashed !== stem && !map[dashed]) map[dashed] = url;
}

function buildStemToCdn() {
  const map = {};
  let modelsRoot = MODELS_ROOTS.find((p) => existsSync(p));
  if (!modelsRoot) {
    console.warn("models tree missing — using baked vehicle+bow+sword stubs");
    const baked = {
      "datsun-240z": `${CDN}/vehicles/datsun-240z.glb`,
      "nsx-voxel": `${CDN}/vehicles/nsx-voxel.glb`,
      "toyota-supra": `${CDN}/vehicles/toyota-supra.glb`,
      "bmw-m3-gtr": `${CDN}/vehicles/bmw-m3-gtr.glb`,
      "minecraft-car": `${CDN}/vehicles/minecraft-car.glb`,
      "unarmed-idle-01": `${CDN}/animations/bow/unarmed-idle-01.fbx`,
      "standing-walk-forward": `${CDN}/animations/bow/standing-walk-forward.fbx`,
      "standing-walk-back": `${CDN}/animations/bow/standing-walk-back.fbx`,
      "standing-walk-left": `${CDN}/animations/bow/standing-walk-left.fbx`,
      "standing-walk-right": `${CDN}/animations/bow/standing-walk-right.fbx`,
      "standing-run-forward": `${CDN}/animations/bow/standing-run-forward.fbx`,
      "standing-run-back": `${CDN}/animations/bow/standing-run-back.fbx`,
      "standing-run-left": `${CDN}/animations/bow/standing-run-left.fbx`,
      "standing-run-right": `${CDN}/animations/bow/standing-run-right.fbx`,
      "standing-turn-90-left": `${CDN}/animations/bow/standing-turn-90-left.fbx`,
      "standing-turn-90-right": `${CDN}/animations/bow/standing-turn-90-right.fbx`,
      "sword-and-shield-idle": `${CDN}/animations/sword/sword-and-shield-idle.fbx`,
      "sword-and-shield-run": `${CDN}/animations/sword/sword-and-shield-run.fbx`,
      "sword-and-shield-strafe": `${CDN}/animations/sword/sword-and-shield-strafe.fbx`,
    };
    return baked;
  }
  const files = walkFiles(modelsRoot).filter((f) =>
    /\.(glb|gltf|fbx|obj|png|jpg|jpeg)$/i.test(f),
  );
  const ranked = files.sort((a, b) => {
    const ra = path.relative(modelsRoot, a).replaceAll("\\", "/");
    const rb = path.relative(modelsRoot, b).replaceAll("\\", "/");
    const ia = FOLDER_PRIORITY.findIndex((p) => ra.startsWith(p + "/") || ra.startsWith(p));
    const ib = FOLDER_PRIORITY.findIndex((p) => rb.startsWith(p + "/") || rb.startsWith(p));
    const pa = ia === -1 ? 99 : ia;
    const pb = ib === -1 ? 99 : ib;
    return pa - pb || ra.localeCompare(rb);
  });
  for (const f of ranked) {
    const rel = path.relative(modelsRoot, f).replaceAll("\\", "/");
    const stem = path.basename(f).replace(/\.[^.]+$/, "");
    addStem(map, stem, `${CDN}/${rel}`);
  }
  console.log("asset stubs", Object.keys(map).length, "from", modelsRoot);
  return map;
}

const STEM_TO_CDN = buildStemToCdn();
const STEMS_SORTED = Object.keys(STEM_TO_CDN).sort((a, b) => b.length - a.length);

const AUTH_BOOT = `(function(){var K=["grudge.open.token","grudge_auth_token","grudge_session_token","grudge.token","sso_token","grudge_token"];function d(t){try{var p=t.split(".")[1];if(!p)return null;return JSON.parse(atob(p.replace(/-/g,"+").replace(/_/g,"/")))}catch(e){return null}}function exp(p){return !!(p&&p.exp&&Date.now()/1000>=p.exp-60)}var s=[],l=[];function c(t){if(!t||t.length<20)return;var p=d(t);if(!p||exp(p))return;if(p.type==="launch"){if(!l.length)l.push(t);return}if(!s.length)s.push(t)}try{for(var i=0;i<K.length;i++){c(sessionStorage.getItem(K[i]));c(localStorage.getItem(K[i]))}}catch(e){return}var ch=s[0]||l[0]||null;if(ch){try{var x=new XMLHttpRequest();x.open("GET","/api/account",false);x.setRequestHeader("Authorization","Bearer "+ch);x.setRequestHeader("Accept","application/json");x.send(null);if(x.status===401||x.status===403)ch=null;}catch(e){}}try{if(!ch){for(var j=0;j<K.length;j++){localStorage.removeItem(K[j]);sessionStorage.removeItem(K[j])}return}for(var k=0;k<K.length;k++){localStorage.setItem(K[k],ch);sessionStorage.setItem(K[k],ch)}}catch(e){}})();`;

const middlewareJs = `const PAGES = "https://grudge-velocity.pages.dev";
const AUTH_BOOT = ${JSON.stringify(AUTH_BOOT)};
const STEM_TO_CDN = ${JSON.stringify(STEM_TO_CDN)};
const STEMS = ${JSON.stringify(STEMS_SORTED)};
const BUNDLE = /^(cruise-|react-vendor-|three-vendor-|bvh-vendor-|style-)/;

function matchStem(file) {
  const base = file.replace(/\\.js$/i, "");
  for (let i = 0; i < STEMS.length; i++) {
    const stem = STEMS[i];
    if (base === stem || base.startsWith(stem + "-")) return stem;
  }
  return null;
}

export const config = {
  matcher: ["/", "/index.html", "/cruise.html", "/assets/:file"],
};

export default async function middleware(request) {
  const incoming = new URL(request.url);
  const file = incoming.pathname.split("/").pop() || "";

  if (incoming.pathname.startsWith("/assets/") && /\\.js$/i.test(file) && !BUNDLE.test(file)) {
    const stem = matchStem(file);
    const cdn = stem && STEM_TO_CDN[stem];
    if (cdn) {
      return new Response("export default " + JSON.stringify(cdn) + ";\\n", {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400",
          "x-velocity-asset-stub": stem,
          "access-control-allow-origin": "*",
        },
      });
    }
  }

  if (
    incoming.pathname === "/" ||
    incoming.pathname === "/index.html" ||
    incoming.pathname === "/cruise.html"
  ) {
    const pagesUrl = PAGES + (incoming.pathname === "/" ? "/" : incoming.pathname);
    const upstream = await fetch(pagesUrl, {
      headers: { accept: "text/html", "user-agent": request.headers.get("user-agent") || "velocity-proxy" },
    });
    let html = await upstream.text();
    if (!html.includes('id="velocity-auth-boot"')) {
      html = html.replace(
        /<script type="module"/,
        '<script id="velocity-auth-boot">' + AUTH_BOOT + '</script>\\n    <script type="module"',
      );
    }
    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("x-velocity-entry", "proxy-to-pages");
    headers.set("x-velocity-auth-boot", "1");
    return new Response(html, { status: upstream.status, headers });
  }

  return fetch(PAGES + incoming.pathname + incoming.search);
}
`;

writeFileSync(path.join(out, "middleware.js"), middlewareJs);

const projectLink = path.join(root, ".vercel", "project.json");
if (existsSync(projectLink)) {
  mkdirSync(path.join(out, ".vercel"), { recursive: true });
  cpSync(projectLink, path.join(out, ".vercel", "project.json"));
}

const token = process.env.VERCEL_TOKEN || "";
const args = ["vercel", "deploy", "--prod", "--yes", "--scope", "grudgenexus"];
if (token) args.push("--token", token);

console.log("Deploying rewrite-only proxy from", out);
const r = spawnSync("npx", args, {
  cwd: out,
  env: process.env,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
