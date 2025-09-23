import { Participant, Track } from 'livekit-client';
import { getCurrentUserRoleFromContext } from '@/contexts/UserContext';

type JsonRecord = Record<string, unknown>;

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + '='.repeat(paddingLength);

  const decodeWithAtob = () => {
    if (typeof globalThis.atob !== 'function') {
      return undefined;
    }
    const binary = globalThis.atob(padded);
    if (typeof TextDecoder === 'function') {
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return binary;
  };

  try {
    const decoded = decodeWithAtob();
    if (decoded !== undefined) {
      return decoded;
    }
  } catch (error) {
    console.warn('Failed to decode JWT with atob, falling back to Buffer-like decoder', error);
  }

  const maybeBuffer = (globalThis as any)?.Buffer;
  if (maybeBuffer) {
    const buffer = maybeBuffer.from(padded, 'base64');
    if (buffer instanceof Uint8Array) {
      if (typeof TextDecoder === 'function') {
        return new TextDecoder().decode(buffer);
      }
      let result = '';
      for (const byte of buffer) {
        result += String.fromCharCode(byte);
      }
      return result;
    }
    if (buffer && typeof buffer.toString === 'function') {
      return buffer.toString('utf8');
    }
  }

  throw new Error('No base64 decoder available in current environment');
};

export const decodeJwtPayload = <T extends JsonRecord = JsonRecord>(token?: string): T | null => {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadSegment = parts[1];
    const jsonString = decodeBase64Url(payloadSegment);
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('Failed to decode JWT payload:', error);
    return null;
  }
};

export const getJwtExpiry = (token?: string): number | undefined => {
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload || typeof payload.exp !== 'number') {
    return undefined;
  }

  const expMs = payload.exp * 1000;
  return Number.isFinite(expMs) && expMs > 0 ? expMs : undefined;
};

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

export type ParticipantMetadataSource = string | null | undefined | Record<string, unknown>;

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

export function getParticipantMetadataSource(participant?: Pick<Participant, 'metadata' | 'attributes'>): ParticipantMetadataSource {
  if (!participant) {
    return null;
  }

  const attributes = participant.attributes as Record<string, unknown> | undefined;
  if (attributes && Object.keys(attributes).length > 0) {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined) {
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          normalized[key] = '';
          continue;
        }
        try {
          normalized[key] = JSON.parse(trimmed);
          continue;
        } catch {
          // fall through
        }
        normalized[key] = trimmed;
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  return participant.metadata ?? null;
}

export function parseParticipantMetadata(metadata?: ParticipantMetadataSource): ParticipantMicStatus {
  if (metadata === null || metadata === undefined) {
    return { ...DEFAULT_PARTICIPANT_STATUS };
  }

  let parsedSource: Record<string, unknown> | null = null;

  if (typeof metadata === 'string') {
    const trimmed = metadata.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return { ...DEFAULT_PARTICIPANT_STATUS };
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsedSource = JSON.parse(trimmed) as Record<string, unknown>;
      } catch (error) {
        console.warn('parseParticipantMetadata fallback', error, { metadataSnippet: trimmed.slice(0, 80) });
        return { ...DEFAULT_PARTICIPANT_STATUS };
      }
    } else {
      console.warn('parseParticipantMetadata fallback: unsupported metadata format', { metadataSnippet: trimmed.slice(0, 80) });
      return { ...DEFAULT_PARTICIPANT_STATUS };
    }
  } else if (typeof metadata === 'object') {
    parsedSource = metadata as Record<string, unknown>;
  }

  if (!parsedSource) {
    return { ...DEFAULT_PARTICIPANT_STATUS };
  }

  const roleValue = parsedSource.role;
  const micStatusValue = parsedSource.mic_status;
  const displayStatusValue = parsedSource.display_status;

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
    roleName: typeof parsedSource.role_name === 'string' ? parsedSource.role_name : undefined,
    joinTime: typeof parsedSource.join_time === 'string' ? parsedSource.join_time : undefined,
    requestTime: typeof parsedSource.request_time === 'string' ? parsedSource.request_time : undefined,
    approveTime: typeof parsedSource.approve_time === 'string' ? parsedSource.approve_time : undefined,
    lastAction: typeof parsedSource.last_action === 'string' ? parsedSource.last_action : undefined,
    operatorId: typeof parsedSource.operator_id === 'string' ? parsedSource.operator_id : undefined,
    isDisabledUser:
      parsedSource.isDisabledUser === true ||
      parsedSource.isDisabledUser === 'true' ||
      parsedSource.is_disabled_user === true ||
      parsedSource.is_disabled_user === 'true',
    raw: parsedSource,
  };
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

