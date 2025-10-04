'use client';

import * as React from 'react';
import { useMaybeLayoutContext, MediaDeviceMenu, useRoomContext, useIsRecording } from '@livekit/components-react';
import styles from '@/styles/SettingsMenu.module.css';
import { CameraSettings } from '@/lib/CameraSettings';
import { MicrophoneSettings } from '@/lib/MicrophoneSettings';

export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  isOpen?: boolean;
  room?: import('livekit-client').Room | null;
}

export function SettingsMenu({ onClose, isOpen, room: _room, ...divProps }: SettingsMenuProps) {
  const layoutContext = useMaybeLayoutContext();
  const room = useRoomContext();
  const recordingEndpoint = process.env.NEXT_PUBLIC_LK_RECORD_ENDPOINT;

  const settings = React.useMemo(
    () => ({
      media: { camera: true, microphone: true, label: 'Media Devices', speaker: true },
      recording: recordingEndpoint ? { label: 'Recording' } : undefined,
    }),
    [recordingEndpoint],
  );

  const tabs = React.useMemo(
    () => Object.keys(settings).filter(tab => settings[tab as keyof typeof settings]) as Array<keyof typeof settings>,
    [settings],
  );

  const [activeTab, setActiveTab] = React.useState<keyof typeof settings>(tabs[0] ?? 'media');

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(activeTab)) {
      setActiveTab(tabs[0]);
    }
  }, [tabs, activeTab]);

  const isRecording = useIsRecording();
  const [initialRecStatus, setInitialRecStatus] = React.useState(isRecording);
  const [processingRecRequest, setProcessingRecRequest] = React.useState(false);

  React.useEffect(() => {
    if (initialRecStatus !== isRecording) {
      setProcessingRecRequest(false);
    }
  }, [isRecording, initialRecStatus]);

  const toggleRoomRecording = React.useCallback(async () => {
    if (!recordingEndpoint) {
      throw TypeError('No recording endpoint specified');
    }
    if (room.isE2EEEnabled) {
      throw Error('Recording of encrypted meetings is currently not supported');
    }
    setProcessingRecRequest(true);
    setInitialRecStatus(isRecording);

    const endpoint = `${recordingEndpoint}/${isRecording ? 'stop' : 'start'}?roomName=${encodeURIComponent(room.name)}`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        console.error(
          'Error handling recording request, check server logs:',
          response.status,
          response.statusText,
        );
        setProcessingRecRequest(false);
      }
    } catch (error) {
      console.error('Error handling recording request:', error);
      setProcessingRecRequest(false);
    }
  }, [isRecording, recordingEndpoint, room]);

  const handleClose = React.useCallback(() => {
    layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' });
    onClose?.();
  }, [layoutContext?.widget, onClose]);

  if (isOpen === false) {
    return null;
  }

  return (
    <div className="settings-menu" style={{ width: '100%', position: 'relative' }} {...divProps}>
      <div className={styles.tabs}>
        {tabs.map(tab => {
          const config = settings[tab];
          if (!config) {
            return null;
          }
          return (
            <button
              key={tab}
              className={`${styles.tab} lk-button`}
              onClick={() => setActiveTab(tab)}
              aria-pressed={tab === activeTab}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      <div className="tab-content">
        {activeTab === 'media' && (
          <>
            {settings.media?.camera && (
              <>
                <h3>Camera</h3>
                <section>
                  <CameraSettings />
                </section>
              </>
            )}
            {settings.media?.microphone && (
              <>
                <h3>Microphone</h3>
                <section>
                  <MicrophoneSettings />
                </section>
              </>
            )}
            {settings.media?.speaker && (
              <>
                <h3>Speaker &amp; Headphones</h3>
                <section className="lk-button-group">
                  <span className="lk-button">Audio Output</span>
                  <div className="lk-button-group-menu">
                    <MediaDeviceMenu kind="audiooutput" />
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {activeTab === 'recording' && settings.recording && (
          <>
            <h3>Record Meeting</h3>
            <section>
              <p>{isRecording ? 'Meeting is currently being recorded' : 'No active recordings for this meeting'}</p>
              <button className="lk-button" disabled={processingRecRequest} onClick={toggleRoomRecording}>
                {isRecording ? 'Stop' : 'Start'} Recording
              </button>
            </section>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        <button className="lk-button" onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  );
}
