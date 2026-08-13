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

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ color: "white", overflow: "hidden" }}>
      <ProductBackground />
      <VoiceTrack asset="07-outro.wav" from={18} />
      <Interactive.Div
        name="Outro logo"
        style={{
          position: "absolute",
          left: 872,
          top: 165,
          width: 176,
          height: 176,
          padding: 30,
          borderRadius: 42,
          background: "rgba(9, 21, 38, 0.88)",
          border: "1px solid rgba(115, 184, 255, 0.38)",
          boxShadow: "0 28px 100px rgba(30, 121, 255, 0.34)",
          opacity: interpolate(frame, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 25], [0.78, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 18 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <CanvasImage
          name="NovelAI Prompt Studio outro icon"
          src={staticFile("assets/app-icon.svg")}
          style={{ width: 116, height: 116 }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Outro product name"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 405,
          textAlign: "center",
          fontSize: 82,
          fontWeight: 800,
          letterSpacing: -2.4,
          opacity: interpolate(frame, [14, 40, durationInFrames - 10, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [14, 40], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        NovelAI Prompt Studio
      </Interactive.Div>
      <Interactive.Div
        name="Outro tagline"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 520,
          textAlign: "center",
          fontSize: 38,
          lineHeight: 1.5,
          fontWeight: 550,
          color: "rgba(220, 234, 251, 0.78)",
          opacity: interpolate(frame, [32, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        免费开源 · Windows / macOS
      </Interactive.Div>
      <Interactive.Div
        name="Outro call to action"
        style={{
          position: "absolute",
          left: 520,
          right: 520,
          top: 635,
          padding: "26px 34px",
          textAlign: "center",
          borderRadius: 20,
          background: "linear-gradient(135deg, #54a9ff, #278bff)",
          boxShadow: "0 18px 60px rgba(48, 145, 255, 0.35)",
          fontSize: 34,
          fontWeight: 800,
          color: "#04111f",
          opacity: interpolate(frame, [48, 68], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [48, 68], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        github.com/LBEILC/NovelAIPromptStudio
      </Interactive.Div>
    </AbsoluteFill>
  );
};
