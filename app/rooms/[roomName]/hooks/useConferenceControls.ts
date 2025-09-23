'use client';

import * as React from 'react';
import { Track } from 'livekit-client';

import { isCameraEnabled } from '@/lib/token-utils';

interface LocalParticipantLike {
  isCameraEnabled: boolean;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  isMicrophoneEnabled: boolean;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setScreenShareEnabled: (enabled: boolean) => Promise<void>;
  getTrackPublication: (source: Track.Source) => any;
  unpublishTrack: (track: any) => Promise<void>;
  getTrackPublications?: () => any[];
  on: (event: string, listener: (arg: any) => void) => void;
  off: (event: string, listener: (arg: any) => void) => void;
}

type RoomContextLike = {
  state?: string;
  disconnect?: () => void;
  localParticipant?: {
    publishData: (payload: Uint8Array, options?: { reliable?: boolean }) => void;
  };
};

interface UseConferenceControlsOptions {
  localParticipant?: LocalParticipantLike | null;
  roomCtx?: RoomContextLike | null;
  userRole?: number;
}

interface UseConferenceControlsResult {
  isScreenSharing: boolean;
  isLocalCameraEnabled: boolean;
  toggleScreenShare: () => Promise<void>;
  toggleCamera: () => Promise<void>;
}

export function useConferenceControls({
  localParticipant,
  roomCtx,
  userRole,
}: UseConferenceControlsOptions): UseConferenceControlsResult {
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const [isLocalCameraEnabled, setIsLocalCameraEnabled] = React.useState(false);
  const [autoScreenShareAttempted, setAutoScreenShareAttempted] = React.useState(false);

  const startAutoScreenShare = React.useCallback(async () => {
    if (!localParticipant || autoScreenShareAttempted) {
      return;
    }
    if (userRole !== 2 && userRole !== 3) {
      setAutoScreenShareAttempted(true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setAutoScreenShareAttempted(true);
      return;
    }
    if (
      !window.isSecureContext &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1')
    ) {
      setAutoScreenShareAttempted(true);
      return;
    }
    setAutoScreenShareAttempted(true);
    try {
      await localParticipant.setScreenShareEnabled(true);
      setIsScreenSharing(true);
      if (localParticipant.isCameraEnabled) {
        await localParticipant.setCameraEnabled(false);
      }
    } catch (error) {
      console.error('自动开启屏幕共享失败:', error);
    }
  }, [localParticipant, userRole, autoScreenShareAttempted]);

  React.useEffect(() => {
    if (!localParticipant) {
      setIsLocalCameraEnabled(false);
      return;
    }

    const updateCameraState = () => {
      setIsLocalCameraEnabled(isCameraEnabled(localParticipant as any));
    };

    updateCameraState();

    const handleTrackMuted = (track: any) => {
      if (track.source === Track.Source.ScreenShare) {
        setIsScreenSharing(false);
      }
      if (track.source === Track.Source.Camera) {
        updateCameraState();
      }
    };
    const handleTrackUnmuted = (track: any) => {
      if (track.source === Track.Source.ScreenShare) {
        setIsScreenSharing(true);
      }
      if (track.source === Track.Source.Camera) {
        updateCameraState();
      }
    };
    const handleTrackPublished = (publication: any) => {
      if (publication.source === Track.Source.Camera) {
        updateCameraState();
      }
      if (publication.source === Track.Source.ScreenShare) {
        setIsScreenSharing(true);
      }
    };
    const handleTrackUnpublished = (publication: any) => {
      if (publication.source === Track.Source.ScreenShare) {
        setIsScreenSharing(false);
      }
      if (publication.source === Track.Source.Camera) {
        updateCameraState();
      }
    };

    localParticipant.on('trackMuted', handleTrackMuted);
    localParticipant.on('trackUnmuted', handleTrackUnmuted);
    localParticipant.on('trackPublished', handleTrackPublished);
    localParticipant.on('trackUnpublished', handleTrackUnpublished);

    return () => {
      localParticipant.off('trackMuted', handleTrackMuted);
      localParticipant.off('trackUnmuted', handleTrackUnmuted);
      localParticipant.off('trackPublished', handleTrackPublished);
      localParticipant.off('trackUnpublished', handleTrackUnpublished);
    };
  }, [localParticipant]);

  React.useEffect(() => {
    if (roomCtx && localParticipant && roomCtx.state === 'connected' && !autoScreenShareAttempted) {
      const timer = window.setTimeout(() => {
        startAutoScreenShare();
      }, 1000);
      return () => window.clearTimeout(timer);
    }
  }, [roomCtx, localParticipant, startAutoScreenShare, autoScreenShareAttempted]);

  const toggleScreenShare = React.useCallback(async () => {
    if (!localParticipant) {
      return;
    }
    try {
      const shouldEnable = !isScreenSharing;
      await localParticipant.setScreenShareEnabled(shouldEnable);
      setIsScreenSharing(shouldEnable);
      if (!shouldEnable) {
        const publications = localParticipant.getTrackPublications?.();
        if (Array.isArray(publications)) {
          for (const pub of publications) {
            if (pub.source === Track.Source.ScreenShare && pub.track) {
              await localParticipant.unpublishTrack(pub.track);
            }
          }
        }
      }
      if (!shouldEnable) {
        alert('屏幕共享已停止');
      }
    } catch (error) {
      console.error('切换屏幕共享失败:', error);
      let message = '切换屏幕共享失败';
      if (error instanceof Error) {
        if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
          message = '用户拒绝了屏幕共享权限';
        } else {
          message = `屏幕共享失败: ${error.message}`;
        }
      }
      alert(message);
    }
  }, [localParticipant, isScreenSharing]);

  const toggleCamera = React.useCallback(async () => {
    if (!localParticipant) {
      return;
    }
    try {
      const shouldEnable = !isLocalCameraEnabled;
      await localParticipant.setCameraEnabled(shouldEnable);
      setIsLocalCameraEnabled(shouldEnable);
      const cameraTrack = localParticipant.getTrackPublication(Track.Source.Camera);
      if (!shouldEnable && cameraTrack?.track) {
        console.info('Camera disabled, track publication remains available.');
      }
    } catch (error) {
      console.error('切换摄像头失败:', error);
      alert(`切换摄像头失败: ${(error as Error).message}`);
    }
  }, [localParticipant, isLocalCameraEnabled]);

  return {
    isScreenSharing,
    isLocalCameraEnabled,
    toggleScreenShare,
    toggleCamera,
  };
}
