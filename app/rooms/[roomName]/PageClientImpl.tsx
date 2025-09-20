'use client';

import React from 'react';

// 娣诲姞 crypto.randomUUID polyfill
if (typeof window !== 'undefined' && !window.crypto?.randomUUID) {
  if (!window.crypto) {
    // @ts-ignore
    window.crypto = {};
  }

  // @ts-ignore
  window.crypto.randomUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}
import { decodePassphrase, isLowPowerDevice } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';
import { callGatewayApi } from '@/lib/api-client';
import type { AuthStatusResponse, RoomDetailRequest, RoomDetailResponse } from '@/types/api';
import {
  formatChatMessageLinks,
  LocalUserChoices,
  PreJoin,
  RoomContext,
  VideoConference,
} from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  DisconnectReason,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from 'livekit-client';
import { useRouter, usePathname } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { CustomVideoConference } from './CustomVideoConference';
import { PermissionHelper } from './PermissionHelper';
import { UserAuthForm } from './UserAuthForm';
import { ErrorToast } from '../../../components/ErrorToast';
import { API_CONFIG } from '@/lib/config';


// const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';
const SHOW_SETTINGS_MENU = true; // 寮哄埗鍚敤璁剧疆鑿滃崟鍔熻兘

export function PageClientImpl() {
  const [roomName, setRoomName] = React.useState<string>('');
  const [region, setRegion] = React.useState<string | undefined>(undefined);
  const [hq, setHq] = React.useState<boolean>(false);
  const [codec, setCodec] = React.useState<VideoCodec>('vp9');
  const [isReady, setIsReady] = React.useState(false);

  // 鍦ㄥ鎴风鑾峰彇 URL 鍙傛暟
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);

      // 浠庤矾寰勪腑鎻愬彇鎴块棿鍚?
      const pathParts = pathname.split('/');
      const roomNameFromPath = pathParts[pathParts.length - 1];
      if (roomNameFromPath) setRoomName(decodeURIComponent(roomNameFromPath));

      // 浠庢煡璇㈠弬鏁颁腑鑾峰彇鍏朵粬鍙傛暟
      const regionParam = searchParams.get('region');
      const hqParam = searchParams.get('hq');
      const codecParam = searchParams.get('codec');

      if (regionParam) setRegion(regionParam);
      if (hqParam === 'true') setHq(true);
      if (codecParam && ['vp8', 'h264', 'vp9', 'av1'].includes(codecParam)) {
        setCodec(codecParam as VideoCodec);
      }

      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return <PageClientImplInner roomName={roomName} region={region} hq={hq} codec={codec} />;
}

