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
import { VoiceTrack } from "../components/VoiceTrack";

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ color: "white", overflow: "hidden" }}>
      <ProductBackground />
      <VoiceTrack asset="01-intro.wav" from={12} />
      <Interactive.Div
        name="Hero prompt chips"
        style={{
          position: "absolute",
          left: 140,
          right: 140,
          top: 104,
          display: "flex",
          justifyContent: "space-between",
          color: "rgba(161, 201, 255, 0.65)",
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 24,
          letterSpacing: 0.5,
          opacity: interpolate(frame, [0, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <span>1girl · masterpiece · cinematic light</span>
        <span>character · composition · style</span>
      </Interactive.Div>
      <Interactive.Div
        name="Hero logo"
        style={{
          position: "absolute",
          left: 904,
          top: 220,
          width: 112,
          height: 112,
          padding: 18,
          borderRadius: 30,
          background: "rgba(11, 24, 42, 0.82)",
          border: "1px solid rgba(119, 184, 255, 0.34)",
          boxShadow: "0 22px 80px rgba(17, 112, 255, 0.3)",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 24], [0.72, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 16 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <CanvasImage
          name="NovelAI Prompt Studio icon"
          src={staticFile("assets/app-icon.svg")}
          style={{ width: 76, height: 76 }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Hero product name"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 382,
          textAlign: "center",
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: 1.2,
          color: "#8fc9ff",
          opacity: interpolate(frame, [14, 34], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [14, 34], ["0px 20px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        NovelAI Prompt Studio
      </Interactive.Div>
      <Interactive.Div
        name="Hero headline"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 460,
          textAlign: "center",
          fontSize: 96,
          lineHeight: 1.08,
          fontWeight: 800,
          letterSpacing: -4,
          color: "#f6f9ff",
          textShadow: "0 12px 60px rgba(57, 140, 255, 0.2)",
          opacity: interpolate(frame, [24, 48, durationInFrames - 14, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [24, 48], ["0px 36px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        让 Prompt 回到创作流程里
      </Interactive.Div>
      <Interactive.Div
        name="Hero subtitle"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 605,
          textAlign: "center",
          fontSize: 36,
          lineHeight: 1.5,
          fontWeight: 500,
          color: "rgba(221, 234, 251, 0.76)",
          opacity: interpolate(frame, [42, 64], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        本地优先的 NovelAI Prompt 编辑工作台与图片库
      </Interactive.Div>
    </AbsoluteFill>
  );
};
