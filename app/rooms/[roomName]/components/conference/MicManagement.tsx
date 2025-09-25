'use client';

import * as React from 'react';
import { ParticipantContext, ParticipantLoop, ParticipantName, useParticipants, useRoomContext } from '@livekit/components-react';
import type { Participant } from 'livekit-client';

import { useUserContext } from '@/contexts/UserContext';
import { resolveAssetPath } from '@/lib/assetPath';
import { callGatewayApi } from '@/lib/api-client';
import { API_CONFIG } from '@/lib/config';
import {
  shouldShowInMicList,
  getParticipantMetadataSource,
  parseParticipantMetadata,
  getMicStatusText,
} from '@/lib/token-utils';

import type { MicListProps, MicParticipantTileProps } from '../../types/conference-types';
import { extractParticipantUid } from '../../utils/conference-utils';

export function MicParticipantList({ currentUserRole, currentUserName, roomInfo, userToken, hostUserId, maxMicSlots, setDebugInfo }: MicListProps) {
  const { resolveGatewayToken, userInfo } = useUserContext();
  const allParticipants = useParticipants();
  // 🎯 LiveKit原生角色获取函数
  const getParticipantRole = (participant: Participant): number => {
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1');
    return role;
  };
  // 🎯 批准上麦函数 - Gateway API
  const handleApproveMic = async (participant: Participant) => {
    if (!roomInfo?.name) return;
    try {


      // 获取Gateway token
      const token = await resolveGatewayToken();
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        throw new Error('缺少参与者 UID，无法批准上麦');
      }
      const hostUid = userInfo?.uid;
      if (!hostUid) {
        throw new Error('缺少主持人 UID，无法批准上麦');
      }

      // 调用Gateway API批准上麦
      const response = await callGatewayApi('/api/v1/participants/grant-publish', {
        room_id: roomInfo.name,
        participant_identity: participant.identity,
        operator_id: hostUid,
        host_user_id: hostUid,
        user_uid: targetUid,
        action: 'approve',
        publish_audio: true,
        publish_video: false,
        approve_time: new Date().toISOString(),
      }, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.success) {

      } else {
        console.error('❌ 批准上麦失败:', response.message);
        alert(`❌ 批准失败: ${response.message}`);
      }
    } catch (error) {
      console.error(`❌ 批准上麦异常: ${error}`);
      alert(`❌ 批准失败: ${(error as Error).message}`);
    }
  };

  // 🎯 获取需要显示在麦位列表中的参与者
  const micListParticipants = React.useMemo(() => {
    const visibleParticipants = allParticipants.filter(participant =>
      shouldShowInMicList(getParticipantMetadataSource(participant))
    );

    if (!hostUserId) {
      return visibleParticipants;
    }

    const hostAlreadyVisible = visibleParticipants.some(participant =>
      extractParticipantUid(participant) === hostUserId
    );

    if (hostAlreadyVisible) {
      return visibleParticipants;
    }

    const hostParticipant = allParticipants.find(participant =>
      extractParticipantUid(participant) === hostUserId
    );

    if (!hostParticipant) {
      return visibleParticipants;
    }

    return [hostParticipant, ...visibleParticipants];
  }, [allParticipants, hostUserId]);

  return (
    <div className="mic-participant-list">
      {micListParticipants.length > 0 ? (
        <ParticipantLoop participants={micListParticipants}>
          <MicParticipantTile
            currentUserRole={currentUserRole}
            onApproveMic={handleApproveMic}
            userToken={userToken}
            hostUserId={hostUserId}
            setDebugInfo={setDebugInfo}
            currentUserName={currentUserName}
          />
        </ParticipantLoop>
      ) : (
        <div style={{
          color: '#888',
          textAlign: 'center',
          padding: '20px',
          fontSize: '12px'
        }}>
          暂无用户申请上麦
        </div>
      )}
    </div>
  );
}

