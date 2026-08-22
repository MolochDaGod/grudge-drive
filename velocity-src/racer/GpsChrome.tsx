/** World GPS arrow + tiny radar. Uses Cruise HUD x/z/yaw vs campaign POI. */
import { gpsBearingDeg, gpsDist } from "./campaign";

export function GpsChrome(props: {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  target: { x: number; z: number; name: string; accent: string } | null;
}) {
  if (!props.target) return null;
  const br = gpsBearingDeg(props.playerX, props.playerZ, props.playerYaw, props.target.x, props.target.z);
  const dist = gpsDist(props.playerX, props.playerZ, props.target.x, props.target.z);
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 25,
        display: "flex",
        gap: 10,
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.55)",
          border: `2px solid ${props.target.accent}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderBottom: `18px solid ${props.target.accent}`,
            transform: `rotate(${br}deg)`,
          }}
        />
      </div>
      <div
        style={{
          background: "rgba(0,0,0,0.55)",
          padding: "6px 10px",
          borderRadius: 8,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {props.target.name} · {Math.round(dist)} m
      </div>
    </div>
  );
}