function PageClientImplInner(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  // 涓洪伩鍏嶆湇鍔＄娓叉煋涓庡鎴风棣栨娓叉煋涓嶄竴鑷达紝鍏堝亣璁句笉鏀寔锛屾寕杞藉悗鍐嶆娴嬨€?
  const [mediaSupported, setMediaSupported] = React.useState(false);
  React.useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setMediaSupported(ok);
  }, []);
  const preJoinDefaults = React.useMemo(() => {
    return {
      username: '',
      videoEnabled: mediaSupported,
      audioEnabled: mediaSupported,
    };
  }, [mediaSupported]);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );
  const [askInvite, setAskInvite] = React.useState(false);
  const [inviteCode, setInviteCode] = React.useState('');
  const [inviteSubmitting, setInviteSubmitting] = React.useState(false);
  const [showPermissionHelper, setShowPermissionHelper] = React.useState(false);
  const [permissionError, setPermissionError] = React.useState<string | null>(null);
  const [showUserAuth, setShowUserAuth] = React.useState(true); // 榛樿鏄剧ず鐢ㄦ埛璁よ瘉鐣岄潰
  const [userRole, setUserRole] = React.useState<number | undefined>(undefined);
  const [userName, setUserName] = React.useState<string | undefined>(undefined);
  const [userId, setUserId] = React.useState<number | undefined>(undefined);
  const [cachedRoomId, setCachedRoomId] = React.useState<string | undefined>(undefined); // 馃幆 鏂板锛氱紦瀛榬oomId
  const [roomData, setRoomData] = React.useState<{
    maxMicSlots: number;
    roomName: string;
    roomState: number;
    audioState: number;
    cameraState: number;
    chatState: number;
    hostUserId?: number;
    hostNickname: string;
    onlineCount: number;
    availableSlots: number;
  } | null>(null);
  // 绉婚櫎璋冭瘯浠ｇ爜锛岄伩鍏嶈瀵肩敤鎴?

  const handlePreJoinSubmit = React.useCallback(async (values: LocalUserChoices) => {
    setPreJoinChoices(values);
    setAskInvite(true);
  }, []);

  const handlePreJoinError = React.useCallback((e: any) => console.error(e), []);

  const handlePermissionGranted = React.useCallback(() => {
    setShowPermissionHelper(false);
    setPermissionError(null);
  }, []);

  const handlePermissionDenied = React.useCallback((error: string) => {
    setPermissionError(error);
    // 鍗充娇鏉冮檺琚嫆缁濓紝涔熷厑璁哥敤鎴风户缁紝浣嗕細浠ラ煶棰戞ā寮忓姞鍏?
    // 涓嶅啀鑷姩闅愯棌锛岃鐢ㄦ埛鎵嬪姩鐐瑰嚮纭畾鎸夐挳
    setShowPermissionHelper(false);
  }, []);

  // 馃幆 缁熶竴鐨勬埧闂存暟鎹獙璇佸拰璁剧疆鍑芥暟
  const setRoomDataWithValidation = React.useCallback((roomDataInput: any, source: string) => {
    if (roomDataInput && roomDataInput.roomId) {
      // 馃幆 楠岃瘉鏁版嵁瀹屾暣鎬?
      const isValidRoomData = roomDataInput.roomId && roomDataInput.roomName;
      if (isValidRoomData) {
        const finalRoomId = roomDataInput.roomId;
        setCachedRoomId(finalRoomId);
        setRoomData(roomDataInput);
        return true;
      } else {
        console.warn(`鈿狅笍 ${source} - 鎴块棿鏁版嵁涓嶅畬鏁?`, {
          hasRoomId: !!roomDataInput.roomId,
          hasRoomName: !!roomDataInput.roomName,
          roomData: roomDataInput
        });
      }
    } else {
      console.warn(`鈿狅笍 ${source} - 鎴块棿鏁版嵁缂哄け鎴栨棤鏁坄);
    }

    // 馃敟 瀹归敊澶勭悊锛氫娇鐢╮oomName浣滀负澶囩敤roomId
    const fallbackRoomId = props.roomName;
    setCachedRoomId(fallbackRoomId);
    setRoomData(null);
    return false;
  }, [props.roomName]);

  const handleLoginSuccess = React.useCallback(async (userData: {
    id: number;
    username: string;
    nickname: string;
    token: string;
    user_roles: number;
    ws_url?: string;
    jwt_token?: string; // 馃幆 鏂板锛欽WT token瀛楁
    roomData?: {
      maxMicSlots: number;
      roomName: string;
      roomState: number;
      audioState: number;
      cameraState: number;
      chatState: number;
      hostUserId?: number;
      hostNickname: string;
      onlineCount: number;
      availableSlots: number;
    } | null;
  }) => {
    // 鐧诲綍鎴愬姛锛岃缃敤鎴烽€夋嫨鍜岃繛鎺ヨ鎯咃紝涓嶈缃换浣曡澶嘔D
    const choices: LocalUserChoices = {
      username: userData.nickname,
      videoEnabled: false,
      audioEnabled: false,
    } as LocalUserChoices;

    // 浼樺厛浣跨敤鍚庣杩斿洖鐨?LiveKit URL锛屽彧鏈夊湪鏃犳晥鏃舵墠浣跨敤鍓嶇閰嶇疆
    const liveKitUrl = await API_CONFIG.getLiveKitUrl();
    let serverUrl = userData.ws_url || liveKitUrl;

    // 楠岃瘉鍚庣杩斿洖鐨?URL 鏄惁涓烘湁鏁堢殑鐢熶骇鐜鍦板潃
    const isValidProductionUrl = userData.ws_url && (
      userData.ws_url.startsWith('wss://') ||
      userData.ws_url.startsWith('ws://') && !userData.ws_url.includes('localhost')
    );

    // 鍦ㄥ紑鍙戠幆澧冩垨鑰呭悗绔繑鍥炵殑鏄?localhost 鏃讹紝浣跨敤鍓嶇閰嶇疆
    if (!isValidProductionUrl && userData.ws_url?.includes('localhost')) {
      serverUrl = liveKitUrl;
    }

    //  淇URL璺緞閲嶅闂 - 绉婚櫎鍚庣杩斿洖鐨?rtc璺緞
    if (serverUrl && serverUrl.includes('/rtc')) {
      serverUrl = serverUrl.replace('/rtc', '');
    }

    const conn: ConnectionDetails = {
      serverUrl: serverUrl,
      roomName: props.roomName,
      participantName: userData.nickname,
      participantToken: userData.token,
    };


    setPreJoinChoices(choices);
    setConnectionDetails(conn);
    setUserRole(userData.user_roles);
    setUserName(userData.nickname);
    setUserId(userData.id);

    // 馃幆 浣跨敤缁熶竴鐨勬埧闂存暟鎹缃嚱鏁?
    const success = setRoomDataWithValidation(userData.roomData, 'handleLoginSuccess');

    if (!success) {
      console.warn('鈿狅笍 鐧诲綍妯″紡鎴块棿鏁版嵁璁剧疆澶辫触锛屼絾浠嶇户缁祦绋?);
    }

    setShowUserAuth(false);
    setShowPermissionHelper(true);
  }, [props.roomName, setRoomDataWithValidation]);

  const handleGuestMode = React.useCallback(() => {
    // 娓稿妯″紡锛氬彧鍏抽棴璁よ瘉琛ㄥ崟锛屾樉绀洪個璇风爜杈撳叆
    // 涓嶉璁緋reJoinChoices锛岀瓑邀请码楠岃瘉鎴愬姛鍚庡啀璁剧疆
    setShowUserAuth(false);
    setAskInvite(true);
  }, []);



  const handleInviteSubmit = React.useCallback(async () => {
    if (!inviteCode.trim()) {
      alert('请输入邀请码');
      return;
    }

    setInviteSubmitting(true);
    try {
      const guestResponse = await callGatewayApi<AuthStatusResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_status'),
      );

      if (!guestResponse.data || !guestResponse.data.success || guestResponse.data.user_type !== 'guest') {
        throw new Error('获取游客身份失败');
      }

      const guestUsername =
        guestResponse.data.user_name ||
        guestResponse.data.user_nickname ||
        `guest_${Math.random().toString(36).slice(2, 8)}`;

      const roomRequest: RoomDetailRequest = {
        room_id: props.roomName,
        invite_code: inviteCode,
        user_name: guestUsername,
        user_jwt_token: guestResponse.data.jwt_token || '',
      };

      const roomResponse = await callGatewayApi<RoomDetailResponse>(
        await API_CONFIG.getEndpoint('gateway_rooms_detail'),
        roomRequest,
        { method: 'GET' },
      );

      if (!roomResponse.data || !roomResponse.data.success) {
        throw new Error(roomResponse.data?.error || '邀请码验证失败');
      }

      const data = roomResponse.data;

      const updatedChoices: LocalUserChoices = {
        username: guestUsername,
        videoEnabled: false,
        audioEnabled: false,
      };
      setPreJoinChoices(updatedChoices);

      const liveKitUrl = await API_CONFIG.getLiveKitUrl();
      let serverUrl = data.ws_url || liveKitUrl;

      const isValidProductionUrl =
        data.ws_url &&
        (data.ws_url.startsWith('wss://') ||
          (data.ws_url.startsWith('ws://') && !data.ws_url.includes('localhost')));

      if (!isValidProductionUrl && data.ws_url?.includes('localhost')) {
        serverUrl = liveKitUrl;
      }

      if (serverUrl && serverUrl.includes('/rtc')) {
        serverUrl = serverUrl.replace('/rtc', '');
      }

      const liveKitToken = data.connection?.livekit_token || data.token || '';

      setConnectionDetails({
        serverUrl,
        roomName: props.roomName,
        participantName: guestUsername,
        participantToken: liveKitToken,
      });
      setUserRole(0);
      setUserName(guestResponse.data.user_nickname || guestResponse.data.user_name || guestUsername);
      setUserId(undefined);

      if (data.room && data.room_id) {
        const roomInfo = {
          roomId: data.room_id,
          maxMicSlots: data.room.max_mic_slots || 10,
          roomName: data.room.room_name || props.roomName,
          roomState: data.room.room_state || 1,
          audioState: data.room.audio_state || 1,
          cameraState: data.room.camera_state || 1,
          chatState: data.room.chat_state || 1,
          hostUserId: data.room.host_user_id,
          hostNickname: data.room.host_nickname || '',
          onlineCount: data.room.online_count || 0,
          availableSlots: data.room.available_slots || 10,
        };
        const success = setRoomDataWithValidation(roomInfo, 'InviteCodeForm-guest-mode');
        if (!success) {
          console.error('游客模式房间数据设置失败');
        }
      } else {
        console.warn('游客模式 API 响应缺少必要的房间数据', {
          hasRoom: !!data.room,
          hasRoomId: !!data.room_id,
          dataKeys: data ? Object.keys(data) : null,
        });
        setRoomDataWithValidation(null, 'InviteCodeForm-guest-mode-fallback');
      }

      setAskInvite(false);
      setShowPermissionHelper(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('游客模式邀请码验证失败:', err);
      setRoomDataWithValidation(null, 'InviteCodeForm-error');
      alert(`邀请码验证失败: ${message}`);
    } finally {
      setInviteSubmitting(false);
    }
  }, [
    inviteCode,
    props.roomName,
    setAskInvite,
    setConnectionDetails,
    setPreJoinChoices,
    setRoomDataWithValidation,
    setShowPermissionHelper,
    setUserId,
    setUserName,
    setUserRole,
  ]);

  const handleInviteCancel = React.useCallback(() => {
    setAskInvite(false);
    setShowUserAuth(true);
  }, [setAskInvite, setShowUserAuth]);
  const SimpleJoinForm = () => {
    const [username, setUsername] = React.useState('');
    const [invite, setInvite] = React.useState('');
    const [loading, setLoading] = React.useState(false);

    const handleJoin = async () => {
      if (!username || !invite) {
        alert('请输入昵称和邀请码');
        return;
      }

      setLoading(true);
      try {
        //  SimpleJoinForm 鏀逛负 Gateway 涓ゆ楠岃瘉

        // 绗竴姝ワ細鑾峰彇娓稿韬唤
        const guestResponse = await callGatewayApi<AuthStatusResponse>(
          await API_CONFIG.getEndpoint('gateway_auth_status')
        );

        if (!guestResponse.data || !guestResponse.data.success || guestResponse.data.user_type !== 'guest') {
          throw new Error('鑾峰彇娓稿韬唤澶辫触');
        }


        // 绗簩姝ワ細浣跨敤娓稿Token楠岃瘉邀请码
        const roomRequest: RoomDetailRequest = {
          room_id: props.roomName,
          invite_code: invite,
          user_name: username,
          user_jwt_token: guestResponse.data.jwt_token || '',
        };

        const roomResponse = await callGatewayApi<RoomDetailResponse>(
          await API_CONFIG.getEndpoint('gateway_rooms_detail'),
          roomRequest,
          { method: 'GET' }
        );

        if (!roomResponse.data || !roomResponse.data.success) {
          throw new Error(roomResponse.data?.error || '邀请码楠岃瘉澶辫触');
        }


        // 浣跨敤楠岃瘉鎴愬姛鐨勬暟鎹?
        const data = roomResponse.data;
        const choices: LocalUserChoices = {
          username,
          videoEnabled: false,
          audioEnabled: false,
        } as any;
        // 纭繚涓嶈缃澶嘔D锛岃LiveKit鑷姩閫夋嫨榛樿璁惧
        delete (choices as any).videoDeviceId;
        delete (choices as any).audioDeviceId;

        // 浼樺厛浣跨敤鍚庣杩斿洖鐨?LiveKit URL锛屽彧鏈夊湪鏃犳晥鏃舵墠浣跨敤鍓嶇閰嶇疆
        const liveKitUrl3 = await API_CONFIG.getLiveKitUrl();
        let serverUrl = data.ws_url || liveKitUrl3;

        // 楠岃瘉鍚庣杩斿洖鐨?URL 鏄惁涓烘湁鏁堢殑鐢熶骇鐜鍦板潃
        const isValidProductionUrl = data.ws_url && (
          data.ws_url.startsWith('wss://') ||
          data.ws_url.startsWith('ws://') && !data.ws_url.includes('localhost')
        );

        // 鍦ㄥ紑鍙戠幆澧冩垨鑰呭悗绔繑鍥炵殑鏄?localhost 鏃讹紝浣跨敤鍓嶇閰嶇疆
        if (!isValidProductionUrl && data.ws_url?.includes('localhost')) {
          serverUrl = liveKitUrl3;
            }

        //  淇URL璺緞閲嶅闂 - 绉婚櫎鍚庣杩斿洖鐨?rtc璺緞
        if (serverUrl && serverUrl.includes('/rtc')) {
          serverUrl = serverUrl.replace('/rtc', '');
        }

        const conn: ConnectionDetails = {
          serverUrl: serverUrl,
          roomName: props.roomName,
          participantName: username,
          participantToken: data.token || '',
        };

        setPreJoinChoices(choices);
        setConnectionDetails(conn);
        //  鏂板锛氳缃父瀹㈣鑹蹭负0
        setUserRole(0);
        setUserName(guestResponse.data.user_nickname);
        setUserId(undefined);
        // 鏄剧ず鏉冮檺妫€鏌ョ晫闈?
        setShowPermissionHelper(true);
      } catch (err) {
        alert('加入房间失败: ' + (err as Error).message);
        console.error('连接错误:', err);
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
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: '8px' }}
            disabled={loading}
          />
          <input
            className="lk-button"
            placeholder="邀请码"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
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
        <UserAuthForm
          onLoginSuccess={handleLoginSuccess}
          onGuestMode={handleGuestMode}
          roomName={props.roomName}
        />
      ) : showPermissionHelper ? (
        <PermissionHelper
          onPermissionGranted={handlePermissionGranted}
          onPermissionDenied={handlePermissionDenied}
        />
      ) : connectionDetails && preJoinChoices ? (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{ codec: props.codec, hq: props.hq }}
          userRole={userRole}
          userName={userName}
          userId={userId}
          roomData={roomData}
        />
      ) : askInvite ? (
        <InviteCodeForm
          inviteCode={inviteCode}
          loading={inviteSubmitting}
          onInviteCodeChange={setInviteCode}
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
            roomData={roomData}
          />
        ) : (
          <SimpleJoinForm />
        )
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <PreJoin
            defaults={preJoinDefaults}
            onSubmit={handlePreJoinSubmit}
            onError={handlePreJoinError}
          />
        </div>
      )}

      <ErrorToast
        message={permissionError || ''}
        isVisible={!!permissionError}
        onClose={() => setPermissionError(null)}
      />
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
          onChange={(event) => onInviteCodeChange(event.target.value)}
          style={{ padding: '8px' }}
          disabled={loading}
          autoFocus
        />
        <button
          className="lk-button"
          onClick={() => { void onSubmit(); }}
          disabled={loading || !inviteCode.trim()}
          style={{ opacity: loading || !inviteCode.trim() ? 0.6 : 1 }}
        >
          {loading ? '验证中...' : '验证邀请码'}
        </button>
        <button
          className="lk-button"
          onClick={onCancel}
          style={{ backgroundColor: '#666' }}
          disabled={loading}
        >
          返回登录
        </button>
      </div>
    </div>
  );
}function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
  };
  userRole?: number;
  userName?: string;
  userId?: number;
  roomData?: {
    maxMicSlots: number;
    roomName: string;
    roomState: number;
    audioState: number;
    cameraState: number;
    chatState: number;
    hostUserId?: number;
    hostNickname: string;
    onlineCount: number;
    availableSlots: number;
  } | null;
}) {
  const [deviceError, setDeviceError] = React.useState<string | null>(null);
  const keyProvider = new ExternalE2EEKeyProvider();
  const e2eeSetup = useSetupE2EE(undefined, {});
  const e2eeEnabled = e2eeSetup.isE2EEEnabled;

  const e2eeSetupComplete = e2eeSetup.isSetupComplete;

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    const videoCaptureDefaults: VideoCaptureOptions = {
      // 鍙湁鍦ㄨ澶嘔D鏈夋晥鏃舵墠璁剧疆锛屽惁鍒欒LiveKit鑷姩閫夋嫨榛樿璁惧
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
      // on lower end devices, publish at a lower resolution, and disable spatial layers
      // encoding spatial layers adds to CPU overhead
      videoCaptureDefaults.resolution = VideoPresets.h360;
      publishDefaults.simulcast = false;
      publishDefaults.scalabilityMode = 'L1T3';
    }
    return {
      videoCaptureDefaults: videoCaptureDefaults,
      publishDefaults: publishDefaults,
      audioCaptureDefaults: {
        // 鍙湁鍦ㄨ澶嘔D鏈夋晥鏃舵墠璁剧疆锛屽惁鍒欒LiveKit鑷姩閫夋嫨榛樿璁惧
        ...(props.userChoices.audioDeviceId ? { deviceId: props.userChoices.audioDeviceId } : {}),
      },
      adaptiveStream: { pixelDensity: 'screen' },
      dynacast: true,
      e2ee: undefined, // E2EE disabled for now
    };
  }, [props.userChoices, props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  // E2EE setup is handled by useSetupE2EE hook

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
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
        .then(() => {
          // 杩炴帴鎴愬姛
        })
        .catch((error) => {
          console.error('杩炴帴LiveKit鎴块棿澶辫触:', error);
          console.error('鏈嶅姟鍣║RL:', props.connectionDetails.serverUrl);
          console.error('Token:', props.connectionDetails.participantToken);

          // 鏄剧ず鏇村弸濂界殑閿欒淇℃伅
          setDeviceError(`杩炴帴浼氳瀹ゅけ璐? ${error.message}銆傝妫€鏌ョ綉缁滆繛鎺ユ垨鑱旂郴绠＄悊鍛樸€俙);

          // 涓嶈皟鐢?handleError锛岄伩鍏嶈Е鍙戝叾浠栭敊璇鐞?
          // handleError(error);
        });

      if (props.userChoices.videoEnabled) {
        room.localParticipant.setCameraEnabled(true).catch((error) => {
          handleError(error);
        });
      }
      if (props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
          handleError(error);
        });
      }
    }
    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [e2eeSetupComplete, room, props.connectionDetails, props.userChoices]);

  const router = useRouter();
  const pathname = usePathname();

  const handleOnLeave = React.useCallback(async (reason?: DisconnectReason) => {
    //  JWT token绯荤粺鏃犻渶娓呴櫎鏈嶅姟绔痵ession锛岀洿鎺ュ埛鏂伴〉闈?
    // 绉婚櫎clear-session.php璇锋眰锛屽洜涓虹幇鍦ㄤ娇鐢↗WT token鑰岄潪PHP session

    //  鐩存帴鍒锋柊椤甸潰鍥炲埌鎴块棿鐧诲綍椤甸潰
    window.location.reload();
  }, [props.userId, props.userName]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);

    // 澶勭悊璁惧鐩稿叧閿欒
    if (error.message.includes('device not found') || error.message.includes('Requested device not found')) {
      setDeviceError('鏈壘鍒版寚瀹氱殑闊宠棰戣澶囷紝浣嗕粛鍙繘鍏ヤ細璁€傝妫€鏌ユ偍鐨勬憚鍍忓ご鍜岄害鍏嬮鏄惁姝ｅ父杩炴帴銆?);
      return;
    }

    if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
      setDeviceError('鏃犳硶璁块棶鎽勫儚澶存垨楹﹀厠椋庯紝璇峰厑璁告祻瑙堝櫒璁块棶鎮ㄧ殑璁惧鏉冮檺銆?);
      return;
    }

    if (error.message.includes('NotFoundError')) {
      setDeviceError('鏈壘鍒板彲鐢ㄧ殑鎽勫儚澶存垨楹﹀厠椋庤澶囥€?);
      return;
    }

    // 鍏朵粬閿欒
    setDeviceError(`閬囧埌鎰忓閿欒: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    setDeviceError(`鍔犲瘑閿欒: ${error.message}锛岃妫€鏌ユ帶鍒跺彴浜嗚В璇︾粏淇℃伅銆俙);
  }, []);

  return (
    <div className="lk-room-container">
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        <CustomVideoConference
          room={room}
          serverUrl={props.connectionDetails.serverUrl}
          token={props.connectionDetails.participantToken}
          connect={true}
        />
        <DebugMode />
        <RecordingIndicator />
      </RoomContext.Provider>

      <ErrorToast
        message={deviceError || ''}
        isVisible={!!deviceError}
        onClose={() => setDeviceError(null)}
      />
    </div>
  );
}







