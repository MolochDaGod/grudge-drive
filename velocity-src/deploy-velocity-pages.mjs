/**
 * Build + package + deploy Velocity cruise to CF Pages (live browser game).
 *
 * Includes:
 *  - SPA (cruise)
 *  - _redirects REST proxy → Railway / Grudge ID
 *  - baked LA map under /models + CDN is primary
 *  - UI pack under /ui
 *
 * Usage: node artifacts/arcade/scripts/deploy-velocity-pages.mjs
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arcade = path.resolve(__dirname, "..");
const distPublic = path.join(arcade, "dist", "public");
const out = path.join(arcade, "dist", "velocity-pages");
const mapSrc = path.join(arcade, "public", "models", "environment", "velocity", "la-gangwar.glb");
const uiSrc = path.join(arcade, "src", "games", "racer", "ui");

function run(cmd, args, env = {}) {
  console.log(">", cmd, args.join(" "));
  const r = spawnSync(cmd, args, {
    cwd: arcade,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// 1) Build
run("node", ["./node_modules/vite/bin/vite.js", "build", "--config", "vite.cruise.config.ts"], {
  BASE_PATH: "/",
});

// 2) Package
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(distPublic, out, { recursive: true });
const cruiseHtml = path.join(out, "cruise.html");
if (existsSync(cruiseHtml)) cpSync(cruiseHtml, path.join(out, "index.html"));

// Map local fallback
if (existsSync(mapSrc)) {
  const dest = path.join(out, "models", "environment", "velocity");
  mkdirSync(dest, { recursive: true });
  cpSync(mapSrc, path.join(dest, "la-gangwar.glb"));
}

// Toon RTS cursors (grudge-creator pack)
const cursorsSrc = path.join(arcade, "public", "cursors");
if (existsSync(cursorsSrc)) {
  cpSync(cursorsSrc, path.join(out, "cursors"), { recursive: true });
}

// UI pack
const uiOut = path.join(out, "ui");
mkdirSync(uiOut, { recursive: true });
for (const f of ["index.html", "velocity-ui.css", "pack.json"]) {
  const p = path.join(uiSrc, f);
  if (existsSync(p)) cpSync(p, path.join(uiOut, f));
}

// Strip huge non-cruise GLBs (Pages 25MB limit)
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.size > 24 * 1024 * 1024) {
      console.log("strip", p, (st.size / 1024 / 1024).toFixed(1) + "MB");
      unlinkSync(p);
    }
  }
}
walk(out);

// Fleet redirects — do NOT splat static assets (cursors, models, assets).
// SPA catch-all still rewrites MISSING /assets/*.js → index.html unless
// functions/_middleware.js converts that HTML response into a real 404.
writeFileSync(
  path.join(out, "_redirects"),
  `# Velocity live browser game — REST proxy (CF Pages 200 rewrite)
/api/health  https://grudge-api-production-0d46.up.railway.app/api/health  200
/api/characters  https://grudge-api-production-0d46.up.railway.app/api/characters  200
/api/characters/*  https://grudge-api-production-0d46.up.railway.app/api/characters/:splat  200
/api/account  https://grudge-api-production-0d46.up.railway.app/api/account  200
/api/account/*  https://grudge-api-production-0d46.up.railway.app/api/account/:splat  200
/api/wallet  https://grudge-api-production-0d46.up.railway.app/api/wallet  200
/api/wallet/*  https://grudge-api-production-0d46.up.railway.app/api/wallet/:splat  200
/api/inventory  https://grudge-api-production-0d46.up.railway.app/api/inventory  200
/api/inventory/*  https://grudge-api-production-0d46.up.railway.app/api/inventory/:splat  200
/api/auth/puter  https://grudge-api-production-0d46.up.railway.app/api/auth/puter  200
/api/auth/*  https://grudge-api-production-0d46.up.railway.app/api/auth/:splat  200
/login  https://id.grudge-studio.com/login  200
/foundry  https://character.grudge-studio.com/  302
/heroes  https://character.grudge-studio.com/  302
/ui  /ui/index.html  200
/ui/  /ui/index.html  200
# SPA fallback for client routes (middleware blocks static-ext HTML spoof)
/  /index.html  200
/*  /index.html  200
`,
  "utf8",
);

writeFileSync(
  path.join(out, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

# Always fetch fresh entry after SSO (?play=1&sso_token=…) — never pin old chunk map
/
  Cache-Control: no-store, no-cache, must-revalidate, max-age=0
  Pragma: no-cache

/index.html
  Cache-Control: no-store, no-cache, must-revalidate, max-age=0
  Pragma: no-cache

/cruise.html
  Cache-Control: no-store, no-cache, must-revalidate, max-age=0

# Hashed Vite chunks — immutable only when the file actually exists
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/models/*
  Cache-Control: public, max-age=86400
`,
  "utf8",
);

// Pages Function: reject SPA-HTML masquerading as .js/.css/etc (MIME fix)
const functionsSrc = path.join(arcade, "functions");
if (!existsSync(path.join(functionsSrc, "_middleware.js"))) {
  console.warn("WARN: functions/_middleware.js missing — SPA will still HTML-fallback missing .js");
}

// 3) Deploy — wrangler 4.x auto-bundles ./functions next to cwd (no --functions-directory)
if (existsSync(functionsSrc)) {
  console.log("functions:", functionsSrc, "(auto-detected by wrangler pages deploy)");
}
run("npx", ["wrangler", "pages", "deploy", out, "--project-name=grudge-velocity", "--branch=main"]);

console.log("\nLive: https://grudge-velocity.pages.dev/");
console.log("Map CDN:", "https://assets.grudge-studio.com/models/environment/velocity/la-gangwar.glb");
console.log("REST:", "https://grudge-api-production-0d46.up.railway.app (proxied via /api/*)");
console.log("Room:", "wss://grudox.grudge-studio.com/api/drive");
