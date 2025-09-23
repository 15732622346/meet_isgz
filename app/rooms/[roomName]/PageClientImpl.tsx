
'use client';

import React from 'react';

// Provide a lightweight polyfill so older browsers still have crypto.randomUUID.
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  if (!window.crypto) {
    // @ts-ignore - create the namespace on the fly
    window.crypto = {};
  }

  // @ts-ignore - assign the polyfill implementation
  window.crypto.randomUUID = function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  };
}

import { isLowPowerDevice } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { ConnectionDetails } from '@/lib/types';
import { callGatewayApi, normalizeGatewayResponse } from '@/lib/api-client';
import { useUserContext } from '@/contexts/UserContext';
import type { AuthStatusResponse, RoomDetailRequest, RoomDetailResponse } from '@/types/api';
import { LocalUserChoices, PreJoin, RoomContext } from '@livekit/components-react';
import {
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from 'livekit-client';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { CustomVideoConference } from './CustomVideoConference';
import type { RoomDetails } from './types/conference-types';
import { PermissionHelper } from './PermissionHelper';
import { UserAuthForm } from './UserAuthForm';
import { ErrorToast } from '../../../components/ErrorToast';
import { API_CONFIG } from '@/lib/config';

interface RoomSnapshot {
  roomId: string;
  roomName: string;
  maxMicSlots: number;
  roomState: number;
  audioState: number;
  cameraState: number;
  chatState: number;
  hostUserId?: number;
  hostNickname: string;
  onlineCount: number;
  availableSlots: number;
}

export function PageClientImpl() {
  const [roomName, setRoomName] = React.useState('');
  const [region, setRegion] = React.useState<string | undefined>(undefined);
  const [hq, setHq] = React.useState(false);
  const [codec, setCodec] = React.useState<VideoCodec>('vp9');
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const segments = pathname.split('/').filter(Boolean);
    const roomFromPath = segments[segments.length - 1];
    if (roomFromPath) {
      setRoomName(decodeURIComponent(roomFromPath));
    }

    const regionParam = searchParams.get('region');
    if (regionParam) {
      setRegion(regionParam);
    }

    const hqParam = searchParams.get('hq');
    if (hqParam === 'true') {
      setHq(true);
    }

    const codecParam = searchParams.get('codec');
    const supportedCodecs: VideoCodec[] = ['vp8', 'h264', 'vp9', 'av1'];
    if (codecParam && supportedCodecs.includes(codecParam as VideoCodec)) {
      setCodec(codecParam as VideoCodec);
    }

    setIsReady(true);
  }, []);

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return <PageClientImplInner roomName={roomName} region={region} hq={hq} codec={codec} />;
}

interface PageClientImplInnerProps {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}

