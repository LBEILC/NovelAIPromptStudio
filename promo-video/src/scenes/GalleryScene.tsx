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
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <ScreenFrame asset="gallery-groups.webp" name="Searchable grouped gallery" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(2,5,11,0.98) 0%, rgba(2,5,11,0.78) 34%, transparent 63%), linear-gradient(0deg, rgba(2,5,11,0.76), transparent 35%)",
        }}
      />
      <Interactive.Div
        name="Gallery solution label"
        style={{
          position: "absolute",
          left: 100,
          top: 170,
          color: "#71b8ff",
          fontSize: 25,
          fontWeight: 850,
          letterSpacing: 2,
          opacity: interpolate(frame, [10, 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        IMAGE LIBRARY
      </Interactive.Div>
      <Interactive.Div
        name="Gallery headline"
        style={{
          position: "absolute",
          left: 96,
          top: 230,
          width: 700,
          fontSize: 78,
          lineHeight: 1.14,
          fontWeight: 850,
          letterSpacing: -3,
          textShadow: "0 14px 50px rgba(0,0,0,0.72)",
          opacity: interpolate(frame, [22, 50, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [22, 50], ["-34px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        图片集中管理
        <br />
        搜索和归类一步完成
      </Interactive.Div>
      <Interactive.Div
        name="Gallery search modes"
        style={{
          position: "absolute",
          left: 96,
          top: 520,
          width: 700,
          display: "flex",
          flexWrap: "wrap",
          gap: 13,
          opacity: interpolate(frame, [65, 95], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {["批量导入", "文件名搜索", "Tag 搜索", "中文译名搜索", "相同提示词自动归类"].map((label) => (
          <span key={label} style={{ padding: "13px 18px", borderRadius: 13, background: "rgba(17,31,49,0.9)", border: "1px solid rgba(111,178,249,0.28)", fontSize: 24, fontWeight: 700 }}>
            {label}
          </span>
        ))}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
