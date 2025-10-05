import * as React from 'react';
import { TrackToggle, MediaDeviceMenu } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { Track } from 'livekit-client';
import { isLowPowerDevice } from './client-utils';
import { isFeatureEnabled } from './config';

const NOISE_FILTER_FEATURE_ENABLED = isFeatureEnabled('noiseFilter');

export function MicrophoneSettings() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '10px',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <section className="lk-button-group">
        <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
        <div className="lk-button-group-menu">
          <MediaDeviceMenu kind="audioinput" />
        </div>
      </section>

      {NOISE_FILTER_FEATURE_ENABLED ? <NoiseFilterToggle /> : null}
    </div>
  );
}

function NoiseFilterToggle() {
  const { isNoiseFilterEnabled, setNoiseFilterEnabled, isNoiseFilterPending } = useKrispNoiseFilter({
    filterOptions: {
      bufferOverflowMs: 100,
      bufferDropMs: 200,
      quality: isLowPowerDevice() ? 'low' : 'medium',
      onBufferDrop: () => {
        console.warn(
          'krisp buffer dropped, noise filter versions >= 0.3.2 will automatically disable the filter',
        );
      },
    },
  });

  React.useEffect(() => {
    if (!isLowPowerDevice()) {
      setNoiseFilterEnabled(true);
    }
  }, [setNoiseFilterEnabled]);

  return (
    <button
      className="lk-button"
      onClick={() => setNoiseFilterEnabled(!isNoiseFilterEnabled)}
      disabled={isNoiseFilterPending}
      aria-pressed={isNoiseFilterEnabled}
    >
      {isNoiseFilterEnabled ? 'Disable' : 'Enable'} Enhanced Noise Cancellation
    </button>
  );
}
