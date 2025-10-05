'use client';
import * as React from 'react';
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  LayoutContextProvider,
  ParticipantName,
  ConnectionQualityIndicator,
  TrackMutedIndicator,
  TrackRefContext,
  VideoTrack,
  ParticipantLoop,
  ParticipantContext,
} from '@livekit/components-react';
import { 
  useParticipants, 
  useTracks,
  useCreateLayoutContext,
  useLocalParticipant,
  useRoomInfo,
  useRoomContext,
  useRemoteParticipant,
} from '@livekit/components-react';
import { Track, Participant, RoomEvent, RemoteParticipant, DataPacket_Kind, AudioPresets } from 'livekit-client';
import type { WidgetState as BaseWidgetState } from '@livekit/components-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { MicRequestButton } from '../../../components/MicRequestButton';
// import { LiveKitHostControlPanel } from '../../../components/LiveKitHostControlPanel';
import { ModernFooter } from '../../../components/ModernFooter';
import { FloatingWrapper } from '../../../components/FloatingParticipantTile';
import { DebugPanel } from '../../../components/DebugPanel';
import { AudioShareHelper } from '../../../components/AudioShareHelper';
import { AttributeBasedVideoTile } from '../../../components/AttributeBasedVideoTile';
import { HideLiveKitCounters } from '../../../components/HideLiveKitCounters';
import { CustomChatPanel, type CustomChatMessage } from './components/CustomChatPanel';
import { SettingsMenu as DefaultSettingsMenu } from '@/lib/SettingsMenu';
import type { CustomVideoConferenceProps, CustomWidgetState } from './types/conference-types';
import { useConferenceControls } from './hooks/useConferenceControls';
import { useRoomManagement } from './hooks/useRoomManagement';
import { MainVideoDisplay, MainVideoDisplayNoHost } from './components/conference/MainVideoDisplay';
import { MicParticipantList } from './components/conference/MicManagement';
import { extractParticipantUid, normalizeUid } from './utils/conference-utils';
import { API_CONFIG } from '@/lib/config';
import { callGatewayApi, normalizeGatewayResponse } from '@/lib/api-client';
import { resolveAssetPath } from '@/lib/assetPath';
import { useUserContext } from '@/contexts/UserContext';
import {
  shouldShowInMicList,
  isRequestingMic,
  isMuted,
  canSpeak,
  isHostOrAdmin,
  getMicStatusText,
  getRoleText,
  parseParticipantMetadata,
  isCameraEnabled,
  isUserDisabled,
  canCurrentUserControlParticipant,
  updateParticipantMetadata,
  getParticipantMetadataSource
} from '../../../lib/token-utils';

