import "./index.css";
import { Composition, Folder } from "remotion";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { HeroScene } from "./scenes/HeroScene";
import { OutroScene } from "./scenes/OutroScene";
import { EditScene } from "./scenes/EditScene";
import { VibeScene } from "./scenes/VibeScene";
import { WorkbenchScene } from "./scenes/WorkbenchScene";
import { PromoVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="NovelAI-Prompt-Studio-Demo-Scenes">
        <Composition
          id="01-Hero"
          component={HeroScene}
          durationInFrames={150}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="02-Workbench"
          component={WorkbenchScene}
          durationInFrames={250}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="03-Edit"
          component={EditScene}
          durationInFrames={215}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="04-Vibe"
          component={VibeScene}
          durationInFrames={280}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="05-Gallery"
          component={GalleryScene}
          durationInFrames={230}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="06-Features"
          component={FeaturesScene}
          durationInFrames={140}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="07-Outro"
          component={OutroScene}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="NovelAIPromptStudio-Demo-16x9"
        component={PromoVideo}
        durationInFrames={1352}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
