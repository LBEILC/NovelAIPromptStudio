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
import { ProductBackground } from "../components/ProductBackground";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ color: "white", overflow: "hidden" }}>
      <ProductBackground />
      <Interactive.Div
        name="GitHub project card"
        style={{
          position: "absolute",
          left: 250,
          right: 250,
          top: 105,
          padding: "34px 42px",
          borderRadius: 30,
          background: "rgba(7,16,29,0.9)",
          border: "1px solid rgba(112,181,252,0.32)",
          boxShadow: "0 34px 120px rgba(0,0,0,0.42)",
          display: "flex",
          alignItems: "center",
          gap: 32,
          opacity: interpolate(frame, [0, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0, 28], ["0px -24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ width: 112, height: 112, padding: 18, borderRadius: 26, background: "rgba(53,143,255,0.12)", border: "1px solid rgba(112,181,252,0.25)" }}>
          <CanvasImage name="Project icon" src={staticFile("assets/app-icon.svg")} style={{ width: 76, height: 76 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#8fc9ff", fontSize: 24, fontWeight: 850, letterSpacing: 1.4 }}>OPEN SOURCE ON GITHUB</div>
          <div style={{ marginTop: 8, fontSize: 53, fontWeight: 850, letterSpacing: -1.8 }}>NovelAI Prompt Studio</div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Repository link"
        style={{
          position: "absolute",
          left: 420,
          right: 420,
          top: 370,
          padding: "23px 28px",
          borderRadius: 19,
          textAlign: "center",
          background: "linear-gradient(135deg,#61b5ff,#318fff)",
          color: "#03101d",
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 29,
          fontWeight: 900,
          opacity: interpolate(frame, [36, 65], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [36, 65], [0.95, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        github.com/LBEILC/NovelAIPromptStudio
      </Interactive.Div>
      <Interactive.Div
        name="Link location note"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 485,
          textAlign: "center",
          color: "rgba(220,234,251,0.72)",
          fontSize: 31,
          fontWeight: 650,
          opacity: interpolate(frame, [62, 86], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        项目链接见简介与置顶评论
      </Interactive.Div>
      <Interactive.Div
        name="Download invitation"
        style={{
          position: "absolute",
          left: 305,
          top: 585,
          width: 600,
          padding: "29px 32px",
          borderRadius: 23,
          background: "rgba(8,18,32,0.9)",
          border: "1px solid rgba(93,190,160,0.28)",
          opacity: interpolate(frame, [130, 158], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [130, 158], ["-28px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ color: "#7ce1bf", fontSize: 34, fontWeight: 850 }}>欢迎下载试用</div>
        <div style={{ marginTop: 10, color: "rgba(220,234,251,0.68)", fontSize: 24 }}>免费开源 · Windows / macOS</div>
      </Interactive.Div>
      <Interactive.Div
        name="Feedback invitation"
        style={{
          position: "absolute",
          right: 305,
          top: 585,
          width: 600,
          padding: "29px 32px",
          borderRadius: 23,
          background: "rgba(8,18,32,0.9)",
          border: "1px solid rgba(111,181,255,0.28)",
          opacity: interpolate(frame, [190, 220, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [190, 220], ["28px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ color: "#8fc9ff", fontSize: 34, fontWeight: 850 }}>欢迎提供反馈</div>
        <div style={{ marginTop: 10, color: "rgba(220,234,251,0.68)", fontSize: 24 }}>问题报告 · 功能建议</div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
