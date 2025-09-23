import type { Participant } from 'livekit-client';

import { getParticipantMetadataSource, parseParticipantMetadata } from '@/lib/token-utils';

export const normalizeUid = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

export const extractParticipantUid = (participant?: Participant): number | null => {
  if (!participant) {
    return null;
  }

  const metadataSource = getParticipantMetadataSource(participant);
  const parsedMetadata = parseParticipantMetadata(metadataSource);
  const raw = parsedMetadata.raw ?? {};

  const candidates: unknown[] = [
    (raw as Record<string, unknown>).user_uid,
    (raw as Record<string, unknown>).userUid,
    participant.attributes?.user_uid,
    participant.attributes?.uid,
    participant.identity?.replace(/^user_/, ''),
  ];

  for (const candidate of candidates) {
    const uid = normalizeUid(candidate);
    if (uid !== null) {
      return uid;
    }
  }

  return null;
};
