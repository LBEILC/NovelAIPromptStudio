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

const RawPromptCard: React.FC<{
  name: string;
  title: string;
  subtitle: string;
  tags: string;
  from: number;
  top: number;
}> = ({ name, title, subtitle, tags, from, top }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        left: 520,
        right: 96,
        top,
        padding: "25px 30px 28px",
        borderRadius: 22,
        background: "rgba(6, 13, 24, 0.9)",
        border: "1px solid rgba(119, 177, 236, 0.25)",
        boxShadow: "0 24px 85px rgba(0,0,0,0.48)",
        opacity: interpolate(frame, [from, from + 26], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [from, from + 26], ["34px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <div style={{ fontSize: 31, fontWeight: 850 }}>{title}</div>
        <div style={{ color: "#ff9daa", fontSize: 22, fontWeight: 700 }}>{subtitle}</div>
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize: 25,
          lineHeight: 1.72,
          color: "rgba(231,238,247,0.78)",
        }}
      >
        {tags}
      </div>
    </Interactive.Div>
  );
};

export const TagPainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <CanvasImage
        name="Prompt workspace background"
        src={staticFile("assets/workbench.webp")}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.24,
          filter: "blur(4px) saturate(0.65)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.04, 1.01], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "rgba(2,6,13,0.76)" }} />
      <Interactive.Div
        name="Tag pain title"
        style={{
          position: "absolute",
          left: 96,
          top: 138,
          width: 390,
          fontSize: 72,
          lineHeight: 1.12,
          fontWeight: 850,
          letterSpacing: -3,
          opacity: interpolate(frame, [0, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Tag 的用途
        <br />
        混在一起
      </Interactive.Div>
      <Interactive.Div
        name="Mixed category legend"
        style={{
          position: "absolute",
          left: 100,
          top: 350,
          width: 350,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          opacity: interpolate(frame, [45, 74], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {["画面控制", "风格描述", "画师串", "角色特征", "服饰内容"].map((label, index) => (
          <span
            key={label}
            style={{
              padding: "11px 15px",
              borderRadius: 999,
              background: index % 2 === 0 ? "rgba(255,116,132,0.13)" : "rgba(255,176,91,0.12)",
              border: index % 2 === 0 ? "1px solid rgba(255,116,132,0.3)" : "1px solid rgba(255,176,91,0.28)",
              color: index % 2 === 0 ? "#ff9daa" : "#ffc27d",
              fontSize: 22,
              fontWeight: 750,
            }}
          >
            {label}
          </span>
        ))}
      </Interactive.Div>
      <RawPromptCard
        name="Mixed base prompt"
        title="基础提示词"
        subtitle="不同用途交错排列"
        from={55}
        top={120}
        tags="masterpiece, cinematic lighting, artist::shion, low angle, depth of field, artist::ciloranko, detailed background, dynamic composition, year 2025…"
      />
      <RawPromptCard
        name="Mixed character prompt"
        title="角色提示词"
        subtitle="角色与服饰混在同一串"
        from={225}
        top={520}
        tags="1girl, bagpipe (arknights), long hair, beige cardigan, plaid skirt, closed mouth, shoulder bag, black ribbon, standing, outdoors…"
      />
    </AbsoluteFill>
  );
};
