/**
 * Velocity / Houston Cruise asset library SSOT.
 *
 * Production binaries live on R2 via assets.grudge-studio.com.
 * D1 registry (api.grudge-studio.com/assets) indexes the same r2Keys.
 * Never invent paths — resolve through this module or the CDN manifest.
 */

export const VELOCITY_CDN = "https://assets.grudge-studio.com";
export const VELOCITY_MANIFEST_URL = `${VELOCITY_CDN}/games/velocity/manifest.json`;
export const VELOCITY_API_ASSETS = "https://api.grudge-studio.com/assets";

/** Catalog assetId → R2 key (under models/vehicles/). */
export const VELOCITY_VEHICLE_R2: Record<string, string> = {
  "vehicles/minecraft-car": "models/vehicles/minecraft-car.glb",
  "vehicles/datsun-240z": "models/vehicles/datsun-240z.glb",
  "vehicles/nsx-voxel": "models/vehicles/nsx-voxel.glb",
  "vehicles/bmw-m3-gtr": "models/vehicles/bmw-m3-gtr.glb",
  "vehicles/skyline-r34": "models/vehicles/skyline-r34.glb",
  "vehicles/street-racer": "models/vehicles/street-racer.glb",
  "vehicles/challenger-srt": "models/vehicles/challenger-srt.glb",
  "vehicles/racing-car": "models/vehicles/racing-car.glb",
  "vehicles/porsche-911": "models/vehicles/porsche-911.glb",
  "vehicles/police-car": "models/vehicles/police-car.glb",
  "vehicles/toyota-supra": "models/vehicles/toyota-supra.glb",
  "vehicles/subaru-22b": "models/vehicles/subaru-22b.glb",
  "vehicles/challenger-widebody": "models/vehicles/challenger-widebody.glb",
};

/** Environment / media keys. */
export const VELOCITY_ENV_R2 = {
  cityRoadNetwork: "models/environment/city-road-network.glb",
  roadStreetLights: "models/environment/road-street-lights-voxel.glb",
  voxelStreet: "models/environment/voxel-street.glb",
  /** LA GANGWAR SIMULATOR 3D (CC-BY-4.0) — production cruise world shell */
  laGangwar: "models/environment/velocity/la-gangwar.glb",
  introVideo: "media/velocity/drive-grudge.mp4",
  introPoster: "media/velocity/drive-grudge-poster.jpg",
  manifest: "games/velocity/manifest.json",
  /** UI pack export (ui.grudge-studio.com / CDN) */
  uiPack: "games/velocity/ui/pack.json",
  uiCss: "games/velocity/ui/velocity-ui.css",
  uiShowcase: "games/velocity/ui/index.html",
} as const;

/** Canonical UI export URLs (fleet CDN). */
export function velocityUiUrls() {
  return {
    showcase: cdnUrl(VELOCITY_ENV_R2.uiShowcase),
    css: cdnUrl(VELOCITY_ENV_R2.uiCss),
    pack: cdnUrl(VELOCITY_ENV_R2.uiPack),
    uiStudioPath: "https://ui.grudge-studio.com/velocity/",
  };
}

export function cdnUrl(r2Key: string): string {
  const key = r2Key.replace(/^\/+/, "");
  return `${VELOCITY_CDN}/${key}`;
}

export function vehicleUrl(assetId: string): string | null {
  const key = VELOCITY_VEHICLE_R2[assetId];
  return key ? cdnUrl(key) : null;
}

export function introVideoUrl(): string {
  return cdnUrl(VELOCITY_ENV_R2.introVideo);
}

export function introPosterUrl(): string {
  return cdnUrl(VELOCITY_ENV_R2.introPoster);
}

/** Magic-byte check: reject HTML fake-200 from CDN. */
export async function assertRealAsset(
  url: string,
  expect: "glb" | "mp4" | "json" | "jpg" = "glb",
): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) return false;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 12) return false;
    const head = new TextDecoder().decode(buf.slice(0, 16));
    if (head.includes("<!DOCTYPE") || head.includes("<html")) return false;
    if (expect === "glb") {
      return buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46;
    }
    if (expect === "mp4") {
      // ftyp box at offset 4
      return (
        buf[4] === 0x66 &&
        buf[5] === 0x74 &&
        buf[6] === 0x79 &&
        buf[7] === 0x70
      );
    }
    if (expect === "json") return head.trimStart().startsWith("{") || head.trimStart().startsWith("[");
    if (expect === "jpg") return buf[0] === 0xff && buf[1] === 0xd8;
    return true;
  } catch {
    return false;
  }
}

export type VelocityManifest = {
  version: number;
  game: "velocity" | "houston-cruise";
  updatedAt: string;
  cdn: string;
  vehicles: Array<{ assetId: string; r2Key: string; cdnUrl: string }>;
  media: Array<{ id: string; r2Key: string; cdnUrl: string; role: string }>;
  environment: Array<{ id: string; r2Key: string; cdnUrl: string }>;
  districts: string[];
};

let _manifest: VelocityManifest | null = null;

export async function loadVelocityManifest(
  force = false,
): Promise<VelocityManifest | null> {
  if (_manifest && !force) return _manifest;
  try {
    const r = await fetch(VELOCITY_MANIFEST_URL, { cache: "no-store" });
    if (!r.ok) return null;
    _manifest = (await r.json()) as VelocityManifest;
    return _manifest;
  } catch {
    return null;
  }
}

/** Build offline manifest (upload pipeline + fallback). */
export function buildLocalManifest(): VelocityManifest {
  const vehicles = Object.entries(VELOCITY_VEHICLE_R2).map(([assetId, r2Key]) => ({
    assetId,
    r2Key,
    cdnUrl: cdnUrl(r2Key),
  }));
  return {
    version: 1,
    game: "velocity",
    updatedAt: new Date().toISOString(),
    cdn: VELOCITY_CDN,
    vehicles,
    media: [
      {
        id: "drive-grudge-intro",
        r2Key: VELOCITY_ENV_R2.introVideo,
        cdnUrl: introVideoUrl(),
        role: "intro",
      },
      {
        id: "drive-grudge-poster",
        r2Key: VELOCITY_ENV_R2.introPoster,
        cdnUrl: introPosterUrl(),
        role: "poster",
      },
    ],
    environment: [
      {
        id: "la-gangwar",
        r2Key: VELOCITY_ENV_R2.laGangwar,
        cdnUrl: cdnUrl(VELOCITY_ENV_R2.laGangwar),
      },
      {
        id: "city-road-network",
        r2Key: VELOCITY_ENV_R2.cityRoadNetwork,
        cdnUrl: cdnUrl(VELOCITY_ENV_R2.cityRoadNetwork),
      },
      {
        id: "road-street-lights",
        r2Key: VELOCITY_ENV_R2.roadStreetLights,
        cdnUrl: cdnUrl(VELOCITY_ENV_R2.roadStreetLights),
      },
    ],
    districts: [
      "montrose",
      "eado",
      "midtown",
      "heights",
      "galleria",
      "energy",
      "ship",
      "katy",
    ],
  };
}
