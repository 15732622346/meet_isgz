import type * as React from 'react';
import type { TrackReference } from '@livekit/components-core';
import type { Participant } from 'livekit-client';

export interface CustomVideoConferenceProps {
  SettingsComponent?: React.ComponentType<SettingsComponentProps>;
  userRole?: number;
  userName?: string;
  userId?: number;
  userToken?: string;
  jwtToken?: string; // JWT token for API auth
  hostUserId?: number;
  roomName?: string;
  initialRoomDetails?: RoomDetails | null;
}


export interface SettingsComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  isOpen?: boolean;
  room?: import('livekit-client').Room | null;
}

export interface RoomDetails {
  maxMicSlots?: number;
  roomName?: string;
  roomState?: number;
  chatState?: number;
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
  hostUserId?: number;
  jwtToken?: string;
  maxMicSlots?: number;
  setDebugInfo?: (updater: (prev: string) => string) => void;
}

export interface MicParticipantTileProps {
  currentUserRole?: number;
  onApproveMic: (participant: Participant) => void;
  userToken?: string;
  hostUserId?: number;
  jwtToken?: string;
  setDebugInfo?: (updater: (prev: string) => string) => void;
  currentUserName?: string;
}

