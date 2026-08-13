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

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ color: "white", overflow: "hidden" }}>
      <ProductBackground />
      <Interactive.Div
        name="Open source transition"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 112,
          textAlign: "center",
          color: "#8fc9ff",
          fontSize: 38,
          fontWeight: 750,
          letterSpacing: 1,
          opacity: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        所以，我写了一个开源工具
      </Interactive.Div>
      <Interactive.Div
        name="Product reveal logo"
        style={{
          position: "absolute",
          left: 878,
          top: 230,
          width: 164,
          height: 164,
          padding: 27,
          borderRadius: 40,
          background: "rgba(9, 21, 38, 0.88)",
          border: "1px solid rgba(115, 184, 255, 0.38)",
          boxShadow: "0 28px 100px rgba(30, 121, 255, 0.34)",
          opacity: interpolate(frame, [12, 38], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [12, 42], [0.7, 1], {
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
          style={{ width: 110, height: 110 }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Product name"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 455,
          textAlign: "center",
          fontSize: 84,
          lineHeight: 1.1,
          fontWeight: 850,
          letterSpacing: -2.5,
          opacity: interpolate(frame, [26, 58, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [26, 58], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        NovelAI Prompt Studio
      </Interactive.Div>
      <Interactive.Div
        name="Product purpose"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 590,
          textAlign: "center",
          fontSize: 40,
          fontWeight: 600,
          color: "rgba(221,234,251,0.76)",
          opacity: interpolate(frame, [52, 78], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        专门解决图片、Tag 与 Vibe 的整理问题
      </Interactive.Div>
    </AbsoluteFill>
  );
};
