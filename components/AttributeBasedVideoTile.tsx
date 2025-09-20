'use client';

import {
  ParticipantName,
  ParticipantTile,
  VideoTrack,
  type ParticipantTileProps,
} from '@livekit/components-react';
import { Participant, Track } from 'livekit-client';
import * as React from 'react';

interface AttributeBasedVideoTileProps {
  participant: Participant;
  size?: 'small' | 'medium' | 'large' | 'auto';
  showName?: boolean;
  showRoleLabel?: boolean;
  showMicStatus?: boolean;
  onClick?: (participant: Participant) => void;
  onDoubleClick?: (participant: Participant) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function AttributeBasedVideoTile({
  participant,
  size = 'auto',
  showName = true,
  showRoleLabel = true,
  showMicStatus = true,
  onClick,
  onDoubleClick,
  className = '',
  style = {},
}: AttributeBasedVideoTileProps) {
  const getAttributesSnapshot = React.useCallback(
    () => ({ ...(participant.attributes ?? {}) }) as Record<string, string | undefined>,
    [participant],
  );

  const [attributes, setAttributes] = React.useState<Record<string, string | undefined>>(
    () => getAttributesSnapshot(),
  );

  React.useEffect(() => {
    const handleAttributesChanged = () => {
      setAttributes(getAttributesSnapshot());
    };

    handleAttributesChanged();
    participant.on('attributesChanged', handleAttributesChanged);

    return () => {
      participant.off('attributesChanged', handleAttributesChanged);
    };
  }, [participant, getAttributesSnapshot]);

  type TrackRef = NonNullable<ParticipantTileProps['trackRef']>;

  const videoTrackRef = React.useMemo<TrackRef>(
    () => ({
      participant,
      source: Track.Source.Camera,
    }),
    [participant],
  );

  const isHost = attributes.role === '2';
  const isOnMic = attributes.mic_status === 'on_mic';
  const isRequesting = attributes.mic_status === 'requesting';
  const isMuted = attributes.mic_status === 'muted';

  const tileClasses = [
    'attribute-based-video-tile',
    isHost ? 'video-tile-host' : 'video-tile-member',
    isOnMic ? 'video-tile-on-mic' : '',
    isRequesting ? 'video-tile-requesting' : '',
    isMuted ? 'video-tile-muted' : '',
    `video-tile-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const computedStyle: React.CSSProperties = {
    ...style,
    border: isHost
      ? '2px solid #ff6b35'
      : isOnMic
      ? '2px solid #4CAF50'
      : isRequesting
      ? '2px solid #FFC107'
      : isMuted
      ? '2px solid #f44336'
      : '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
    cursor: onClick ? 'pointer' : 'default',
  };

  const handleClick = () => {
    if (onClick) onClick(participant);
  };

  const handleDoubleClick = () => {
    if (onDoubleClick) onDoubleClick(participant);
  };

  return (
    <div className={tileClasses} style={computedStyle} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      <ParticipantTile trackRef={videoTrackRef}>
        <VideoTrack />
        {showName && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <ParticipantName />
            {showRoleLabel && isHost && (
              <span style={{ color: '#ff6b35', marginLeft: '4px' }}>(主持人)</span>
            )}
            {showMicStatus && (
              <span style={{ marginLeft: '4px' }}>
                {isOnMic && '🎤'}
                {isRequesting && '✋'}
                {isMuted && '🔇'}
              </span>
            )}
          </div>
        )}
      </ParticipantTile>
    </div>
  );
}

// 预设组件
export function HostVideoTile({ participant, ...props }: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile participant={participant} size="large" {...props} />;
}

export function MemberVideoTile({ participant, ...props }: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile participant={participant} size="medium" {...props} />;
}

export function CompactVideoTile({ participant, ...props }: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile participant={participant} size="small" {...props} />;
}

// 批量创建工具函数
export function createVideoTilesFromParticipants(
  participants: Participant[],
  options: Partial<AttributeBasedVideoTileProps> = {},
) {
  return participants.map(participant => (
    <AttributeBasedVideoTile key={participant.identity} participant={participant} {...options} />
  ));
}
