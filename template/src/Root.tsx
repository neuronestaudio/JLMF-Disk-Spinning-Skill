import React from 'react';
import {Composition, Still} from 'remotion';
import {VinylSpin} from './VinylSpin';
import {Calibrate} from './Calibrate';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VinylSpin"
        component={VinylSpin}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Still id="Calibrate" component={Calibrate} width={1920} height={1080} />
    </>
  );
};
