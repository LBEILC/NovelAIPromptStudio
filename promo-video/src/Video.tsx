import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { GalleryScene } from "./scenes/GalleryScene";
import { HeroScene } from "./scenes/HeroScene";
import { OutroScene } from "./scenes/OutroScene";
import { EditScene } from "./scenes/EditScene";
import { VibeScene } from "./scenes/VibeScene";
import { WorkbenchScene } from "./scenes/WorkbenchScene";
import { CaptionOverlay } from "./components/CaptionOverlay";

export const PromoVideo: React.FC = () => {
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={150} name="Hero">
          <HeroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={250} name="Workbench">
          <WorkbenchScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 18 })}
        />
        <TransitionSeries.Sequence durationInFrames={215} name="Edit">
          <EditScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={280} name="Vibe">
          <VibeScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={230} name="Gallery">
          <GalleryScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={140} name="Features">
          <FeaturesScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={180} name="Outro">
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <CaptionOverlay />
    </>
  );
};
