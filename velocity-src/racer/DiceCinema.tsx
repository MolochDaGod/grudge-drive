/**
 * Short street-dice cinema → car key → won line.
 * CSS beats (no second video host). Skip always available.
 */
import { useEffect, useState } from "react";
import { DICE_WIN_LINE } from "./campaign";

type Beat = "alley" | "roll" | "win" | "key" | "line";

const BEATS: { id: Beat; ms: number }[] = [
  { id: "alley", ms: 1800 },
  { id: "roll", ms: 2200 },
  { id: "win", ms: 1600 },
  { id: "key", ms: 1800 },
  { id: "line", ms: 0 },
];

export function DiceCinema(props: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const beat = BEATS[i]?.id ?? "line";

  useEffect(() => {
    const ms = BEATS[i]?.ms ?? 0;
    if (!ms) return;
    const t = window.setTimeout(() => setI((n) => Math.min(n + 1, BEATS.length - 1)), ms);
    return () => window.clearTimeout(t);
  }, [i]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        background: "radial-gradient(ellipse at 40% 60%, #3a1a12, #05080f 70%)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {beat === "alley" && (
        <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.04em" }}>
          Alley. Dice. Your people on the wall.
        </p>
      )}
      {beat === "roll" && (
        <div style={{ fontSize: 72, fontWeight: 900, animation: "none" }}>
          ⚄  →  ⚅
        </div>
      )}
      {beat === "win" && (
        <p style={{ fontSize: 28, fontWeight: 900, color: "#a3e635" }}>THEY PAID IN STEEL.</p>
      )}
      {beat === "key" && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 28,
              margin: "0 auto 16px",
              background: "linear-gradient(90deg,#ffd54a,#c9a227)",
              borderRadius: "4px 14px 14px 4px",
              boxShadow: "0 0 40px #ffca28",
              transform: "scale(1.4)",
            }}
          />
          <p style={{ opacity: 0.7, fontSize: 13 }}>zoom · car key</p>
        </div>
      )}
      {beat === "line" && (
        <div style={{ maxWidth: 520, textAlign: "center", padding: 24 }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.55)",
              padding: "18px 22px",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            {DICE_WIN_LINE}
          </div>
          <button
            type="button"
            onClick={props.onDone}
            style={{
              marginTop: 22,
              border: "none",
              background: "linear-gradient(90deg,#06b6d4,#a3e635)",
              color: "#000",
              fontWeight: 900,
              padding: "12px 28px",
              borderRadius: 10,
              fontSize: 15,
            }}
          >
            Pick the heap →
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={props.onDone}
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.3)",
          color: "#fff",
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        Skip
      </button>
    </div>
  );
}
