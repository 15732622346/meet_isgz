'use client';

import * as React from 'react';
import { GridLayout, TrackRefContext, VideoTrack, useParticipants } from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-core';
import type { Participant } from 'livekit-client';
import { Track } from 'livekit-client';

import { AttributeBasedVideoTile } from '@/components/AttributeBasedVideoTile';
import { FloatingWrapper } from '@/components/FloatingParticipantTile';

import type { MainVideoDisplayProps } from '../../types/conference-types';

const shouldRenderCameraTile = (
  trackRef: TrackReference,
  userRole?: number,
  isLocalCameraEnabled?: boolean,
): boolean => {
  const publication = trackRef.publication;
  const participant = trackRef.participant;

  if (trackRef.source !== Track.Source.Camera) {
    return true;
  }

  if (!publication || publication.isMuted || !publication.track) {
    return false;
  }

  if (!participant) {
    return false;
  }

  if (participant.isLocal && (userRole === 2 || userRole === 3)) {
    const localCameraActive = isLocalCameraEnabled ?? participant.isCameraEnabled;
    if (localCameraActive === false) {
      return false;
    }
  }

  return true;
};

export function MainVideoDisplayNoHost({
  roomInfo,
  tracks,
  userRole,
  userId,
  userName,
  isLocalCameraEnabled,
}: MainVideoDisplayProps) {
  const filteredTracks = React.useMemo(() => {
    return tracks.filter(track => {
      return track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare;
    });
  }, [tracks]);

  return (
    <div className="main-video-display">
      <div className="video-content">
        <div className="video-conference-active">
          {filteredTracks.filter(t => t.source === Track.Source.ScreenShare).length > 0 && (
            <GridLayout tracks={filteredTracks.filter(t => t.source === Track.Source.ScreenShare)}>
              <VideoTrack />
            </GridLayout>
          )}
          {filteredTracks
            .filter(t => t.source === Track.Source.Camera)
            .map((trackRef, index) => {
              const shouldRender = shouldRenderCameraTile(trackRef, userRole, isLocalCameraEnabled);

              if (!shouldRender) {
                return null;
              }
              return (
                <FloatingWrapper
                  key={trackRef.participant?.sid ? `${trackRef.participant.sid}${trackRef.source}` : String(index)}
                  initialPosition={{ x: 100 + index * 50, y: 100 + index * 50 }}
                  width={180}
                  height={170}
                >
                  <TrackRefContext.Provider value={trackRef}>
                    <AttributeBasedVideoTile
                      participant={trackRef.participant}
                      showName={false}
                      showConnectionQuality={false}
                      showRoleLabel={false}
                      showMicStatus={false}
                      size="auto"
                    />
                  </TrackRefContext.Provider>
                </FloatingWrapper>
              );
            })}
        </div>
        <style jsx>{`
          .video-content {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: #1a1a1a;
            color: white;
          }
        `}</style>
      </div>
    </div>
  );
}

export function MainVideoDisplay({
  roomInfo,
  tracks,
  userRole,
  userId,
  userName,
  isLocalCameraEnabled,
}: MainVideoDisplayProps) {
  const participants = useParticipants();

  const getParticipantRole = (participant: Participant): number => {
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1', 10);
    return role;
  };

  const filteredTracks = React.useMemo(() => {
    return tracks.filter(track => {
      return track.source === Track.Source.Camera || track.source === Track.Source.ScreenShare;
    });
  }, [tracks]);

  const currentUserIsHost = userRole === 2 || userRole === 3;

  const otherHostParticipant = participants.find(p => {
    const role = getParticipantRole(p);
    return role === 2 || role === 3;
  });

  const hasHost = currentUserIsHost || otherHostParticipant !== undefined;

  return (
    <div className="main-video-display">
      <div className="video-content">
        {!hasHost ? (
          <div className="waiting-for-host">
            <div className="waiting-content">
              <div className="waiting-icon"></div>
              <h3>等待主持人进入房间</h3>
              <p>
                {currentUserIsHost
                  ? '您是主持人，正在初始化会议，请稍候...'
                  : '主持人尚未入场，请稍候...'}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                  调试信息: userRole={userRole}, hasHost={hasHost.toString()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="video-conference-active">
            {filteredTracks.filter(track => track.source === Track.Source.ScreenShare).length > 0 && (
              <GridLayout tracks={filteredTracks.filter(track => track.source === Track.Source.ScreenShare)}>
                <VideoTrack />
              </GridLayout>
            )}
            {filteredTracks
              .filter(track => track.source === Track.Source.Camera)
              .map((trackRef, index) => {
                const shouldRender = shouldRenderCameraTile(trackRef, userRole, isLocalCameraEnabled);

                if (!shouldRender) {
                  return null;
                }
                return (
                  <FloatingWrapper
                    key={trackRef.participant?.sid ? `${trackRef.participant.sid}${trackRef.source}` : String(index)}
                    initialPosition={{ x: 100 + index * 50, y: 100 + index * 50 }}
                    width={180}
                    height={170}
                  >
                    <TrackRefContext.Provider value={trackRef}>
                      <AttributeBasedVideoTile
                        participant={trackRef.participant}
                        showName={false}
                        showConnectionQuality={false}
                        showRoleLabel={false}
                        showMicStatus={false}
                        size="auto"
                      />
                    </TrackRefContext.Provider>
                  </FloatingWrapper>
                );
              })}
          </div>
        )}
        <style jsx>{`
          .header-user-info {
            display: flex;
            align-items: center;
            height: 100%;
            gap: 6px;
            color: #fff;
          }
          .user-avatar {
            font-size: 12px;
            color: #4a9eff;
          }
          .user-name {
            font-size: 12px;
            font-weight: 500;
            color: #4a9eff;
            white-space: nowrap;
          }
          .user-role {
            font-size: 11px;
            color: #888;
            white-space: nowrap;
          }
          .user-permissions {
            font-size: 10px;
            color: #666;
            white-space: nowrap;
            letter-spacing: 1px;
          }
          .video-content {
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: #1a1a1a;
            color: white;
          }
          .waiting-for-host {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100%;
            text-align: center;
          }
          .waiting-content {
            max-width: 400px;
            padding: 40px;
          }
          .waiting-icon {
            font-size: 48px;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
          }
          .waiting-content h3 {
            color: #4a9eff;
            margin-bottom: 16px;
            font-size: 20px;
          }
          .waiting-content p {
            color: #aaa;
            font-size: 14px;
            line-height: 1.6;
          }
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          .video-conference-active {
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .video-conference-active :global(.lk-grid-layout) {
            width: 100% !important;
            height: 100% !important;
          }
          .video-conference-active :global(.lk-participant-tile) {
            width: 100% !important;
            height: 100% !important;
          }
          :global(.lk-chat) {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
          }
          :global(.lk-chat-header) {
            display: none !important;
          }
          :global(.lk-chat-messages) {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            flex: 1 !important;
          }
        `}</style>
      </div>
    </div>
  );
}
