import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

export const VoiceTrack: React.FC<{
  asset: string;
  from: number;
}> = ({ asset, from }) => {
  return (
    <Sequence from={from} name={`Voiceover: ${asset}`} layout="none">
      <Audio src={staticFile(`audio/${asset}`)} volume={1} />
    </Sequence>
  );
};
