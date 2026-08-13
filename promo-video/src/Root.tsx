import "./index.css";
import { Composition, Folder } from "remotion";
import { ImagePainScene } from "./scenes/ImagePainScene";
import { TagPainScene } from "./scenes/TagPainScene";
import { TranslationPainScene } from "./scenes/TranslationPainScene";
import { VibePainScene } from "./scenes/VibePainScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { HeroScene } from "./scenes/HeroScene";
import { OutroScene } from "./scenes/OutroScene";
import { EditScene } from "./scenes/EditScene";
import { VibeScene } from "./scenes/VibeScene";
import { PromoVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="NovelAI-Prompt-Studio-Demo-Scenes">
        <Composition
          id="01-Image-Pain"
          component={ImagePainScene}
          durationInFrames={226}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="02-Tag-Pain"
          component={TagPainScene}
          durationInFrames={281}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="03-Translation-Pain"
          component={TranslationPainScene}
          durationInFrames={212}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="04-Vibe-Pain"
          component={VibePainScene}
          durationInFrames={204}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="05-Open-Source-Reveal"
          component={HeroScene}
          durationInFrames={167}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="06-Gallery"
          component={GalleryScene}
          durationInFrames={247}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="07-Tag-Organization"
          component={EditScene}
          durationInFrames={353}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="08-Vibe-And-Privacy"
          component={VibeScene}
          durationInFrames={231}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="09-GitHub-Outro"
          component={OutroScene}
          durationInFrames={299}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="NovelAIPromptStudio-Demo-16x9"
        component={PromoVideo}
        durationInFrames={2220}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
