import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";

export const ProductBackground: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 14% 18%, rgba(35, 126, 255, 0.28), transparent 34%), radial-gradient(circle at 88% 78%, rgba(0, 198, 255, 0.12), transparent 32%), linear-gradient(135deg, #07111f 0%, #030711 52%, #010309 100%)",
        overflow: "hidden",
      }}
    >
      <Interactive.Div
        name="Ambient blue glow"
        style={{
          position: "absolute",
          left: -180,
          top: 120,
          width: 640,
          height: 640,
          borderRadius: 999,
          background: "rgba(31, 119, 255, 0.14)",
          filter: "blur(90px)",
          translate: interpolate(frame, [0, 180], ["0px 0px", "120px -30px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Interactive.Div
        name="Ambient cyan glow"
        style={{
          position: "absolute",
          right: -160,
          bottom: -260,
          width: 720,
          height: 720,
          borderRadius: 999,
          background: "rgba(22, 185, 255, 0.11)",
          filter: "blur(110px)",
          translate: interpolate(frame, [0, 180], ["0px 0px", "-90px -40px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            "linear-gradient(rgba(100, 168, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 168, 255, 0.08) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "linear-gradient(to bottom, black, transparent 82%)",
        }}
      />
    </AbsoluteFill>
  );
};
