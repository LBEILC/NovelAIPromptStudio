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

const Step: React.FC<{ index: number; label: string; detail: string }> = ({
  index,
  label,
  detail,
}) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name={`Edit step ${index + 1}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "17px 22px",
        borderRadius: 18,
        background: "rgba(4, 11, 22, 0.82)",
        border: "1px solid rgba(111, 181, 255, 0.28)",
        boxShadow: "0 18px 55px rgba(0, 0, 0, 0.34)",
        opacity: interpolate(frame, [26 + index * 15, 48 + index * 15], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [26 + index * 15, 48 + index * 15], ["28px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          flex: "0 0 auto",
          background: "linear-gradient(135deg, #67b6ff, #318fff)",
          color: "#03101d",
          fontSize: 25,
          fontWeight: 900,
        }}
      >
        {index + 1}
      </div>
      <div>
        <div style={{ fontSize: 29, fontWeight: 800, color: "#f5f9ff" }}>{label}</div>
        <div style={{ marginTop: 4, fontSize: 21, color: "rgba(216, 233, 251, 0.68)" }}>
          {detail}
        </div>
      </div>
    </Interactive.Div>
  );
};

export const EditScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <ScreenFrame
        asset="workbench.webp"
        name="Prompt editing screenshot"
        highlight={{ left: 745, top: 178, width: 930, height: 760 }}
      />
      <VoiceTrack asset="03-edit.wav" from={15} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(2, 5, 11, 0.12) 0%, rgba(2, 5, 11, 0.42) 48%, rgba(2, 5, 11, 0.96) 100%)",
        }}
      />
      <Interactive.Div
        name="Edit scene headline"
        style={{
          position: "absolute",
          right: 92,
          top: 126,
          width: 520,
          fontSize: 60,
          lineHeight: 1.15,
          fontWeight: 850,
          letterSpacing: -2,
          textAlign: "right",
          opacity: interpolate(frame, [8, 34, durationInFrames - 16, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        从看懂 Prompt
        <br />
        到直接使用
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          right: 92,
          top: 330,
          width: 520,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Step index={0} label="筛选与搜索" detail="按区域、类别和译名快速聚焦" />
        <Step index={1} label="翻译与调整" detail="理解 Tag，并保留原始语法与权重" />
        <Step index={2} label="一键复制" detail="复制可见、完整或指定区域 Prompt" />
      </div>
    </AbsoluteFill>
  );
};
