import { Participant, Track } from 'livekit-client';
import { getCurrentUserRoleFromContext } from '@/contexts/UserContext';

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
  roleName?: string;
  joinTime?: string;
  requestTime?: string;
  approveTime?: string;
  lastAction?: string;
  operatorId?: string;
  isDisabledUser: boolean;
  raw?: Record<string, unknown>;
}

const DEFAULT_PARTICIPANT_STATUS: ParticipantMicStatus = {
  micStatus: 'off_mic',
  displayStatus: 'hidden',
  role: '1',
  isDisabledUser: false,
};

export function parseTokenMetadata(token: string): TokenMetadata | null {
  try {
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

export function parseParticipantMetadata(metadata?: string | null): ParticipantMicStatus {
  if (!metadata) {
    return { ...DEFAULT_PARTICIPANT_STATUS };
  }

  try {
    const parsed = JSON.parse(metadata);
    const roleValue = parsed.role;
    const micStatusValue = parsed.mic_status;
    const displayStatusValue = parsed.display_status;

    return {
      ...DEFAULT_PARTICIPANT_STATUS,
      micStatus: typeof micStatusValue === 'string' ? micStatusValue : DEFAULT_PARTICIPANT_STATUS.micStatus,
      displayStatus: typeof displayStatusValue === 'string' ? displayStatusValue : DEFAULT_PARTICIPANT_STATUS.displayStatus,
      role:
        typeof roleValue === 'string'
          ? roleValue
          : typeof roleValue === 'number'
          ? String(roleValue)
          : DEFAULT_PARTICIPANT_STATUS.role,
      roleName: typeof parsed.role_name === 'string' ? parsed.role_name : undefined,
      joinTime: typeof parsed.join_time === 'string' ? parsed.join_time : undefined,
      requestTime: typeof parsed.request_time === 'string' ? parsed.request_time : undefined,
      approveTime: typeof parsed.approve_time === 'string' ? parsed.approve_time : undefined,
      lastAction: typeof parsed.last_action === 'string' ? parsed.last_action : undefined,
      operatorId: typeof parsed.operator_id === 'string' ? parsed.operator_id : undefined,
      isDisabledUser:
        parsed.isDisabledUser === true ||
        parsed.isDisabledUser === 'true' ||
        parsed.is_disabled_user === true ||
        parsed.is_disabled_user === 'true',
      raw: typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : undefined,
    };
  } catch (error) {
    console.warn('parseParticipantMetadata fallback', error);
    return { ...DEFAULT_PARTICIPANT_STATUS };
  }
}

export function isHost(metadata: TokenMetadata | null): boolean {
  return metadata?.role === 2 || metadata?.role === 3;
}

export function isStudent(metadata: TokenMetadata | null): boolean {
  return metadata?.role === 1;
}

export function getRoleDisplayName(metadata: TokenMetadata | null): string {
  if (!metadata) return '游客';

  switch (metadata.role) {
    case 3:
      return '管理员';
    case 2:
      return '主持人';
    case 1:
      return '学生';
    default:
      return '游客';
  }
}

export function shouldShowInMicList(metadata?: string | null): boolean {
  return parseParticipantMetadata(metadata).displayStatus === 'visible';
}

export function isRequestingMic(metadata?: string | null): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'requesting';
}

export function isOnMic(metadata?: string | null): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'on_mic';
}

export function isMuted(metadata?: string | null): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'muted';
}

export function canSpeak(metadata?: string | null): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  if (status.isDisabledUser) {
    return false;
  }
  return role >= 2 || status.micStatus === 'on_mic';
}

export function isHostOrAdmin(metadata?: string | null): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  return role >= 2;
}

export function isUserDisabled(metadata?: string | null): boolean {
  return parseParticipantMetadata(metadata).isDisabledUser;
}

export function canRequestMic(metadata?: string | null): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  if (status.isDisabledUser || role >= 2) {
    return false;
  }
  return true;
}

export function getMicStatusText(metadata?: string | null): string {
  const status = parseParticipantMetadata(metadata);
  if (status.isDisabledUser) return '已禁用';
  switch (status.micStatus) {
    case 'requesting':
      return '申请中';
    case 'on_mic':
      return '已上麦';
    case 'muted':
      return '已静音';
    case 'off_mic':
    default:
      return '未上麦';
  }
}

