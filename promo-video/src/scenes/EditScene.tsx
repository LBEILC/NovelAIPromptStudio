import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ScreenFrame } from "../components/ScreenFrame";

const CategoryChip: React.FC<{ index: number; label: string; count: number }> = ({ index, label, count }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name={`Tag category ${label}`}
      style={{
        padding: "15px 18px",
        borderRadius: 15,
        background: "rgba(6,14,25,0.9)",
        border: "1px solid rgba(107,179,250,0.3)",
        boxShadow: "0 18px 45px rgba(0,0,0,0.32)",
        opacity: interpolate(frame, [38 + index * 16, 62 + index * 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [38 + index * 16, 62 + index * 16], ["24px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 850 }}>{label}</div>
      <div style={{ marginTop: 4, color: "#82c4ff", fontSize: 20, fontWeight: 700 }}>{count} 个 Tag</div>
    </Interactive.Div>
  );
};

export const EditScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <ScreenFrame asset="workbench.webp" name="Classified prompt workspace" highlight={{ left: 735, top: 176, width: 1000, height: 785 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,5,11,0.2), rgba(2,5,11,0.56) 48%, rgba(2,5,11,0.97) 100%)" }} />
      <Interactive.Div
        name="Tag organization headline"
        style={{
          position: "absolute",
          right: 90,
          top: 95,
          width: 650,
          textAlign: "right",
          fontSize: 70,
          lineHeight: 1.13,
          fontWeight: 850,
          letterSpacing: -2.5,
          opacity: interpolate(frame, [10, 38, durationInFrames - 18, durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        自动识别用途
        <br />
        Tag 分类整理
      </Interactive.Div>
      <div style={{ position: "absolute", right: 90, top: 310, width: 620, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
        <CategoryChip index={0} label="画面控制" count={16} />
        <CategoryChip index={1} label="画师" count={16} />
        <CategoryChip index={2} label="角色特征" count={7} />
        <CategoryChip index={3} label="服饰内容" count={23} />
      </div>
      <Interactive.Div
        name="Prompt editing actions"
        style={{
          position: "absolute",
          right: 90,
          top: 615,
          width: 620,
          padding: "25px 28px",
          borderRadius: 20,
          background: "rgba(5,13,24,0.92)",
          border: "1px solid rgba(111,181,255,0.3)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.38)",
          opacity: interpolate(frame, [168, 202], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [168, 202], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["区域筛选", "类别筛选", "查看翻译", "调整权重", "一键复制"].map((label, index) => (
            <span key={label} style={{ padding: "12px 15px", borderRadius: 12, background: index === 4 ? "linear-gradient(135deg,#62b4ff,#338fff)" : "rgba(255,255,255,0.055)", color: index === 4 ? "#03101d" : "#f1f6fc", fontSize: 23, fontWeight: 800 }}>
              {label}
            </span>
          ))}
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