function MicParticipantTile({ currentUserRole, onApproveMic, userToken, hostUserId, setDebugInfo, currentUserName }: MicParticipantTileProps) {
  const { resolveGatewayToken, userInfo } = useUserContext();
  const participant = React.useContext(ParticipantContext);
  const [showControlMenu, setShowControlMenu] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const room = useRoomContext();
  if (!participant) return null;
  const getParticipantRole = (participant: Participant): number => {
    const status = parseParticipantMetadata(getParticipantMetadataSource(participant));
    return parseInt(status.role || '1', 10);
  };
  // 🎯 获取麦克风状态图标
  const getMicStatusIcon = (status: ReturnType<typeof parseParticipantMetadata>): string => {
    const micStatus = status.micStatus;
    if (micStatus === 'requesting') {
      return resolveAssetPath('/images/needmic.png');
    }
    if (micStatus === 'on_mic') {
      return resolveAssetPath('/images/mic.png');
    }
    if (micStatus === 'muted') {
      return resolveAssetPath('/images/nomic.png');
    }
    return resolveAssetPath('/images/nomic.png');
  };
  const participantMetadataSource = getParticipantMetadataSource(participant);
  const participantStatus = parseParticipantMetadata(participantMetadataSource);
  const participantUid = extractParticipantUid(participant);
  const isFallbackHost = hostUserId !== undefined && participantUid === hostUserId;
  const role = isFallbackHost ? 2 : parseInt(participantStatus.role || '1', 10);
  const roleText = role === 3 ? '管理员' : role === 2 ? '主持人' : role === 0 ? '游客' : '普通会员';
  const micStatusText = isFallbackHost ? '' : getMicStatusText(participantMetadataSource);
  const micStatusIcon = isFallbackHost ? resolveAssetPath('/images/mic.png') : getMicStatusIcon(participantStatus);
  const roleAndStatusText = micStatusText ? `${roleText} - ${micStatusText}` : roleText;
  const isHost = currentUserRole === 2 || currentUserRole === 3;
  const isTargetMember = role === 1;
  // 🎯 判断当前参与者是否是自己
  const isSelf = participant.name === currentUserName || participant.identity === currentUserName;
  // 🎯 主持人控制API调用函数
  const callControlAPI = async (action: string, additionalData: any = {}) => {
    if (!room?.name) return;
    setIsLoading(true);
    try {


      // 获取Gateway token
      const token = await resolveGatewayToken();
      const hostUid = userInfo?.uid;
      if (!hostUid) {
        throw new Error('缺少主持人 UID，无法执行操作');
      }
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        throw new Error('缺少参与者 UID，无法执行操作');
      }

      let endpoint = '';
      let payload: any = {
        room_id: room.name,
        host_user_id: hostUid,
        operator_id: hostUid,
        participant_identity: participant.identity,
        ...additionalData
      };

      // 根据action选择不同的API端点
      switch (action) {
        case 'approve_mic':
          endpoint = '/api/v1/participants/grant-publish';
          payload = {
            ...payload,
            action: 'approve',
            publish_audio: true,
            publish_video: false,
            approve_time: new Date().toISOString(),
            user_uid: targetUid,
          };
          break;
        case 'kick_mic':
          endpoint = '/api/v1/participants/kick-mic';
          payload = {
            ...payload,
            action: 'kick_mic',
            user_uid: targetUid,
            kick_time: new Date().toISOString(),
          };
          break;
        case 'mute':
          endpoint = '/api/v1/participants/batch-set-microphone';
          payload = {
            ...payload,
            action: 'mute',
            user_uids: [targetUid],
            mute_status: true,
            mute_time: new Date().toISOString(),
          };
          break;
        case 'unmute':
          endpoint = '/api/v1/participants/batch-set-microphone';
          payload = {
            ...payload,
            action: 'unmute',
            user_uids: [targetUid],
            mute_status: false,
            unmute_time: new Date().toISOString(),
          };
          break;
        default:
          throw new Error(`不支持的操作: ${action}`);
      }

      // 调用Gateway API
      const response = await callGatewayApi(endpoint, payload, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.success) {

        // 🎯 添加成功提示
        const actionText = action === 'mute' ? '禁麦' :
                          action === 'unmute' ? '解除禁麦' :
                          action === 'kick_mic' ? '踢下麦位' :
                          action === 'approve_mic' ? '批准上麦' : action;
        alert(`✅ 操作成功：${participant.name} ${actionText}成功`);
        setShowControlMenu(false);
      } else {
        console.error(`❌ ${action} 操作失败:`, response.message);
        alert(`操作失败: ${response.message}`);
      }
    } catch (error) {
      console.error(`❌ ${action} 操作异常:`, error);
      alert(`操作失败: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };
  // 🎯 更新participant attributes的API调用
  const updateParticipantAttributes = async (attributes: Record<string, string>) => {
    if (!room?.name) return;
    setIsLoading(true);
    try {
      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfoText = `🎯 ${timestamp} 批准上麦 (MicParticipantTile)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  属性: ${JSON.stringify(attributes)}\n` +
        `  Token状态: ${userToken ? '✅ 存在' : '❌ 不存在'}\n` +
        `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
      // 如果有调试函数，输出到调试面板；否则输出到控制台
      if (setDebugInfo) {
        setDebugInfo(prev => prev + debugInfoText);
      } else {

      }
      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
        if (setDebugInfo) {
          setDebugInfo(prev => prev + `  ✅ 已添加Authorization头\n`);
        }
      } else {
        if (setDebugInfo) {
          setDebugInfo(prev => prev + `  ⚠️ 没有userToken，将依赖Session认证\n`);
        }
      }
      await API_CONFIG.load();
      const baseUrl = API_CONFIG.BASE_URL;
      if (!baseUrl) {
        throw new Error('未配置 Gateway 基础地址');
      }

      const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
      // 🔧 修复：调用正确的API来真正控制参与者
      const response = await fetch(`${normalizedBaseUrl}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        credentials: 'include', // 🔧 修复：携带Session Cookie
        body: JSON.stringify({
          action: 'approve_mic',
          room_name: room.name,
          target_identity: participant.identity,
          operator_identity: 'admin' // 可以根据需要传递真实的操作者身份
        }),
      });
      const result = await response.json();
      if (result.success) {

        if (setDebugInfo) {
          setDebugInfo(prev => prev + `  ✅ 批准上麦成功: ${JSON.stringify(result)}\n\n`);
        }
        // 🎯 添加成功提示
        alert(`✅ 操作成功：${participant.name} 已批准上麦`);
        setShowControlMenu(false);
      } else {
        console.error('❌ 更新属性失败:', result);
        if (setDebugInfo) {
          setDebugInfo(prev => prev + `  ❌ 批准上麦失败: HTTP ${response.status} - ${JSON.stringify(result)}\n\n`);
        }
        alert(`操作失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('❌ 更新属性异常:', error);
      if (setDebugInfo) {
        setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
      }
      alert('操作失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };
  // 🎯 4个控制操作
  const handleApproveMic = () => {
    callControlAPI('approve_mic');
  };
  const handleKickFromMic = () => {
    callControlAPI('kick_mic');
  };
  const handleMuteMic = () => {
    callControlAPI('mute');
  };
  const handleUnmuteMic = () => {
    callControlAPI('unmute');
  };
  // 🎯 点击外部关闭菜单
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showControlMenu) {
        setShowControlMenu(false);
      }
    };
    if (showControlMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showControlMenu]);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px',
      margin: '4px 0',
      background: '#333',
      borderRadius: '4px',
      color: '#fff',
      position: 'relative'
    }}>
      {/* 用户信息 - 移到最左边 */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px' }}>
          <ParticipantName />
        </div>
        <div style={{ fontSize: '11px', color: '#888' }}>
          {roleAndStatusText}
        </div>
      </div>
      {/* 麦克风状态图标 - 移到中间 */}
      <div style={{ 
        width: '24px', 
        height: '24px', 
        marginRight: '8px',
        marginLeft: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <img 
          src={micStatusIcon} 
          alt={micStatusText} 
          style={{ 
            width: '20px', 
            height: '20px' 
          }} 
        />
      </div>
      {/* 主持人控制按钮 - 保持在右边 */}
      {isHost && !isSelf && (
        <div style={{ position: 'relative' }}>
          {/* 三个点按钮 */}
          <button
            style={{
              padding: '4px 8px',
              background: 'transparent',
              color: '#fff',
              border: '1px solid #666',
              borderRadius: '3px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={(e) => {
              e.stopPropagation();
              setShowControlMenu(!showControlMenu);
            }}
            disabled={isLoading}
          >
            {isLoading ? '...' : '⋮'}
          </button>
          {/* 控制菜单 */}
          {showControlMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 1000,
                minWidth: '120px',
                marginTop: '2px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 批准上麦 */}
              {micStatusText === '申请中' && (
                <button
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#333',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                    borderBottom: '1px solid #eee'
                  }}
                  onClick={handleApproveMic}
                  disabled={isLoading}
                >
                  ✅ 批准上麦
                </button>
              )}
              {/* 踢下麦 */}
              <button
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  color: '#333',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderBottom: '1px solid #eee'
                }}
                onClick={handleKickFromMic}
                disabled={isLoading}
              >
                🚫 踢下麦
              </button>
              {/* 禁麦 */}
              {micStatusText === '已上麦' && (
                <button
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#333',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                    borderBottom: '1px solid #eee'
                  }}
                  onClick={handleMuteMic}
                  disabled={isLoading}
                >
                  🔇 禁麦
                </button>
              )}
              {/* 恢复发言 - 修复：对已静音用户显示恢复发言选项 */}
              {micStatusText === '已静音' && (
                <button
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#333',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '12px',
                    borderBottom: '1px solid #eee'
                  }}
                  onClick={handleUnmuteMic}
                  disabled={isLoading}
                >
                  🔊 恢复发言
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
