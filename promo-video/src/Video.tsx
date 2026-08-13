import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import { ImagePainScene } from "./scenes/ImagePainScene";
import { TagPainScene } from "./scenes/TagPainScene";
import { TranslationPainScene } from "./scenes/TranslationPainScene";
import { VibePainScene } from "./scenes/VibePainScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { HeroScene } from "./scenes/HeroScene";
import { OutroScene } from "./scenes/OutroScene";
import { EditScene } from "./scenes/EditScene";
import { VibeScene } from "./scenes/VibeScene";
import { CaptionOverlay } from "./components/CaptionOverlay";

export const PromoVideo: React.FC = () => {
  return (
    <>
      <Sequence durationInFrames={242} name="Pain: image management">
        <ImagePainScene />
      </Sequence>
      <Sequence from={242} durationInFrames={382} name="Pain: mixed tags">
        <TagPainScene />
      </Sequence>
      <Sequence from={624} durationInFrames={226} name="Pain: translation">
        <TranslationPainScene />
      </Sequence>
      <Sequence from={850} durationInFrames={231} name="Pain: Vibe restore">
        <VibePainScene />
      </Sequence>
      <Sequence from={1081} durationInFrames={169} name="Open-source reveal">
        <HeroScene />
      </Sequence>
      <Sequence from={1250} durationInFrames={265} name="Solution: gallery">
        <GalleryScene />
      </Sequence>
      <Sequence from={1515} durationInFrames={361} name="Solution: tag organization">
        <EditScene />
      </Sequence>
      <Sequence from={1876} durationInFrames={260} name="Solution: Vibe and privacy">
        <VibeScene />
      </Sequence>
      <Sequence from={2136} durationInFrames={351} name="GitHub and feedback">
        <OutroScene />
      </Sequence>
      <Audio src={staticFile("audio/narration-minimax.wav")} volume={1.35} />
      <CaptionOverlay />
    </>
  );
};