function PageClientImplInner(props: PageClientImplInnerProps) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(undefined);
  const [mediaSupported, setMediaSupported] = React.useState(false);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(undefined);
  const [askInvite, setAskInvite] = React.useState(false);
  const { setInviteCode: storeInviteCode, inviteCode: storedInviteCode } = useUserContext();
  const [inviteCodeInput, setInviteCodeInput] = React.useState(storedInviteCode ?? '');
  const [inviteSubmitting, setInviteSubmitting] = React.useState(false);
  const [showPermissionHelper, setShowPermissionHelper] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<string | null>(null);
  const [showUserAuth, setShowUserAuth] = React.useState(true);
  const [userRole, setUserRole] = React.useState<number | undefined>(undefined);
  const [userName, setUserName] = React.useState<string | undefined>(undefined);
  const [userId, setUserId] = React.useState<number | undefined>(undefined);
  const [jwtToken, setJwtToken] = React.useState<string | undefined>(undefined);
  const [cachedRoomId, setCachedRoomId] = React.useState<string | undefined>(undefined);
  const [roomData, setRoomData] = React.useState<RoomSnapshot | null>(null);

  React.useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setMediaSupported(supported);
  }, []);

  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: mediaSupported,
      audioEnabled: mediaSupported,
    };
  }, [mediaSupported]);

  const normalizeRoomData = React.useCallback(
    (raw: any, source: string): RoomSnapshot | null => {
      if (!raw) {
        return null;
      }

      const roomId = raw.roomId ?? raw.room_id ?? cachedRoomId ?? props.roomName;
      const roomName = raw.roomName ?? raw.room_name ?? props.roomName;
      if (!roomId || !roomName) {
        console.warn(`[${source}] 房间数据缺失`, { raw });
        return null;
      }

      return {
        roomId,
        roomName,
        maxMicSlots: Number(raw.maxMicSlots ?? raw.max_mic_slots ?? 10),
        roomState: Number(raw.roomState ?? raw.room_state ?? 1),
        audioState: Number(raw.audioState ?? raw.audio_state ?? 1),
        cameraState: Number(raw.cameraState ?? raw.camera_state ?? 1),
        chatState: Number(raw.chatState ?? raw.chat_state ?? 1),
        hostUserId: raw.hostUserId ?? raw.host_user_id ?? undefined,
        hostNickname: raw.hostNickname ?? raw.host_nickname ?? '',
        onlineCount: Number(raw.onlineCount ?? raw.online_count ?? 0),
        availableSlots: Number(raw.availableSlots ?? raw.available_slots ?? 0),
      };
    },
    [cachedRoomId, props.roomName],
  );

  const setRoomDataWithValidation = React.useCallback(
    (raw: any, source: string) => {
      const snapshot = normalizeRoomData(raw, source);
      if (snapshot) {
        setCachedRoomId(snapshot.roomId);
        setRoomData(snapshot);
        return true;
      }

      setCachedRoomId(props.roomName);
      setRoomData(null);
      return false;
    },
    [normalizeRoomData, props.roomName],
  );

  const handlePreJoinSubmit = React.useCallback((values: LocalUserChoices) => {
    setPreJoinChoices(values);
    setAskInvite(true);
  }, []);

  const handlePreJoinError = React.useCallback((reason: unknown) => {
    console.error(reason);
  }, []);

  const handlePermissionGranted = React.useCallback(() => {
    setShowPermissionHelper(false);
    setPermissionError(null);
  }, []);

  const handlePermissionDenied = React.useCallback((message: string) => {
    setPermissionError(message);
    setShowPermissionHelper(false);
  }, []);

  type LoginSuccessPayload = {
    id: number;
    username: string;
    nickname: string;
    token: string;
    user_roles: number;
    ws_url?: string;
    jwt_token?: string;
    roomData?: any;
  };

  const handleLoginSuccess = React.useCallback(
    async (payload: LoginSuccessPayload) => {
      const choices: LocalUserChoices = {
        username: payload.nickname || payload.username,
        videoEnabled: false,
        audioEnabled: false,
        videoDeviceId: '',
        audioDeviceId: '',
      };

      const liveKitUrl = await API_CONFIG.getLiveKitUrl();
      let serverUrl = payload.ws_url || liveKitUrl;
      const isProductionUrl =
        serverUrl &&
        (serverUrl.startsWith('wss://') || (serverUrl.startsWith('ws://') && !serverUrl.includes('localhost')));

      if (!isProductionUrl && serverUrl?.includes('localhost')) {
        serverUrl = liveKitUrl;
      }

      if (serverUrl?.includes('/rtc')) {
        serverUrl = serverUrl.replace('/rtc', '');
      }

      const connection: ConnectionDetails = {
        serverUrl,
        roomName: props.roomName,
        participantName: payload.nickname || payload.username,
        participantToken: payload.token,
      };

      setPreJoinChoices(choices);
      setConnectionDetails(connection);
      setUserRole(payload.user_roles);
      setUserName(payload.nickname || payload.username);
      setUserId(payload.id);
      setJwtToken(payload.jwt_token);
      setRoomDataWithValidation(payload.roomData, 'handleLoginSuccess');

      setShowUserAuth(false);
      setShowPermissionHelper(true);
    },
    [props.roomName, setRoomDataWithValidation],
  );

  const handleGuestMode = React.useCallback(() => {
    setShowUserAuth(false);
    setAskInvite(true);
    setInviteCodeInput('');
    setJwtToken(undefined);
  }, []);

  const handleInviteSubmit = React.useCallback(async () => {
    const normalizedInvite = inviteCodeInput.trim();
    if (!normalizedInvite) {
      alert('请输入邀请码');
      return;
    }

    setInviteSubmitting(true);
    try {
      const authResponse = await callGatewayApi<AuthStatusResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_status'),
      );

      const authResult = normalizeGatewayResponse<AuthStatusResponse>(authResponse);
      const authData = authResult.payload ?? (authResponse as AuthStatusResponse);

      if (!authResult.success || authData.user_type !== 'guest') {
        throw new Error('获取游客身份失败');
      }

      const guestName =
        authData.user_name ||
        authData.user_nickname ||
        `guest_${Math.random().toString(36).slice(2, 8)}`;

      const roomRequest: RoomDetailRequest = {
        room_id: props.roomName,
        invite_code: normalizedInvite,
        user_name: guestName,
        user_jwt_token: authData.jwt_token || '',
      };

      const roomResponse = await callGatewayApi<RoomDetailResponse>(
        await API_CONFIG.getEndpoint('gateway_rooms_detail'),
        roomRequest,
        { method: 'GET' },
      );

      setJwtToken(authData.jwt_token || '');

      const roomResult = normalizeGatewayResponse<RoomDetailResponse>(roomResponse);
      if (!roomResult.success) {
        throw new Error(roomResult.error || roomResult.message || '邀请码验证失败');
      }

      const data = roomResult.payload ?? (roomResponse as RoomDetailResponse);

      storeInviteCode(normalizedInvite);

      const guestChoices: LocalUserChoices = {
        username: guestName,
        videoEnabled: false,
        audioEnabled: false,
        videoDeviceId: '',
        audioDeviceId: '',
      };
      setPreJoinChoices(guestChoices);

      const liveKitUrl = await API_CONFIG.getLiveKitUrl();
      let serverUrl = data.ws_url || liveKitUrl;
      const isProductionUrl =
        serverUrl &&
        (serverUrl.startsWith('wss://') || (serverUrl.startsWith('ws://') && !serverUrl.includes('localhost')));

      if (!isProductionUrl && serverUrl?.includes('localhost')) {
        serverUrl = liveKitUrl;
      }

      if (serverUrl?.includes('/rtc')) {
        serverUrl = serverUrl.replace('/rtc', '');
      }

      const participantToken = data.connection?.livekit_token || data.token || '';

      setConnectionDetails({
        serverUrl,
        roomName: props.roomName,
        participantName: guestName,
        participantToken,
      });
      setUserRole(0);
      setUserName(guestName);
      setUserId(undefined);

      if (!setRoomDataWithValidation(data.room, 'InviteCodeForm-guest')) {
        console.warn('游客模式 API 缺少房间信息', data);
      }

      setInviteCodeInput('');
      setAskInvite(false);
      setShowPermissionHelper(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('邀请码验证失败', error);
      setRoomDataWithValidation(null, 'InviteCodeForm-error');
      alert(`邀请码验证失败: ${message}`);
    } finally {
      setInviteSubmitting(false);
    }
  }, [inviteCodeInput, props.roomName, setRoomDataWithValidation, storeInviteCode]);

  const handleInviteCancel = React.useCallback(() => {
    setInviteCodeInput('');
    setAskInvite(false);
    setShowUserAuth(true);
    setJwtToken(undefined);
  }, []);

  const SimpleJoinForm = () => {
    const [username, setUsername] = React.useState('');
    const [invite, setInvite] = React.useState('');
    const [loading, setLoading] = React.useState(false);

    const handleJoin = async () => {
      if (!username.trim() || !invite.trim()) {
        alert('请输入昵称和邀请码');
        return;
      }

      setLoading(true);
      try {
        const authResponse = await callGatewayApi<AuthStatusResponse>(
          await API_CONFIG.getEndpoint('gateway_auth_status'),
        );

        const authResult = normalizeGatewayResponse<AuthStatusResponse>(authResponse);
        const authData = authResult.payload ?? (authResponse as AuthStatusResponse);

        if (!authResult.success || authData.user_type !== 'guest') {
          throw new Error('获取游客身份失败');
        }

        const roomRequest: RoomDetailRequest = {
          room_id: props.roomName,
          invite_code: invite,
          user_name: username,
          user_jwt_token: authData.jwt_token || '',
        };

        setJwtToken(authData.jwt_token || '');

        const roomResponse = await callGatewayApi<RoomDetailResponse>(
          await API_CONFIG.getEndpoint('gateway_rooms_detail'),
          roomRequest,
          { method: 'GET' },
        );

        const roomResult = normalizeGatewayResponse<RoomDetailResponse>(roomResponse);
        if (!roomResult.success) {
          throw new Error(roomResult.error || roomResult.message || '邀请码验证失败');
        }

        const data = roomResult.payload ?? (roomResponse as RoomDetailResponse);

        storeInviteCode(invite.trim());

        const choices: LocalUserChoices = {
          username,
          videoEnabled: false,
          audioEnabled: false,
          videoDeviceId: '',
          audioDeviceId: '',
        };
        setPreJoinChoices(choices);

        const liveKitUrl = await API_CONFIG.getLiveKitUrl();
        let serverUrl = data.ws_url || liveKitUrl;
        const isProductionUrl =
          serverUrl &&
          (serverUrl.startsWith('wss://') || (serverUrl.startsWith('ws://') && !serverUrl.includes('localhost')));

        if (!isProductionUrl && serverUrl?.includes('localhost')) {
          serverUrl = liveKitUrl;
        }

        if (serverUrl?.includes('/rtc')) {
          serverUrl = serverUrl.replace('/rtc', '');
        }

        setConnectionDetails({
          serverUrl,
          roomName: props.roomName,
          participantName: username,
          participantToken: data.token || '',
        });
        setUserRole(0);
        setUserName(authData.user_nickname || username);
        setUserId(undefined);
        setShowPermissionHelper(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`加入房间失败: ${message}`);
        console.error('连接失败', error);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '280px' }}>
          <input
            className="lk-button"
            placeholder="昵称"
            value={username}
            onChange={event => setUsername(event.target.value)}
            style={{ padding: '8px' }}
            disabled={loading}
          />
          <input
            className="lk-button"
            placeholder="邀请码"
            value={invite}
            onChange={event => setInvite(event.target.value)}
            style={{ padding: '8px' }}
            disabled={loading}
          />
          <button
            className="lk-button"
            onClick={handleJoin}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '连接中...' : '进入房间'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      {showUserAuth ? (
        <UserAuthForm onLoginSuccess={handleLoginSuccess} onGuestMode={handleGuestMode} roomName={props.roomName} />
      ) : showPermissionHelper ? (
        <PermissionHelper onPermissionGranted={handlePermissionGranted} onPermissionDenied={handlePermissionDenied} />
      ) : connectionDetails && preJoinChoices ? (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{ codec: props.codec, hq: props.hq }}
          userRole={userRole}
          userName={userName}
          userId={userId}
          jwtToken={jwtToken}
          roomName={props.roomName}
          roomData={roomData}
        />
      ) : askInvite ? (
        <InviteCodeForm
          inviteCode={inviteCodeInput}
          loading={inviteSubmitting}
          onInviteCodeChange={setInviteCodeInput}
          onSubmit={handleInviteSubmit}
          onCancel={handleInviteCancel}
        />
      ) : !mediaSupported ? (
        connectionDetails ? (
          <VideoConferenceComponent
            connectionDetails={connectionDetails}
            userChoices={preJoinChoices as LocalUserChoices}
            options={{ codec: props.codec, hq: props.hq }}
            userRole={userRole}
            userName={userName}
            userId={userId}
            jwtToken={jwtToken}
            roomName={props.roomName}
            roomData={roomData}
          />
        ) : (
          <SimpleJoinForm />
        )
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <PreJoin defaults={preJoinDefaults} onSubmit={handlePreJoinSubmit} onError={handlePreJoinError} />
        </div>
      )}

      <ErrorToast message={permissionError || ''} isVisible={!!permissionError} onClose={() => setPermissionError(null)} />
    </main>
  );
}

