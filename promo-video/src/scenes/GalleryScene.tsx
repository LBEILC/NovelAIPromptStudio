import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";

export const GalleryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <ScreenFrame asset="gallery.webp" name="Gallery screenshot" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(2, 5, 11, 0.98) 0%, rgba(2, 5, 11, 0.75) 30%, transparent 62%), linear-gradient(0deg, rgba(2, 5, 11, 0.7), transparent 32%)",
        }}
      />
      <Interactive.Div
        name="Gallery kicker"
        style={{
          position: "absolute",
          left: 100,
          top: 230,
          fontSize: 27,
          fontWeight: 800,
          letterSpacing: 2,
          color: "#71b8ff",
          opacity: interpolate(frame, [0.5 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        VISUAL LIBRARY
      </Interactive.Div>
      <Interactive.Div
        name="Gallery headline"
        style={{
          position: "absolute",
          left: 96,
          top: 290,
          width: 680,
          fontSize: 82,
          lineHeight: 1.15,
          fontWeight: 800,
          letterSpacing: -3,
          textShadow: "0 12px 45px rgba(0, 0, 0, 0.75)",
          opacity: interpolate(frame, [0.8 * fps, 1.55 * fps, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.8 * fps, 1.55 * fps], ["-38px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        把生成记录
        <br />
        变成可检索的图片库
      </Interactive.Div>
      <Interactive.Div
        name="Gallery feature chips"
        style={{
          position: "absolute",
          left: 96,
          top: 560,
          display: "flex",
          gap: 14,
          fontSize: 26,
          fontWeight: 650,
          opacity: interpolate(frame, [1.55 * fps, 2.25 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <span style={{ padding: "13px 18px", borderRadius: 12, background: "rgba(22, 35, 52, 0.86)", border: "1px solid rgba(118, 179, 255, 0.28)" }}>批量导入</span>
        <span style={{ padding: "13px 18px", borderRadius: 12, background: "rgba(22, 35, 52, 0.86)", border: "1px solid rgba(118, 179, 255, 0.28)" }}>Prompt 搜索</span>
        <span style={{ padding: "13px 18px", borderRadius: 12, background: "rgba(22, 35, 52, 0.86)", border: "1px solid rgba(118, 179, 255, 0.28)" }}>自动分组</span>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
