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
  initialRoomDetails?: RoomDetails | null;
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
  initialRoomDetails,
  roomName,
  inviteCode: _inviteCode,
  userToken,
  roomCtx,
  participants,
  setChatGlobalMute,
  setDebugInfo,
  hostUserId,
  userRole,
}: UseRoomManagementOptions): UseRoomManagementResult {
  const [roomDetails, setRoomDetails] = React.useState<RoomDetails | null>(
    initialRoomDetails ?? null,
  );
  const [forceUpdateTrigger, setForceUpdateTrigger] = React.useState(0);

  const initialRoomDetailsKey = React.useMemo(() => {
    if (!initialRoomDetails) {
      return null;
    }
    return JSON.stringify(initialRoomDetails);
  }, [initialRoomDetails]);

  React.useEffect(() => {
    if (!initialRoomDetails) {
      return;
    }
    setRoomDetails(prev => ({
      ...prev,
      ...initialRoomDetails,
    }));
  }, [initialRoomDetailsKey, initialRoomDetails]);

  React.useEffect(() => {
    if (initialRoomDetails?.chatState !== undefined) {
      setChatGlobalMute(initialRoomDetails.chatState !== 1);
    }
  }, [initialRoomDetails?.chatState, setChatGlobalMute]);

  React.useEffect(() => {
    if (!roomCtx || !roomName || typeof roomCtx.on !== 'function' || typeof roomCtx.off !== 'function') {
      return;
    }

    const handleMetadataChanged = () => {
      try {
        if (!roomCtx.metadata) {
          return;
        }
        const metadata = JSON.parse(roomCtx.metadata);
        if (metadata && typeof metadata === 'object') {
          setRoomDetails(prev => {
            const next: RoomDetails = {
              ...(prev ?? {}),
            };
            if (typeof metadata.maxMicSlots === 'number') {
              next.maxMicSlots = metadata.maxMicSlots;
            }
            if (!next.roomName && roomName) {
              next.roomName = roomName;
            }
            if (typeof metadata.roomState === 'number') {
              next.roomState = metadata.roomState;
            }
            if (typeof metadata.chatState === 'number') {
              next.chatState = metadata.chatState;
            }
            return next;
          });
          if (typeof metadata.chatState === 'number') {
            setChatGlobalMute(metadata.chatState !== 1);
          }
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
          ` ${timestamp} API调用开始
` +
          `  房间: ${roomName}
` +
          `  目标身份: ${participantIdentity}
` +
          `  属性: ${JSON.stringify(attributes)}
` +
          `  Token状态: ${userToken ? '已提供' : '未提供'}
` +
          `  Token长度: ${userToken?.length || 'N/A'}
` +
          `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}
`;
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

        await API_CONFIG.load();
        const baseUrl = API_CONFIG.BASE_URL;
        if (!baseUrl) {
          setDebugInfo(prev => prev + '   ⚠️ Gateway 基础地址未配置，跳过属性更新\n');
          return;
        }

        const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
        const response = await fetch(`${normalizedBaseUrl}/api/update-participant.php`, {
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
          setDebugInfo(prev => prev + `   API调用成功: ${JSON.stringify(result)}

`);
        } else {
          setDebugInfo(prev => prev + `   API调用失败: ${JSON.stringify(result)}

`);
        }
      } catch (error) {
        setDebugInfo(prev => prev + `   请求异常: ${String(error)}

`);
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
