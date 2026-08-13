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
      <Sequence durationInFrames={226} name="Pain: image management">
        <ImagePainScene />
      </Sequence>
      <Sequence from={226} durationInFrames={281} name="Pain: mixed tags">
        <TagPainScene />
      </Sequence>
      <Sequence from={507} durationInFrames={212} name="Pain: translation">
        <TranslationPainScene />
      </Sequence>
      <Sequence from={719} durationInFrames={204} name="Pain: Vibe restore">
        <VibePainScene />
      </Sequence>
      <Sequence from={923} durationInFrames={167} name="Open-source reveal">
        <HeroScene />
      </Sequence>
      <Sequence from={1090} durationInFrames={247} name="Solution: gallery">
        <GalleryScene />
      </Sequence>
      <Sequence from={1337} durationInFrames={353} name="Solution: tag organization">
        <EditScene />
      </Sequence>
      <Sequence from={1690} durationInFrames={231} name="Solution: Vibe and privacy">
        <VibeScene />
      </Sequence>
      <Sequence from={1921} durationInFrames={299} name="GitHub and feedback">
        <OutroScene />
      </Sequence>
      <Audio src={staticFile("audio/narration-minimax.wav")} volume={1.35} />
      <CaptionOverlay />
    </>
  );
};
