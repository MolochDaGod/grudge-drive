/**
 * GTA-style phone overlay. M / ↑ toggled from launcher.
 */
import { COUSIN_CALL, STREET_JOBS, type CampaignBeat } from "./campaign";

type App = "home" | "cousin" | "jobs" | "gps";

export function StreetPhone(props: {
  open: boolean;
  app: App;
  beat: CampaignBeat;
  onApp: (a: App) => void;
  onClose: () => void;
  onHangCousin: () => void;
  onGotoShop: () => void;
  onGotoCousin: () => void;
}) {
  if (!props.open) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 18,
        bottom: 18,
        zIndex: 40,
        width: 280,
        borderRadius: 28,
        background: "#11161c",
        border: "4px solid #222",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        color: "#e8eef4",
        fontFamily: "Inter, system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      <div style={{ height: 18, background: "#000" }} />
      <div style={{ padding: 14, minHeight: 320 }}>
        {props.app === "home" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(["cousin", "jobs", "gps"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => props.onApp(a)}
                style={{
                  height: 88,
                  borderRadius: 16,
                  border: "none",
                  background: a === "cousin" ? "#1b3d2a" : "#1c2430",
                  color: "#fff",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  fontSize: 12,
                }}
              >
                {a}
              </button>
            ))}
          </div>
        )}
        {props.app === "cousin" && (
          <div>
            <div style={{ fontSize: 11, color: "#9dff00" }}>INCOMING · {COUSIN_CALL.from}</div>
            {COUSIN_CALL.lines.map((l) => (
              <p key={l} style={{ marginTop: 10, fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>
                {l}
              </p>
            ))}
            <button
              type="button"
              onClick={props.onHangCousin}
              style={{
                marginTop: 16,
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "none",
                background: "#c62828",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              End call
            </button>
          </div>
        )}
        {props.app === "jobs" && (
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>OPEN WORLD</div>
            {STREET_JOBS.map((j) => (
              <div
                key={j.id}
                style={{
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: 10,
                  background: "#1c2430",
                }}
              >
                <div style={{ fontWeight: 800 }}>{j.title}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{j.blurb}</div>
                <div style={{ fontSize: 12, color: "#a3e635" }}>${j.pay}</div>
              </div>
            ))}
          </div>
        )}
        {props.app === "gps" && (
          <div>
            <button
              type="button"
              onClick={props.onGotoShop}
              style={{
                width: "100%",
                padding: 12,
                marginBottom: 8,
                borderRadius: 10,
                border: "none",
                background: "#ffca28",
                fontWeight: 800,
              }}
            >
              Midnight Tune
            </button>
            <button
              type="button"
              onClick={props.onGotoCousin}
              disabled={props.beat !== "cousin_ready" && props.beat !== "cousin_race"}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "none",
                background:
                  props.beat === "cousin_ready" || props.beat === "cousin_race"
                    ? "#ff5a36"
                    : "#333",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Cousin's lot
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => (props.app === "home" ? props.onClose() : props.onApp("home"))}
        style={{
          display: "block",
          width: 48,
          height: 48,
          margin: "0 auto 12px",
          borderRadius: "50%",
          border: "2px solid #444",
          background: "#222",
          color: "#888",
        }}
      >
        ●
      </button>
    </div>
  );
}
