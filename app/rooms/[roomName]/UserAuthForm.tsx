'use client';

import React from 'react';
import { API_CONFIG, getApiUrl } from '@/lib/config';
import { callGatewayApi, normalizeGatewayResponse } from '@/lib/api-client';
import { useUser } from '@/contexts/UserContext';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  RoomDetailRequest,
  RoomDetailResponse
} from '@/types/api';


const parseAbsoluteTimestamp = (value?: number | string | null): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue > 0 && numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const deriveExpiryTimestamp = (
  absolute?: number | string | null,
  relative?: number | string | null,
  now: number = Date.now(),
): number | undefined => {
  const absoluteTimestamp = parseAbsoluteTimestamp(absolute);
  if (absoluteTimestamp !== undefined) {
    return absoluteTimestamp;
  }

  if (relative !== undefined && relative !== null) {
    const numericRelative = Number(relative);
    if (Number.isFinite(numericRelative) && numericRelative > 0) {
      return now + numericRelative * 1000;
    }
  }

  return undefined;
};

interface RoomData {
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
}

interface UserAuthFormProps {
  onLoginSuccess: (userData: {
    id: number;
    username: string;
    nickname: string;
    token: string;
    user_roles: number;
    ws_url?: string;
    jwt_token?: string; // 新增JWT token字段
    roomData?: RoomData | null;
  }) => void;
  onGuestMode: () => void;
  roomName: string;
}

