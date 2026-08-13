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

const FeatureCard: React.FC<{
  index: number;
  title: string;
  description: string;
  accent: string;
}> = ({ index, title, description, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Interactive.Div
      name={`Feature: ${title}`}
      style={{
        padding: "34px 34px 32px",
        minHeight: 210,
        borderRadius: 24,
        background: "rgba(8, 16, 29, 0.84)",
        border: `1px solid ${accent}`,
        boxShadow: "0 24px 70px rgba(0, 0, 0, 0.38)",
        backdropFilter: "blur(18px)",
        opacity: interpolate(frame, [(0.45 + index * 0.2) * fps, (1.2 + index * 0.2) * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [(0.45 + index * 0.2) * fps, (1.2 + index * 0.2) * fps], ["0px 44px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ fontSize: 35, fontWeight: 800, color: "#f5f9ff", marginBottom: 16 }}>
        {title}
      </div>
      <div style={{ fontSize: 25, lineHeight: 1.55, color: "rgba(219, 233, 250, 0.7)" }}>
        {description}
      </div>
    </Interactive.Div>
  );
};

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <VoiceTrack asset="06-privacy.wav" from={15} />
      <CanvasImage
        name="Feature background"
        src={staticFile("assets/hero.webp")}
        style={{
          position: "absolute",
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.28,
          filter: "blur(7px) saturate(0.75)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.08, 1.02], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(1, 5, 12, 0.72)" }} />
      <Interactive.Div
        name="Feature headline"
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 92,
          fontSize: 70,
          lineHeight: 1.15,
          fontWeight: 800,
          letterSpacing: -2,
          opacity: interpolate(frame, [0, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        专注创作，也尊重你的素材
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 225,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 22,
        }}
      >
        <FeatureCard index={0} title="本地优先" description="图片、Prompt、Tag 字典与设置保存在本地。" accent="rgba(76, 159, 255, 0.44)" />
        <FeatureCard index={1} title="原图只读" description="工作台不覆盖源图，也不改写原始 metadata。" accent="rgba(75, 210, 186, 0.4)" />
        <FeatureCard index={2} title="AI 功能可选" description="不配置 AI 服务，也能完成核心整理工作。" accent="rgba(158, 126, 255, 0.4)" />
        <FeatureCard index={3} title="跨平台" description="Windows 与 macOS 都是一等支持平台。" accent="rgba(99, 184, 255, 0.4)" />
      </div>
    </AbsoluteFill>
  );
};
