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

const LookupRow: React.FC<{ index: number; tag: string; meaning: string }> = ({ index, tag, meaning }) => {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name={`Manual translation ${tag}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px 1fr",
        alignItems: "center",
        gap: 18,
        opacity: interpolate(frame, [34 + index * 22, 58 + index * 22], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [34 + index * 22, 58 + index * 22], ["0px 22px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ padding: "17px 21px", borderRadius: 16, background: "#0a1320", border: "1px solid rgba(127,176,229,0.24)", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 25, fontWeight: 700 }}>
        {tag}
      </div>
      <div style={{ textAlign: "center", color: "#ff9daa", fontSize: 31, fontWeight: 900 }}>复制 →</div>
      <div style={{ padding: "17px 21px", borderRadius: 16, background: "rgba(255,128,142,0.09)", border: "1px solid rgba(255,128,142,0.24)", fontSize: 26, fontWeight: 750 }}>
        {meaning}
      </div>
    </Interactive.Div>
  );
};

export const TranslationPainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <CanvasImage
        name="Translation pain background"
        src={staticFile("assets/workbench.webp")}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.22,
          filter: "blur(5px) saturate(0.55)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.02, 1.06], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(2,6,13,0.96), rgba(2,6,13,0.78))" }} />
      <Interactive.Div
        name="Translation pain headline"
        style={{
          position: "absolute",
          left: 96,
          top: 95,
          right: 96,
          fontSize: 72,
          lineHeight: 1.16,
          fontWeight: 850,
          letterSpacing: -2.5,
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        不认识的 Tag，只能一个个查
      </Interactive.Div>
      <div style={{ position: "absolute", left: 300, right: 300, top: 285, display: "flex", flexDirection: "column", gap: 17 }}>
        <LookupRow index={0} tag="depth of field" meaning="景深" />
        <LookupRow index={1} tag="dropped shoulders" meaning="落肩设计" />
        <LookupRow index={2} tag="artist::ciloranko" meaning="画师标签" />
      </div>
      <Interactive.Div
        name="Manual translation loop"
        style={{
          position: "absolute",
          left: 410,
          right: 410,
          top: 740,
          padding: "22px 28px",
          borderRadius: 18,
          textAlign: "center",
          background: "rgba(255,120,136,0.1)",
          border: "1px solid rgba(255,120,136,0.24)",
          color: "#ffabb5",
          fontSize: 31,
          fontWeight: 800,
          opacity: interpolate(frame, [112, 145], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        复制 → 翻译 → 返回 → 再修改
      </Interactive.Div>
    </AbsoluteFill>
  );
};
