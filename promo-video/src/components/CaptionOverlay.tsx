import type { Caption } from "@remotion/captions";
import { useCallback, useEffect, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";

export const CaptionOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading voiceover captions"));

  const loadCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("captions/voiceover.json"));
      if (!response.ok) throw new Error(`Unable to load captions: ${response.status}`);
      setCaptions((await response.json()) as Caption[]);
      continueRender(handle);
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [cancelRender, continueRender, handle]);

  useEffect(() => {
    loadCaptions();
  }, [loadCaptions]);

  if (!captions) return null;

  const currentTimeMs = (frame / fps) * 1000;
  const activeCaption = captions.find(
    (caption) => caption.startMs <= currentTimeMs && caption.endMs > currentTimeMs,
  );

  if (!activeCaption) return null;

  const captionProgressFrame = frame - (activeCaption.startMs / 1000) * fps;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 50,
        paddingLeft: 100,
        paddingRight: 100,
      }}
    >
      <Interactive.Div
        name="Voiceover caption"
        style={{
          maxWidth: 1500,
          padding: "15px 27px 17px",
          borderRadius: 16,
          background: "rgba(2, 7, 15, 0.82)",
          border: "1px solid rgba(135, 192, 255, 0.28)",
          boxShadow: "0 16px 50px rgba(0, 0, 0, 0.46)",
          backdropFilter: "blur(14px)",
          color: "#f7faff",
          fontSize: 34,
          lineHeight: 1.42,
          fontWeight: 700,
          textAlign: "center",
          whiteSpace: "pre-line",
          opacity: interpolate(captionProgressFrame, [0, 7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(captionProgressFrame, [0, 7], ["0px 12px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {activeCaption.text}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
