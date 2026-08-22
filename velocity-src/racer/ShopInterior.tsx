/**
 * Interior overlay for Midnight Tune — arcade garage catalog, not a second shop DB.
 */
import {
  PAINTS,
  STAT_KEYS,
  STAT_LABEL,
  TUNE_MAX,
  VISUAL_MODS,
  emptyTuning,
  getMod,
  getPaint,
  tuneCost,
  type CarTuning,
} from "./garage";
import type { GarageState } from "./garageStateLocal";

export function ShopInterior(props: {
  garage: GarageState;
  onChange: (g: GarageState) => void;
  onLeave: () => void;
}) {
  const g = props.garage;
  const tuning = g.tuning ?? emptyTuning();

  const buyTune = (k: keyof CarTuning) => {
    const lvl = tuning[k];
    if (lvl >= TUNE_MAX) return;
    const cost = tuneCost(lvl);
    if (g.currency < cost) return;
    const nextTune = { ...tuning, [k]: lvl + 1 };
    props.onChange({ ...g, currency: g.currency - cost, tuning: nextTune });
  };

  const buyPaint = (id: string) => {
    const p = getPaint(id);
    if (!p) return;
    const cost = id === "stock" ? 0 : 120;
    if (g.currency < cost) return;
    props.onChange({ ...g, paintId: id, currency: g.currency - cost });
  };

  const buyMod = (id: string) => {
    if (g.mods.includes(id)) return;
    const m = getMod(id);
    if (!m || g.currency < m.price) return;
    props.onChange({ ...g, mods: [...g.mods, id], currency: g.currency - m.price });
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 35,
        background: "linear-gradient(180deg,#1a1208,#0a0806)",
        color: "#f4e8d0",
        padding: 28,
        overflow: "auto",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: "0.3em", color: "#ffca28" }}>MIDNIGHT TUNE</div>
      <h1 style={{ margin: "6px 0 8px", fontSize: 28 }}>Learn the pile. Bolt something on.</h1>
      <p style={{ opacity: 0.75, maxWidth: 560 }}>
        Stock dice-win cars start at 0/5 tune. Buy speed, accel, grip. Paint is from the
        racing-game color idea — same garage catalog, not a second paint DB. Cash ${g.currency}.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 14 }}>TUNE (low → less junk)</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {STAT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => buyTune(k)}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid #5a4a20",
              background: "#2a1e0c",
              color: "#ffca28",
              fontWeight: 800,
            }}
          >
            {STAT_LABEL[k]} {tuning[k]}/{TUNE_MAX} · ${tuneCost(tuning[k])}
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 24, fontSize: 14 }}>PAINT</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PAINTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => buyPaint(p.id)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: g.paintId === p.id ? "2px solid #fff" : "1px solid #444",
              background: p.color || "#333",
              color: p.id === "stock" || p.id === "gold" ? "#111" : "#fff",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 24, fontSize: 14 }}>BOLT-ONS</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {VISUAL_MODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => buyMod(m.id)}
            disabled={g.mods.includes(m.id)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #444",
              background: g.mods.includes(m.id) ? "#1b3d2a" : "#222",
              color: "#fff",
            }}
          >
            {m.name} · ${m.price}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={props.onLeave}
        style={{
          marginTop: 32,
          padding: "14px 28px",
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(90deg,#06b6d4,#a3e635)",
          color: "#000",
          fontWeight: 900,
          fontSize: 16,
        }}
      >
        Roll out · streets
      </button>
    </div>
  );
}
