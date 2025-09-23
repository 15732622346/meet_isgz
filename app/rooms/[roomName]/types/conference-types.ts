import type * as React from 'react';
import type { MessageFormatter } from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-core';
import type { Participant } from 'livekit-client';

export interface CustomVideoConferenceProps {
  chatMessageFormatter?: MessageFormatter;
  SettingsComponent?: React.ComponentType<{ onClose?: () => void }>;
  userRole?: number;
  userName?: string;
  userId?: number;
  userToken?: string;
  jwtToken?: string; // JWT token for API auth
  hostUserId?: number;
  roomName?: string;
  initialRoomDetails?: RoomDetails | null;
}


export interface RoomDetails {
  maxMicSlots?: number;
  roomName?: string;
  roomState?: number;
}

export interface CustomWidgetState {
  showChat: boolean;
  showParticipants: boolean;
  showHostPanel: boolean;
  showMicMenu: boolean;
  showDebugPanel: boolean;
  showAudioHelper: boolean;
  unreadMessages: number;
  showSettings: boolean;
}

export interface MainVideoDisplayProps {
  roomInfo: { name: string };
  tracks: TrackReference[];
  userRole?: number;
  userId?: number;
  userName?: string;
  isLocalCameraEnabled?: boolean;
}

export interface MicListProps {
  currentUserRole?: number;
  currentUserName?: string;
  roomInfo?: { name: string };
  userToken?: string;
  jwtToken?: string;
  maxMicSlots?: number;
  setDebugInfo?: (updater: (prev: string) => string) => void;
}

export interface MicParticipantTileProps {
  currentUserRole?: number;
  onApproveMic: (participant: Participant) => void;
  userToken?: string;
  jwtToken?: string;
  setDebugInfo?: (updater: (prev: string) => string) => void;
  currentUserName?: string;
}
