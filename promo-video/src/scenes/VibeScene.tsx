import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { VoiceTrack } from "../components/VoiceTrack";

export const VibeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <CanvasImage
        name="Vibe workbench background"
        src={staticFile("assets/hero.webp")}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.4,
          filter: "blur(5px) saturate(0.7)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.05, 1.01], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <VoiceTrack asset="04-vibe.wav" from={15} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 72% 45%, rgba(54, 143, 255, 0.18), transparent 34%), linear-gradient(90deg, rgba(2, 6, 14, 0.96), rgba(2, 6, 14, 0.58) 55%, rgba(2, 6, 14, 0.86))",
        }}
      />
      <Interactive.Div
        name="Vibe headline"
        style={{
          position: "absolute",
          left: 96,
          top: 155,
          width: 780,
          fontSize: 82,
          lineHeight: 1.12,
          fontWeight: 850,
          letterSpacing: -3,
          opacity: interpolate(frame, [0.4 * fps, 1.25 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.4 * fps, 1.25 * fps], ["-34px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        图片里的 Vibe
        <br />
        也可以恢复出来
      </Interactive.Div>
      <Interactive.Div
        name="Vibe boundary note"
        style={{
          position: "absolute",
          left: 100,
          top: 390,
          width: 660,
          fontSize: 29,
          lineHeight: 1.65,
          color: "rgba(219, 234, 251, 0.74)",
          opacity: interpolate(frame, [1.15 * fps, 1.9 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        只读识别图片内嵌编码
        <br />
        不修改图片，也不重新计算 Vibe
      </Interactive.Div>
      <Interactive.Div
        name="Embedded Vibe card"
        style={{
          position: "absolute",
          right: 105,
          top: 185,
          width: 760,
          padding: "34px 38px 36px",
          borderRadius: 28,
          background: "rgba(7, 15, 28, 0.92)",
          border: "1px solid rgba(104, 181, 255, 0.4)",
          boxShadow: "0 34px 120px rgba(0, 62, 150, 0.35)",
          opacity: interpolate(frame, [0.8 * fps, 1.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0.8 * fps, 1.7 * fps], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#83c4ff", fontSize: 22, fontWeight: 800, letterSpacing: 1.4 }}>
              EMBEDDED VIBE
            </div>
            <div style={{ marginTop: 9, fontSize: 44, fontWeight: 850 }}>Vibe 1</div>
          </div>
          <div
            style={{
              padding: "9px 14px",
              borderRadius: 999,
              background: "rgba(68, 165, 255, 0.16)",
              color: "#9dd1ff",
              fontSize: 21,
              fontWeight: 750,
            }}
          >
            NovelAI V4.5
          </div>
        </div>
        <div style={{ height: 1, margin: "28px 0", background: "rgba(135, 184, 237, 0.18)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div style={{ padding: 22, borderRadius: 18, background: "rgba(255,255,255,0.035)" }}>
            <div style={{ color: "rgba(208, 227, 248, 0.62)", fontSize: 21 }}>Reference Strength</div>
            <div style={{ marginTop: 10, fontSize: 39, fontWeight: 850, color: "#f5f9ff" }}>0.60</div>
          </div>
          <div style={{ padding: 22, borderRadius: 18, background: "rgba(255,255,255,0.035)" }}>
            <div style={{ color: "rgba(208, 227, 248, 0.62)", fontSize: 21 }}>Information Extracted</div>
            <div style={{ marginTop: 10, fontSize: 39, fontWeight: 850, color: "#f5f9ff" }}>0.75</div>
          </div>
        </div>
        <Interactive.Div
          name="Export Vibe action"
          style={{
            marginTop: 22,
            padding: "18px 24px",
            borderRadius: 16,
            textAlign: "center",
            background: "linear-gradient(135deg, #5eb1ff, #318fff)",
            color: "#03101d",
            fontSize: 27,
            fontWeight: 900,
            opacity: interpolate(frame, [3.6 * fps, 4.5 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          导出 .naiv4vibe 文件
        </Interactive.Div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
