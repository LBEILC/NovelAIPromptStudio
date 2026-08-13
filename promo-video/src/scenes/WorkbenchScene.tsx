import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";
import { VoiceTrack } from "../components/VoiceTrack";

export const WorkbenchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <ScreenFrame
        asset="workbench.webp"
        name="Workbench screenshot"
        highlight={{ left: 680, top: 188, width: 1008, height: 330 }}
      />
      <VoiceTrack asset="02-workbench.wav" from={18} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 50%, rgba(2, 5, 11, 0.18) 64%, rgba(2, 5, 11, 0.97) 100%)",
        }}
      />
      <Interactive.Div
        name="Workbench kicker"
        style={{
          position: "absolute",
          left: 96,
          bottom: 248,
          padding: "11px 18px",
          borderRadius: 999,
          background: "rgba(70, 158, 255, 0.16)",
          border: "1px solid rgba(106, 182, 255, 0.35)",
          color: "#9ed2ff",
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: 1.5,
          opacity: interpolate(frame, [0.8 * fps, 1.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        WORKBENCH
      </Interactive.Div>
      <Interactive.Div
        name="Workbench headline"
        style={{
          position: "absolute",
          left: 96,
          bottom: 138,
          fontSize: 74,
          fontWeight: 800,
          letterSpacing: -2,
          textShadow: "0 8px 32px rgba(0, 0, 0, 0.7)",
          opacity: interpolate(frame, [1 * fps, 1.75 * fps, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [1 * fps, 1.75 * fps], ["0px 32px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        解析、分类、编辑，一屏完成
      </Interactive.Div>
      <Interactive.Div
        name="Workbench supporting copy"
        style={{
          position: "absolute",
          right: 96,
          bottom: 145,
          maxWidth: 500,
          textAlign: "right",
          fontSize: 29,
          lineHeight: 1.55,
          fontWeight: 500,
          color: "rgba(225, 237, 251, 0.76)",
          opacity: interpolate(frame, [1.8 * fps, 2.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        自动拆分 Prompt 区域与类别
        <br />
        搜索、翻译、调整权重并一键复制
      </Interactive.Div>
    </AbsoluteFill>
  );
};
