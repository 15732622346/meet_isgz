'use client';

import React from 'react';
import {
  LiveKitRoom,
  VideoConference,
  useParticipants,
  useTracks,
  ParticipantTile,
  ControlBar,
  Chat,
  RoomAudioRenderer,
  useRoomContext,
} from '@livekit/components-react';
import { Track, Room } from 'livekit-client';

interface CustomVideoConferenceProps {
  room?: Room;
  token?: string;
  serverUrl?: string;
  audio?: boolean;
  video?: boolean;
  connect?: boolean;
  style?: React.CSSProperties;
}

function ConferenceContent() {
  const room = useRoomContext();
  const participants = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#111',
      color: '#fff'
    }}>
      {/* 主视频区域 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* 视频网格 */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '8px',
          padding: '8px',
          overflow: 'auto'
        }}>
          {tracks.map((track, index) => (
            <ParticipantTile
              key={`${track.participant.identity}-${track.source}-${index}`}
              trackRef={track}
              style={{
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            />
          ))}
        </div>

        {/* 控制栏 */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid #333'
        }}>
          <ControlBar variation="verbose" />
        </div>
      </div>

      {/* 聊天区域 - 可选 */}
      <div style={{
        width: '300px',
        borderLeft: '1px solid #333',
        display: 'none' // 默认隐藏，可以根据需要显示
      }}>
        <Chat style={{ height: '100%' }} />
      </div>

      {/* 音频渲染器 */}
      <RoomAudioRenderer />
    </div>
  );
}

export function CustomVideoConference({
  room,
  token,
  serverUrl,
  audio = true,
  video = true,
  connect = true,
  style = {}
}: CustomVideoConferenceProps) {
  if (room && connect) {
    return (
      <div style={{ height: '100vh', ...style }}>
        <ConferenceContent />
      </div>
    );
  }

  if (token && serverUrl) {
    return (
      <div style={{ height: '100vh', ...style }}>
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={connect}
          audio={audio}
          video={video}
          style={{ height: '100%' }}
        >
          <ConferenceContent />
        </LiveKitRoom>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#111',
      color: '#fff',
      ...style
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2>等待加入会议...</h2>
        <p>正在获取房间信息</p>
      </div>
    </div>
  );
}