'use client';

import * as React from 'react';
import { ParticipantTile, VideoTrack, ParticipantName, ConnectionQualityIndicator, TrackMutedIndicator } from '@livekit/components-react';
import { Participant, Track } from 'livekit-client';
import { 
  parseParticipantAttributes, 
  isOnMic, 
  isRequestingMic, 
  isMuted, 
  isHostOrAdmin, 
  getMicStatusText, 
  getRoleText,
  shouldShowVideoFrame,
  isCameraEnabled,
  getVideoFrameStatusText
} from '../lib/token-utils';

/**
 * AttributeBasedVideoTile - 基于参与者属性的视频瓦片组件
 * 
 * 🆕 v2024.12.28 新增功能：
 * - 📹 智能视频框隐藏：主持人关闭摄像头时自动隐藏视频框
 * - 🔄 实时状态监听：监听摄像头状态变化，立即响应
 * - 🎯 角色区分处理：主持人和普通参与者使用不同的显示规则
 * 
 * 功能特性：
 * 1. 🎯 根据 participant.attributes 动态调整样式
 * 2. 🔄 监听 attributesChanged 事件，实时更新样式
 * 3. 🎨 支持多种预设样式（主持人、麦位用户、申请中等）
 * 4. 🖱️ 支持点击、双击、拖拽等交互
 * 5. 📱 响应式设计，适配不同屏幕尺寸
 * 6. 📹 智能视频框控制：根据摄像头状态自动显示/隐藏
 * 
 * 显示规则：
 * - 主持人/管理员：摄像头开启时显示视频框，关闭时隐藏
 * - 普通参与者：始终显示视频框（可根据需要调整）
 * 
 * 样式控制：
 * - .video-tile-host: 主持人样式
 * - .video-tile-on-mic: 已上麦用户样式
 * - .video-tile-requesting: 申请麦位用户样式
 * - .video-tile-muted: 被静音用户样式
 * - .video-tile-member: 普通成员样式
 */

interface AttributeBasedVideoTileProps {
  participant: Participant;
  /** 是否显示参与者名称 */
  showName?: boolean;
  /** 是否显示连接质量指示器 */
  showConnectionQuality?: boolean;
  /** 是否显示静音指示器 */
  showMutedIndicator?: boolean;
  /** 是否显示角色标签 */
  showRoleLabel?: boolean;
  /** 是否显示麦位状态 */
  showMicStatus?: boolean;
  /** 自定义样式类名 */
  className?: string;
  /** 自定义样式对象 */
  style?: React.CSSProperties;
  /** 点击事件处理 */
  onClick?: (participant: Participant) => void;
  /** 双击事件处理 */
  onDoubleClick?: (participant: Participant) => void;
  /** 是否启用拖拽 */
  draggable?: boolean;
  /** 视频框尺寸 */
  size?: 'small' | 'medium' | 'large' | 'auto';
}

