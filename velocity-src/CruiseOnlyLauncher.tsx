/**
 * Velocity production shell — Three.js open world + Grudge ID / Foundry 4-slot.
 *
 * Flow:
 *  boot → capture token → load 4 heroes → garage (login + slots)
 *  → START immediately mounts CruiseGame (WebGL scene + LA map)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CruiseGame } from "./CruiseGame";
import { CruiseHud } from "./CruiseHud";
import { emptyCruiseHud, type CruiseConfig, type CruiseHudState } from "./cruise";
import { resolveDriveWsUrl } from "./driveNetClient";
import { CARS, STARTER_CARS, getCar } from "./cars";
import { CHARACTERS, getCharacter } from "./characters";
import { getPaint } from "./garage";
import {
  defaultGarage,
  loadGarage,
  saveGarage,
  type GarageState,
} from "./garageStateLocal";
import {
  crestDriverOptions,
  loadFleetDriverOptions,
  readUrlCharacterId,
  readUrlCharacterName,
  resolveDriverLook,
  type FleetDriverOption,
} from "./fleetDriver";
import {
  introPosterUrl,
  introVideoUrl,
  loadVelocityManifest,
  vehicleUrl,
} from "./velocityLibrary";
import { probeVelocityLiveLoad, FLEET, type LoadProbe } from "./fleetConfig";
import {
  clearSession,
  ensureFleetSession,
  foundryCreateUrl,
  foundryHeroesUrl,
  getSessionToken,
  getStoredUsername,
  probeAuthAccount,
  setActiveCharacterId,
  velocityLoginUrl,
} from "./fleetAuth";

type Phase = "boot" | "intro" | "garage" | "cruise";

const btn = (active: boolean, accent = "#22d3ee"): React.CSSProperties => ({
  borderRadius: 8,
  border: `1px solid ${active ? accent : "rgba(255,255,255,0.15)"}`,
  background: active ? `${accent}22` : "rgba(255,255,255,0.05)",
  padding: "10px 14px",
  fontSize: 14,
  minWidth: 120,
  textAlign: "left" as const,
});

const SLOT_COUNT = 4;

export function CruiseOnlyLauncher() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<CruiseGame | null>(null);
  const startedRef = useRef(false);
  const [garage, setGarage] = useState<GarageState>(() => loadGarage() ?? defaultGarage());
  const [phase, setPhase] = useState<Phase>("boot");
  const [hud, setHud] = useState<CruiseHudState>(() => emptyCruiseHud());
  const [bootMsg, setBootMsg] = useState("Booting Three.js world…");
  const [fleetDrivers, setFleetDrivers] = useState<FleetDriverOption[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);
  const [loadProbes, setLoadProbes] = useState<LoadProbe[]>([]);
  const [liveReady, setLiveReady] = useState(false);
  const [authLabel, setAuthLabel] = useState<string>("guest");
  const [authOk, setAuthOk] = useState(false);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [autoPlayArmed, setAutoPlayArmed] = useState(false);

  // ── Boot: token → stack probe → roster → garage / auto-play ─────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFleetSession();
      const urlId = readUrlCharacterId();
      const urlName = readUrlCharacterName();
      const qs = new URLSearchParams(window.location.search);
      const wantAuto =
        qs.get("play") === "1" ||
        qs.get("auto") === "1" ||
        qs.get("skipIntro") === "1" ||
        !!urlId ||
        sessionStorage.getItem("velocity_auto_play") === "1";

      setBootMsg("Checking Grudge ID session…");
      const token = getSessionToken();
      if (token) {
        const acct = await probeAuthAccount();
        if (cancelled) return;
        if (acct.ok) {
          setAuthOk(true);
          setAuthLabel(acct.username || acct.grudgeId || "signed in");
        } else {
          setAuthOk(false);
          setAuthLabel(acct.detail);
        }
      } else {
        setAuthOk(false);
        setAuthLabel("not signed in");
      }

      setBootMsg("Probing live stack (CDN · REST · room)…");
      const probe = await probeVelocityLiveLoad((p) => {
        if (cancelled) return;
        setLoadProbes((prev) => {
          const rest = prev.filter((x) => x.id !== p.id);
          return [...rest, p];
        });
        setBootMsg(`${p.ok ? "✓" : "✗"} ${p.id} · ${p.detail} (${p.ms}ms)`);
      });
      if (cancelled) return;
      setLiveReady(probe.ok);

      setBootMsg("Loading Velocity CDN library…");
      try {
        const man = await loadVelocityManifest();
        if (!cancelled && man) {
          setLibraryReady(true);
          setBootMsg(`Library v${man.version} · ${man.vehicles.length} cars`);
        }
      } catch {
        if (!cancelled) setBootMsg("CDN offline — procedural fallback OK");
      }

      setBootMsg("Loading account 4-slot voxel heroes…");
      try {
        const tokenNow = getSessionToken();
        const fleet = tokenNow ? await loadFleetDriverOptions(tokenNow) : [];
        if (cancelled) return;
        setFleetDrivers(fleet);
        if (fleet.length) {
          setAuthOk(true);
          setBootMsg(`Loaded ${fleet.length}/4 account heroes`);
        } else if (tokenNow) {
          setBootMsg("Signed in — no heroes yet. Create in Foundry (4 slots).");
        }
        if (urlId) {
          setActiveCharacterId(urlId);
          setGarage((g) => {
            const next = {
              ...g,
              driverId: `fleet:${urlId}`,
              driverName: urlName || g.driverName || "Hero",
            };
            saveGarage(next);
            return next;
          });
        } else if (fleet[0]) {
          setActiveCharacterId(fleet[0]!.characterId || null);
          setGarage((g) => {
            if (g.driverId?.startsWith("fleet:") && fleet.some((f) => f.id === g.driverId)) return g;
            const next = { ...g, driverId: fleet[0]!.id, driverName: fleet[0]!.name };
            saveGarage(next);
            return next;
          });
        }
      } catch {
        /* guest crest */
      }

      if (cancelled) return;

      // Skip cinematic intro unless first visit without skip
      const skipIntro =
        wantAuto ||
        qs.get("skipIntro") === "1" ||
        sessionStorage.getItem("velocity_intro_seen") === "1";

      if (wantAuto) {
        setAutoPlayArmed(true);
        setPhase("garage");
      } else if (skipIntro) {
        setPhase("garage");
      } else {
        setPhase("intro");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishIntro = () => {
    try {
      sessionStorage.setItem("velocity_intro_seen", "1");
    } catch {
      /* ignore */
    }
    setPhase("garage");
  };

  const car = useMemo(
    () => getCar(garage.carId) ?? STARTER_CARS[0] ?? CARS[0]!,
    [garage.carId],
  );
  const driver = useMemo(
    () => getCharacter(garage.driverId) ?? CHARACTERS[0],
    [garage.driverId],
  );

  const startCruise = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      setWorldError("Scene container missing — hard refresh the page.");
      return;
    }
    if (startedRef.current && gameRef.current) {
      setPhase("cruise");
      return;
    }
    setWorldError(null);
    setBootMsg("Spawning Three.js open world (LA Gangwar)…");
    setPhase("boot");
    requestAnimationFrame(() => {
      try {
        gameRef.current?.dispose();
        gameRef.current = null;

        const resolved = resolveDriverLook(garage.driverId, fleetDrivers);
        const paint = getPaint(garage.paintId)?.color;
        const cfg: CruiseConfig = {
          carName: car.name,
          driverName: garage.driverName || resolved.name || driver?.name || "Driver",
          carAccent: paint || resolved.accent || car.color || "#9dff00",
          characterId: garage.driverId.startsWith("fleet:")
            ? garage.driverId.slice(6)
            : null,
          driverLook: resolved.look ?? driver?.look,
          multiplayerUrl: resolveDriveWsUrl(),
        };

        const game = new CruiseGame(el, setHud, cfg);
        gameRef.current = game;
        startedRef.current = true;
        game.start();
        setPhase("cruise");
        try {
          sessionStorage.setItem("velocity_auto_play", "1");
        } catch {
          /* ignore */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[velocity] CruiseGame start failed", e);
        setWorldError(msg);
        setPhase("garage");
        startedRef.current = false;
      }
    });
  }, [car, garage, driver, fleetDrivers]);

  // Auto-play once garage is ready and armed (URL ?play=1 / characterId / return)
  useEffect(() => {
    if (phase === "garage" && autoPlayArmed && !startedRef.current) {
      setAutoPlayArmed(false);
      // Small delay so container paints
      const t = window.setTimeout(() => startCruise(), 80);
      return () => clearTimeout(t);
    }
  }, [phase, autoPlayArmed, startCruise]);

  useEffect(
    () => () => {
      gameRef.current?.dispose();
      gameRef.current = null;
      startedRef.current = false;
    },
    [],
  );

  const pickDriver = (id: string, name?: string) => {
    if (id.startsWith("fleet:")) setActiveCharacterId(id.slice(6));
    setGarage((g) => {
      const next = { ...g, driverId: id, driverName: name || g.driverName };
      saveGarage(next);
      return next;
    });
  };

  const pickCar = (id: string) => {
    setGarage((g) => {
      const next = { ...g, carId: id };
      saveGarage(next);
      return next;
    });
  };

  const backGarage = () => {
    gameRef.current?.dispose();
    gameRef.current = null;
    startedRef.current = false;
    setPhase("garage");
    setHud(emptyCruiseHud());
  };

  const goLogin = () => {
    // Always return to drive.grudge-studio.com in production (not pages.dev origin)
    window.location.href = velocityLoginUrl();
  };

  const goFoundry = () => {
    window.location.href = foundryHeroesUrl();
  };

  const goCreate = () => {
    window.location.href = foundryCreateUrl();
  };

  const signOutLocal = () => {
    clearSession();
    setAuthOk(false);
    setAuthLabel("not signed in");
    setFleetDrivers([]);
  };

  // Pad to 4 Foundry slots for UI
  const slots: (FleetDriverOption | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    slots.push(fleetDrivers[i] ?? null);
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#05080f",
        color: "#fff",
      }}
    >
      {/* Three.js mount — always present so WebGL can attach */}
      <div
        ref={containerRef}
        id="velocity-scene"
        style={{ position: "absolute", inset: 0, zIndex: 0 }}
      />

      {phase === "boot" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.88)",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 440, padding: 16 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.4em",
                color: "#22d3ee",
                textTransform: "uppercase",
              }}
            >
              Velocity
            </div>
            <h1 style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
              Deploying 3D world…
            </h1>
            <p style={{ marginTop: 16, fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              {bootMsg}
            </p>
            {loadProbes.length > 0 && (
              <ul
                style={{
                  marginTop: 14,
                  textAlign: "left",
                  fontSize: 11,
                  listStyle: "none",
                  padding: 0,
                }}
              >
                {loadProbes.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      marginBottom: 4,
                      color: p.ok ? "rgba(163,230,53,0.85)" : "rgba(255,90,54,0.9)",
                    }}
                  >
                    {p.ok ? "✓" : "✗"} {p.id} — {p.detail}
                  </li>
                ))}
              </ul>
            )}
            {libraryReady && (
              <p style={{ marginTop: 8, fontSize: 11, color: "rgba(34,211,238,0.7)" }}>
                {FLEET.mapGlb.split("/").slice(-2).join("/")} · meshopt
              </p>
            )}
          </div>
        </div>
      )}

      {phase === "intro" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 25,
            background: "#05080f",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            autoPlay
            muted
            playsInline
            poster={introPosterUrl()}
            src={introVideoUrl()}
            onEnded={finishIntro}
            onError={finishIntro}
            style={{
              width: "min(960px, 100%)",
              maxHeight: "70vh",
              objectFit: "contain",
              borderRadius: 12,
            }}
          />
          <button
            type="button"
            onClick={finishIntro}
            style={{
              marginTop: 16,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            Skip · Enter garage
          </button>
        </div>
      )}

      {phase === "garage" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            padding: 24,
            background: "linear-gradient(180deg,#0a1020,#05080f 40%,#000)",
          }}
        >
          <header style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.35em",
                color: "#22d3ee",
                textTransform: "uppercase",
              }}
            >
              GRUDOX · Velocity {liveReady ? "· stack OK" : "· stack warn"}
            </div>
            <h1 style={{ marginTop: 4, fontSize: 30, fontWeight: 900 }}>
              LA Streets · Open World
            </h1>
            <p style={{ marginTop: 4, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
              Login → pick your Ethereal Falls hero (4 slots) → deploy Three.js scene
            </p>
          </header>

          {/* Auth strip */}
          <section
            style={{
              marginBottom: 20,
              padding: 14,
              borderRadius: 12,
              border: "1px solid rgba(34,211,238,0.35)",
              background: "rgba(0,20,30,0.55)",
              maxWidth: 560,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: authOk ? "#a3e635" : "rgba(255,255,255,0.55)" }}>
                {authOk ? `✓ ${authLabel}` : `○ ${authLabel}`}
              </span>
              {!authOk ? (
                <button
                  type="button"
                  onClick={goLogin}
                  style={{
                    ...btn(true, "#a3e635"),
                    fontWeight: 800,
                    background: "linear-gradient(90deg,#06b6d4,#a3e635)",
                    color: "#000",
                    border: "none",
                  }}
                >
                  Login (Grudge ID)
                </button>
              ) : (
                <button type="button" style={btn(false)} onClick={signOutLocal}>
                  Sign out (this device)
                </button>
              )}
              <button type="button" style={btn(false, "#f472b6")} onClick={goFoundry}>
                My Heroes · Foundry
              </button>
              <button type="button" style={btn(false)} onClick={goCreate}>
                Create hero
              </button>
            </div>
            <p style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              Characters load from Railway after login. Empty slots open Character Foundry
              (character.grudge-studio.com) then return here with characterId.
            </p>
          </section>

          {/* 4-slot Foundry heroes */}
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ marginBottom: 10, fontSize: 14, fontWeight: 600 }}>
              Your 4 heroes (Ethereal Falls / Foundry)
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {slots.map((slot, i) =>
                slot ? (
                  <button
                    key={slot.id}
                    type="button"
                    style={btn(garage.driverId === slot.id, slot.accent)}
                    onClick={() => pickDriver(slot.id, slot.name)}
                  >
                    <div style={{ fontWeight: 700 }}>{slot.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{slot.perkLabel}</div>
                  </button>
                ) : (
                  <button
                    key={`empty-${i}`}
                    type="button"
                    style={{
                      ...btn(false),
                      borderStyle: "dashed",
                      opacity: 0.75,
                    }}
                    onClick={goCreate}
                  >
                    <div style={{ fontWeight: 700 }}>Slot {i + 1} empty</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>Create in Foundry →</div>
                  </button>
                ),
              )}
            </div>
            {!authOk && fleetDrivers.length === 0 && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#fbbf24" }}>
                Login required to load your Foundry roster. Guest crest drivers still work below.
              </p>
            )}
          </section>

          <section style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
              Guest crest drivers
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {crestDriverOptions().map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={btn(garage.driverId === c.id)}
                  onClick={() => pickDriver(c.id, c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Car</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(STARTER_CARS.length ? STARTER_CARS : CARS).slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  style={btn(garage.carId === c.id, "#a3e635")}
                  onClick={() => pickCar(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <p style={{ marginTop: 6, fontSize: 11, color: "rgba(34,211,238,0.65)" }}>
              {vehicleUrl(car.assetId) ? "car CDN ready" : "procedural car"} ·{" "}
              {libraryReady ? "manifest live" : "manifest fallback"}
            </p>
          </section>

          {worldError && (
            <p style={{ color: "#f87171", marginBottom: 12, fontSize: 13 }}>
              Scene failed: {worldError}
            </p>
          )}

          <button
            type="button"
            onClick={startCruise}
            style={{
              alignSelf: "flex-start",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(90deg,#06b6d4,#a3e635)",
              color: "#000",
              padding: "16px 36px",
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "0.04em",
            }}
          >
            DEPLOY 3D WORLD →
          </button>
          <p style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Mounts WebGL · loads LA Gangwar (CDN meshopt) · NPCs · wss /api/drive
          </p>
        </div>
      )}

      {phase === "cruise" && (
        <CruiseHud state={hud} game={gameRef.current} onGarage={backGarage} onExit={backGarage} />
      )}
    </div>
  );
}

export default CruiseOnlyLauncher;
