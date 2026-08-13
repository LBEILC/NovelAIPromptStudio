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

export const ImagePainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#02050b", color: "white", overflow: "hidden" }}>
      <CanvasImage
        name="Unmanaged image library"
        src={staticFile("assets/gallery.webp")}
        style={{
          width: 1920,
          height: 1080,
          objectFit: "cover",
          opacity: 0.5,
          filter: "saturate(0.65) blur(1px)",
          scale: interpolate(frame, [0, durationInFrames - 1], [1.03, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(2,5,11,0.98) 0%, rgba(2,5,11,0.82) 44%, rgba(2,5,11,0.32) 100%), linear-gradient(0deg, rgba(2,5,11,0.72), transparent 48%)",
        }}
      />
      <Interactive.Div
        name="Pain point label"
        style={{
          position: "absolute",
          left: 100,
          top: 126,
          padding: "10px 18px",
          borderRadius: 999,
          background: "rgba(255, 107, 123, 0.12)",
          border: "1px solid rgba(255, 123, 137, 0.32)",
          color: "#ff9daa",
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: 2,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        PAIN POINT 01
      </Interactive.Div>
      <Interactive.Div
        name="Image management pain headline"
        style={{
          position: "absolute",
          left: 96,
          top: 235,
          width: 830,
          fontSize: 88,
          lineHeight: 1.13,
          fontWeight: 850,
          letterSpacing: -3.5,
          textShadow: "0 18px 70px rgba(0,0,0,0.65)",
          opacity: interpolate(frame, [12, 38], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [12, 38], ["-34px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        图片越来越多
        <br />
        想找一张却要翻半天
      </Interactive.Div>
      <Interactive.Div
        name="Image search pain card"
        style={{
          position: "absolute",
          left: 100,
          top: 520,
          width: 700,
          padding: "24px 28px",
          borderRadius: 22,
          background: "rgba(8, 15, 26, 0.88)",
          border: "1px solid rgba(132, 170, 214, 0.22)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
          opacity: interpolate(frame, [70, 100], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [70, 100], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ fontSize: 24, color: "rgba(215,230,247,0.58)", marginBottom: 13 }}>
          想找的那张图……
        </div>
        <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>
          <div style={{ width: "18%", height: 3, borderRadius: 999, background: "#ff7e8d" }} />
        </div>
        <div style={{ marginTop: 18, fontSize: 28, fontWeight: 750, color: "#f4f7fb" }}>
          一张张打开 · 一张张确认
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