export function shouldShowInMicList(metadata?: ParticipantMetadataSource): boolean {
  return parseParticipantMetadata(metadata).displayStatus === 'visible';
}

export function isRequestingMic(metadata?: ParticipantMetadataSource): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'requesting';
}

export function isOnMic(metadata?: ParticipantMetadataSource): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'on_mic';
}

export function isMuted(metadata?: ParticipantMetadataSource): boolean {
  return parseParticipantMetadata(metadata).micStatus === 'muted';
}

export function canSpeak(metadata?: ParticipantMetadataSource): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  if (status.isDisabledUser) {
    return false;
  }
  return role >= 2 || status.micStatus === 'on_mic';
}

export function isHostOrAdmin(metadata?: ParticipantMetadataSource): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  return role >= 2;
}

export function isUserDisabled(metadata?: ParticipantMetadataSource): boolean {
  return parseParticipantMetadata(metadata).isDisabledUser;
}

export function canRequestMic(metadata?: ParticipantMetadataSource): boolean {
  const status = parseParticipantMetadata(metadata);
  const role = parseInt(status.role || '1', 10);
  if (status.isDisabledUser || role >= 2) {
    return false;
  }
  return true;
}

export function getMicStatusText(metadata?: ParticipantMetadataSource): string {
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

export function getRoleText(metadata?: ParticipantMetadataSource): string {
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
  const isHostRole = isHostOrAdmin(getParticipantMetadataSource(participant));
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
  const isHostRole = isHostOrAdmin(getParticipantMetadataSource(participant));
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
  currentMetadata: ParticipantMetadataSource,
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
  const base: Record<string, unknown> = {
    ...(current.raw ?? {}),
    ...updates,
  };

  if (updates.role !== undefined) {
    return JSON.stringify({
      ...base,
      role: updates.role.toString(),
      role_name: getRoleNameByNumber(updates.role),
    });
  }

  return JSON.stringify(base);
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

export function canCurrentUserControlParticipant(targetMetadata?: ParticipantMetadataSource): boolean {
  const currentRole = getCurrentUserRole();
  const targetRole = parseInt(parseParticipantMetadata(targetMetadata).role || '1', 10);

  if (currentRole >= 3) return true;
  if (currentRole === 2 && targetRole <= 1) return true;

  return false;
}

export function canCurrentUserKickFromMic(targetMetadata?: ParticipantMetadataSource): boolean {
  const currentRole = getCurrentUserRole();
  const targetStatus = parseParticipantMetadata(targetMetadata);
  const targetRole = parseInt(targetStatus.role || '1', 10);

  if (currentRole < 2) return false;
  if (currentRole >= 3) return true;
  if (currentRole === 2 && targetRole <= 1) return true;

  return false;
}

export function canCurrentUserMuteParticipant(targetMetadata?: ParticipantMetadataSource): boolean {
  return canCurrentUserControlParticipant(targetMetadata);
}

export function canCurrentUserApproveRequest(targetMetadata?: ParticipantMetadataSource): boolean {
  const currentRole = getCurrentUserRole();
  const targetStatus = parseParticipantMetadata(targetMetadata);

  if (currentRole < 2) return false;
  if (targetStatus.micStatus !== 'requesting') return false;

  return canCurrentUserControlParticipant(targetMetadata);
}