export function UserAuthForm({ onLoginSuccess, onGuestMode, roomName }: UserAuthFormProps) {
  // UserContext集成
  const { setUserInfo, setInviteCode } = useUser();

  const [isLogin, setIsLogin] = React.useState(true); // true=登录, false=注册
  const [formData, setFormData] = React.useState({
    username: '',
    password: '',
    nickname: '', // 注册时需要
    confirmPassword: '', // 注册时需要
    inviteCode: '' //  PC端新增邀请码字段
  });
  const [loading, setLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState(''); //  新增加载状态消息
  const [error, setError] = React.useState('');
  const [showForceLogin, setShowForceLogin] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState(''); //  新增成功提示状态

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(''); // 清除错误信息
    setSuccessMessage(''); // 清除成功提示
    setShowForceLogin(false); // 清除强制登录选项
  };

  const handleLogin = async () => {
    if (!formData.username || !formData.password) {
      setError('请输入用户名和密码');
      return;
    }

    if (!formData.inviteCode.trim()) {
      setError('请输入邀请码');
      return;
    }

    setLoading(true);
    setLoadingMessage('正在验证账户...');
    try {
      setError('');

      const loginRequest: AuthLoginRequest = {
        user_name: formData.username,
        user_password: formData.password,
      };

      const loginResponse = await callGatewayApi<AuthLoginResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_login'),
        loginRequest,
        { method: 'POST' },
      );

      const loginResult = normalizeGatewayResponse<AuthLoginResponse>(loginResponse);
      if (!loginResult.success) {
        setError(loginResult.message || '用户名或密码错误');
        return;
      }

      const loginData = loginResult.payload ?? (loginResponse as AuthLoginResponse);
      const jwtToken =
        loginData?.tokens?.access_token ||
        loginData?.jwt_token ||
        (typeof (loginResponse as any)?.jwt_token === 'string'
          ? ((loginResponse as any).jwt_token as string)
          : '');

      if (!jwtToken) {
        setError('登录异常：未获取到认证信息');
        return;
      }

      const roomRequest: RoomDetailRequest = {
        room_id: roomName,
        invite_code: formData.inviteCode,
        user_name: formData.username,
        user_jwt_token: jwtToken,
      };

      setLoadingMessage('正在验证邀请码...');

      const roomResponse = await callGatewayApi<RoomDetailResponse>(
        await API_CONFIG.getEndpoint('gateway_rooms_detail'),
        roomRequest,
        { method: 'GET' },
      );

      const roomResult = normalizeGatewayResponse<RoomDetailResponse>(roomResponse);
      if (!roomResult.success) {
        console.error('Gateway API 调用失败', { raw: roomResponse, normalized: roomResult });
        setError(roomResult.error || roomResult.message || '邀请码无效或房间不存在');
        return;
      }

      const roomData = roomResult.payload ?? (roomResponse as RoomDetailResponse);
      const connection: any = (roomData as any)?.connection ?? {};
      const liveKitToken = connection?.livekit_token || (roomData as any)?.token || '';

      const roomInfoSource: any = (roomData as any)?.room ?? null;
      const resolvedRoomData: RoomData | null = roomInfoSource
        ? {
            roomId: roomInfoSource.room_id ?? (roomData as any)?.room_id ?? '',
            maxMicSlots: roomInfoSource.max_mic_slots ?? (roomData as any)?.max_mic_slots ?? 10,
            roomName: roomInfoSource.room_name ?? (roomData as any)?.room_name ?? '',
            roomState: roomInfoSource.room_state ?? (roomData as any)?.room_state ?? 1,
            audioState: roomInfoSource.audio_state ?? (roomData as any)?.audio_state ?? 1,
            cameraState: roomInfoSource.camera_state ?? (roomData as any)?.camera_state ?? 1,
            chatState: roomInfoSource.chat_state ?? (roomData as any)?.chat_state ?? 1,
            hostUserId: roomInfoSource.host_user_id ?? (roomData as any)?.host_user_id ?? 0,
            hostNickname: roomInfoSource.host_nickname ?? (roomData as any)?.host_nickname ?? '',
            onlineCount: roomInfoSource.online_count ?? (roomData as any)?.online_count ?? 0,
            availableSlots: roomInfoSource.available_slots ?? (roomData as any)?.available_slots ?? 10,
          }
        : null;

      // 保存用户信息到UserContext
      const tokens = loginData?.tokens;
      const now = Date.now();
      const accessExpiresAt = deriveExpiryTimestamp(
        tokens?.access_expires_at ?? (loginData as any)?.access_expires_at ?? tokens?.expires_at,
        tokens?.access_expires_in ?? tokens?.expires_in ?? (loginData as any)?.access_expires_in,
        now,
      );
      const refreshExpiresAt = deriveExpiryTimestamp(
        tokens?.refresh_expires_at ?? (loginData as any)?.refresh_expires_at,
        tokens?.refresh_expires_in ?? (loginData as any)?.refresh_expires_in,
        now,
      );

      const userInfo = {
        uid: loginData?.uid ?? loginData?.user_id ?? loginData?.id ?? 0,
        user_name: formData.username,
        user_nickname: loginData?.user_nickname || formData.username,
        user_roles: loginData?.user_roles || 1,
        user_status: 1, // 活跃状态
        jwt_token: jwtToken,
        access_token: tokens?.access_token || jwtToken,
        refresh_token: tokens?.refresh_token,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        livekit_token: liveKitToken,
      };

      setUserInfo(userInfo);
      setInviteCode(formData.inviteCode.trim());


      onLoginSuccess({
        id: userInfo.uid,
        username: formData.username,
        nickname: userInfo.user_nickname,
        token: liveKitToken,
        user_roles: userInfo.user_roles,
        ws_url:
          loginData?.ws_url ||
          (roomData as any)?.ws_url ||
          connection?.wss_url ||
          connection?.ws_url ||
          '',
        jwt_token: jwtToken,
        roomData: resolvedRoomData,
      });
    } catch (err) {
      console.error('登录错误:', err);
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('无法连接到服务器，请检查网络连接');
        } else if (err.message.includes('认证失败')) {
          setError('用户名或密码错误');
        } else if (err.message.includes('权限')) {
          setError('邀请码无效或权限不足');
        } else {
          setError(err.message);
        }
      } else {
        setError('登录失败，请稍后重试');
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleRegister = async () => {
    if (!formData.username || !formData.password || !formData.nickname) {
      setError('请填写完整的注册信息');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (formData.password.length < 6) {
      setError('密码长度至少 6 位');
      return;
    }

    setLoading(true);
    setLoadingMessage('正在注册账号...');
    try {
      let clientIP: string | null = null;
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        clientIP = typeof ipData.ip === 'string' && ipData.ip.trim() !== '' ? ipData.ip.trim() : null;
      } catch (error) {
        // IP 获取失败不阻断注册流程
      }

      const registerRequest = {
        user_name: formData.username,
        user_nickname: formData.nickname,
        user_password: formData.password,
        user_ip: clientIP,
      };

      const registerResponse = await callGatewayApi<AuthLoginResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_register'),
        registerRequest,
        { method: 'POST' },
      );

      const registerResult = normalizeGatewayResponse<AuthLoginResponse>(registerResponse);
      if (!registerResult.success) {
        setError(registerResult.error || registerResult.message || '注册失败');
        return;
      }

      const registerData = registerResult.payload ?? (registerResponse as AuthLoginResponse);
      const nickname = registerData?.user_nickname || formData.nickname || formData.username;

      setError('');
      setSuccessMessage(`注册成功，欢迎 ${nickname}，请使用邀请码登录进入房间。`);
      setFormData({
        username: formData.username,
        password: formData.password,
        nickname: '',
        confirmPassword: '',
        inviteCode: '',
      });
      setIsLogin(true);

    } catch (err) {
      console.error('注册错误:', err);
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('无法连接到服务器，请检查网络连接');
        } else {
          setError(err.message);
        }
      } else {
        setError('注册失败，请稍后重试');
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleForceLogin = async () => {
    if (!formData.username || !formData.password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setLoadingMessage('强制登录中...');
    try {
      setError('');

      const loginRequest: AuthLoginRequest = {
        user_name: formData.username,
        user_password: formData.password,
        force_login: true, // 强制登录标识
      };

      const loginResponse = await callGatewayApi<AuthLoginResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_login'),
        loginRequest,
        { method: 'POST' },
      );

      const loginResult = normalizeGatewayResponse<AuthLoginResponse>(loginResponse);
      if (!loginResult.success) {
        setError(loginResult.message || '强制登录失败');
        return;
      }

      const loginData = loginResult.payload ?? (loginResponse as AuthLoginResponse);
      const jwtToken =
        loginData?.tokens?.access_token ||
        loginData?.jwt_token ||
        (typeof (loginResponse as any)?.jwt_token === 'string'
          ? ((loginResponse as any).jwt_token as string)
          : '');

      if (!jwtToken) {
        setError('强制登录异常：未获取到认证信息');
        return;
      }

      // 获取房间信息
      const roomRequest: RoomDetailRequest = {
        room_id: roomName,
        invite_code: formData.inviteCode || '',
      };

      const roomResponse = await callGatewayApi<RoomDetailResponse>(
        await API_CONFIG.getEndpoint('gateway_rooms_detail'),
        roomRequest,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          }
        },
      );

      const roomResult = normalizeGatewayResponse<RoomDetailResponse>(roomResponse);
      if (!roomResult.success) {
        setError(roomResult.message || '获取房间信息失败');
        return;
      }

      const roomData = roomResult.payload ?? (roomResponse as RoomDetailResponse);
      const liveKitToken = roomData?.livekit_token || roomData?.token || '';

      // 保存用户信息到UserContext
      const tokens = loginData?.tokens;
      const now = Date.now();
      const accessExpiresAt = deriveExpiryTimestamp(
        tokens?.access_expires_at ?? (loginData as any)?.access_expires_at ?? tokens?.expires_at,
        tokens?.access_expires_in ?? tokens?.expires_in ?? (loginData as any)?.access_expires_in,
        now,
      );
      const refreshExpiresAt = deriveExpiryTimestamp(
        tokens?.refresh_expires_at ?? (loginData as any)?.refresh_expires_at,
        tokens?.refresh_expires_in ?? (loginData as any)?.refresh_expires_in,
        now,
      );

      const userInfo = {
        uid: loginData?.uid ?? loginData?.user_id ?? loginData?.id ?? 0,
        user_name: formData.username,
        user_nickname: loginData?.user_nickname || formData.username,
        user_roles: loginData?.user_roles || 1,
        user_status: 1,
        jwt_token: jwtToken,
        access_token: tokens?.access_token || jwtToken,
        refresh_token: tokens?.refresh_token,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        livekit_token: liveKitToken,
      };

      setUserInfo(userInfo);
      setInviteCode(formData.inviteCode.trim());


      onLoginSuccess({
        id: userInfo.uid,
        username: formData.username,
        nickname: userInfo.user_nickname,
        token: liveKitToken,
        user_roles: userInfo.user_roles,
        jwt_token: jwtToken,
        ws_url: roomData?.ws_url || '',
        roomData: roomData ? {
          maxMicSlots: roomData.max_mic_slots || 10,
          roomName: roomData.room_name || roomName,
          roomState: roomData.room_state || 1,
          audioState: roomData.audio_state || 1,
          cameraState: roomData.camera_state || 1,
          chatState: roomData.chat_state || 1,
          hostUserId: roomData.host_user_id || 0,
          hostNickname: roomData.host_nickname || '',
          onlineCount: roomData.online_count || 0,
          availableSlots: roomData.available_slots || 10,
        } : null,
      });
    } catch (err) {
      console.error('强制登录错误:', err);
      // 更友好的错误提示
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        setError('无法连接到服务器，请检查网络连接');
      } else if (err instanceof SyntaxError) {
        setError('该房间不存在');
      } else {
        setError('强制登录失败，请稍后再试');
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleSubmit = () => {
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <div style={{
      display: 'grid',
      placeItems: 'center',
      height: '100%',
      background: '#1a1a1a',
      color: 'white'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: '400px',
        background: '#2a2a2a',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
      }}>
        {/* 标题和切换 */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>
            {isLogin ? '登录会议' : '注册账户'}
          </h2>
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            background: '#ff4757',
            color: 'white',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/*  成功提示 */}
        {successMessage && (
          <div style={{
            background: '#4ade80',
            color: 'white',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {successMessage}
          </div>
        )}

        {/* 表单字段 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/*  PC端邀请码输入框 - 只在登录时显示，注册时不需要 */}
          {isLogin && (
            <input
              type="text"
              placeholder="邀请码（必填）"
              value={formData.inviteCode}
              onChange={(e) => handleInputChange('inviteCode', e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#333',
                color: 'white',
                fontSize: '16px'
              }}
              disabled={loading}
            />
          )}
          <input
            type="text"
            placeholder="用户名"
            value={formData.username}
            onChange={(e) => handleInputChange('username', e.target.value)}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #444',
              background: '#333',
              color: 'white',
              fontSize: '16px'
            }}
            disabled={loading}
          />

          {!isLogin && (
            <input
              type="text"
              placeholder="昵称"
              value={formData.nickname}
              onChange={(e) => handleInputChange('nickname', e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#333',
                color: 'white',
                fontSize: '16px'
              }}
              disabled={loading}
            />
          )}

          <input
            type="password"
            placeholder="密码"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #444',
              background: '#333',
              color: 'white',
              fontSize: '16px'
            }}
            disabled={loading}
          />

          {!isLogin && (
            <input
              type="password"
              placeholder="确认密码"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #444',
                background: '#333',
                color: 'white',
                fontSize: '16px'
              }}
              disabled={loading}
            />
          )}

        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '14px',
              borderRadius: '6px',
              border: 'none',
              background: loading ? '#666' : '#4ade80',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {loading ? (loadingMessage || '处理中...') : (isLogin ? '登录' : '注册')}
          </button>

          {/* 强制登录按钮 */}
          {showForceLogin && isLogin && (
            <button
              onClick={handleForceLogin}
              disabled={loading}
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #f59e0b',
                background: '#f59e0b',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {loading ? '处理中...' : '强制登录（踢出其他设备）'}
            </button>
          )}

          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(''); // 切换模式时清除错误信息
              setSuccessMessage(''); // 切换模式时清除成功提示
              setShowForceLogin(false); // 清除强制登录选项
            }}
            disabled={loading}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #666',
              background: 'transparent',
              color: '#ccc',
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLogin ? '没有账户？点击注册' : '已有账户？点击登录'}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '10px 0'
          }}>
            <div style={{ flex: 1, height: '1px', background: '#444' }}></div>
            <span style={{ color: '#888', fontSize: '14px' }}>或</span>
            <div style={{ flex: 1, height: '1px', background: '#444' }}></div>
          </div>

          <button
            onClick={onGuestMode}
            disabled={loading}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #666',
              background: 'transparent',
              color: '#ccc',
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            游客模式（需要邀请码）
          </button>
        </div>
      </div>
    </div>
  );
}