export function AttributeBasedVideoTile({
  participant,
  showName = true,
  showConnectionQuality = true,
  showMutedIndicator = true,
  showRoleLabel = true,
  showMicStatus = true,
  className = '',
  style = {},
  onClick,
  onDoubleClick,
  draggable = false,
  size = 'auto'
}: AttributeBasedVideoTileProps) {
  // 🔄 强制重渲染状态，用于 attributesChanged 事件
  const [forceUpdate, setForceUpdate] = React.useState(0);
  
  // 🎯 解析参与者属性
  const attributes = participant.attributes || {};
  const participantStatus = parseParticipantAttributes(attributes);
  
  // 🎨 根据属性计算样式类名
  const computedClassName = React.useMemo(() => {
    const baseClasses = ['attribute-based-video-tile'];
    
    // 根据角色添加样式类
    if (isHostOrAdmin(attributes)) {
      baseClasses.push('video-tile-host');
    } else {
      baseClasses.push('video-tile-member');
    }
    
    // 根据麦位状态添加样式类
    if (isOnMic(attributes)) {
      baseClasses.push('video-tile-on-mic');
    } else if (isRequestingMic(attributes)) {
      baseClasses.push('video-tile-requesting');
    }
    
    // 根据静音状态添加样式类
    if (isMuted(attributes)) {
      baseClasses.push('video-tile-muted');
    }
    
    // 根据尺寸添加样式类
    if (size !== 'auto') {
      baseClasses.push(`video-tile-${size}`);
    }
    
    // 添加自定义类名
    if (className) {
      baseClasses.push(className);
    }
    
    return baseClasses.join(' ');
  }, [attributes, size, className, forceUpdate]);
  
  // 🎨 根据属性计算内联样式
  const computedStyle = React.useMemo(() => {
    const baseStyle: React.CSSProperties = {
      position: 'relative',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      cursor: onClick || onDoubleClick ? 'pointer' : 'default',
      ...style
    };
    
    // 根据角色调整边框
    if (isHostOrAdmin(attributes)) {
      baseStyle.border = '2px solid #ff6b35'; // 主持人橙色边框
      baseStyle.boxShadow = '0 0 10px rgba(255, 107, 53, 0.3)';
    } else if (isOnMic(attributes)) {
      baseStyle.border = '2px solid #4CAF50'; // 已上麦绿色边框
      baseStyle.boxShadow = '0 0 10px rgba(76, 175, 80, 0.3)';
    } else if (isRequestingMic(attributes)) {
      baseStyle.border = '2px solid #FFC107'; // 申请中黄色边框
      baseStyle.boxShadow = '0 0 10px rgba(255, 193, 7, 0.3)';
    } else {
      baseStyle.border = '1px solid #333'; // 普通成员灰色边框
    }
    
    // 根据静音状态调整透明度
    if (isMuted(attributes)) {
      baseStyle.opacity = 0.7;
    }
    
    // 根据尺寸调整大小
    switch (size) {
      case 'small':
        baseStyle.width = '160px';
        baseStyle.height = '120px';
        break;
      case 'medium':
        baseStyle.width = '240px';
        baseStyle.height = '180px';
        break;
      case 'large':
        baseStyle.width = '320px';
        baseStyle.height = '240px';
        break;
      // 'auto' 不设置固定尺寸
    }
    
    return baseStyle;
  }, [attributes, size, style, onClick, onDoubleClick, forceUpdate]);
  
  // 🔄 监听 attributesChanged 事件
  React.useEffect(() => {
    const handleAttributesChanged = () => {
      console.log(`🔄 ${participant.identity} 的属性已更新:`, participant.attributes);
      setForceUpdate(prev => prev + 1);
    };
    
    participant.on('attributesChanged', handleAttributesChanged);
    
    return () => {
      participant.off('attributesChanged', handleAttributesChanged);
    };
  }, [participant]);
  
  // 🎥 监听摄像头状态变化事件
  React.useEffect(() => {
    const handleTrackChanged = () => {
      console.log(`🎥 ${participant.identity} 的摄像头状态变化`);
      setForceUpdate(prev => prev + 1); // 触发重新渲染
    };
    
    // 监听各种摄像头相关事件
    participant.on('trackPublished', handleTrackChanged);
    participant.on('trackUnpublished', handleTrackChanged);
    participant.on('trackMuted', handleTrackChanged);
    participant.on('trackUnmuted', handleTrackChanged);
    participant.on('trackSubscribed', handleTrackChanged);
    participant.on('trackUnsubscribed', handleTrackChanged);
    
    return () => {
      participant.off('trackPublished', handleTrackChanged);
      participant.off('trackUnpublished', handleTrackChanged);
      participant.off('trackMuted', handleTrackChanged);
      participant.off('trackUnmuted', handleTrackChanged);
      participant.off('trackSubscribed', handleTrackChanged);
      participant.off('trackUnsubscribed', handleTrackChanged);
    };
  }, [participant]);
  
  // 🎯 检查是否应该显示视频框
  const shouldShowVideo = React.useMemo(() => {
    const showVideo = shouldShowVideoFrame(participant);
    
    // 🔍 简洁的组件调试信息
    console.log(`🎬 AttributeBasedVideoTile ${participant.identity}:`, {
      shouldShow: showVideo,
      isHost: isHostOrAdmin(participant.attributes),
      cameraEnabled: isCameraEnabled(participant),
      forceUpdate
    });
    
    return showVideo;
  }, [participant, forceUpdate]);
  
  // 🖱️ 事件处理
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(participant);
  }, [onClick, participant]);
  
  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(participant);
  }, [onDoubleClick, participant]);
  
  // 🎯 如果不应该显示视频框，返回 null（完全隐藏）
  if (!shouldShowVideo) {
    console.log(`🙈 隐藏视频框 - ${participant.identity} (${getRoleText(participant.attributes)})`);
    return null;
  }
  
  return (
    <div
      className={computedClassName}
      style={{
        ...computedStyle,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box'
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={draggable}
      data-participant-id={participant.identity}
      data-participant-role={getRoleText(attributes)}
      data-mic-status={getMicStatusText(attributes)}
    >
      {/* 直接渲染视频元素，不使用额外的容器 */}
      <video 
        ref={(el) => {
          if (el) {
            const videoTrack = participant.getTrackPublication(Track.Source.Camera)?.track;
            if (videoTrack) {
              // @ts-ignore - 直接访问MediaStreamTrack
              videoTrack.attach(el);
            }
          }
        }}
        autoPlay
        playsInline
        muted
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          padding: 0,
          margin: 0
        }}
      />
    </div>
  );
}

// 🎨 预设样式组件
export function HostVideoTile(props: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile {...props} size="large" />;
}

export function MemberVideoTile(props: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile {...props} size="medium" />;
}

export function CompactVideoTile(props: Omit<AttributeBasedVideoTileProps, 'size'>) {
  return <AttributeBasedVideoTile {...props} size="small" />;
}

// 🔧 工具函数：批量创建视频瓦片
export function createVideoTilesFromParticipants(
  participants: Participant[],
  props: Partial<AttributeBasedVideoTileProps> = {}
) {
  return participants.map(participant => (
    <AttributeBasedVideoTile
      key={participant.identity}
      participant={participant}
      {...props}
    />
  ));
} 