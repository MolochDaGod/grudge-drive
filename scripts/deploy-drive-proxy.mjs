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
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "_drive_proxy_out");

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
    {
      source: "/(.*)",
      destination: "https://grudge-velocity.pages.dev/$1",
    },
  ],
};

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "vercel.json"), JSON.stringify(vercelJson, null, 2));
// No index.html — rewrites must own every path
writeFileSync(path.join(out, ".gitkeep"), "");

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
