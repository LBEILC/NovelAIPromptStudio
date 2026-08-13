import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { ProductBackground } from "../components/ProductBackground";

export const VibePainScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ color: "white", overflow: "hidden" }}>
      <ProductBackground />
      <Interactive.Div
        name="Vibe pain title"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 95,
          textAlign: "center",
          fontSize: 72,
          lineHeight: 1.16,
          fontWeight: 850,
          letterSpacing: -2.5,
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        重新拖入图片，也还原不了完整的 Vibe
      </Interactive.Div>
      <Interactive.Div
        name="Generated image source"
        style={{
          position: "absolute",
          left: 165,
          top: 290,
          width: 450,
          height: 470,
          padding: 18,
          borderRadius: 28,
          background: "rgba(8,16,29,0.88)",
          border: "1px solid rgba(112,178,247,0.3)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.4)",
          opacity: interpolate(frame, [22, 50], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [22, 50], ["-30px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <CanvasImage
          name="Generated image preview"
          src={staticFile("assets/gallery-groups.webp")}
          style={{ width: 414, height: 355, objectFit: "cover", objectPosition: "73% 36%", borderRadius: 18 }}
        />
        <div style={{ paddingTop: 16, textAlign: "center", fontSize: 27, fontWeight: 800 }}>生成图片</div>
      </Interactive.Div>
      <Interactive.Div
        name="Drag back arrow"
        style={{
          position: "absolute",
          left: 705,
          top: 460,
          width: 430,
          textAlign: "center",
          color: "#8cc9ff",
          fontSize: 30,
          fontWeight: 800,
          opacity: interpolate(frame, [58, 86], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        拖回 NovelAI
        <div style={{ marginTop: 17, height: 4, borderRadius: 999, background: "linear-gradient(90deg, rgba(89,170,255,0.15), #5daeff)" }} />
        <div style={{ marginTop: -21, textAlign: "right", fontSize: 42 }}>›</div>
      </Interactive.Div>
      <Interactive.Div
        name="Incomplete restore result"
        style={{
          position: "absolute",
          right: 165,
          top: 330,
          width: 500,
          padding: "34px 38px",
          borderRadius: 28,
          background: "rgba(8,16,29,0.9)",
          border: "1px solid rgba(255,117,133,0.34)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.42)",
          opacity: interpolate(frame, [92, 122], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [92, 122], ["30px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ fontSize: 31, fontWeight: 850, marginBottom: 26 }}>恢复结果</div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "17px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 27 }}>
          <span>Prompt</span><span style={{ color: "#7fe0be", fontWeight: 850 }}>已读取 ✓</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "22px 0 8px", fontSize: 27 }}>
          <span>Vibe</span><span style={{ color: "#ff8f9d", fontWeight: 850 }}>未恢复 ✕</span>
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