export function CustomVideoConference({
  SettingsComponent,
  userRole,
  userName,
  userId,
  userToken,
  jwtToken,
  roomName,
  hostUserId,
  initialRoomDetails,
}: CustomVideoConferenceProps) {
  const EffectiveSettingsComponent = SettingsComponent ?? DefaultSettingsMenu;
  // 🎯 版本标识 - LiveKit原生机制重构版本
  // 🎯 版本验证弹窗已移除
  const [widgetState, setWidgetState] = React.useState<CustomWidgetState>({
    showChat: true,
    showParticipants: true, // 默认显示参与者列表
    showHostPanel: false, // 默认不显示主持人面板
    showMicMenu: false, // 默认不显示麦克风菜单
    showDebugPanel: false, // 默认不显示调试面板
    showAudioHelper: false, // 默认不显示音频帮助
    // 移除未读消息计数
    unreadMessages: 0,
    showSettings: false,
  });
  const [currentMicStatus, setCurrentMicStatus] = React.useState<'disabled' | 'enabled' | 'requesting' | 'muted_by_host'>('disabled');
  const [showChatMenu, setShowChatMenu] = React.useState(false);
  const [chatGlobalMute, setChatGlobalMute] = React.useState(
  () => initialRoomDetails?.chatState !== 1,
);
React.useEffect(() => {
  if (initialRoomDetails?.chatState !== undefined) {
    setChatGlobalMute(initialRoomDetails.chatState !== 1);
  }
}, [initialRoomDetails?.chatState]);

const [micGlobalMute, setMicGlobalMute] = React.useState(false);
  const [isChatTogglePending, setIsChatTogglePending] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState<CustomChatMessage[]>([]);
  const chatMessageKeysRef = React.useRef(new Set<string>());
  const handleLeaveRoomCallbackRef = React.useRef<() => void>(() => {});
  const [isSendingChatMessage, setIsSendingChatMessage] = React.useState(false);
  const [chatValidationMessage, setChatValidationMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    return () => {
      chatMessageKeysRef.current.clear();
    };
  }, []);
  // 移除“主持人在场”判断逻辑
  // 添加isLocalUserDisabled状态来追踪用户禁用状态
  const [isLocalUserDisabled, setIsLocalUserDisabled] = React.useState(false);
  // 🎯 强制重渲染状态，用于attributesChanged事件触发UI更新
  // 🔍 调试状态
  const [debugInfo, setDebugInfo] = React.useState<string>('');
  // 添加消息发送时间限制状态 - 使用useRef保持引用
  const lastSentTimeRef = React.useRef<number>(0);
  const MESSAGE_COOLDOWN = 2000; // 两秒冷却时间（毫秒）
  const isSendingMessageRef = React.useRef(false);
  const generateMessageId = React.useCallback(() => {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (cryptoApi?.randomUUID) {
      return cryptoApi.randomUUID();
    }
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }, []);
  const ensureChatVisible = React.useCallback(() => {
    setWidgetState(prev => {
      if (prev.showChat) {
        if (prev.unreadMessages === 0) {
          return prev;
        }
        return { ...prev, unreadMessages: 0 };
      }
      return { ...prev, showChat: true, unreadMessages: 0 };
    });
  }, [setWidgetState]);
  const appendChatMessage = React.useCallback(
    (message: CustomChatMessage, dedupeKey?: string | number | null) => {
      const keyCandidate =
        dedupeKey !== undefined && dedupeKey !== null && dedupeKey !== ''
          ? dedupeKey
          : message.id;
      if (!keyCandidate) {
        return;
      }
      const storeKey =
        typeof keyCandidate === 'string' ? keyCandidate : String(keyCandidate);
      if (chatMessageKeysRef.current.has(storeKey)) {
        return;
      }
      chatMessageKeysRef.current.add(storeKey);
      setChatMessages(prev => [...prev, message]);
      setWidgetState(prev => {
        if (prev.showChat || message.isSelf) {
          if (prev.unreadMessages === 0) {
            return prev;
          }
          return { ...prev, unreadMessages: 0 };
        }
        return { ...prev, unreadMessages: prev.unreadMessages + 1 };
      });
    },
    [setWidgetState],
  );
  // 🎯 新增：房间详情信息管理
  // 游客点击处理函数 - 定义移到useEffect之前
  const guestClickHandler = React.useCallback((event?: Event) => {
    event?.preventDefault();
    event?.stopPropagation();
    handleLeaveRoomCallbackRef.current();
  }, [handleLeaveRoomCallbackRef]);

  // UserContext集成
  const { userInfo, resolveGatewayToken, getCurrentUserRole, inviteCode, performLogout, clearUserInfo } = useUserContext();

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const roomInfo = useRoomInfo();
  const roomCtx = useRoomContext();
  const layoutContext = useCreateLayoutContext();
  const router = useRouter();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const resolvedUserRole = React.useMemo(() => {
    if (typeof userRole === 'number') {
      return userRole;
    }
    if (typeof userInfo?.user_roles === 'number') {
      return userInfo.user_roles;
    }
    try {
      const fallbackRole = getCurrentUserRole();
      if (typeof fallbackRole === 'number') {
        return fallbackRole;
      }
    } catch {
      // ignore lookup errors
    }
    return 1;
  }, [userRole, userInfo?.user_roles, getCurrentUserRole]);
  const isGuest = resolvedUserRole === 0;
  const isHostOrAdmin = resolvedUserRole === 2 || resolvedUserRole === 3;
  
  const isGlobalChatMutedForUser = !isHostOrAdmin && !isGuest && chatGlobalMute;
  const chatInputDisabled = isLocalUserDisabled || isGlobalChatMutedForUser;
  const chatPlaceholder = isGuest
    ? '游客需注册才能发言'
    : isGlobalChatMutedForUser
      ? '全员禁言中'
      : '说点什么吧...';
  const chatBannerMessage = React.useMemo(() => {
    if (isLocalUserDisabled) {
      return '您已被主持人禁用，暂时无法发送消息';
    }
    if (!isHostOrAdmin && !isGuest && chatGlobalMute) {
      return '主持人已开启全员禁言';
    }
    if (isGuest) {
      return '游客需注册才能发送消息';
    }
    return undefined;
  }, [isGuest, isHostOrAdmin, isLocalUserDisabled, chatGlobalMute]);
  const handleGuestIntercept = React.useCallback(() => {
    guestClickHandler();
  }, [guestClickHandler]);

  const sendChatMessageViaApi = React.useCallback(
    async (message: string) => {
      if (!roomInfo?.name) {
        throw new Error('Room information is missing, cannot send chat message');
      }
      if (!userInfo?.uid) {
        throw new Error('User information is missing, cannot send chat message');
      }

      const token = await resolveGatewayToken();
      if (!token) {
        throw new Error('Authentication expired, please sign in again');
      }

      const response = await callGatewayApi('/api/v1/chat/send', {
        room_id: roomInfo.name,
        user_uid: userInfo.uid,
        message,
      }, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const normalized = normalizeGatewayResponse(response);
      if (!normalized.success) {
        throw new Error(normalized.message || normalized.error || 'Failed to send chat message');
      }
    },
    [roomInfo?.name, userInfo?.uid, resolveGatewayToken],
  );

  const handleSendChatMessage = React.useCallback(
  async (rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed) {
      return false;
    }
    if (isGuest) {
      handleGuestIntercept();
      setChatValidationMessage('游客需注册才能发送消息');
      return false;
    }
    if (chatInputDisabled) {
      setChatValidationMessage(chatBannerMessage ?? '当前暂时无法发送消息');
      return false;
    }
    const now = Date.now();
    if (!isHostOrAdmin) {
      const elapsed = now - lastSentTimeRef.current;
      if (elapsed < MESSAGE_COOLDOWN) {
        const remainingSeconds = Math.ceil((MESSAGE_COOLDOWN - elapsed) / 1000);
        setChatValidationMessage(`发言太快了，请等待${remainingSeconds}秒后再发送`);
        return false;
      }
    }
    if (isSendingMessageRef.current) {
      return false;
    }
    isSendingMessageRef.current = true;
    setIsSendingChatMessage(true);
    setChatValidationMessage(null);
    try {
      await sendChatMessageViaApi(trimmed);
      lastSentTimeRef.current = Date.now();
      ensureChatVisible();
      return true;
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : '发送消息失败';
      setChatValidationMessage(fallbackMessage || '发送消息失败');
      return false;
    } finally {
      isSendingMessageRef.current = false;
      setIsSendingChatMessage(false);
    }
  },
  [
    chatBannerMessage,
    chatInputDisabled,
    ensureChatVisible,
    handleGuestIntercept,
    isGuest,
    isHostOrAdmin,
    sendChatMessageViaApi,
  ],
);
  const { isScreenSharing, isLocalCameraEnabled, toggleScreenShare, toggleCamera } = useConferenceControls({ localParticipant, roomCtx, userRole: resolvedUserRole });
  const {
    roomDetails,
    participantRolesInfo,
    getParticipantRole,
  } = useRoomManagement({
    initialRoomDetails,
    roomName: roomInfo.name,
    inviteCode,
    userToken,
    roomCtx,
    participants,
    setChatGlobalMute,
    setDebugInfo,
    hostUserId,
    userRole,
  });
  const maxMicSlots = roomDetails?.maxMicSlots;
  const maxMicSlotsLabel = maxMicSlots !== undefined ? String(maxMicSlots) : '--';
  const micListCount = React.useMemo(() => {
    const visibleParticipants = participants.filter(participant =>
      shouldShowInMicList(getParticipantMetadataSource(participant)),
    );

    if (!hostUserId) {
      return visibleParticipants.length;
    }

    const hostUid = hostUserId;
    const hostAlreadyVisible = visibleParticipants.some(participant =>
      extractParticipantUid(participant) === hostUid
    );

    if (hostAlreadyVisible) {
      return visibleParticipants.length;
    }

    const hostExists = participants.some(participant =>
      extractParticipantUid(participant) === hostUid
    );

    return hostExists ? visibleParticipants.length + 1 : visibleParticipants.length;
  }, [participants, hostUserId]);
  const requestingMicCount = React.useMemo(() => {
    return participants.filter(participant =>
      isRequestingMic(getParticipantMetadataSource(participant)),
    ).length;
  }, [participants]);
  const widgetUpdate = React.useCallback((state: BaseWidgetState) => {
    setWidgetState(prevState => ({
      ...prevState,
      ...state,
      showChat: true,
    }));
  }, []);
  const toggleParticipants = React.useCallback(() => {
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showParticipants: !prev.showParticipants
    }));
  }, []);
  const toggleChat = React.useCallback(() => {
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showChat: true,
      unreadMessages: 0,
    }));
  }, [setWidgetState]);
  const toggleHostPanel = React.useCallback(() => {
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showHostPanel: !prev.showHostPanel
    }));
  }, []);
  const toggleSettings = React.useCallback(() => {
    layoutContext.widget.dispatch?.({ msg: 'toggle_settings' });
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showSettings: !prev.showSettings,
    }));
  }, [layoutContext.widget]);
  const handleMicStatusChange = React.useCallback((newStatus: string) => {
    setCurrentMicStatus(newStatus as 'disabled' | 'enabled' | 'requesting' | 'muted_by_host');
  }, []);
  // 处理麦克风权限变化
  const handleMicPermissionChange = React.useCallback((userId: number, enabled: boolean) => {
    // 这里可以添加其他逻辑，比如通知后端、更新UI等
  }, []);
  // 聊天菜单功能
  const toggleChatMenu = React.useCallback(() => {
    setShowChatMenu(prev => !prev);
  }, []);
  const collectBatchMicTargets = React.useCallback((): number[] => {
    if (!participants || participants.length === 0) {
      return [];
    }

    const operatorUid = userInfo?.uid;
    const uniqueUids: number[] = [];
    const seen = new Set<number>();

    participants.forEach(participant => {
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        return;
      }
      if (operatorUid && targetUid === operatorUid) {
        return;
      }
      if (isHostOrAdmin(getParticipantMetadataSource(participant))) {
        return;
      }
      if (!seen.has(targetUid)) {
        seen.add(targetUid);
        uniqueUids.push(targetUid);
      }
    });

    return uniqueUids;
  }, [participants, userInfo?.uid]);
  const sanitizedUserName = React.useMemo(() => {
    if (typeof userName === 'string') {
      const trimmed = userName.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return 'User';
  }, [userName]);
  const userRoleLabel = React.useMemo(() => {
    if (userRole === 3) {
      return '管理员';
    }
    if (userRole === 2) {
      return '主持人';
    }
    if (userRole === 0) {
      return '游客';
    }
    return '普通会员';
  }, [userRole]);
  const permissionSegments = React.useMemo(() => {
    if (userRole === 3 || userRole === 2) {
      return ['摄像头✅', '麦克风✅', '共享✅', '控麦✅'];
    }
    return [];
  }, [userRole]);
  const userStatusLine = React.useMemo(() => {
    if (userRole === 3 || userRole === 2) {
      return [sanitizedUserName, userRoleLabel, ...permissionSegments].join('  ');
    }
    return sanitizedUserName;
  }, [sanitizedUserName, userRole, userRoleLabel, permissionSegments]);
  const handleGlobalMuteChat = React.useCallback(async () => {
    if (!roomCtx || (userRole !== 2 && userRole !== 3)) {
      return;
    }
    if (!roomInfo?.name) {
      alert('Missing room information, unable to update chat state');
      return;
    }
    if (isChatTogglePending) {
      return;
    }
    const nextMuteState = !chatGlobalMute;
    const operatorUid = userInfo?.uid ?? hostUserId;
    if (!operatorUid) {
      alert('Missing host uid, unable to update chat state');
      return;
    }

    setIsChatTogglePending(true);
    try {
      const token = await resolveGatewayToken();
      const response = await callGatewayApi('/api/v1/chat/manage', {
        room_id: roomInfo.name,
        host_user_id: operatorUid,
        action: nextMuteState ? 'disable' : 'enable',
      }, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const normalized = normalizeGatewayResponse(response);
      if (!normalized.success) {
        throw new Error(normalized.message || normalized.error || 'Failed to update chat state');
      }

      setChatGlobalMute(nextMuteState);
      setShowChatMenu(false);

      try {
        roomCtx.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'chat-mute', mute: nextMuteState })),
          { reliable: true },
        );
      } catch (broadcastError) {
        console.error('Failed to broadcast chat mute update:', broadcastError);
      }
    } catch (error) {
      console.error('Chat mute toggle failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to update chat state';
      alert(message);
    } finally {
      setIsChatTogglePending(false);
    }
  }, [
    roomCtx,
    userRole,
    chatGlobalMute,
    isChatTogglePending,
    roomInfo?.name,
    userInfo?.uid,
    hostUserId,
    resolveGatewayToken,
    localParticipant,
  ]);
  const hasLeftRef = React.useRef(false);

  const leaveRoom = React.useCallback(async () => {
    if (hasLeftRef.current) {
      return;
    }
    hasLeftRef.current = true;

    try {
      if (userInfo?.jwt_token) {
        await performLogout();
      } else {
        clearUserInfo();
      }
    } catch (error) {
      console.error('退出登录失败:', error);
      clearUserInfo();
    } finally {
      try {
        await roomCtx?.disconnect();
      } catch (disconnectError) {
        console.error('断开房间失败:', disconnectError);
      }
    }
  }, [performLogout, clearUserInfo, roomCtx]);

  const leaveRoomRef = React.useRef(leaveRoom);

  React.useEffect(() => {
    leaveRoomRef.current = leaveRoom;
  }, [leaveRoom]);

  const handleLeaveRoom = React.useCallback(() => {
    if (hasLeftRef.current) {
      return;
    }
    if (!confirm('确定要离开会议吗？')) {
      return;
    }

    leaveRoom().catch(error => {
      console.error('离开会议流程异常:', error);
    });
  }, [leaveRoom]);

  React.useEffect(() => {
    handleLeaveRoomCallbackRef.current = handleLeaveRoom;
  }, [handleLeaveRoom]);

  React.useEffect(() => {
    const safeLeaveRoom = () => {
      const promise = leaveRoomRef.current();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(error => {
          console.error('离开会议失败:', error);
        });
      }
    };

    const handleBeforeUnload = () => {
      safeLeaveRoom();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      safeLeaveRoom();
    };
  }, []);
  // 麦克风管理函数 - 改为调用后台API
  const performBatchMicControl = React.useCallback(
    async (mute: boolean) => {
      if (!roomCtx || !roomInfo?.name || (userRole !== 2 && userRole !== 3)) {
        return;
      }

      const operatorUid = userInfo?.uid;
      if (!operatorUid) {
        alert('缺少主持人 UID，无法执行操作');
        return;
      }

      const targetUids = collectBatchMicTargets();
      if (targetUids.length === 0) {
        alert('没有可操作的参会人');
        return;
      }

      try {
        const token = await resolveGatewayToken();
        const endpoint = await API_CONFIG.getEndpoint('gateway_participants_batch_microphone');
        const payload = {
          room_id: roomInfo.name,
          host_user_id: operatorUid,
          operator_id: operatorUid,
          user_uids: targetUids,
          action: mute ? 'mute' : 'unmute',
          mute_status: mute,
          ...(mute
            ? { mute_time: new Date().toISOString() }
            : { unmute_time: new Date().toISOString() }),
        };

        const response = await callGatewayApi(endpoint, payload, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const normalized = normalizeGatewayResponse(response);
        if (!normalized.success) {
          const errorMessage = normalized.message || normalized.error || '批量麦克风操作失败';
          throw new Error(errorMessage);
        }

        setMicGlobalMute(mute);
        setWidgetState(prev => ({ ...prev, showMicMenu: false }));

        const actionLabel = mute ? '全员禁麦' : '恢复全员发言';
        const affected = (normalized.payload as any)?.affected_count;
        if (typeof affected === 'number' && affected >= 0) {
          alert(`✅ ${actionLabel}成功，影响人数：${affected}`);
        } else {
          alert(`✅ ${actionLabel}操作成功`);
        }
      } catch (error) {
        console.error('批量麦克风操作失败:', error);
        const errorMessage = error instanceof Error ? error.message : '网络错误';
        alert(`❌ 操作失败: ${errorMessage}`);
      }
    },
    [roomCtx, roomInfo?.name, userRole, userInfo?.uid, collectBatchMicTargets, resolveGatewayToken],
  );
  // 全员禁麦/恢复发言入口，内部调用批量控制函数
  const handleMuteAll = React.useCallback(() => {
    if (!micGlobalMute) {
      void performBatchMicControl(true);
    }
  }, [micGlobalMute, performBatchMicControl]);
  const handleUnmuteAll = React.useCallback(() => {
    if (micGlobalMute) {
      void performBatchMicControl(false);
    }
  }, [micGlobalMute, performBatchMicControl]);
  // 点击外部关闭菜单
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetState.showMicMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.mic-management-menu')) {
          setWidgetState(prev => ({ ...prev, showMicMenu: false }));
        }
      }
      // 关闭聊天菜单
      if (showChatMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.chat-menu-container')) {
          setShowChatMenu(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [widgetState.showMicMenu, showChatMenu]);
  // 移动LiveKit Chat组件的DOM元素到我们的容器中
  // 检查消息是否包含屏蔽词
  
  // 当 chatGlobalMute 改变时，禁用或启用聊天输入框
  // 手动切换屏幕共享

  // 主视频显示组件
  const MainVideoDisplayComponent = React.useMemo(() => (
    <MainVideoDisplay
      roomInfo={roomInfo}
      tracks={tracks}
      userRole={userRole}
      userId={userId}
      userName={userName}
      isLocalCameraEnabled={isLocalCameraEnabled}
    />
  ), [roomInfo, tracks, userRole, userId, userName, isLocalCameraEnabled]);
  // 自定义控制栏
  const CustomControlBar = React.useMemo(() => (
    <div className="custom-control-bar">
      <div className="control-left">
        <span className="room-name">会议号: {roomInfo.name || '123'}</span>
      </div>
      <div className="control-center">
        <div className="control-buttons">
          {/* 麦克风按钮 */}
          <button 
            className={`control-btn mic-btn ${isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'disabled' : ''}`}
            disabled={isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true'}
            title={isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? "您已被禁用，无法使用麦克风" : "麦克风"}
            onClick={() => {
              if (isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') {
                alert('您已被禁用，无法使用麦克风');
                return;
              }
              // 原有的麦克风控制逻辑
              if (localParticipant) {
                localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
              }
            }}
            style={{
              opacity: isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 0.5 : 1,
              cursor: isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'not-allowed' : 'pointer',
              position: 'relative'
            }}
          >
            {isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? '🚫 麦克风已禁用' : '🎤 麦克风'}
            {/* 添加一个透明覆盖层，完全阻止点击 */}
            {(isLocalUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
              }} onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('您已被禁用，无法使用麦克风');
              }}></div>
            )}
          </button>
          {/* 摄像头按钮 - 只有主持人可用 */}
          <button 
            className={`control-btn camera-btn ${(userRole || 0) < 2 ? 'disabled' : ''} ${isLocalCameraEnabled ? 'active' : ''}`}
            disabled={(userRole || 0) < 2}
            aria-pressed={isLocalCameraEnabled}
            onClick={(event) => {
              if ((userRole || 0) < 2) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              toggleCamera();
            }}
            style={{
              opacity: (userRole || 0) < 2 ? 0.5 : 1,
              cursor: (userRole || 0) < 2 ? 'not-allowed' : 'pointer',
              borderColor: isLocalCameraEnabled ? '#4caf50' : undefined
            }}
            title={(userRole || 0) < 2 ? '摄像头（仅主持人可用）' : isLocalCameraEnabled ? '关闭摄像头' : '开启摄像头'}
          >
            {isLocalCameraEnabled ? '📹 关闭摄像头' : '📷 开启摄像头'}
          </button>
          {/* 申请上麦按钮 - 普通用户 */}
        {userInfo && getCurrentUserRole() < 2 && roomInfo.name && (
          <button
            className={`control-btn request-mic-btn ${isUserDisabled(localParticipant?.metadata) ? 'disabled' : ''}`}
            disabled={isUserDisabled(localParticipant?.metadata)}
            onClick={async (e) => {
              // 检查用户是否被禁用
              if (isUserDisabled(localParticipant?.metadata)) {
                e.preventDefault();
                e.stopPropagation();
                alert('您已被禁用，无法申请上麦');
                return false;
              }

              try {

                if (!localParticipant) {
                  console.error('❌ localParticipant 不存在');
                  alert('❌ 申请失败：用户信息不存在');
                  return;
                }

                // 获取Gateway token
                const token = await resolveGatewayToken();

                // 调用后端API申请上麦
                const rawResponse = await callGatewayApi('/api/v1/participants/request-microphone', {
                  room_id: roomInfo.name,
                  participant_identity: localParticipant.identity,
                  user_id: userInfo.uid,
                  request_time: new Date().toISOString(),
                }, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  }
                });

                const { success, message } = normalizeGatewayResponse(rawResponse);

                if (success) {

                  alert('✅ 申请成功！等待主持人批准');
                } else {
                  throw new Error(message || '申请失败');
                }
              } catch (error) {
                console.error('❌ 申请上麦失败:', error);
                alert('❌ 申请失败: ' + (error as Error).message);
              }
            }}
            style={{
              pointerEvents: isUserDisabled(localParticipant?.metadata) ? 'none' : 'auto',
              opacity: isUserDisabled(localParticipant?.metadata) ? 0.5 : 1,
              cursor: isUserDisabled(localParticipant?.metadata) ? 'not-allowed' : 'pointer',
              position: 'relative'
            }}
            title={isUserDisabled(localParticipant?.metadata) ? "您已被禁用，无法申请上麦" : "申请上麦"}
          >
            {isUserDisabled(localParticipant?.metadata)
              ? '\U0001f6ab \u5df2\u7981\u7528'
              : `\U0001f64b\u200d\u2642\ufe0f \u7533\u8bf7\u4e0a\u9ea6 (${requestingMicCount}/${maxMicSlotsLabel})`}
            {/* 添加一个透明覆盖层，完全阻止点击 */}
            {isUserDisabled(localParticipant?.metadata) && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10,
              }} onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('您已被禁用，无法申请上麦');
              }}></div>
            )}
          </button>
        )}
          {/* 上麦申请 - 主持人管理 */}
          {(userRole === 2 || userRole === 3) && (
        <button 
              className="control-btn host-control-btn"
              onClick={toggleHostPanel}
              title="上麦申请管理"
        >
              📋 上麦申请
            </button>
          )}
          {/* 屏幕共享按钮 - 主持人专用 */}
          {(userRole === 2 || userRole === 3) && (
            <>
              <button 
                className={`control-btn screen-share-btn ${isScreenSharing ? 'active' : ''}`}
                onClick={toggleScreenShare}
                title={isScreenSharing ? '停止屏幕共享（含音频）' : '开始屏幕共享（记得勾选"分享音频"选项）'}
              >
                📺 共享屏幕+🔊
              </button>
              <button 
                className="control-btn help-btn"
                onClick={() => setWidgetState(prev => ({ ...prev, showAudioHelper: true }))}
                title="屏幕分享音频帮助"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                🔊 音频帮助
              </button>
            </>
          )}
          {/* 设置按钮 */}
        <button 
            className={`control-btn settings-btn ${widgetState.showSettings ? 'active' : ''}`}
            onClick={() => setWidgetState(prev => ({ ...prev, showSettings: !prev.showSettings }))}
            title="设置"
        >
            ⚙️ 设置
        </button>
        </div>
      </div>
      <div className="control-right">
        {/* 结束会议按钮 */}
        <button className="control-btn end-meeting-btn" onClick={handleLeaveRoom}>
          结束
        </button>
      </div>
    </div>
  ), [roomInfo.name, widgetState.showSettings, widgetState.showHostPanel, handleLeaveRoom, userRole, userId, userName, isScreenSharing, toggleScreenShare, toggleHostPanel, localParticipant, isLocalUserDisabled, isLocalCameraEnabled, toggleCamera]);
  
  const handleDataReceived = React.useCallback((payload: Uint8Array) => {
    const coerceNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
      return undefined;
    };

    const coerceTimestamp = (value: unknown): number => {
      const numeric = coerceNumber(value);
      if (typeof numeric === 'number') {
        return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
      return Date.now();
    };

    try {
      const rawText = new TextDecoder().decode(payload).trim();
      if (!rawText) {
        return;
      }
      if (!rawText.startsWith('{') || !rawText.endsWith('}')) {
        return;
      }
      const msg = JSON.parse(rawText);
      const typeValue =
        typeof msg.type === 'string'
          ? msg.type.toLowerCase()
          : typeof msg.event === 'string'
            ? msg.event.toLowerCase()
            : undefined;



    
  if (typeValue === 'chat-message' || typeValue === 'chat_message' || typeValue === 'chat') {
    const dedupeKey =
      msg.message_id ??
      msg.messageId ??
      msg.id ??
      msg.uuid ??
      msg.sequence ??
      msg.seq;
    const rawContent =
      typeof msg.message === 'string'
        ? msg.message
        : typeof msg.content === 'string'
          ? msg.content
          : '';
    const content = rawContent.trim();
    if (!content) {
      return;
    }
    let userUid = coerceNumber(
      msg.user_uid ??
      msg.userUid ??
      msg.uid ??
      msg.sender_uid ??
      msg.senderUid ??
      msg.userId ??
      msg.user_id,
    );

    const identityRaw =
      msg.identity ??
      msg.participant_identity ??
      msg.participantIdentity ??
      msg.sender_identity ??
      msg.senderIdentity ??
      msg.identity_id ??
      msg.identityId;

    const identity = typeof identityRaw === 'string' ? identityRaw.trim() : undefined;

    if ((userUid === undefined || userUid === null) && identity) {
      const normalizedFromIdentity = normalizeUid(identity.replace(/^user_/, ''));
      if (normalizedFromIdentity !== null) {
        userUid = normalizedFromIdentity;
      }
    }

    const nicknameRaw =
      msg.nickname ??
      msg.user_nickname ??
      msg.user_name ??
      msg.sender_name ??
      msg.username ??
      msg.name ??
      '匿名用户';
    const timestamp = coerceTimestamp(
      msg.timestamp ?? msg.sent_at ?? msg.created_at ?? msg.createdAt ?? msg.time,
    );

    const localIdentity = roomCtx?.localParticipant?.identity ?? localParticipant?.identity ?? null;
    const localUid = typeof userInfo?.uid === 'number' ? userInfo.uid : undefined;
    const resolvedUserUid = userUid !== null && userUid !== undefined ? userUid : undefined;

    const identityMatchesLocal =
      typeof identity === 'string' && typeof localIdentity === 'string' && identity === localIdentity;

    const isSelf =
      (localUid !== undefined && resolvedUserUid !== undefined && resolvedUserUid === localUid) ||
      identityMatchesLocal;
    const messageId =
      typeof dedupeKey === 'string'
        ? dedupeKey
        : typeof dedupeKey === 'number'
          ? String(dedupeKey)
          : generateMessageId();
    appendChatMessage(
      {
        id: messageId,
        userUid: resolvedUserUid ?? 0,
        nickname: String(nicknameRaw ?? '匿名用户'),
        content,
        timestamp,
        isSelf,
      },
      messageId,
    );
    return;
  }
    if (typeValue === 'chat-mute' && typeof msg.mute === 'boolean') {
        setChatGlobalMute(msg.mute);
        return;
      }

      if (typeValue === 'chat-control') {
        if (typeof msg.chat_state !== 'undefined') {
          const nextMute = Number(msg.chat_state) !== 1;
          setChatGlobalMute(nextMute);
        } else if (typeof msg.mute === 'boolean') {
          setChatGlobalMute(msg.mute);
        }
        return;
      }

      if (typeValue === 'mic-mute' && typeof msg.mute === 'boolean') {
        setMicGlobalMute(msg.mute);
        return;
      }
    } catch (error) {
      console.warn('解析数据通道消息失败:', error);
    }
  }, [
    appendChatMessage,
    generateMessageId,
    setChatGlobalMute,
    setMicGlobalMute,
    userInfo?.uid,
    localParticipant?.identity,
    roomCtx?.localParticipant?.identity,
  ]);

  // 监听 LiveKit 数据通道，接收禁言/禁麦指令
  React.useEffect(() => {
    if (!roomCtx) return;
    roomCtx.on('dataReceived', handleDataReceived);
    return () => {
      roomCtx.off('dataReceived', handleDataReceived);
    };
  }, [roomCtx, handleDataReceived]);
  // micGlobalMute 生效时，强制关闭普通成员麦克风
  React.useEffect(() => {
    if (!localParticipant) return;
    if (userRole === 2 || userRole === 3) return; // 主持人/管理员不受影响
    if (micGlobalMute && localParticipant.isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(false);
    }
  }, [micGlobalMute, localParticipant, userRole]);
  const [expandedMenuId, setExpandedMenuId] = React.useState<string | null>(null);
  const toggleMenu = (id: string) => {


    setExpandedMenuId(prev => {
      const newValue = prev === id ? null : id;

      return newValue;
    });
  };
  const closeMenu = () => setExpandedMenuId(null);
  React.useEffect(() => {
    const handler = () => closeMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
  // 🎯 批准上麦 - 调用Gateway API
  const handleApproveToSpeak = async (participant: Participant) => {
    try {

      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 批准上麦 (Gateway API)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  当前metadata: ${JSON.stringify(participant.metadata)}\n`;
      setDebugInfo(prev => prev + debugInfo);

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
        room_id: roomInfo?.name,
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

      if (!response.success) {
        throw new Error(response.message || '批准失败');
      }


      setDebugInfo(prev => prev + `  ✅ 批准上麦成功 (Gateway API)\n  响应数据: ${JSON.stringify(response.data)}\n\n`);
      // 🎯 添加成功提示
      alert(`✅ 操作成功：${participant.name} 已批准上麦`);
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('批准上麦失败:', error);
      setDebugInfo(prev => prev + `  ❌ 批准上麦失败: ${error}\n\n`);
      alert(`❌ 批准失败: ${(error as Error).message}`);
    }
  };
  const handleKickFromMic = async (participant: Participant) => {
    try {

      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 踢下麦位 (Gateway API)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  当前metadata: ${JSON.stringify(participant.metadata)}\n`;
      setDebugInfo(prev => prev + debugInfo);

      // 获取Gateway token
      const token = await resolveGatewayToken();
      const hostUid = userInfo?.uid;
      if (!hostUid) {
        throw new Error('缺少主持人 UID，无法执行踢麦');
      }
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        throw new Error('缺少参与者 UID，无法执行踢麦');
      }

      // 调用Gateway API踢下麦位
      const response = await callGatewayApi('/api/v1/participants/kick-mic', {
        room_id: roomInfo?.name,
        host_user_id: hostUid,
        user_uid: targetUid,
        action: 'kick_mic',
        kick_time: new Date().toISOString(),
      }, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.success) {

        setDebugInfo(prev => prev + `  ✅ 踢下麦位成功 (Gateway API)\n  响应数据: ${JSON.stringify(response.data)}\n\n`);
        alert(`✅ 操作成功：${participant.name} 已踢下麦位`);
      } else {
        console.error('❌ 踢出麦位失败:', response.message);
        setDebugInfo(prev => prev + `  ❌ 踢下麦位失败: ${response.message}\n\n`);
        alert(`❌ 踢下麦位失败: ${response.message}`);
      }
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('踢出麦位网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
      alert(`❌ 踢下麦位失败: ${(error as Error).message}`);
    }
  };
  const handleMuteMicrophone = async (participant: Participant) => {
    try {

      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 禁麦 (Gateway API)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  当前metadata: ${JSON.stringify(participant.metadata)}\n`;
      setDebugInfo(prev => prev + debugInfo);

      // 获取Gateway token
      const token = await resolveGatewayToken();
      const hostUid = userInfo?.uid;
      if (!hostUid) {
        throw new Error('缺少主持人 UID，无法执行禁麦');
      }
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        throw new Error('缺少参与者 UID，无法执行禁麦');
      }

      // 调用Gateway API禁麦
      const response = await callGatewayApi('/api/v1/participants/batch-set-microphone', {
        room_id: roomInfo?.name,
        host_user_id: hostUid,
        user_uids: [targetUid],
        action: 'mute',
        mute_status: true,
        mute_time: new Date().toISOString(),
      }, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.success) {

        setDebugInfo(prev => prev + `  ✅ 禁麦成功 (Gateway API)\n  响应数据: ${JSON.stringify(response.data)}\n\n`);
        alert(`✅ 操作成功：${participant.name} 已禁麦`);
      } else {
        console.error('❌ 禁麦失败:', response.message);
        setDebugInfo(prev => prev + `  ❌ 禁麦失败: ${response.message}\n\n`);
        alert(`❌ 禁麦失败: ${response.message}`);
      }
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('禁麦网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
      alert(`❌ 禁麦失败: ${(error as Error).message}`);
    }
  };
  const handleUnmuteMicrophone = async (participant: Participant) => {
    try {

      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 恢复说话 (Gateway API)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  当前metadata: ${JSON.stringify(participant.metadata)}\n`;
      setDebugInfo(prev => prev + debugInfo);

      // 获取Gateway token
      const token = await resolveGatewayToken();
      const hostUid = userInfo?.uid;
      if (!hostUid) {
        throw new Error('缺少主持人 UID，无法执行解除禁麦');
      }
      const targetUid = extractParticipantUid(participant);
      if (!targetUid) {
        throw new Error('缺少参与者 UID，无法执行解除禁麦');
      }

      // 调用Gateway API解除禁麦
      const response = await callGatewayApi('/api/v1/participants/batch-set-microphone', {
        room_id: roomInfo?.name,
        host_user_id: hostUid,
        user_uids: [targetUid],
        action: 'unmute',
        mute_status: false,
        unmute_time: new Date().toISOString(),
      }, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.success) {

        setDebugInfo(prev => prev + `  ✅ 恢复说话成功 (Gateway API)\n  响应数据: ${JSON.stringify(response.data)}\n\n`);
        alert(`✅ 操作成功：${participant.name} 已恢复说话`);
      } else {
        console.error('❌ 恢复说话失败:', response.message);
        setDebugInfo(prev => prev + `  ❌ 恢复说话失败: ${response.message}\n\n`);
        alert(`❌ 恢复说话失败: ${response.message}`);
      }
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('恢复说话网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
      alert(`❌ 恢复说话失败: ${(error as Error).message}`);
    }
  };
  // 监听 LiveKit 断线并自动处理
  React.useEffect(() => {
    if (!roomCtx) return;
    const handleDisconnected = async () => {
      try {
        await leaveRoom();
      } catch (error) {
        console.error('自动离开会议失败:', error);
      } finally {
        try {
          router.replace(`/rooms/${encodeURIComponent(roomName)}`);
        } catch (navigationError) {
          console.error('导航回登录页失败:', navigationError);
        }
      }
    };
    roomCtx.on(RoomEvent.Disconnected, handleDisconnected);
    return () => {
      roomCtx.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [roomCtx, leaveRoom, router, roomName]);
  // 初始化时检查用户是否被禁用
  React.useEffect(() => {
    if (localParticipant?.attributes?.isDisabledUser === 'true') {
      setIsLocalUserDisabled(true);
    }
  }, [localParticipant]);
  // 修复localParticipant的属性监听
  React.useEffect(() => {
    if (!localParticipant) return;
    const handleAttributesChanged = () => {
      const oldDisabledState = isLocalUserDisabled;
      const newDisabledState = localParticipant.attributes?.isDisabledUser === 'true';
      const timestamp = new Date().toLocaleTimeString();
      // 增强调试日志



      // 添加到调试面板
      setDebugInfo(prev => prev + 
        `\n[${timestamp}] 🔍 属性变化检测:\n` +
        `- 完整attributes: ${JSON.stringify(localParticipant.attributes)}\n` +
        `- isDisabledUser变化: ${oldDisabledState ? 'true' : 'false'} → ${newDisabledState ? 'true' : 'false'}\n` +
        `---------------------------\n`
      );
      // 特别检测isDisabledUser变化
      if (localParticipant.attributes?.isDisabledUser !== undefined) {
        const isNowDisabled = localParticipant.attributes.isDisabledUser === 'true';
        setDebugInfo(prev => prev + 
          `\n[${timestamp}] 🚨 禁用状态特别检测:\n` +
          `- 之前状态: ${oldDisabledState ? '已禁用' : '未禁用'}\n` +
          `- 当前状态: ${isNowDisabled ? '已禁用' : '未禁用'}\n` +
          `- 原始值: "${localParticipant.attributes.isDisabledUser}"\n` +
          `---------------------------\n`
        );
      }
      // 检查禁用状态并更新
      if (localParticipant.attributes?.isDisabledUser === 'true') {

        setIsLocalUserDisabled(true);
        // 添加到调试面板
        setDebugInfo(prev => prev + `\n[${timestamp}] 🚫 用户被禁用!\n`);
      } else {

        setIsLocalUserDisabled(false);
        // 添加到调试面板
        setDebugInfo(prev => prev + `\n[${timestamp}] ✅ 用户禁用状态解除\n`);
      }
    };
    // 初始检测
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => prev + 
      `\n[${timestamp}] 📌 初始禁用状态检测:\n` +
      `- isDisabledUser: ${localParticipant.attributes?.isDisabledUser || '未设置'}\n` +
      `- 当前状态变量: ${isLocalUserDisabled ? 'true' : 'false'}\n` +
      `---------------------------\n`
    );
    localParticipant.on('attributesChanged', handleAttributesChanged);
    return () => {
      localParticipant.off('attributesChanged', handleAttributesChanged);
    };
  }, [localParticipant, isLocalUserDisabled, setDebugInfo]);
  return (
    <LayoutContextProvider value={layoutContext} onWidgetChange={widgetUpdate}>
      <div className="lk-video-conference">
        <HideLiveKitCounters />
        <div className="lk-video-conference-inner">
          <div className="main-content-area">
            <div className="video-and-sidebar" style={{ display: 'flex', height: '100vh' }}>
              {/* 左侧主视频区域 (自动占满剩余空间) */}
              <div className="main-video-container" style={{ 
                flex: '1', 
                display: 'flex', 
                flexDirection: 'column',
                background: '#1a1a1a',
                position: 'relative',
                borderRight: '2px solid #444'
              }}>
                {/* 左侧Header */}
                <div className="left-header" style={{
                  height: '35px',
                  background: '#2a2a2a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  borderBottom: '1px solid #333',
                  flexShrink: 0
                }}>
                  <div className="room-info">
                    <span className="room-name">📹 {roomInfo.name}</span>
                    <span className="participants-count" style={{ marginLeft: '12px', color: '#888', fontSize: '12px' }}>
                      👥 {participants.length}人在线
                    </span>
                  </div>
                  {/* 用户信息 - 纯文本显示在Header右侧 */}
                  <div className="header-user-info">
                    <span className="user-avatar">
                      {userRole === 3 ? '👑' : userRole === 2 ? '🎤' : '👤'}
                    </span>
                    <span className="user-name user-status-line" style={{ whiteSpace: 'pre' }}>{userStatusLine}</span>
                  </div>
                </div>
                {/* 主视频显示区域 */}
                <div style={{ flex: '1', overflowY: 'auto' }}>
                  <MainVideoDisplayNoHost 
                    roomInfo={roomInfo} 
                    tracks={tracks} 
                    userRole={userRole}
                    userId={userId}
                    userName={userName}
                    isLocalCameraEnabled={isLocalCameraEnabled}
                  />
                </div>
                {/* 底部控制栏 - 只在左侧区域 */}
                <div style={{ flex: '0 0 auto' }}>
                  <ModernFooter
                  jwtToken={jwtToken}
                  roomName={roomName}
                  userId={userId}
                    isScreenSharing={isScreenSharing}
                    widgetState={widgetState}
                    micGlobalMute={micGlobalMute}
                    onToggleScreenShare={toggleScreenShare}
                    onToggleChat={toggleChat}
                    onToggleParticipants={toggleParticipants}
                    onToggleHostPanel={toggleHostPanel}
                    onToggleSettings={toggleSettings}
                    onLeaveRoom={handleLeaveRoom}
                    onMicStatusChange={handleMicStatusChange}
                    room={roomCtx}
                    roomDetails={roomDetails}
                    currentUserRole={userRole}
                    hostUserId={hostUserId}
                  />
                </div>
              </div>
              {/* 右侧边栏 (固定宽度，贴右边缘) */}
              <div className="sidebar-container" style={{ 
                width: '340px',
                minWidth: '340px',
                maxWidth: '340px',
                display: 'flex', 
                flexDirection: 'column',
                background: '#2a2a2a'
              }}>
                {/* 右侧Header */}
                <div className="right-header" style={{
                  height: '35px',
                  background: '#2a2a2a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
                  borderBottom: '1px solid #333',
                  flexShrink: 0
                }}>
                                  <div className="participants-header">
                  <span className="participants-title">
                    麦位上限 ({micListCount}/{maxMicSlotsLabel})
                  </span>
                </div>
                  <div className="sidebar-controls">
                    {/* 麦克风管理菜单 - 只有主持人可见 */}
                    {(userRole === 2 || userRole === 3) && (
                      <div className="mic-management-menu" style={{ position: 'relative' }}>
                        <button
                          onClick={() => setWidgetState(prev => ({ ...prev, showMicMenu: !prev.showMicMenu }))}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '14px',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '2px'
                          }}
                          title="麦克风管理"
                        >
                          ⋯
                        </button>
                        {/* 下拉菜单 */}
                        {widgetState.showMicMenu && (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: '0',
                            background: '#2a2a2a',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            zIndex: 1000,
                            minWidth: '120px',
                            marginTop: '2px'
                          }}>
                            <button
                              onClick={() => handleMuteAll()}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '12px',
                                borderBottom: '1px solid #444'
                              }}
                              onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#3a3a3a'}
                              onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                            >
                              全员禁麦
                            </button>
                            <button
                              onClick={() => handleUnmuteAll()}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#fff',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                              onMouseEnter={(e) => (e.target as HTMLElement).style.background = '#3a3a3a'}
                              onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                            >
                              恢复全员发
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* 移除这里的调试信息，改为在主调试面板中显示 */}
                {/* 参与者列表区域 */}
                <div
                  className="participants-section"
                  style={{
                    flex: '1 1 0%',
                    display: widgetState.showParticipants ? 'block' : 'none',
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                  }}
                >
                                      <MicParticipantList
                        currentUserRole={userRole}
                        currentUserName={userName}
                        roomInfo={roomInfo}
                        userToken={userToken}
                        hostUserId={hostUserId}
                        maxMicSlots={roomDetails?.maxMicSlots}
                        setDebugInfo={setDebugInfo}
                      />
                </div>
                {/* 聊天区域 - 新的三段式布局 */}
                <div className="chat-section" style={{ 
                  width: '100%',
                  height: widgetState.showChat ? '50%' : 'auto',
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: '1px solid #333',
                  background: '#2d2d2d',
                  boxSizing: 'border-box'
                }}>
                  {/* 聊天Header */}
                  <div className="chat-header" style={{
                    padding: '8px 12px',
                    background: '#333',
                    borderBottom: '1px solid #444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '36px'
                  }}>
                    <button
                      onClick={toggleChat}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ffffff',
                        cursor: 'default',
                        fontSize: '16px',
                        padding: '0',
                        pointerEvents: 'none'
                      }}
                    >
                      聊天
                    </button>
                    {/* 管理员菜单按钮 - 直接放在这里，不需要额外的容器div */}
                      {userRole && (userRole === 2 || userRole === 3) && (
                        <div className="chat-menu-container" style={{ position: 'relative' }}>
                          <button
                            onClick={toggleChatMenu}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ffffff',
                              cursor: 'pointer',
                              fontSize: '16px',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            ⋯
                          </button>
                          {/* 下拉菜单 */}
                          {showChatMenu && (
                            <div style={{
                              position: 'absolute',
                              top: '100%',
                              right: '0',
                              background: '#2a2a2a',
                              border: '1px solid #444',
                              borderRadius: '4px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                              zIndex: 1000,
                              minWidth: '120px',
                              marginTop: '4px'
                            }}>
                              <button
                                onClick={handleGlobalMuteChat}
                                disabled={isChatTogglePending || chatGlobalMute}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: chatGlobalMute ? 'rgba(255, 255, 255, 0.35)' : '#ffffff',
                                  cursor: isChatTogglePending ? 'wait' : chatGlobalMute ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  textAlign: 'left',
                                  borderRadius: '4px 4px 0 0',
                                  borderBottom: '1px solid #444',
                                  opacity: isChatTogglePending ? 0.6 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (!chatGlobalMute && !isChatTogglePending) (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.08)';
                                }}
                                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                              >
                                全员禁言
                              </button>
                              <button
                                onClick={handleGlobalMuteChat}
                                disabled={isChatTogglePending || !chatGlobalMute}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: !chatGlobalMute ? 'rgba(255, 255, 255, 0.35)' : '#ffffff',
                                  cursor: isChatTogglePending ? 'wait' : !chatGlobalMute ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  textAlign: 'left',
                                  opacity: isChatTogglePending ? 0.6 : 1,
                                }}
                                onMouseEnter={(e) => {
                                  if (chatGlobalMute && !isChatTogglePending) (e.target as HTMLElement).style.background = 'rgba(255, 255, 255, 0.08)';
                                }}
                                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                              >
                                恢复全员发言
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                  {/* 聊天Content - 始终渲染，但控制显示/隐藏 */}
                  <div className="chat-content" style={{
                    flexGrow: widgetState.showChat ? 1 : 0,
                    flexShrink: widgetState.showChat ? 1 : 0,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <CustomChatPanel
                      messages={chatMessages}
                      onSend={handleSendChatMessage}
                      isSending={isSendingChatMessage}
                      inputDisabled={chatInputDisabled}
                      bannerMessage={chatBannerMessage}
                      validationMessage={chatValidationMessage}
                      maxLength={60}
                      isGuest={isGuest}
                      onGuestIntercept={handleGuestIntercept}
                      placeholder={chatPlaceholder}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* 主持人控制面板 */}
        {userRole && (userRole === 2 || userRole === 3) && widgetState.showHostPanel && userId !== undefined && userName && (
          <div className="host-panel-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              background: '#2a2a2a',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              {/* LiveKit Host Control Panel 临时注释
              <LiveKitHostControlPanel 
                roomId={roomInfo.name}
                operatorId={userId!}
                operatorName={userName!}
                userRole={userRole!}
                isVisible={true}
                onClose={() => toggleHostPanel()} 
              />
              */}
              <div>
                <h3>🎤 麦位管理</h3>
                <p>Live Kit Host Control Panel 临时不可用</p>
                <button onClick={() => toggleHostPanel()}>关闭</button>
              </div>
            </div>
          </div>
        )}
        {/* 调试面板 */}
        {widgetState.showDebugPanel && (
          <DebugPanel 
            onClose={() => setWidgetState(prev => ({ ...prev, showDebugPanel: false }))}
          />
        )}
        {/* 音频分享帮助 */}
        <AudioShareHelper 
          isVisible={widgetState.showAudioHelper}
          onClose={() => setWidgetState(prev => ({ ...prev, showAudioHelper: false }))}
        />
        {/* 设置面板 */}
        {widgetState.showSettings && (
          <div className="lk-settings-menu-modal" style={{ display: 'block' }}>
            <EffectiveSettingsComponent
              onClose={() => setWidgetState(prev => ({ ...prev, showSettings: false }))}
              isOpen={widgetState.showSettings}
            />
          </div>
        )}
        {/* 房间音频渲染器 */}
        <RoomAudioRenderer />
        {/* 麦克风状态调试按钮 - 固定在右下角 - 已注释掉
        <button
          onClick={() => setWidgetState(prev => ({ ...prev, showDebugPanel: !prev.showDebugPanel }))}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: widgetState.showDebugPanel ? '#ff6b6b' : '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            cursor: 'pointer',
            fontSize: '20px',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transition: 'background 0.2s'
          }}
          title="调试面板"
        >
          D
        </button>
        */}
      </div>
    </LayoutContextProvider>
  );
}
// 主视频显示组件
// 简化版本：不再判断“主持人是否在场”，始终渲染会议界面
// 🎯 使用官方组件的麦位列表
// 🎯 麦位参与者瓦片组件 - 配合官方ParticipantLoop使用









