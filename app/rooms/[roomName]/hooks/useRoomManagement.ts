'use client';

import * as React from 'react';
import type { Participant } from 'livekit-client';

import { API_CONFIG } from '@/lib/config';
import { getParticipantMetadataSource, parseParticipantMetadata } from '@/lib/token-utils';

import type { RoomDetails } from '../../types/conference-types';

type RoomContextLike = {
  metadata?: string | null;
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  localParticipant?: {
    publishData: (payload: Uint8Array, options?: { reliable?: boolean }) => void;
  };
} | null;

interface UseRoomManagementOptions {
  roomName?: string;
  inviteCode?: string;
  userToken?: string;
  roomCtx: RoomContextLike;
  participants: Participant[];
  setChatGlobalMute: React.Dispatch<React.SetStateAction<boolean>>;
  setDebugInfo: React.Dispatch<React.SetStateAction<string>>;
  hostUserId?: number;
  userRole?: number;
}

interface UseRoomManagementResult {
  roomDetails: RoomDetails | null;
  participantRolesInfo: Record<string, number>;
  getParticipantRole: (participant: Participant) => number;
  updateParticipantAttributes: (
    participantIdentity: string,
    attributes: Record<string, string>
  ) => Promise<void>;
  refreshParticipantRoles: () => void;
}

