import {
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const ScreenFrame: React.FC<{
  asset: string;
  name: string;
  highlight?: { left: number; top: number; width: number; height: number };
}> = ({ asset, name, highlight }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <Interactive.Div
      name={`${name} frame`}
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(
          frame,
          [0, 18, durationInFrames - 18, durationInFrames - 1],
          [0, 1, 1, 0.96],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        ),
        scale: interpolate(frame, [0, durationInFrames - 1], [1.055, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
        }),
      }}
    >
      <CanvasImage
        name={name}
        src={staticFile(`assets/${asset}`)}
        style={{ width: 1920, height: 1080, objectFit: "cover" }}
      />
      {highlight ? (
        <Interactive.Div
          name={`${name} feature highlight`}
          style={{
            position: "absolute",
            left: highlight.left,
            top: highlight.top,
            width: highlight.width,
            height: highlight.height,
            border: "3px solid rgba(91, 175, 255, 0.9)",
            borderRadius: 22,
            boxShadow:
              "0 0 0 7px rgba(76, 153, 255, 0.12), 0 0 46px rgba(67, 154, 255, 0.24)",
            opacity: interpolate(
              frame,
              [34, 52, durationInFrames - 35, durationInFrames - 18],
              [0, 1, 1, 0],
              {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              },
            ),
            scale: interpolate(frame, [34, 52], [1.025, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
              output: "perceptual-scale",
            }),
          }}
        />
      ) : null}
    </Interactive.Div>
  );
};
