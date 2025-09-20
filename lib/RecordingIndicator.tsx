'use client';

import React from 'react';

interface RecordingIndicatorProps {
  room?: any;
  isRecording?: boolean;
}

export function RecordingIndicator({ room, isRecording }: RecordingIndicatorProps) {
  const [recording, setRecording] = React.useState(isRecording || false);

  React.useEffect(() => {
    if (!room) return;

    const handleRecordingChanged = (recording: boolean) => {
      setRecording(recording);
    };

    // Listen for recording state changes
    room.on('recordingChanged', handleRecordingChanged);

    return () => {
      room.off('recordingChanged', handleRecordingChanged);
    };
  }, [room]);

  if (!recording) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#ff4444',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      animation: 'pulse 2s infinite'
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: 'white',
        animation: 'blink 1s infinite'
      }}></div>
      正在录制
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}