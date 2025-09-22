// 🎯 LiveKit Token解析工具
// 用于从Token中提取角色和麦位状态信息

import { Participant, Track } from 'livekit-client';

export interface TokenMetadata {
  role: number;
  role_name: 'admin' | 'host' | 'student';
  auto_on_mic: boolean;
  user_id: number;
}

export interface ParticipantMicStatus {
  micStatus: 'off_mic' | 'requesting' | 'on_mic' | 'muted';
  displayStatus: 'hidden' | 'visible';
  role: string;
  joinTime?: string;
  requestTime?: string;
  approveTime?: string;
  lastAction?: string;
  operatorId?: string;
  isDisabledUser?: boolean;
}

/**
 * 解析LiveKit Token中的metadata
 */
export function parseTokenMetadata(token: string): TokenMetadata | null {
  try {
    // 简单的JWT解析（仅用于客户端，不验证签名）
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    
    const payload = JSON.parse(atob(parts[1]));
    
    if (payload.metadata) {
      return JSON.parse(payload.metadata) as TokenMetadata;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to parse token metadata:', error);
    return null;
  }
}

/**
 * 解析参与者的attributes
 */
export function parseParticipantAttributes(attributes: Record<string, string>): ParticipantMicStatus {
  return {
    micStatus: (attributes.mic_status as any) || 'off_mic',
    displayStatus: (attributes.display_status as any) || 'hidden',
    role: attributes.role || '1',
    joinTime: attributes.join_time,
    requestTime: attributes.request_time,
    approveTime: attributes.approve_time,
    lastAction: attributes.last_action,
    operatorId: attributes.operator_id,
    isDisabledUser: attributes.isDisabledUser === 'true'
  };
}

/**
 * 检查用户是否有主持人权限
 */
export function isHost(metadata: TokenMetadata | null): boolean {
  return metadata?.role === 2 || metadata?.role === 3;
}

/**
 * 检查用户是否为学生
 */
export function isStudent(metadata: TokenMetadata | null): boolean {
  return metadata?.role === 1;
}

/**
 * 获取角色显示名称
 */
export function getRoleDisplayName(metadata: TokenMetadata | null): string {
  if (!metadata) return '游客';
  
  switch (metadata.role) {
    case 3: return '管理员';
    case 2: return '主持人';
    case 1: return '学生';
    default: return '游客';
  }
}

/**
 * 检查参与者是否应该显示在麦位列表中
 */
export function shouldShowInMicList(attributes: Record<string, string>): boolean {
  const status = parseParticipantAttributes(attributes);
  return status.displayStatus === 'visible';
}

/**
 * 检查参与者是否正在申请麦位
 */
export function isRequestingMic(attributes: Record<string, string>): boolean {
  const status = parseParticipantAttributes(attributes);
  return status.micStatus === 'requesting';
}

/**
 * 检查参与者是否在麦位上
 */
export function isOnMic(attributes: Record<string, string>): boolean {
  const status = parseParticipantAttributes(attributes);
  return status.micStatus === 'on_mic';
}

/**
 * 检查参与者是否被静音
 */
export function isMuted(attributes: Record<string, string>): boolean {
  const status = parseParticipantAttributes(attributes);
  return status.micStatus === 'muted';
}

/**
 * 检查参与者是否可以说话
 */
export function canSpeak(attributes: Record<string, string>): boolean {
  const role = parseInt(attributes.role || '1');
  const micStatus = attributes.mic_status;
  const isDisabled = isUserDisabled(attributes);
  
  // 如果是禁用用户，则不能说话
  if (isDisabled) return false;
  
  // 主持人/管理员默认可以说话，或者已上麦且未被静音
  return role >= 2 || (micStatus === 'on_mic');
}

/**
 * 检查参与者是否为主持人或管理员
 */
export function isHostOrAdmin(attributes: Record<string, string>): boolean {
  const role = parseInt(attributes.role || '1');
  return role >= 2;
}

/**
 * 检查用户是否已被禁用
 */
export function isUserDisabled(attributes: Record<string, string>): boolean {
  // 记录调试日志
  console.log('isUserDisabled调试 - 输入属性:', attributes);
  console.log('isUserDisabled调试 - isDisabledUser值:', attributes.isDisabledUser);
  console.log('isUserDisabled调试 - 值类型:', typeof attributes.isDisabledUser);
  
  // 修复逻辑：只有当isDisabledUser明确为"true"字符串时才返回true
  // 如果是"false"字符串或不存在，都视为未禁用
  const result = attributes.isDisabledUser === 'true';
  
  console.log('isUserDisabled调试 - 最终结果:', result);
  return result;
}

/**
 * 检查是否可以申请上麦
 * 被禁用的用户不能申请上麦
 */
export function canRequestMic(attributes: Record<string, string>): boolean {
  const role = parseInt(attributes.role || '1');
  const isDisabled = isUserDisabled(attributes);
  
  // 禁用用户不能申请上麦，主持人/管理员不需要申请上麦
  if (isDisabled || role >= 2) return false;
  
  // 普通会员可以申请上麦
  return true;
}

/**
 * 获取麦位状态的显示文本
 */
export function getMicStatusText(attributes: Record<string, string>): string {
  const status = parseParticipantAttributes(attributes);
  
  // 如果用户被禁用，显示禁用状态
  if (status.isDisabledUser) return '已禁用';
  
  switch (status.micStatus) {
    case 'requesting': return '申请中';
    case 'on_mic': return '已上麦';
    case 'muted': return '已静音';
    case 'off_mic':
    default: return '未上麦';
  }
}

/**
 * 获取角色显示文本（基于attributes）
 */
export function getRoleText(attributes: Record<string, string>): string {
  const role = parseInt(attributes.role || '1');
  
  switch (role) {
    case 3: return '管理员';
    case 2: return '主持人';
    case 1: return '参会者';
    default: return '游客';
  }
}

/**
 * 检查参与者是否开启了摄像头
 */
export function isCameraEnabled(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return !!(
    videoTrack && 
    videoTrack.track &&
    !videoTrack.isMuted && 
    participant.isCameraEnabled
  );
}

/**
 * 检查参与者是否有摄像头轨道（不管是否开启）
 */
export function hasCameraTrack(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return !!videoTrack;
}

/**
 * 检查参与者的摄像头是否被静音
 */
export function isCameraMuted(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return videoTrack?.isMuted || false;
}

/**
 * 检查是否应该显示视频框
 * 规则：
 * - 主持人/管理员：必须开启摄像头才显示视频框
 * - 普通参与者：根据其他条件决定（暂时默认显示）
 */
export function shouldShowVideoFrame(participant: Participant): boolean {
  const attributes = participant.attributes || {};
  const isHostRole = isHostOrAdmin(attributes);
  
  if (isHostRole) {
    // 主持人/管理员：检查摄像头状态
    const cameraEnabled = isCameraEnabled(participant);
    console.log(`🎥 主持人 ${participant.identity} 摄像头状态检查:`, {
      hasCameraTrack: hasCameraTrack(participant),
      isCameraMuted: isCameraMuted(participant),
      isCameraEnabled: participant.isCameraEnabled,
      finalResult: cameraEnabled
    });
    return cameraEnabled;
  } else {
    // 普通参与者：暂时默认显示
    // 后续可以根据需要添加其他条件
    return true;
  }
}

/**
 * 获取视频框状态的显示文本
 */
export function getVideoFrameStatusText(participant: Participant): string {
  const attributes = participant.attributes || {};
  const isHostRole = isHostOrAdmin(attributes);
  
  if (isHostRole) {
    if (isCameraEnabled(participant)) {
      return '摄像头已开启';
    } else if (hasCameraTrack(participant) && isCameraMuted(participant)) {
      return '摄像头已静音';
    } else {
      return '摄像头未开启';
    }
  } else {
    return '参会者';
  }
} 