'use client';

import * as React from 'react';
import {
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  Chat,
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
  useChat,
  useRemoteParticipant,
} from '@livekit/components-react';
import { Track, Participant, RoomEvent, RemoteParticipant, DataPacket_Kind, AudioPresets } from 'livekit-client';
import type { MessageFormatter, WidgetState as BaseWidgetState } from '@livekit/components-react';
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
import { API_CONFIG } from '@/lib/config';
import { shouldShowInMicList, isRequestingMic, isOnMic, isMuted, canSpeak, isHostOrAdmin, getMicStatusText, getRoleText, parseParticipantAttributes, isCameraEnabled } from '../../../lib/token-utils';

interface CustomVideoConferenceProps {
  chatMessageFormatter?: MessageFormatter;
  SettingsComponent?: React.ComponentType<{ onClose?: () => void }>;
  userRole?: number;
  userName?: string;
  userId?: number;
  userToken?: string; // 🎯 添加Token用于API认证
}

interface CustomWidgetState {
  showChat: boolean;
  showParticipants: boolean;
  showHostPanel: boolean;
  showMicMenu: boolean;
  showDebugPanel: boolean;
  showAudioHelper: boolean;
  unreadMessages: number;
  showSettings: boolean;
}

export function CustomVideoConference({
  chatMessageFormatter,
  SettingsComponent,
  userRole,
  userName,
  userId,
  userToken,
}: CustomVideoConferenceProps) {
  // 🎯 版本标识 - LiveKit原生机制重构版本
  console.log('🚀🚀🚀 CustomVideoConference 版本: v2024.06.29.21.30 - LiveKit原生机制重构版本 🚀🚀🚀');
  console.log('🔧 重构内容: 移除自定义状态管理，使用participant.attributes + attributesChanged事件');
  console.log('📅 部署时间: 2025年6月29日 21:30');

  // 🎯 版本验证弹窗已移除

  const [widgetState, setWidgetState] = React.useState<CustomWidgetState>({
    showChat: false,
    showParticipants: true, // 默认显示参与者列表
    showHostPanel: false, // 默认不显示主持人面板
    showMicMenu: false, // 默认不显示麦克风菜单
    showDebugPanel: false, // 默认不显示调试面板
    showAudioHelper: false, // 默认不显示音频帮助
    // 移除未读消息计数
    unreadMessages: 0,
    showSettings: false,
  });

  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [autoScreenShareAttempted, setAutoScreenShareAttempted] = React.useState(false);
  const [currentMicStatus, setCurrentMicStatus] = React.useState<'disabled' | 'enabled' | 'requesting' | 'muted_by_host'>('disabled');
  const [showChatMenu, setShowChatMenu] = React.useState(false);
  const [chatGlobalMute, setChatGlobalMute] = React.useState(true); // 修改为true，默认不能发言
  const [micGlobalMute, setMicGlobalMute] = React.useState(false);
  const [hasHost, setHasHost] = React.useState(false);
  // 添加isUserDisabled状态来追踪用户禁用状态
  const [isUserDisabled, setIsUserDisabled] = React.useState(false);
  
  // 🎯 强制重渲染状态，用于attributesChanged事件触发UI更新
  const [forceUpdateTrigger, setForceUpdateTrigger] = React.useState(0);

  // 🔍 调试状态
  const [debugInfo, setDebugInfo] = React.useState<string>('');

  // 添加消息发送时间限制状态 - 使用useRef保持引用
  const lastSentTimeRef = React.useRef<number>(0);
  const MESSAGE_COOLDOWN = 2000; // 两秒冷却时间（毫秒）

  // 🎯 新增：房间详情信息管理
  const [roomDetails, setRoomDetails] = React.useState<{
    maxMicSlots: number;
    roomName: string;
    roomState: number;
  } | null>(null);

  // 游客点击处理函数 - 定义移到useEffect之前
  const guestClickHandler = React.useCallback((e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    // 使用 confirm 对话框，让用户选择是否前往注册登录
    if (confirm(`游客必须注册为会员才能使用发送消息功能，是否前往注册登录？`)) {
      // 用户选择"是" - 刷新页面，跳转到登录页面
      window.location.reload();
    }
  }, []);
  
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const roomInfo = useRoomInfo();
  const roomCtx = useRoomContext();
  const router = useRouter();

  console.log('Component Render - roomDetails:', roomDetails);
  console.log('Component Render - roomInfo.name:', roomInfo.name);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false },
  );

  const layoutContext = useCreateLayoutContext();

  // 🎯 当房间连接时，获取房间详情
  React.useEffect(() => {
    if (!roomInfo.name) {
      console.log('⏭️ 跳过房间详情获取 - 没有房间ID');
      return;
    }

    console.log('🚀 开始获取房间详情 - room_id:', roomInfo.name);

    const fetchData = async () => {
      try {
        const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ROOM_INFO}?room_id=${roomInfo.name}`;
        console.log('🔗 请求URL:', url);

        const response = await fetch(url);
        console.log('📥 响应状态:', response.status, response.statusText);

        if (response.ok) {
          const data = await response.json();
          console.log('📦 收到数据:', data);

          if (data.success) {
            console.log('✅ 成功！设置房间详情:', data.data);
            setRoomDetails({
              maxMicSlots: data.data.max_mic_slots,
              roomName: data.data.room_name,
              roomState: data.data.room_state
            });
            
            // 检查是否有主持人在线，如果有，获取禁言状态
            if (participants.length > 0) {
              // 寻找主持人或管理员
              const hostParticipant = participants.find(p => {
                const role = p.attributes?.role ? parseInt(p.attributes.role) : 1;
                return role === 2 || role === 3;
              });
              
              if (hostParticipant && hostParticipant.attributes?.chatGlobalMute) {
                const muteState = hostParticipant.attributes.chatGlobalMute === "true";
                console.log(`📢 从主持人属性获取聊天禁言状态: ${muteState ? '禁言' : '恢复发言'}`);
                setChatGlobalMute(muteState);
              }
            }
          } else {
            console.error('❌ API返回失败:', data.error);
          }
        } else {
          console.error('❌ HTTP请求失败:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('❌ 网络错误:', error);
      }
    };

    fetchData();
  }, [roomInfo.name, participants]);

  // 🎯 新增：监听房间元数据变化，更新roomDetails
  React.useEffect(() => {
    if (!roomCtx) return;
    
    const handleMetadataChanged = () => {
      try {
        console.log('🔄 房间元数据更新:', roomCtx.metadata);
        if (!roomCtx.metadata) return;
        
        const metadata = JSON.parse(roomCtx.metadata);
        if (metadata && typeof metadata.maxMicSlots === 'number') {
          console.log('✅ 从元数据更新最大麦位数:', metadata.maxMicSlots);
          
          // 更新roomDetails中的maxMicSlots，确保类型安全
          setRoomDetails(prev => {
            if (!prev) return {
              maxMicSlots: metadata.maxMicSlots,
              roomName: roomInfo.name || '',
              roomState: 1 // 默认值
            };
            
            return {
              ...prev,
              maxMicSlots: metadata.maxMicSlots
            };
          });
        }
      } catch (error) {
        console.error('❌ 解析房间元数据失败:', error);
      }
    };
    
    // 初始化时处理当前元数据
    handleMetadataChanged();
    
    // 添加元数据变化事件监听
    // @ts-ignore - LiveKit类型定义中可能缺少'metadata_changed'事件
    roomCtx.on('metadata_changed', handleMetadataChanged);
    
    // 清理函数
    return () => {
      // @ts-ignore - LiveKit类型定义中可能缺少'metadata_changed'事件
      roomCtx.off('metadata_changed', handleMetadataChanged);
    };
  }, [roomCtx, roomInfo.name]);

  // 🎯 获取参与者角色的辅助函数 - 添加缓存
  const roleCache = React.useRef<Record<string, number>>({});
  
  const getParticipantRole = React.useCallback((participant: Participant) => {
    // 🎯 正确方式：直接从participant.attributes获取角色
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1');
    
    // 用户调试信息已清理
    
    return role;
  }, []);

  // 🎯 计算所有参与者的角色 - 只在必要时更新
  const participantRolesInfo = React.useMemo(() => {
    const roles: Record<string, number> = {};
    participants.forEach(participant => {
      roles[participant.identity] = getParticipantRole(participant);
    });
    return roles;
  }, [participants, getParticipantRole, forceUpdateTrigger]); // 添加forceUpdateTrigger依赖

  // 🎯 新增：LiveKit原生 attributesChanged 事件监听
  React.useEffect(() => {
    if (!participants.length) return;

    // 创建一个Map保存每个参与者的处理函数
    const handlersMap = new Map();

    const handleAttributesChanged = (participant: Participant) => {
      console.log(`🔄 参与者属性变化 - ${participant.name}:`, participant.attributes);
      
      // 检查是否有聊天禁言状态更新
      if (participant.attributes?.chatGlobalMute !== undefined) {
        const newMuteState = participant.attributes.chatGlobalMute === "true";
        console.log(`📢 收到聊天禁言状态更新: ${newMuteState ? '禁言' : '恢复发言'}`);
        setChatGlobalMute(newMuteState);
      }
      
      // 强制触发UI重新渲染
      setForceUpdateTrigger(prev => prev + 1);
    };

    // 为所有参与者添加事件监听
    participants.forEach(participant => {
      // 创建特定于该参与者的处理函数
      const handler = () => handleAttributesChanged(participant);
      // 保存到Map中以便清理
      handlersMap.set(participant.sid, handler);
      // 添加监听器
      participant.on('attributesChanged', handler);
    });

    // 清理函数
    return () => {
      participants.forEach(participant => {
        const handler = handlersMap.get(participant.sid);
        if (handler) {
          participant.off('attributesChanged', handler);
        }
      });
    };
  }, [participants]);

  // 🎯 新增：UpdateParticipant API 调用函数
  const updateParticipantAttributes = React.useCallback(async (
    participantIdentity: string, 
    attributes: Record<string, string>
  ) => {
    if (!roomInfo.name) {
      console.error('❌ 无法更新参与者属性：缺少房间ID');
      return;
    }

    try {
      // API调用日志已简化

      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const tokenDebugInfo = `🎯 ${timestamp} API调用开始\n` +
        `  房间: ${roomInfo.name}\n` +
        `  参与者: ${participantIdentity}\n` +
        `  属性: ${JSON.stringify(attributes)}\n` +
        `  Token状态: ${userToken ? '✅ 存在' : '❌ 不存在'}\n` +
        `  Token长度: ${userToken?.length || 'N/A'}\n` +
        `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
      
      setDebugInfo(prev => prev + tokenDebugInfo);

      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
        setDebugInfo(prev => prev + `  ✅ 已添加Authorization头\n`);
      } else {
        setDebugInfo(prev => prev + `  ⚠️ 没有userToken，将依赖Session认证\n`);
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}/api/update-participant.php`, {
        method: 'POST',
        headers,
        credentials: 'include', // 保持Session支持（兼容后台管理）
        body: JSON.stringify({
          room_name: roomInfo.name, // 🔧 修正参数名
          participant_identity: participantIdentity,
          attributes
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setDebugInfo(prev => prev + `  ✅ API调用成功: ${JSON.stringify(result)}\n\n`);
      } else {
        setDebugInfo(prev => prev + `  ❌ API调用失败: ${JSON.stringify(result)}\n\n`);
      }
    } catch (error) {
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
    }
  }, [roomInfo.name, userToken, setDebugInfo]);

  // 🎯 计算是否有主持人在房间 - 简化逻辑，只基于确定的角色信息
  React.useEffect(() => {
    // 🎯 当前用户是否为主持人
    const currentUserIsHost = userRole && (userRole === 2 || userRole === 3);

    // 如果当前用户是主持人，直接设置为true
    if (currentUserIsHost) {
      setHasHost(true);
      return;
    }

    // 🔧 只检查已确认的角色信息，不进行推测
    const otherHostFromRoles = participants.find(p => {
      // 排除当前用户
      if (p.identity === userId?.toString() || p.name === userName) {
        return false;
      }
      
      const role = participantRolesInfo[p.identity];
      const isHost = role === 2 || role === 3;
      return isHost;
    });

    if (otherHostFromRoles) {
      setHasHost(true);
    } else {
      setHasHost(false);
    }
  }, [userRole, userId, userName, participants, participantRolesInfo]);

  // hasHost状态变化调试已清理

  // 🎯 判断参与者是否可以进入麦位（主持人或管理员）
  const canEnterMicSlot = React.useCallback((participant: Participant) => {
    const role = participantRolesInfo[participant.identity];
    return role === 2 || role === 3;
  }, [participantRolesInfo]);

  // 🎯 计算当前麦位使用数量
  const currentMicCount = React.useMemo(() => {
    return tracks.filter(track => {  
      const participant = track.participant;
      return participant && canEnterMicSlot(participant);
    }).length;
  }, [tracks, canEnterMicSlot]);

  // 主持人自动屏幕共享功能
  const startAutoScreenShare = React.useCallback(async () => {
    if (!localParticipant || autoScreenShareAttempted) return;
    
    // 只有主持人(2)或管理员(3)才自动开启屏幕共享
    if (userRole !== 2 && userRole !== 3) return;
    
    // 检查浏览器是否支持屏幕共享
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setAutoScreenShareAttempted(true);
      return;
    }

    // 检查是否为安全上下文
    if (!window.isSecureContext && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      setAutoScreenShareAttempted(true);
      return;
    }
    
    setAutoScreenShareAttempted(true);
    
    try {
      await localParticipant.setScreenShareEnabled(true);
      setIsScreenSharing(true);
      
      // 关闭摄像头，专注于屏幕共享
      if (localParticipant.isCameraEnabled) {
        await localParticipant.setCameraEnabled(false);
      }
    } catch (error) {
      console.error('自动开启屏幕共享失败:', error);
    }
  }, [localParticipant, userRole, autoScreenShareAttempted]);

  // 监听本地参与者状态变化
  React.useEffect(() => {
    if (!localParticipant) return;

    const handleTrackMuted = (track: any) => {
      if (track.source === Track.Source.ScreenShare) {
        setIsScreenSharing(false);
      }
    };

    const handleTrackUnmuted = (track: any) => {
      if (track.source === Track.Source.ScreenShare) {
        setIsScreenSharing(true);
      }
    };

    localParticipant.on('trackMuted', handleTrackMuted);
    localParticipant.on('trackUnmuted', handleTrackUnmuted);

    return () => {
      localParticipant.off('trackMuted', handleTrackMuted);
      localParticipant.off('trackUnmuted', handleTrackUnmuted);
    };
  }, [localParticipant]);

  // 当房间连接成功且是主持人时，自动开启屏幕共享
  React.useEffect(() => {
    if (roomCtx && localParticipant && roomCtx.state === 'connected' && !autoScreenShareAttempted) {
      // 延迟一秒确保连接稳定
      const timer = setTimeout(() => {
        startAutoScreenShare();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [roomCtx, localParticipant, startAutoScreenShare, autoScreenShareAttempted]);

  const widgetUpdate = React.useCallback((state: BaseWidgetState) => {
    setWidgetState(prevState => ({
      ...prevState,
      ...state
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
      showChat: !prev.showChat,
    }));
  }, []);

  const toggleHostPanel = React.useCallback(() => {
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showHostPanel: !prev.showHostPanel
    }));
  }, []);

  const toggleSettings = React.useCallback(() => {
    setWidgetState((prev: CustomWidgetState) => ({
      ...prev,
      showSettings: !prev.showSettings
    }));
  }, []);

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

  const handleGlobalMuteChat = React.useCallback(() => {
    if (!roomCtx || (userRole !== 2 && userRole !== 3)) return;

    try {
      const newMuteState = !chatGlobalMute;
      setChatGlobalMute(newMuteState);
      setShowChatMenu(false);

      // 1. 使用participant的attributes来存储禁言状态
      if (localParticipant) {
        // 更新本地参与者的attributes，用于持久化存储禁言状态
        localParticipant.setAttributes({
          ...localParticipant.attributes,
          chatGlobalMute: newMuteState ? "true" : "false",
          updatedAt: new Date().toISOString()
        }).then(() => {
          console.log(`✅ 禁言状态已更新到参与者attributes: ${newMuteState ? '禁言' : '恢复发言'}`);
        }).catch((err) => {
          console.error('❌ 更新参与者attributes失败:', err);
        });
      }

      // 2. 通过 LiveKit 数据通道广播给所有参与者（实时通知）
      roomCtx.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'chat-mute', mute: newMuteState })),
        { reliable: true }
      );
    } catch (error) {
      console.error('全员禁言广播失败:', error);
    }
  }, [roomCtx, userRole, chatGlobalMute, localParticipant]);

  const handleLeaveRoom = React.useCallback(() => {
    if (confirm('确定要离开会议吗？')) {
      roomCtx?.disconnect();
      // 🎯 简单有效的解决方案：直接刷新页面回到房间登录页面
      window.location.reload();
    }
  }, [roomCtx]);

  // 麦克风管理函数 - 改为调用后台API
  const handleToggleMicMute = React.useCallback(async () => {
    if (!roomCtx || (userRole !== 2 && userRole !== 3)) return;

    try {
      const newMuteState = !micGlobalMute;
      const action = newMuteState ? 'mute_all' : 'unmute_all';
      
      // 🎯 调用后台API进行批量操作
      const response = await fetch('/admin/batch-mic-control.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: roomInfo.name,
          action: action,
          token: userToken,
          operatorRole: userRole
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // 更新本地状态
        setMicGlobalMute(newMuteState);
        setWidgetState(prev => ({ ...prev, showMicMenu: false }));
        
        // 显示操作结果
        if (result.affected_count > 0) {
          alert(`✅ ${result.message}\n影响用户数: ${result.affected_count}`);
        } else {
          alert(`ℹ️ ${result.message}`);
        }
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('❌ 批量麦克风控制失败:', error);
      const errorMessage = error instanceof Error ? error.message : '网络错误';
      alert(`❌ 操作失败: ${errorMessage}`);
    }
  }, [roomCtx, userRole, roomInfo?.name, userToken, micGlobalMute]);

  // 保持原有的两个函数用于兼容性，但内部调用切换函数
  const handleMuteAll = React.useCallback(() => {
    if (!micGlobalMute) { // 只有在未禁麦时才执行
      handleToggleMicMute();
    }
  }, [micGlobalMute, handleToggleMicMute]);

  const handleUnmuteAll = React.useCallback(() => {
    if (micGlobalMute) { // 只有在已禁麦时才执行
      handleToggleMicMute();
    }
  }, [micGlobalMute, handleToggleMicMute]);

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
  React.useEffect(() => {
    const moveElements = () => {
      const messagesElement = document.querySelector('.lk-chat-messages');
      const messagesContainer = document.querySelector('.chat-messages-container');
      
      if (messagesElement && messagesContainer && !messagesContainer.contains(messagesElement)) {
        messagesContainer.appendChild(messagesElement);
      }

      const formElement = document.querySelector('.lk-chat-form');
      const formContainer = document.querySelector('.chat-form-container');
      
      if (formElement && formContainer && !formContainer.contains(formElement)) {
        formContainer.appendChild(formElement);
      }

      // 添加输入框焦点监听和字符限制
      const livekitInput = document.querySelector('.lk-chat-form-input') as HTMLInputElement;
      if (livekitInput && !livekitInput.hasAttribute('data-focus-listener')) {
        const handleInputFocus = () => {
          if (!widgetState.showChat) {
            setWidgetState(prev => ({ ...prev, showChat: true }));
          }
        };
        
        // 设置字符限制和占位符
        livekitInput.maxLength = 60;
        livekitInput.placeholder = '说点什么...（最多60字）';
        
        // 添加输入监听以进行实时敏感词检查
        livekitInput.addEventListener('input', async (e) => {
          const message = livekitInput.value.trim();
          if (!message) return;
          
          // 主持人和管理员不受屏蔽词限制
          const isHostOrAdmin = userRole === 2 || userRole === 3;
          if (isHostOrAdmin) {
            // 主持人直接恢复正常状态
            const sendButton = document.querySelector('.lk-chat-form button[type="submit"]') as HTMLButtonElement | null;
            if (sendButton) {
              sendButton.disabled = false;
              sendButton.style.opacity = '1';
              sendButton.style.cursor = 'pointer';
              sendButton.title = '';
            }
            
            // 恢复输入框样式
            livekitInput.style.borderColor = '';
            livekitInput.style.backgroundColor = '';
            
            // 隐藏错误提示
            const errorTip = document.getElementById('sensitive-word-tip');
            if (errorTip) {
              errorTip.style.display = 'none';
            }
            return;
          }
          
          // 实时检查敏感词（仅对非主持人用户）
          const checkResult = await checkBlockedWords(message);
          
          // 获取发送按钮
          const sendButton = document.querySelector('.lk-chat-form button[type="submit"]') as HTMLButtonElement | null;
          if (!sendButton) return;
          
          if (checkResult.blocked) {
            // 检测到敏感词，禁用发送按钮并改变样式
            sendButton.disabled = true;
            sendButton.style.opacity = '0.5';
            sendButton.style.cursor = 'not-allowed';
            sendButton.title = `消息包含屏蔽词"${checkResult.word}"，无法发送`;
            
            // 给输入框添加错误样式
            livekitInput.style.borderColor = 'red';
            livekitInput.style.backgroundColor = 'rgba(255, 0, 0, 0.05)';
            
            // 添加明显的错误提示
            let errorTip = document.getElementById('sensitive-word-tip');
            if (!errorTip) {
              errorTip = document.createElement('div');
              errorTip.id = 'sensitive-word-tip';
              errorTip.style.color = 'red';
              errorTip.style.fontSize = '12px';
              errorTip.style.padding = '4px 8px';
              errorTip.style.marginBottom = '4px';
              errorTip.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
              errorTip.style.borderRadius = '4px';
              errorTip.style.position = 'absolute';
              errorTip.style.bottom = '65px';
              errorTip.style.left = '8px';
              errorTip.style.right = '8px';
              errorTip.style.zIndex = '100';
              errorTip.style.textAlign = 'center';
              const chatFormContainer = document.querySelector('.chat-form-container') as HTMLElement | null;
              if (chatFormContainer) {
                chatFormContainer.style.position = 'relative';
                chatFormContainer.appendChild(errorTip);
              }
            }
            errorTip.textContent = `⚠️ 消息包含屏蔽词"${checkResult.word}"，请修改后发送`;
            errorTip.style.display = 'block';
          } else {
            // 没有敏感词，恢复发送按钮和输入框样式
            sendButton.disabled = false;
            sendButton.style.opacity = '1';
            sendButton.style.cursor = 'pointer';
            sendButton.title = '';
            
            // 恢复输入框样式
            livekitInput.style.borderColor = '';
            livekitInput.style.backgroundColor = '';
            
            // 隐藏错误提示
            const errorTip = document.getElementById('sensitive-word-tip');
            if (errorTip) {
              errorTip.style.display = 'none';
            }
          }
        });
        
        livekitInput.addEventListener('focus', handleInputFocus);
        livekitInput.setAttribute('data-focus-listener', 'true');
      }
    };

    // 强制移除聊天消息的背景和边框样式
    const removeChatStyles = () => {
      const chatEntries = document.querySelectorAll('.lk-chat-entry');
      chatEntries.forEach(entry => {
        const element = entry as HTMLElement;
        element.style.background = 'transparent';
        element.style.backgroundColor = 'transparent';
        element.style.border = 'none';
        element.style.borderBottom = 'none';
        element.style.borderTop = 'none';
        element.style.borderLeft = 'none';
        element.style.borderRight = 'none';
        element.style.boxShadow = 'none';
        element.style.padding = '4px 12px';
        element.style.margin = '2px 0';
        element.style.marginBottom = '2px';
      });
    };

    // 监听新消息添加，自动应用样式
    const observer = new MutationObserver(() => {
      removeChatStyles();
    });

    const chatMessages = document.querySelector('.lk-chat-messages');
    if (chatMessages) {
      observer.observe(chatMessages, { childList: true, subtree: true });
    }

    // 使用轮询方式检查和移动元素
    const interval = setInterval(moveElements, 300);
    
    // 定期检查和应用样式
    const styleInterval = setInterval(removeChatStyles, 1000);

    moveElements();
    removeChatStyles();

    return () => {
      clearInterval(interval);
      clearInterval(styleInterval);
      observer.disconnect();
      // 清理事件监听
      const livekitInput = document.querySelector('.lk-chat-form-input') as HTMLInputElement;
      if (livekitInput) {
        livekitInput.removeEventListener('focus', () => {});
        livekitInput.removeAttribute('data-focus-listener');
      }
    };
  }, [widgetState.showChat]);

  // 检查消息是否包含屏蔽词
  const checkBlockedWords = async (message: string): Promise<{blocked: boolean, word?: string}> => {
    try {
      const apiUrl = `${API_CONFIG.BASE_URL}/api/check-blocked-words.php`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': userToken ? `Bearer ${userToken}` : ''
        },
        body: JSON.stringify({ message })
      });
      
      const result = await response.json();
      
      if (result.success) {
        return {
          blocked: result.blocked,
          word: result.word
        };
      } else {
        console.error('检查屏蔽词失败:', result.message);
        return { blocked: false };
      }
    } catch (error) {
      console.error('检查屏蔽词请求失败:', error);
      return { blocked: false };
    }
  };

  // 当 chatGlobalMute 改变时，禁用或启用聊天输入框
  React.useEffect(() => {
    const chatInput = document.querySelector('.lk-chat-form-input') as HTMLInputElement | null;
    const sendButton = document.querySelector('.lk-chat-form button[type="submit"]') as HTMLButtonElement | null;
    
    if (!chatInput || !sendButton) return;
    
    // 主持人和管理员不受禁言影响
    const isHostOrAdmin = userRole === 2 || userRole === 3;
    
    // 游客状态判断
    const isGuest = userRole === 0;
    
    // 普通会员在全局禁言时禁用输入框
    const shouldDisable = !isHostOrAdmin && !isGuest && chatGlobalMute;
    
    // 设置输入框状态 - 修改：游客只模拟禁用
    if (isGuest) {
      // 对游客：视觉上看起来禁用，但不使用disabled属性
      chatInput.disabled = false; // 不真正禁用，以便能接收点击事件
      chatInput.readOnly = true; // 但设为只读，防止输入
      chatInput.style.background = '#444';
      chatInput.style.cursor = 'not-allowed';
      chatInput.style.color = '#999';
      chatInput.placeholder = '游客需注册才能发言';
      chatInput.title = '游客必须注册为会员才能发送消息';
      
      // 移除之前的点击事件（如果有）
      chatInput.removeEventListener('click', guestClickHandler);
      
      // 添加新的点击事件
      chatInput.addEventListener('click', guestClickHandler);
    } else {
      // 对普通会员：常规禁用逻辑
    chatInput.disabled = shouldDisable;
      chatInput.readOnly = false;
    chatInput.style.background = shouldDisable ? '#444' : '';
    chatInput.style.cursor = shouldDisable ? 'not-allowed' : 'auto';
      chatInput.style.color = shouldDisable ? '#999' : '';
      chatInput.placeholder = '说点什么...（最多60字）';
    chatInput.title = shouldDisable ? '已启用全员禁言，无法发送消息' : '';
    }
    
    // 设置发送按钮状态 - 修改：游客的按钮类似处理
    if (isGuest) {
      // 对游客：视觉上看起来禁用，但不使用disabled属性
      sendButton.disabled = false; // 不真正禁用，以便能接收点击事件
      sendButton.style.background = '#555';
      sendButton.style.opacity = '0.6';
      sendButton.style.cursor = 'not-allowed';
      
      // 移除之前的点击事件（如果有）
      sendButton.removeEventListener('click', guestClickHandler);
      
      // 添加新的点击事件
      sendButton.addEventListener('click', guestClickHandler);
    } else {
      // 对普通会员：常规禁用逻辑
    sendButton.disabled = shouldDisable;
      sendButton.style.background = '';
      sendButton.style.opacity = '';
    sendButton.style.cursor = shouldDisable ? 'not-allowed' : 'pointer';
    }
    
    // 移除之前的事件监听器，确保不重复添加
    const oldForm = chatInput.closest('.lk-chat-form') as HTMLFormElement | null;
    if (oldForm && oldForm.hasAttribute('data-message-cooldown')) {
      // 已经设置过事件监听，避免重复添加
      return;
    }
    
    // 为所有用户添加发送拦截（屏蔽词检查 + 游客拦截 + 发送频率限制）
    const form = chatInput.closest('.lk-chat-form') as HTMLFormElement | null;
    if (form) {
      // 标记已添加事件监听
      form.setAttribute('data-message-cooldown', 'true');
      
      const originalSubmit = form.onsubmit;
      form.onsubmit = async (e) => {
        e.preventDefault(); // 先阻止默认提交
        
        // 游客拦截
        if (userRole === 0) {
          guestClickHandler(e);
          return false;
        }
        
        // 获取消息内容
        const message = chatInput.value.trim();
        if (!message) return false;
        
        // 添加发送频率限制 - 主持人和管理员不受限制
        if (!isHostOrAdmin) {
          const now = Date.now();
          const timeSinceLastSent = now - lastSentTimeRef.current;
          
          console.log('消息发送检查:', {
            now,
            lastSent: lastSentTimeRef.current,
            timeDiff: timeSinceLastSent,
            withinCooldown: timeSinceLastSent < MESSAGE_COOLDOWN
          });
          
          // 检查是否在冷却时间内
          if (timeSinceLastSent < MESSAGE_COOLDOWN) {
            const remainingTime = Math.ceil((MESSAGE_COOLDOWN - timeSinceLastSent) / 1000);
            alert(`发言太快了，请等待${remainingTime}秒后再发送`);
            return false;
          }
        }
        
        // 主持人和管理员不受屏蔽词限制
        if (!isHostOrAdmin) {
          // 提交前再次检查屏蔽词（双重保险）- 仅对非主持人用户
          const checkResult = await checkBlockedWords(message);
          if (checkResult.blocked) {
            // 先清空输入框，再显示提示
            chatInput.value = '';
            // 确保输入框的状态更新
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            // 再显示提示
            alert(`消息包含屏蔽词"${checkResult.word}"，无法发送`);
            return false;
          }
        }
        
        // 更新最后发送时间
        lastSentTimeRef.current = Date.now();
        console.log('更新最后发送时间:', lastSentTimeRef.current);
        
        // 通过检查，调用原始提交处理
        if (originalSubmit) {
          return originalSubmit.call(form, e);
        }
        return true;
      };
      chatInput.setAttribute('data-intercept', 'true');
    }
  }, [chatGlobalMute, userRole, userToken]);

  // 手动切换屏幕共享
  const toggleScreenShare = React.useCallback(async () => {
    if (!localParticipant) return;
    
    // 检查浏览器是否支持屏幕共享
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('❌ 您的浏览器不支持屏幕共享功能\n\n建议使用：\n• Chrome 72+\n• Firefox 66+\n• Edge 79+\n• Safari 13+');
      return;
    }

    // 检查是否为安全上下文
    if (!window.isSecureContext && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      const currentPort = window.location.port || '3000';
      alert(`❌ 屏幕共享需要安全连接\n\n解决方案：\n1. 使用 localhost 访问：http://localhost:${currentPort}\n2. 或在Chrome中启用不安全源：\n   chrome://flags/#unsafely-treat-insecure-origin-as-secure\n   添加：${window.location.origin}`);
      return;
    }

    // 🎯 移除音频提示弹框，直接进入屏幕分享
    
    try {
      const newState = !isScreenSharing;
      
      if (newState) {
        // 🎯 使用getDisplayMedia API获取包含音频的屏幕分享流
        const displayMediaOptions = {
          video: {
            mediaSource: 'screen' as const,
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100
          },
          // 🎯 尝试包含系统音频（Chrome支持）
          systemAudio: 'include' as any,
          selfBrowserSurface: 'exclude' as any,
          surfaceSwitching: 'include' as any
        };

        console.log('🎯 开始屏幕分享，尝试包含系统音频...');
        
        // 获取屏幕分享流（包含音频）
        const screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        
        // 检查是否成功获取了音频轨道
        const videoTrack = screenStream.getVideoTracks()[0];
        const audioTrack = screenStream.getAudioTracks()[0];
        
        console.log(`📺 视频轨道: ${videoTrack ? '✅ 已获取' : '❌ 未获取'}`);
        console.log(`🔊 音频轨道: ${audioTrack ? '✅ 已获取 (包含系统音频)' : '❌ 未获取'}`);
        
        if (audioTrack) {
          console.log('🎉 成功获取系统音频！学生们可以听到纪录片的声音');
        } else {
          console.log('⚠️ 未获取到系统音频，只有视频');
        }

        // 🎯 手动发布屏幕分享轨道到LiveKit
        if (videoTrack) {
          // 发布视频轨道
          await localParticipant.publishTrack(videoTrack, {
            name: 'screen-share-video',
            source: Track.Source.ScreenShare,
            videoCodec: 'vp8'
          });
        }

        if (audioTrack) {
          // 🎯 发布系统音频轨道
          await localParticipant.publishTrack(audioTrack, {
            name: 'screen-share-audio', 
            source: Track.Source.ScreenShareAudio,
            audioPreset: AudioPresets.music // 使用音乐预设获得更好的音质
          });
        }

        // 监听流结束事件
        videoTrack?.addEventListener('ended', () => {
          console.log('📺 屏幕分享视频流已结束');
          setIsScreenSharing(false);
        });

        audioTrack?.addEventListener('ended', () => {
          console.log('🔊 屏幕分享音频流已结束');
        });

        setIsScreenSharing(true);
        
        // 🎯 不再自动关闭摄像头，让用户自己决定是否需要同时显示摄像头
        // 这样可以同时进行屏幕分享和摄像头显示
        
      } else {
        // 停止屏幕分享
        console.log('⏹️ 停止屏幕分享...');
        
        // 🎯 停止所有屏幕分享相关的轨道
        const publications = Array.from(localParticipant.trackPublications.values());
        
        for (const pub of publications) {
          if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
            console.log(`🛑 停止轨道: ${pub.trackName} (${pub.source})`);
            await localParticipant.unpublishTrack(pub.track!);
          }
        }
        
        setIsScreenSharing(false);
        alert('✅ 屏幕分享已停止');
      }
      
    } catch (error) {
      console.error('切换屏幕共享失败:', error);
      
      // 提供详细的错误信息
      let errorMessage = '切换屏幕共享失败';
      if (error instanceof Error) {
        if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
          errorMessage = '❌ 用户拒绝了屏幕共享权限\n\n📋 解决步骤：\n1. 点击"允许"按钮\n2. 选择要共享的屏幕/窗口/标签页\n3. 🔊 重要：勾选"分享系统音频"或"分享音频"选项\n4. 点击"分享"\n\n💡 勾选音频选项后，学生们就能听到视频声音了！';
        } else if (error.message.includes('NotSupportedError')) {
          errorMessage = '❌ 浏览器不支持屏幕共享\n\n请使用Chrome、Firefox或Edge浏览器';
        } else if (error.message.includes('getDisplayMedia')) {
          errorMessage = '❌ 屏幕共享API不可用\n\n可能原因：\n• 不是安全连接(HTTPS)\n• 浏览器版本过旧\n• 权限被禁用\n\n建议使用localhost访问或启用HTTPS';
        } else {
          errorMessage = `❌ 屏幕共享失败: ${error.message}`;
        }
      }
      
      alert(errorMessage);
    }
  }, [localParticipant, isScreenSharing]);

  // 主视频显示组件
  const MainVideoDisplayComponent = React.useMemo(() => (
    <MainVideoDisplay
      roomInfo={roomInfo}
      tracks={tracks}
      userRole={userRole}
      userId={userId}
      userName={userName}
    />
  ), [roomInfo, tracks, userRole, userId, userName]);



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
            className={`control-btn mic-btn ${isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'disabled' : ''}`}
            disabled={isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true'}
            title={isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? "您已被禁用，无法使用麦克风" : "麦克风"}
            onClick={() => {
              if (isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') {
                alert('您已被禁用，无法使用麦克风');
                return;
              }
              // 原有的麦克风控制逻辑
              if (localParticipant) {
                localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
              }
            }}
            style={{
              opacity: isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 0.5 : 1,
              cursor: isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'not-allowed' : 'pointer',
              position: 'relative'
            }}
          >
            {isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? '🚫 麦克风已禁用' : '🎤 麦克风'}
            {/* 添加一个透明覆盖层，完全阻止点击 */}
            {(isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') && (
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
            className={`control-btn camera-btn ${(userRole || 0) < 2 ? 'disabled' : ''}`}
            disabled={(userRole || 0) < 2}
            title={`摄像头${(userRole || 0) < 2 ? '（仅主持人可用）' : ''}`}
          >
            📹 摄像头
          </button>

          {/* 申请上麦按钮 - 普通用户 */}
        {userId && userRole && userRole < 2 && roomInfo.name && (
          <button 
            className={`control-btn request-mic-btn ${!hasHost || isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'disabled' : ''}`}
            disabled={!hasHost || isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true'}
            onClick={async (e) => {
              // 检查用户是否被禁用
              if (isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') {
                e.preventDefault();
                e.stopPropagation();
                alert('您已被禁用，无法申请上麦');
                return false;
              }
              
              // 🔧 确保样式与交互逻辑一致
              if (!hasHost) {
                e.preventDefault();
                e.stopPropagation();
                alert('请等待主持人进入房间后再申请上麦');
                return false;
              }
              
              try {
                // 🎯 使用LiveKit原生机制 - 直接设置participant attributes
                console.log(`🎯 申请上麦 - 使用LiveKit原生机制: ${localParticipant?.name}`);
                
                if (!localParticipant) {
                  console.error('❌ localParticipant 不存在');
                  alert('❌ 申请失败：用户信息不存在');
                  return;
                }

                // 🔍 输出调试信息到控制台
                const timestamp = new Date().toLocaleTimeString();
                console.log(`🎯 ${timestamp} 申请上麦 - LiveKit原生机制`);
                console.log(`  参与者: ${localParticipant.name} (${localParticipant.identity})`);
                console.log(`  当前attributes:`, localParticipant.attributes);

                // 🎯 直接使用LiveKit原生API设置participant attributes
                await localParticipant.setAttributes({
                  ...localParticipant.attributes, // 保留现有属性
                  mic_status: 'requesting',        // 设置为申请状态
                  display_status: 'visible',       // 确保可见
                  request_time: Date.now().toString() // 添加申请时间戳
                });

                console.log('✅ 申请上麦成功 - attributes已更新');
                console.log(`  新attributes:`, localParticipant.attributes);
                
                // 🎯 LiveKit会自动同步attributes到所有客户端
                // 主持人会通过attributesChanged事件收到通知
                alert('✅ 申请成功！等待主持人批准');
                
              } catch (error) {
                console.error('❌ 申请上麦失败:', error);
                alert('❌ 申请失败: ' + (error as Error).message);
              }
            }}
            style={{
              // 🔧 确保样式与disabled属性一致
              pointerEvents: !hasHost || isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'none' : 'auto',
              opacity: !hasHost || isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 0.5 : 1,
              cursor: !hasHost || isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? 'not-allowed' : 'pointer',
              position: 'relative'
            }}
            title={isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? "您已被禁用，无法申请上麦" : hasHost ? "申请上麦" : "等待主持人进入后可申请上麦"}
          >
            {isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true' ? '🚫 已禁用' : hasHost ? '🙋‍♂️ 申请上麦' : '🙋‍♂️ 等待主持人'}
            {/* 添加一个透明覆盖层，完全阻止点击 */}
            {(isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') && (
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
  ), [roomInfo.name, widgetState.showSettings, widgetState.showHostPanel, handleLeaveRoom, userRole, userId, userName, isScreenSharing, toggleScreenShare, toggleHostPanel, hasHost, localParticipant, isUserDisabled]);

  const handleDataReceived = React.useCallback((payload: Uint8Array) => {
    try {
      const text = new TextDecoder().decode(payload).trim();
      if (!text.startsWith('{') || !text.endsWith('}')) {
        // 非 JSON 消息，直接忽略
        return;
      }
      const msg = JSON.parse(text);
      
      if (msg.type === 'chat-mute' && typeof msg.mute === 'boolean') {
        setChatGlobalMute(msg.mute);
      }
      if (msg.type === 'mic-mute' && typeof msg.mute === 'boolean') {
        setMicGlobalMute(msg.mute);
      }
      // 🎯 删除所有数据通道状态管理，改用LiveKit原生attributesChanged事件
      // ❌ 删除：mic-request, mic-approval, kick-from-mic, participant-render-state, participant-speak-state, sync-request
      // ✅ 现在完全依赖 participant.attributes 和 attributesChanged 事件
      
    } catch (error) {
      console.warn('解析数据通道消息失败:', error);
    }
  }, [userRole, roomCtx]);

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
    console.log('toggleMenu clicked, participant id:', id);
    console.log('current expandedMenuId:', expandedMenuId);
    setExpandedMenuId(prev => {
      const newValue = prev === id ? null : id;
      console.log('setting expandedMenuId to:', newValue);
      return newValue;
    });
  };

  const closeMenu = () => setExpandedMenuId(null);

  React.useEffect(() => {
    const handler = () => closeMenu();
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // 🎯 批准上麦 - 使用LiveKit原生机制
  const handleApproveToSpeak = async (participant: Participant) => {
    try {
      console.log(`🎯 批准上麦 - 使用LiveKit原生机制: ${participant.name}`);
      
      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 批准上麦 (LiveKit原生)\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  当前attributes: ${JSON.stringify(participant.attributes)}\n`;
      
      setDebugInfo(prev => prev + debugInfo);

      // 🔧 修复：调用正确的API来真正批准上麦并设置发布权限
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          room_name: roomInfo?.name,
          target_identity: participant.identity,
          operator_identity: localParticipant?.identity || userName || 'unknown',
          action: 'approve_mic'
        })
      });
      
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '更新失败');
      }

      console.log(`✅ 批准参与者 ${participant.identity} 上麦成功`);
      setDebugInfo(prev => prev + `  ✅ 批准上麦成功 (LiveKit原生机制)\n  新attributes: ${JSON.stringify(participant.attributes)}\n\n`);
      
      // 🎯 添加成功提示
      alert(`✅ 操作成功：${participant.name} 已批准上麦`);
      
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('批准上麦失败:', error);
      setDebugInfo(prev => prev + `  ❌ 批准上麦失败: ${error}\n\n`);
    }
  };
  
  const handleKickFromMic = async (participant: Participant) => {
    try {
      console.log('🎯 踢出麦位:', participant.name);
      
      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 踢下麦位\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  Token状态: ${userToken ? '✅ 存在' : '❌ 不存在'}\n` +
        `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
      
      setDebugInfo(prev => prev + debugInfo);

      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
        setDebugInfo(prev => prev + `  ✅ 已添加Authorization头\n`);
      } else {
        setDebugInfo(prev => prev + `  ⚠️ 没有userToken，将依赖Session认证\n`);
      }
      
      // 🔧 修复：调用正确的API来真正踢下麦位并关闭音频
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          room_name: roomInfo.name,
          target_identity: participant.identity,
          operator_identity: localParticipant?.identity || userName || 'unknown',
          action: 'kick_from_mic'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✅ 踢出参与者 ${participant.identity} 成功`);
        setDebugInfo(prev => prev + `  ✅ 踢下麦位成功: ${JSON.stringify(result)}\n\n`);
      } else {
        console.error('❌ 踢出麦位失败:', result);
        setDebugInfo(prev => prev + `  ❌ 踢下麦位失败: HTTP ${response.status} - ${JSON.stringify(result)}\n\n`);
        
        // 🔍 特别处理401错误，显示详细调试信息
        if (response.status === 401) {
          alert(`❌ 踢下麦位失败: 权限不足 (401)\n\n调试信息:\n- Token状态: ${userToken ? '存在' : '不存在'}\n- 认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n- 错误详情: ${result.error || '未知错误'}\n\n请检查调试面板查看详细日志`);
        }
      }
      
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('踢出麦位网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
    }
  };
  
  const handleMuteMicrophone = async (participant: Participant) => {
    try {
      console.log('🎯 禁麦:', participant.name);
      
      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 禁麦\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  Token状态: ${userToken ? '✅ 存在' : '❌ 不存在'}\n` +
        `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
      
      setDebugInfo(prev => prev + debugInfo);

      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
        setDebugInfo(prev => prev + `  ✅ 已添加Authorization头\n`);
      } else {
        setDebugInfo(prev => prev + `  ⚠️ 没有userToken，将依赖Session认证\n`);
      }
      
      // 🔧 修复：调用正确的API来真正静音音频轨道
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          room_name: roomInfo.name,
          target_identity: participant.identity,
          operator_identity: localParticipant?.identity || userName || 'unknown',
          action: 'mute_participant'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✅ 禁麦参与者 ${participant.identity} 成功`);
        setDebugInfo(prev => prev + `  ✅ 禁麦成功: ${JSON.stringify(result)}\n\n`);
        } else {
        console.error('❌ 禁麦失败:', result);
        setDebugInfo(prev => prev + `  ❌ 禁麦失败: HTTP ${response.status} - ${JSON.stringify(result)}\n\n`);
        
        // 🔍 特别处理401错误，显示详细调试信息
        if (response.status === 401) {
          alert(`❌ 禁麦失败: 权限不足 (401)\n\n调试信息:\n- Token状态: ${userToken ? '存在' : '不存在'}\n- 认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n- 错误详情: ${result.error || '未知错误'}\n\n请检查调试面板查看详细日志`);
        }
      }
      
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('禁麦网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
    }
  };
  
  const handleUnmuteMicrophone = async (participant: Participant) => {
    try {
      console.log('🎯 恢复说话:', participant.name);
      
      // 🔍 输出调试信息到调试面板
      const timestamp = new Date().toLocaleTimeString();
      const debugInfo = `🎯 ${timestamp} 恢复说话\n` +
        `  参与者: ${participant.name} (${participant.identity})\n` +
        `  Token状态: ${userToken ? '✅ 存在' : '❌ 不存在'}\n` +
        `  认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n`;
      
      setDebugInfo(prev => prev + debugInfo);

      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
        setDebugInfo(prev => prev + `  ✅ 已添加Authorization头\n`);
      } else {
        setDebugInfo(prev => prev + `  ⚠️ 没有userToken，将依赖Session认证\n`);
      }
      
      // 🔧 修复：调用正确的API来真正解除音频静音
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          room_name: roomInfo.name,
          target_identity: participant.identity,
          operator_identity: localParticipant?.identity || userName || 'unknown',
          action: 'unmute_participant'
        })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log(`✅ 恢复说话参与者 ${participant.identity} 成功`);
        setDebugInfo(prev => prev + `  ✅ 恢复说话成功: ${JSON.stringify(result)}\n\n`);
        } else {
        console.error('❌ 恢复说话失败:', result);
        setDebugInfo(prev => prev + `  ❌ 恢复说话失败: HTTP ${response.status} - ${JSON.stringify(result)}\n\n`);
        
        // 🔍 特别处理401错误，显示详细调试信息
        if (response.status === 401) {
          alert(`❌ 恢复说话失败: 权限不足 (401)\n\n调试信息:\n- Token状态: ${userToken ? '存在' : '不存在'}\n- 认证方式: ${userToken ? 'JWT Token' : 'Session Cookie'}\n- 错误详情: ${result.error || '未知错误'}\n\n请检查调试面板查看详细日志`);
        }
      }
      
      // 关闭菜单
      closeMenu();
    } catch (error) {
      console.error('恢复说话网络错误:', error);
      setDebugInfo(prev => prev + `  ❌ 网络错误: ${error}\n\n`);
    }
  };

  // 监听 LiveKit 断线并自动处理
  React.useEffect(() => {
    if (!roomCtx) return;
    const handleDisconnected = async (reason?: any) => {
      // 自动清除session，不再显示确认对话框
      try {
        // 调用后端清除session接口
        const response = await fetch(`${API_CONFIG.BASE_URL}/clear-session.php`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            user_name: userName
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Session cleared:', result);
        } else {
          console.warn('Failed to clear session:', response.status);
        }
      } catch (error) {
        console.error('Error clearing session:', error);
      }
      
      // 直接刷新页面回到房间登录页
      window.location.reload();
    };
    roomCtx.on(RoomEvent.Disconnected, handleDisconnected);
    return () => {
      roomCtx.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [roomCtx, userId, userName]);

  // 初始化时检查用户是否被禁用
  React.useEffect(() => {
    if (localParticipant?.attributes?.isDisabledUser === 'true') {
      setIsUserDisabled(true);
    }
  }, [localParticipant]);

  // 修复localParticipant的属性监听
  React.useEffect(() => {
    if (!localParticipant) return;
    
    const handleAttributesChanged = () => {
      const oldDisabledState = isUserDisabled;
      const newDisabledState = localParticipant.attributes?.isDisabledUser === 'true';
      const timestamp = new Date().toLocaleTimeString();
      
      // 增强调试日志
      console.log('🔄 本地参与者属性变化检测:', localParticipant.attributes);
      console.log('当前禁用状态:', oldDisabledState);
      console.log('属性中的禁用标记:', localParticipant.attributes?.isDisabledUser);
      
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
        console.log('🚫 用户被禁用状态变化: true');
        setIsUserDisabled(true);
        
        // 添加到调试面板
        setDebugInfo(prev => prev + `\n[${timestamp}] 🚫 用户被禁用!\n`);
      } else {
        console.log('✅ 用户禁用状态变化: false');
        setIsUserDisabled(false);
        
        // 添加到调试面板
        setDebugInfo(prev => prev + `\n[${timestamp}] ✅ 用户禁用状态解除\n`);
      }
    };
    
    // 初始检测
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => prev + 
      `\n[${timestamp}] 📌 初始禁用状态检测:\n` +
      `- isDisabledUser: ${localParticipant.attributes?.isDisabledUser || '未设置'}\n` +
      `- 当前状态变量: ${isUserDisabled ? 'true' : 'false'}\n` +
      `---------------------------\n`
    );
    
    localParticipant.on('attributesChanged', handleAttributesChanged);
    
    return () => {
      localParticipant.off('attributesChanged', handleAttributesChanged);
    };
  }, [localParticipant, isUserDisabled, setDebugInfo]);

  return (
    <LayoutContextProvider value={layoutContext}>
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
                    <span className="user-name">{userName || 'User'}</span>
                    <span className="user-role">
                      {userRole === 3 ? '管理员' : userRole === 2 ? '主持人' : userRole === 0 ? '游客' : '普通会员'}
                    </span>
                    <span className="user-permissions">
                      {userRole === 3 || userRole === 2 
                        ? '摄像头✅ 麦克风✅ 共享✅ 控麦✅' 
                        : '摄像头❌ 麦克风⚠️ 共享❌'
                      }
                    </span>
                  </div>
                </div>

                {/* 主视频显示区域 */}
                <div style={{ flex: '1', overflow: 'hidden' }}>
                  <MainVideoDisplay 
                    roomInfo={roomInfo} 
                    tracks={tracks} 
                    userRole={userRole}
                    userId={userId}
                    userName={userName}
                  />
                </div>
                
                {/* 底部控制栏 - 只在左侧区域 */}
                <div style={{ flex: '0 0 auto' }}>
                  <ModernFooter
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
                  />
                </div>
              </div>

              {/* 右侧边栏 (固定宽度，贴右边缘) */}
              <div className="sidebar-container" style={{ 
                width: 'min(280px, 25vw)',
                minWidth: '200px',
                maxWidth: '300px',
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
                    麦位 {roomDetails?.maxMicSlots}
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
                <div className="participants-section" style={{ 
                  flex: '1',
                  display: widgetState.showParticipants ? 'block' : 'none',
                  overflow: 'hidden'
                }}>
                                      <MicParticipantList 
                        currentUserRole={userRole}
                        currentUserName={userName}
                        roomInfo={roomInfo}
                        userToken={userToken}
                        setDebugInfo={setDebugInfo}
                      />
                </div>

                {/* 聊天区域 - 新的三段式布局 */}
                <div className="chat-section" style={{ 
                  width: 'calc(100% - 1px)',
                  height: widgetState.showChat ? '50%' : 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: '1px solid #333',
                  background: '#2d2d2d',
                  marginRight: '1px'
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
                        color: '#4a9eff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '0'
                      }}
                    >
                      {widgetState.showChat ? '点我收起聊天' : '点我展开聊天'}
                    </button>
                    
                    {/* 管理员菜单按钮 - 直接放在这里，不需要额外的容器div */}
                      {userRole && (userRole === 2 || userRole === 3) && (
                        <div className="chat-menu-container" style={{ position: 'relative' }}>
                          <button
                            onClick={toggleChatMenu}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#4a9eff',
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
                                disabled={chatGlobalMute}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: chatGlobalMute ? '#777' : '#fff',
                                  cursor: chatGlobalMute ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  textAlign: 'left',
                                  borderRadius: '4px 4px 0 0',
                                  borderBottom: '1px solid #444'
                                }}
                                onMouseEnter={(e) => {
                                  if (!chatGlobalMute) (e.target as HTMLElement).style.background = '#333';
                                }}
                                onMouseLeave={(e) => (e.target as HTMLElement).style.background = 'transparent'}
                              >
                                全员禁言
                              </button>
                              <button
                                onClick={handleGlobalMuteChat}
                                disabled={!chatGlobalMute}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: !chatGlobalMute ? '#777' : '#fff',
                                  cursor: !chatGlobalMute ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                  textAlign: 'left'
                                }}
                                onMouseEnter={(e) => {
                                  if (chatGlobalMute) (e.target as HTMLElement).style.background = '#333';
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
                    flex: widgetState.showChat ? 1 : 0,
                    overflow: 'hidden',
                    display: widgetState.showChat ? 'flex' : 'none',
                    flexDirection: 'column'
                  }}>
                    {/* 消息列表区域 */}
                    <div className="chat-messages-container" style={{
                      flex: 1,
                      overflow: 'hidden',
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}>
                      {/* LiveKit Chat组件 - 始终挂载 */}
                      <Chat messageFormatter={chatMessageFormatter} />
                    </div>
                  </div>

                  {/* Footer：输入表单区域 - 高度与ModernFooter保持一致 */}
                  <div className="chat-input-section" style={{
                    height: '65px',
                    padding: '8px',
                    background: '#333',
                    borderTop: widgetState.showChat ? '1px solid #444' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0
                  }}>
                    <div className="chat-form-container" style={{ width: '100%', position: 'relative' }}>
                      {/* 添加禁用用户的聊天输入框覆盖层 */}
                      {(isUserDisabled || localParticipant?.attributes?.isDisabledUser === 'true') && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0,0,0,0.6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10,
                          borderRadius: '4px',
                          pointerEvents: 'all'
                        }}
                        onClick={() => alert('您已被禁用，无法发送消息')}
                        >
                          <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>🚫 您已被禁用，无法发送消息</span>
                        </div>
                      )}
                      {/* 聊天输入框会自动显示在这里 */}
                    </div>
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
        {SettingsComponent && widgetState.showSettings && (
          <div 
            className="settings-overlay" 
            style={{
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
            }}
            onClick={(e) => {
              // 点击背景关闭设置面板
              if (e.target === e.currentTarget) {
                setWidgetState(prev => ({ ...prev, showSettings: false }));
              }
            }}
          >
            <div style={{
              background: '#2a2a2a',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative'
            }}>
              {/* 关闭按钮 */}
              <button
                onClick={() => setWidgetState(prev => ({ ...prev, showSettings: false }))}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '5px'
                }}
                title="关闭设置"
              >
                ✕
              </button>
              <SettingsComponent onClose={() => setWidgetState(prev => ({ ...prev, showSettings: false }))} />
            </div>
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
interface MainVideoDisplayProps {
  roomInfo: { name: string };
  tracks: any[];
  userRole?: number;
  userId?: number;
  userName?: string;
}

function MainVideoDisplay({ roomInfo, tracks, userRole, userId, userName }: MainVideoDisplayProps) {
  const participants = useParticipants();
  
  // 🎯 在组件内部定义getParticipantRole函数
  const getParticipantRole = (participant: Participant): number => {
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1');
    return role;
  };

  // 过滤tracks，只显示主持人和管理员
  const filteredTracks = React.useMemo(() => {
    // 麦位过滤日志已清理
    
    const filtered = tracks.filter(track => {
      // 获取track对应的参与者
      const participant = track.participant;
      if (!participant) {
        return false;
      }

      // 使用LiveKit原生机制获取角色信息
      const role = getParticipantRole(participant);
      const isAllowed = role === 2 || role === 3;
      return isAllowed; // 只显示主持人或管理员
    });
    
    return filtered;
  }, [tracks]);


  
  // 🎯 修复：直接使用传入的userRole，与标题栏保持完全一致
  const currentUserIsHost = userRole && (userRole === 2 || userRole === 3);
  
  // 查找其他主持人参与者 - 使用LiveKit原生机制
  const otherHostParticipant = participants.find(p => {
    const role = getParticipantRole(p);
    return role === 2 || role === 3; // 主持人或管理员
  });

  // 如果当前用户是主持人，或者找到了其他主持人，则认为有主持人
  const hasHost = currentUserIsHost || otherHostParticipant !== undefined;



  // 主视频显示区域（不包含Header，Header已经移到外层）
  return (
    <div className="main-video-display">
      {/* 主视频显示区域 */}
      <div className="video-content">
        {!hasHost ? (
          // 主持人未进入时的等待界面
          <div className="waiting-for-host">
            <div className="waiting-content">
              <div className="waiting-icon">⏳</div>
              <h3>等待主持人进入房间</h3>
              <p>
                {currentUserIsHost 
                  ? '正在检测您的主持人身份，请稍候...' 
                  : '主持人还未进入房间，请稍后等待...'
                }
              </p>
              {process.env.NODE_ENV === 'development' && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                  调试信息: userRole={userRole}, hasHost={hasHost.toString()}
                </div>
              )}
            </div>
          </div>
                ) : (
          // 主持人已进入，显示正常的视频会议界面
          <div className="video-conference-active">
            {/* 屏幕分享内容铺满整个区域 */}
            {filteredTracks.filter(track => track.source === Track.Source.ScreenShare).length > 0 && (
              <GridLayout tracks={filteredTracks.filter(track => track.source === Track.Source.ScreenShare)}>
                {/* 🎯 修改：使用VideoTrack替代ParticipantTile，移除元数据 */}
                <VideoTrack />
              </GridLayout>
            )}
            
            {/* 摄像头视频浮动显示 */}
            {filteredTracks
              .filter(track => track.source === Track.Source.Camera)
              .map((trackRef, index) => {
                // 🎯 在这里就检查是否应该显示视频框
                const participant = trackRef.participant;
                const attributes = participant.attributes || {};
                const isHostRole = isHostOrAdmin(attributes);
                
                // 如果是主持人且摄像头未开启，直接不渲染这个组件
                if (isHostRole) {
                  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
                  const cameraEnabled = !!(
                    videoTrack && 
                    videoTrack.track &&
                    !videoTrack.isMuted && 
                    participant.isCameraEnabled
                  );
                  
                  console.log(`🎯 FloatingWrapper层面检查 ${participant.identity}:`, {
                    isHost: isHostRole,
                    cameraEnabled,
                    shouldRender: cameraEnabled
                  });
                  
                  // 主持人摄像头未开启时，直接不渲染整个FloatingWrapper
                  if (!cameraEnabled) {
                    console.log(`🙈 完全隐藏主持人 ${participant.identity} 的视频框`);
                    return null;
                  }
                }
                
                return (
                  <FloatingWrapper
                    key={trackRef.participant.sid + trackRef.source}
                    initialPosition={{ 
                      x: 100 + (index * 50), 
                      y: 100 + (index * 50) 
                    }}
                    width={320}
                    height={240}
                  >
                    <TrackRefContext.Provider value={trackRef}>
                      {/* 直接渲染视频组件，移除多余的div嵌套 */}
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
          /* Header右侧用户信息样式 - 纯文本模式 */
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

          /* 中间区域样式 */
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

          /* 确保屏幕分享内容铺满整个区域 */
          .video-conference-active :global(.lk-grid-layout) {
            width: 100% !important;
            height: 100% !important;
          }

          .video-conference-active :global(.lk-participant-tile) {
            width: 100% !important;
            height: 100% !important;
          }

          /* 🔧 修复聊天框宽度问题 - 确保不超出容器 */
          :global(.lk-chat) {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* 🚫 隐藏聊天框默认的Header */
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
            height: 100% !important;
          }

          :global(.lk-chat-form) {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          :global(.lk-chat-form-input) {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* 自定义聊天消息样式 */
          :global(.lk-chat-entry) {
            padding: 4px 12px !important;
            border-bottom: none !important;
            background: transparent !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            margin-bottom: 2px !important;
          }

          /* 显示时间戳 */
          :global(.lk-timestamp) {
            display: inline !important;
            color: #888 !important;
            font-size: 11px !important;
            margin-left: 8px !important;
          }

          /* 调整消息布局 */
          :global(.lk-meta-data) {
            display: inline !important;
            margin-right: 8px !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          :global(.lk-participant-name) {
            color: #4a9eff !important;
            font-weight: bold !important;
            margin-right: 4px !important;
            word-break: break-all !important;
          }

          :global(.lk-participant-name::after) {
            content: " : " !important;
            color: #fff !important;
          }

          :global(.lk-message-body) {
            color: #fff !important;
            display: inline !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            word-break: break-word !important;
            max-width: 100% !important;
          }

          /* 强制覆盖LiveKit默认样式 - 使用多重选择器提高优先级 */
          :global(.lk-chat .lk-chat-entry),
          :global(.lk-chat .lk-list .lk-chat-entry),
          :global(.lk-chat ul.lk-list li.lk-chat-entry),
          :global(div.lk-chat ul.lk-chat-messages li.lk-chat-entry) {
            display: block !important;
            line-height: 1.4 !important;
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            border-bottom: none !important;
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            padding: 4px 12px !important;
            margin: 2px 0 !important;
            margin-bottom: 2px !important;
            box-shadow: none !important;
          }
        `}</style>
      </div>
    </div>
  );
}

// 🎯 使用官方组件的麦位列表
interface MicListProps {
  currentUserRole?: number;
  currentUserName?: string;
  roomInfo?: { name: string };
  userToken?: string;
  setDebugInfo?: (updater: (prev: string) => string) => void;
}

function MicParticipantList({ currentUserRole, currentUserName, roomInfo, userToken, setDebugInfo }: MicListProps) {
  const allParticipants = useParticipants();
  
  // 🎯 LiveKit原生角色获取函数
  const getParticipantRole = (participant: Participant): number => {
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1');
    return role;
  };

  // 🎯 批准上麦函数 - 通过服务端API
  const handleApproveMic = async (participant: Participant) => {
    if (!roomInfo?.name) return;

    try {
      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'approve_mic',
          room_name: roomInfo.name,
          target_identity: participant.identity,
          operator_identity: currentUserName || 'admin'
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ 批准上麦成功: ${participant.name}`);
      } else {
        console.error('❌ 批准上麦失败:', result.error);
      }
    } catch (error) {
      console.error(`❌ 批准上麦异常: ${error}`);
    }
  };

  // 🎯 过滤麦位列表参与者
  const micListParticipants = React.useMemo(() => {
    return [...allParticipants]
      .filter(participant => {
        return shouldShowInMicList(participant.attributes || {});
      })
      .sort((a, b) => {
        const roleA = getParticipantRole(a);
        const roleB = getParticipantRole(b);
        return roleB - roleA; // 角色值大的排前面
      });
  }, [allParticipants]);

  // 🎯 使用官方ParticipantLoop组件
  return (
    <div className="participants-list" style={{ 
      height: '100%', 
      overflow: 'auto',
      padding: '8px'
    }}>
      <h4 style={{ color: '#fff', margin: '0 0 12px 0', fontSize: '14px' }}>
        麦位列表 ({micListParticipants.length})
      </h4>
      
      {micListParticipants.length > 0 ? (
        <ParticipantLoop participants={micListParticipants}>
          <MicParticipantTile 
            currentUserRole={currentUserRole}
            onApproveMic={handleApproveMic}
            userToken={userToken}
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

// 🎯 麦位参与者瓦片组件 - 配合官方ParticipantLoop使用
interface MicParticipantTileProps {
  currentUserRole?: number;
  onApproveMic: (participant: Participant) => void;
  userToken?: string;
  setDebugInfo?: (updater: (prev: string) => string) => void;
  currentUserName?: string; // 添加当前用户名称参数
}

function MicParticipantTile({ currentUserRole, onApproveMic, userToken, setDebugInfo, currentUserName }: MicParticipantTileProps) {
  const participant = React.useContext(ParticipantContext);
  const [showControlMenu, setShowControlMenu] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const room = useRoomContext();
  
  if (!participant) return null;
  
  const getParticipantRole = (participant: Participant): number => {
    const attributes = participant.attributes || {};
    const role = parseInt(attributes.role || '1');
    return role;
  };
  
  // 🎯 获取麦克风状态图标
  const getMicStatusIcon = (attributes: Record<string, string>): string => {
    const status = parseParticipantAttributes(attributes);
    
    // 使用绝对URL路径
    const baseUrl = window.location.origin; // 获取当前网站的根URL
    
    // 尝试多种不同的路径格式
    const micStatus = status.micStatus;
    
    // 直接使用相对路径，不带域名
    if (micStatus === 'requesting') return '/images/needmic.png';
    if (micStatus === 'on_mic') return '/images/mic.png';
    if (micStatus === 'muted') return '/images/nomic.png';
    return '/images/nomic.png';
  };
  
  const role = getParticipantRole(participant);
  const roleText = role === 3 ? '管理员' : role === 2 ? '主持人' : role === 0 ? '游客' : '普通会员';
  const micStatusText = getMicStatusText(participant.attributes || {});
  const micStatusIcon = getMicStatusIcon(participant.attributes || {});
  const isHost = currentUserRole === 2 || currentUserRole === 3;
  const isTargetMember = role === 1;
  
  // 🎯 判断当前参与者是否是自己
  const isSelf = participant.name === currentUserName || participant.identity === currentUserName;
  
  // 🎯 主持人控制API调用函数
  const callControlAPI = async (action: string, additionalData: any = {}) => {
    if (!room?.name) return;
    
    setIsLoading(true);
    try {
      // 🎯 构建请求头，支持Token认证
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // 如果有Token，添加Authorization头
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
      }
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
        method: 'POST',
        headers,
        credentials: 'include', // 🔧 修复：携带Session Cookie
        body: JSON.stringify({
          action,
          room_name: room.name,
          target_identity: participant.identity,
          ...additionalData
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ ${action} 操作成功: ${participant.name}`);
        // 🎯 添加成功提示
        const actionText = action === 'mute_participant' ? '禁麦' : 
                          action === 'unmute_participant' ? '解除禁麦' : 
                          action === 'kick_from_mic' ? '踢下麦位' :
                          action === 'approve_mic' ? '批准上麦' : action;
        alert(`✅ 操作成功：${participant.name} ${actionText}成功`);
        setShowControlMenu(false);
      } else {
        console.error(`❌ ${action} 操作失败:`, result.error);
        alert(`操作失败: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ ${action} 操作异常:`, error);
      alert('操作失败，请稍后重试');
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
        console.log('🔍 调试信息:', debugInfoText);
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

      // 🔧 修复：调用正确的API来真正控制参与者
      const response = await fetch(`${API_CONFIG.BASE_URL}/admin-control-participants.php`, {
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
        console.log(`✅ 更新属性成功: ${participant.name}`, result);
        if (setDebugInfo) {
          setDebugInfo(prev => prev + `  ✅ 批准上麦成功: ${JSON.stringify(result)}\n\n`);
        }
        // 🎯 添加成功提示
        alert(`✅ 操作成功：${participant.name} 已批准上麦`);
        setShowControlMenu(false);
      } else {
        console.error('❌ 更新属性失败:', result);
        console.log('🔍 401错误详情:', {
          status: response.status,
          statusText: response.statusText,
          result,
          headers: Object.fromEntries(response.headers.entries())
        });
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
    callControlAPI('kick_from_mic');
  };

  const handleMuteMic = () => {
    callControlAPI('mute_participant');
  };

  const handleUnmuteMic = () => {
    callControlAPI('unmute_participant');
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
          {roleText} - {micStatusText}
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


 