export function getRoleText(metadata?: string | null): string {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  switch (role) {
    case 3:
      return '管理员';
    case 2:
      return '主持人';
    case 1:
      return '参会者';
    default:
      return '游客';
  }
}

export function isCameraEnabled(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return !!(videoTrack && videoTrack.track && !videoTrack.isMuted && participant.isCameraEnabled);
}

export function hasCameraTrack(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return !!videoTrack;
}

export function isCameraMuted(participant: Participant): boolean {
  const videoTrack = participant.getTrackPublication(Track.Source.Camera);
  return videoTrack?.isMuted || false;
}

export function shouldShowVideoFrame(participant: Participant): boolean {
  const isHostRole = isHostOrAdmin(participant.metadata);
  if (isHostRole) {
    const cameraEnabled = isCameraEnabled(participant);
    console.log(`🎥 主持人${participant.identity} 摄像头状态检测`, {
      hasCameraTrack: hasCameraTrack(participant),
      isCameraMuted: isCameraMuted(participant),
      isCameraEnabled: participant.isCameraEnabled,
      finalResult: cameraEnabled,
    });
    return cameraEnabled;
  }
  return true;
}

export function getVideoFrameStatusText(participant: Participant): string {
  const isHostRole = isHostOrAdmin(participant.metadata);
  if (isHostRole) {
    if (isCameraEnabled(participant)) {
      return '摄像头已开启';
    }
    if (hasCameraTrack(participant) && isCameraMuted(participant)) {
      return '摄像头已静音';
    }
    return '摄像头未开启';
  }
  return '参会者';
}

export function createParticipantMetadata(
  role: number,
  micStatus: string = 'off_mic',
  displayStatus: string = 'visible',
  additionalData?: Record<string, unknown>
): string {
  const metadata = {
    role: role.toString(),
    role_name: getRoleNameByNumber(role),
    mic_status: micStatus,
    display_status: displayStatus,
    join_time: new Date().toISOString(),
    ...additionalData,
  };
  return JSON.stringify(metadata);
}

export function updateParticipantMetadata(
  currentMetadata: string | null,
  updates: Partial<{
    role: number;
    mic_status: string;
    display_status: string;
    last_action: string;
    operator_id: string;
    request_time: string;
    approve_time: string;
  }>
): string {
  const current = parseParticipantMetadata(currentMetadata);
  const updated = {
    ...current.raw,
    ...updates,
  };

  if (updates.role !== undefined) {
    updated.role = updates.role.toString();
    updated.role_name = getRoleNameByNumber(updates.role);
  }

  return JSON.stringify(updated);
}

export function getRoleNameByNumber(role: number): string {
  switch (role) {
    case 3:
      return 'admin';
    case 2:
      return 'host';
    case 1:
      return 'student';
    default:
      return 'student';
  }
}

export function getCurrentUserRole(): number {
  return getCurrentUserRoleFromContext();
}

export function canCurrentUserControlParticipant(targetMetadata?: string | null): boolean {
  const currentRole = getCurrentUserRole();
  const targetRole = parseInt(parseParticipantMetadata(targetMetadata).role || '1', 10);

  if (currentRole >= 3) return true;
  if (currentRole === 2 && targetRole <= 1) return true;

  return false;
}

export function canCurrentUserKickFromMic(targetMetadata?: string | null): boolean {
  const currentRole = getCurrentUserRole();
  const targetStatus = parseParticipantMetadata(targetMetadata);
  const targetRole = parseInt(targetStatus.role || '1', 10);

  if (currentRole < 2) return false;
  if (currentRole >= 3) return true;
  if (currentRole === 2 && targetRole <= 1) return true;

  return false;
}

export function canCurrentUserMuteParticipant(targetMetadata?: string | null): boolean {
  return canCurrentUserControlParticipant(targetMetadata);
}

export function canCurrentUserApproveRequest(targetMetadata?: string | null): boolean {
  const currentRole = getCurrentUserRole();
  const targetStatus = parseParticipantMetadata(targetMetadata);

  if (currentRole < 2) return false;
  if (targetStatus.micStatus !== 'requesting') return false;

  return canCurrentUserControlParticipant(targetMetadata);
}
