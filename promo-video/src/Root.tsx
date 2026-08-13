import "./index.css";
import { Composition, Folder } from "remotion";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { HeroScene } from "./scenes/HeroScene";
import { OutroScene } from "./scenes/OutroScene";
import { WorkbenchScene } from "./scenes/WorkbenchScene";
import { PromoVideo } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="NovelAI-Prompt-Studio-Demo-Scenes">
        <Composition
          id="01-Hero"
          component={HeroScene}
          durationInFrames={105}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="02-Workbench"
          component={WorkbenchScene}
          durationInFrames={195}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="03-Gallery"
          component={GalleryScene}
          durationInFrames={165}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="04-Features"
          component={FeaturesScene}
          durationInFrames={135}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="05-Outro"
          component={OutroScene}
          durationInFrames={105}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
      <Composition
        id="NovelAIPromptStudio-Demo-16x9"
        component={PromoVideo}
        durationInFrames={642}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
