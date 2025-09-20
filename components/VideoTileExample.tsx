'use client';

import { useParticipants } from '@livekit/components-react';
import { AttributeBasedVideoTile } from './AttributeBasedVideoTile';
import * as React from 'react';

// 基础视频瓦片示例
export function VideoTileExample() {
  const participants = useParticipants();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
      padding: '16px'
    }}>
      {participants.map(participant => (
        <AttributeBasedVideoTile
          key={participant.identity}
          participant={participant}
          size="medium"
          onClick={(p) => console.log('Clicked participant:', p.name)}
        />
      ))}
    </div>
  );
}

// 麦位管理布局
export function MicManagementLayout() {
  const participants = useParticipants();

  // 分类参与者
  const hosts = participants.filter(p => p.attributes?.role === '2');
  const onMicParticipants = participants.filter(p => p.attributes?.mic_status === 'on_mic' && p.attributes?.role !== '2');
  const requestingParticipants = participants.filter(p => p.attributes?.mic_status === 'requesting');
  const offMicParticipants = participants.filter(p => p.attributes?.mic_status === 'off_mic' || !p.attributes?.mic_status);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      padding: '16px',
      background: '#111',
      color: '#fff',
      minHeight: '100vh'
    }}>
      {/* 主持人区域 */}
      {hosts.length > 0 && (
        <div>
          <h3 style={{ color: '#ff6b35', marginBottom: '16px' }}>主持人</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {hosts.map(participant => (
              <AttributeBasedVideoTile
                key={participant.identity}
                participant={participant}
                size="large"
              />
            ))}
          </div>
        </div>
      )}

      {/* 已上麦区域 */}
      {onMicParticipants.length > 0 && (
        <div>
          <h3 style={{ color: '#4CAF50', marginBottom: '16px' }}>已上麦 ({onMicParticipants.length})</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px'
          }}>
            {onMicParticipants.map(participant => (
              <AttributeBasedVideoTile
                key={participant.identity}
                participant={participant}
                size="medium"
              />
            ))}
          </div>
        </div>
      )}

      {/* 申请上麦区域 */}
      {requestingParticipants.length > 0 && (
        <div>
          <h3 style={{ color: '#FFC107', marginBottom: '16px' }}>申请上麦 ({requestingParticipants.length})</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '8px'
          }}>
            {requestingParticipants.map(participant => (
              <AttributeBasedVideoTile
                key={participant.identity}
                participant={participant}
                size="small"
                onClick={(p) => console.log('Process request for:', p.name)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 观众区域 */}
      {offMicParticipants.length > 0 && (
        <div>
          <h3 style={{ color: '#ccc', marginBottom: '16px' }}>观众 ({offMicParticipants.length})</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {offMicParticipants.slice(0, 20).map(participant => (
              <AttributeBasedVideoTile
                key={participant.identity}
                participant={participant}
                size="small"
                showName={false}
                showMicStatus={false}
              />
            ))}
            {offMicParticipants.length > 20 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#333',
                borderRadius: '8px',
                padding: '8px',
                fontSize: '12px',
                color: '#ccc'
              }}>
                +{offMicParticipants.length - 20} 更多
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 移动端优化布局
export function MobileOptimizedLayout() {
  const participants = useParticipants();

  const [focusedParticipant, setFocusedParticipant] = React.useState<string | null>(null);

  // 选择焦点参与者（主持人或第一个上麦的人）
  const mainParticipant = React.useMemo(() => {
    if (focusedParticipant) {
      return participants.find(p => p.identity === focusedParticipant);
    }

    // 自动选择主持人或第一个上麦的人
    const host = participants.find(p => p.attributes?.role === '2');
    if (host) return host;

    const onMic = participants.find(p => p.attributes?.mic_status === 'on_mic');
    if (onMic) return onMic;

    return participants[0];
  }, [participants, focusedParticipant]);

  const otherParticipants = participants.filter(p => p.identity !== mainParticipant?.identity);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#111',
      color: '#fff'
    }}>
      {/* 主视频区域 */}
      {mainParticipant && (
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px'
        }}>
          <AttributeBasedVideoTile
            participant={mainParticipant}
            size="large"
            style={{
              width: '100%',
              height: '100%',
              maxHeight: '70vh'
            }}
          />
        </div>
      )}

      {/* 其他参与者缩略图 */}
      {otherParticipants.length > 0 && (
        <div style={{
          padding: '8px',
          background: '#1a1a1a',
          borderTop: '1px solid #333'
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px'
          }}>
            {otherParticipants.map(participant => (
              <div
                key={participant.identity}
                style={{ flexShrink: 0 }}
                onClick={() => setFocusedParticipant(participant.identity)}
              >
                <AttributeBasedVideoTile
                  participant={participant}
                  size="small"
                  style={{
                    width: '80px',
                    height: '60px',
                    cursor: 'pointer'
                  }}
                  showName={false}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}