interface InviteCodeFormProps {
  inviteCode: string;
  loading: boolean;
  onInviteCodeChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function InviteCodeForm({ inviteCode, loading, onInviteCodeChange, onSubmit, onCancel }: InviteCodeFormProps) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '280px' }}>
        <h3 style={{ textAlign: 'center', margin: 0, color: 'white' }}>请输入邀请码</h3>
        <input
          className="lk-button"
          placeholder="邀请码"
          value={inviteCode}
          onChange={event => onInviteCodeChange(event.target.value)}
          style={{ padding: '8px' }}
          disabled={loading}
          autoFocus
        />
        <button
          className="lk-button"
          onClick={() => onSubmit()}
          disabled={loading || !inviteCode.trim()}
          style={{ opacity: loading || !inviteCode.trim() ? 0.6 : 1 }}
        >
          {loading ? '验证中...' : '验证邀请码'}
        </button>
        <button className="lk-button" onClick={onCancel} style={{ backgroundColor: '#666' }} disabled={loading}>
          返回登录
        </button>
      </div>
    </div>
  );
}

interface VideoConferenceComponentProps {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
  };
  userRole?: number;
  userName?: string;
  userId?: number;
  jwtToken?: string;
  roomName?: string;
  roomData?: RoomSnapshot | null;
}