export function useRoomManagement({
  roomName,
  inviteCode,
  userToken,
  roomCtx,
  participants,
  setChatGlobalMute,
  setDebugInfo,
  hostUserId,
  userRole,
}: UseRoomManagementOptions): UseRoomManagementResult {
  const [roomDetails, setRoomDetails] = React.useState<RoomDetails | null>(null);
  const [forceUpdateTrigger, setForceUpdateTrigger] = React.useState(0);

  React.useEffect(() => {
    if (!roomName || !inviteCode) {
      return;
    }
    let cancelled = false;

    const fetchRoomDetails = async () => {
      try {
        const headers: Record<string, string> = {};
        if (userToken) {
          headers.Authorization = `Bearer ${userToken}`;
        }
        const params = new URLSearchParams({
          room_id: roomName,
          invite_code: inviteCode,
        });
        const response = await fetch(`/api/v1/rooms/detail?${params.toString()}`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (cancelled || !payload?.data) {
          return;
        }
        const data = payload.data as {
          max_mic_slots?: number | string;
          room_name?: string;
          room_state?: number;
          chat_global_mute?: boolean | string | number;
        };
        const parsedMaxSlots = Number(data.max_mic_slots);
        setRoomDetails(prev => {
          const next: RoomDetails = { ...(prev ?? {}) };
          if (Number.isFinite(parsedMaxSlots)) {
            next.maxMicSlots = parsedMaxSlots;
          }
          if (typeof data.room_name === 'string' && data.room_name) {
            next.roomName = data.room_name;
          }
          if (typeof data.room_state === 'number') {
            next.roomState = data.room_state;
          }
          return Object.keys(next).length > 0 ? next : prev;
        });
        if (data.chat_global_mute !== undefined) {
          const muteValue = data.chat_global_mute;
          if (muteValue === true || muteValue === 'true' || muteValue === 1) {
            setChatGlobalMute(true);
          } else if (muteValue === false || muteValue === 'false' || muteValue === 0) {
            setChatGlobalMute(false);
          }
        }
      } catch (error) {
        console.error('[room] fetch room detail error', error);
      }
    };

    fetchRoomDetails();
    return () => {
      cancelled = true;
    };
  }, [roomName, inviteCode, userToken, setChatGlobalMute]);

  React.useEffect(() => {
    if (!roomCtx || !roomName || typeof roomCtx.on !== 'function' || typeof roomCtx.off !== 'function') {
      return;
    }
    const handleMetadataChanged = () => {
      try {
        if (!roomCtx.metadata) return;
        const metadata = JSON.parse(roomCtx.metadata);
        if (metadata && typeof metadata.maxMicSlots === 'number') {
          setRoomDetails(prev => {
            if (!prev) {
              return {
                maxMicSlots: metadata.maxMicSlots,
                roomName: roomName || '',
                roomState: 1,
              };
            }
            return {
              ...prev,
              maxMicSlots: metadata.maxMicSlots,
            };
          });
        }
      } catch (error) {
        console.error('解析房间元数据失败:', error);
      }
    };

    handleMetadataChanged();
    roomCtx.on('metadata_changed', handleMetadataChanged);
    return () => {
      roomCtx.off('metadata_changed', handleMetadataChanged);
    };
  }, [roomCtx, roomName]);

  const getParticipantRole = React.useCallback(
    (participant: Participant) => {
      const metadataSource = getParticipantMetadataSource(participant);
      const metadata = parseParticipantMetadata(metadataSource);
      const attributes = participant.attributes || {};

      const normalizeRole = (value: unknown): number | undefined => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (!trimmed) {
            return undefined;
          }
          const numeric = Number(trimmed);
          if (Number.isFinite(numeric)) {
            return numeric;
          }
          switch (trimmed.toLowerCase()) {
            case 'admin':
            case 'administrator':
              return 3;
            case 'host':
            case 'moderator':
              return 2;
            case 'student':
            case 'member':
            case 'user':
              return 1;
            case 'guest':
              return 0;
            default:
              return undefined;
          }
        }
        return undefined;
      };

      const metadataRole = normalizeRole(metadata?.role) ?? normalizeRole(metadata?.role_name);
      const attributeRole = normalizeRole(attributes.role);
      const localOverride = participant.isLocal && typeof userRole === 'number' ? userRole : undefined;
      const hostIdentity = typeof hostUserId === 'number' ? `user_${hostUserId}` : undefined;
      const identityMatchesHost = hostIdentity !== undefined && participant.identity === hostIdentity;

      if (localOverride !== undefined) {
        return localOverride;
      }
      if (identityMatchesHost) {
        return metadataRole ?? attributeRole ?? 2;
      }
      return metadataRole ?? attributeRole ?? 1;
    },
    [userRole, hostUserId],
  );

  const participantRolesInfo = React.useMemo(() => {
    const roles: Record<string, number> = {};
    participants.forEach(participant => {
      roles[participant.identity] = getParticipantRole(participant);
    });
    return roles;
  }, [participants, getParticipantRole, forceUpdateTrigger]);

  React.useEffect(() => {
    if (!participants.length) {
      return;
    }
    const handlersMap = new Map<string, () => void>();

    const handleAttributesChanged = (participant: Participant) => {
      if (participant.attributes?.chatGlobalMute !== undefined) {
        const newMuteState = participant.attributes.chatGlobalMute === 'true';
        setChatGlobalMute(newMuteState);
      }
      setForceUpdateTrigger(prev => prev + 1);
    };

    participants.forEach(participant => {
      const handler = () => handleAttributesChanged(participant);
      handlersMap.set(participant.sid, handler);
      participant.on?.('attributesChanged', handler);
    });

    return () => {
      participants.forEach(participant => {
        const handler = handlersMap.get(participant.sid);
        if (handler) {
          participant.off?.('attributesChanged', handler);
        }
      });
    };
  }, [participants, setChatGlobalMute]);

  const updateParticipantAttributes = React.useCallback(
    async (participantIdentity: string, attributes: Record<string, string>) => {
      if (!roomName) {
        console.error('无法更新参与者属性，缺少房间ID');
        return;
      }
      try {
        const timestamp = new Date().toLocaleTimeString();
        const tokenDebugInfo =
          ` ${timestamp} API调用开始\n` +
          `  房间: ${roomName}\n` +
          `  目标身份: ${participantIdentity}\n` +
          `  属性: ${JSON.stringify(attributes)}\n` +
          `  Token状态: ${userToken ? '已提供' : '未提供'}\n` +
          `  Token长度: ${userToken?.length || 'N/A'}\n` +
          `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
        setDebugInfo(prev => prev + tokenDebugInfo);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (userToken) {
          headers.Authorization = `Bearer ${userToken}`;
          setDebugInfo(prev => prev + '   已附加 Authorization 头\n');
        } else {
          setDebugInfo(prev => prev + '   未提供 userToken，将使用 Session 认证\n');
        }

        const response = await fetch(`${API_CONFIG.BASE_URL}/api/update-participant.php`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            room_name: roomName,
            participant_identity: participantIdentity,
            attributes,
          }),
        });
        const result = await response.json();
        if (result.success) {
          setDebugInfo(prev => prev + `   API调用成功: ${JSON.stringify(result)}\n\n`);
        } else {
          setDebugInfo(prev => prev + `   API调用失败: ${JSON.stringify(result)}\n\n`);
        }
      } catch (error) {
        setDebugInfo(prev => prev + `   请求异常: ${String(error)}\n\n`);
      }
    },
    [roomName, userToken, setDebugInfo],
  );

  const refreshParticipantRoles = React.useCallback(() => {
    setForceUpdateTrigger(prev => prev + 1);
  }, []);

  return {
    roomDetails,
    participantRolesInfo,
    getParticipantRole,
    updateParticipantAttributes,
    refreshParticipantRoles,
  };
}
