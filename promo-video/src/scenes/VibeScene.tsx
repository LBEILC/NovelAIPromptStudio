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

export const VibeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <CanvasImage
        name="Vibe solution background"
        src={staticFile("assets/hero.webp")}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.34,
          filter: "blur(5px) saturate(0.7)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.05, 1.01], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 73% 40%, rgba(54,143,255,0.18), transparent 35%), linear-gradient(90deg, rgba(2,6,14,0.97), rgba(2,6,14,0.61) 56%, rgba(2,6,14,0.88))" }} />
      <Interactive.Div
        name="Vibe solution headline"
        style={{
          position: "absolute",
          left: 96,
          top: 125,
          width: 760,
          fontSize: 76,
          lineHeight: 1.13,
          fontWeight: 850,
          letterSpacing: -3,
          opacity: interpolate(frame, [12, 38], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [12, 38], ["-32px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        读取内嵌 Vibe
        <br />
        恢复参数并导出
      </Interactive.Div>
      <Interactive.Div
        name="Embedded Vibe card"
        style={{
          position: "absolute",
          right: 100,
          top: 145,
          width: 760,
          padding: "32px 36px 34px",
          borderRadius: 28,
          background: "rgba(7,15,28,0.93)",
          border: "1px solid rgba(104,181,255,0.4)",
          boxShadow: "0 34px 120px rgba(0,62,150,0.35)",
          opacity: interpolate(frame, [28, 60], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [28, 60], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#83c4ff", fontSize: 22, fontWeight: 850, letterSpacing: 1.4 }}>EMBEDDED VIBE</div>
            <div style={{ marginTop: 8, fontSize: 43, fontWeight: 850 }}>Vibe 1</div>
          </div>
          <div style={{ padding: "9px 14px", borderRadius: 999, background: "rgba(68,165,255,0.16)", color: "#9dd1ff", fontSize: 21, fontWeight: 750 }}>NovelAI V4.5</div>
        </div>
        <div style={{ height: 1, margin: "24px 0", background: "rgba(135,184,237,0.18)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 17 }}>
          <div style={{ padding: 20, borderRadius: 17, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ color: "rgba(208,227,248,0.62)", fontSize: 20 }}>Reference Strength</div>
            <div style={{ marginTop: 8, fontSize: 37, fontWeight: 850 }}>0.60</div>
          </div>
          <div style={{ padding: 20, borderRadius: 17, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ color: "rgba(208,227,248,0.62)", fontSize: 20 }}>Information Extracted</div>
            <div style={{ marginTop: 8, fontSize: 37, fontWeight: 850 }}>0.75</div>
          </div>
        </div>
        <Interactive.Div
          name="Vibe export action"
          style={{
            marginTop: 20,
            padding: "17px 22px",
            borderRadius: 15,
            textAlign: "center",
            background: "linear-gradient(135deg,#5eb1ff,#318fff)",
            color: "#03101d",
            fontSize: 26,
            fontWeight: 900,
            opacity: interpolate(frame, [74, 100], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          导出 .naiv4vibe 文件
        </Interactive.Div>
      </Interactive.Div>
      <Interactive.Div
        name="Local data promise"
        style={{
          position: "absolute",
          left: 98,
          top: 455,
          width: 650,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          opacity: interpolate(frame, [125, 155], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [125, 155], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ padding: "25px 24px", borderRadius: 20, background: "rgba(7,16,29,0.9)", border: "1px solid rgba(83,200,168,0.3)" }}>
          <div style={{ color: "#76dfbd", fontSize: 25, fontWeight: 850 }}>本地保存</div>
          <div style={{ marginTop: 9, color: "rgba(221,234,249,0.68)", fontSize: 21 }}>整理数据不离开设备</div>
        </div>
        <div style={{ padding: "25px 24px", borderRadius: 20, background: "rgba(7,16,29,0.9)", border: "1px solid rgba(104,181,255,0.3)" }}>
          <div style={{ color: "#8bc9ff", fontSize: 25, fontWeight: 850 }}>原图只读</div>
          <div style={{ marginTop: 9, color: "rgba(221,234,249,0.68)", fontSize: 21 }}>不会改写原始图片</div>
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