function VideoConferenceComponent(props: VideoConferenceComponentProps) {
  const [deviceError, setDeviceError] = React.useState<string | null>(null);
  const e2eeSetup = useSetupE2EE(undefined, {});
  const e2eeEnabled = e2eeSetup.isE2EEEnabled;

  const initialRoomDetails = React.useMemo<RoomDetails | null>(() => {
    if (!props.roomData) {
      return null;
    }
    return {
      maxMicSlots: props.roomData.maxMicSlots,
      roomName: props.roomData.roomName,
      roomState: props.roomData.roomState,
    };
  }, [props.roomData]);
  const e2eeSetupComplete = e2eeSetup.isSetupComplete;

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec || 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }

    const videoCaptureDefaults: VideoCaptureOptions = {
      ...(props.userChoices.videoDeviceId ? { deviceId: props.userChoices.videoDeviceId } : {}),
      resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };

    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      videoSimulcastLayers: props.options.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
      red: !e2eeEnabled,
      videoCodec,
    };

    if (isLowPowerDevice()) {
      videoCaptureDefaults.resolution = VideoPresets.h360;
      publishDefaults.simulcast = false;
      publishDefaults.scalabilityMode = 'L1T3';
    }

    return {
      videoCaptureDefaults,
      publishDefaults,
      audioCaptureDefaults: {
        ...(props.userChoices.audioDeviceId ? { deviceId: props.userChoices.audioDeviceId } : {}),
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: undefined,
    };
  }, [props.options.codec, props.options.hq, props.userChoices, e2eeEnabled]);

  const room = React.useMemo(() => new Room(roomOptions), [roomOptions]);

  const connectOptions = React.useMemo<RoomConnectOptions>(() => ({ autoSubscribe: true }), []);

  const handleOnLeave = React.useCallback(() => {
    window.location.reload();
  }, []);

  const handleError = React.useCallback((error: Error) => {
    console.error(error);

    if (error.message.includes('device not found') || error.message.includes('Requested device not found')) {
      setDeviceError('未找到指定的音视频设备，但仍可继续加入会议。请检查摄像头和麦克风的连接。');
      return;
    }

    if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
      setDeviceError('无法访问摄像头或麦克风，请在浏览器中授予相应权限。');
      return;
    }

    if (error.message.includes('NotFoundError')) {
      setDeviceError('没有可用的摄像头或麦克风设备。');
      return;
    }

    setDeviceError(`遇到未知错误: ${error.message}`);
  }, []);

  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    setDeviceError(`端到端加密出现问题: ${error.message}，请联系管理员。`);
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);

    if (e2eeSetupComplete) {
      room
        .connect(
          props.connectionDetails.serverUrl,
          props.connectionDetails.participantToken,
          connectOptions,
        )
        .catch(error => {
          console.error('连接 LiveKit 房间失败', error);
          setDeviceError(`连接会议失败: ${error.message}`);
        });

      if (props.userChoices.videoEnabled) {
        room.localParticipant.setCameraEnabled(true).catch(handleError);
      }

      if (props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch(handleError);
      }
    }

    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [connectOptions, e2eeSetupComplete, handleEncryptionError, handleError, handleOnLeave, props.connectionDetails, props.userChoices, room]);

  return (
    <div className="lk-room-container">
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        <CustomVideoConference
          userRole={props.userRole}
          userName={props.userName ?? props.connectionDetails.participantName}
          userId={props.userId}
          userToken={props.connectionDetails.participantToken}
          jwtToken={props.jwtToken}
          roomName={props.roomName ?? props.roomData?.roomName ?? props.connectionDetails.roomName}
          hostUserId={props.roomData?.hostUserId}
          initialRoomDetails={initialRoomDetails}
        />
        <DebugMode />
        <RecordingIndicator />
      </RoomContext.Provider>

      <ErrorToast message={deviceError || ''} isVisible={!!deviceError} onClose={() => setDeviceError(null)} />
    </div>
  );
}


