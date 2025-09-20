'use client';

import React from 'react';
import { API_CONFIG, getApiUrl } from '@/lib/config';
import { callGatewayApi } from '@/lib/api-client';
import { useUser } from '@/contexts/UserContext';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  RoomDetailRequest,
  RoomDetailResponse
} from '@/types/api';

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
      //  第一步：用户身份验证
      setError(''); // 清除之前的错误

      const loginRequest: AuthLoginRequest = {
        user_name: formData.username,
        user_password: formData.password,
      };

      const loginResponse = await callGatewayApi<AuthLoginResponse>(
        await API_CONFIG.getEndpoint('gateway_auth_login'),
        loginRequest,
        { method: 'POST' }
      );

      if (!loginResponse.data || !loginResponse.data.success) {
        setError(loginResponse.data?.message || '用户名或密码错误');
        return;
      }


      //  第二步：使用 JWT Token 验证邀请码
      setLoadingMessage('正在验证邀请码...');

      if (!loginResponse.data.jwt_token) {
        setError('登录异常：未获取到认证信息');
        return;
      }

      const roomRequest: RoomDetailRequest = {
        room_id: roomName,
        invite_code: formData.inviteCode,
        user_name: formData.username,
        user_jwt_token: loginResponse.data.jwt_token,
      };


      const roomResponse = await callGatewayApi<RoomDetailResponse>(
        await API_CONFIG.getEndpoint('gateway_rooms_detail'),
        roomRequest,
        { method: 'GET' }
      );


      if (!roomResponse.data || !roomResponse.data.success) {
        console.error(' Gateway API调用失败:', {
          hasData: !!roomResponse.data,
          success: roomResponse.data?.success,
          error: roomResponse.data?.error,
          message: roomResponse.data?.message
        });
        setError(roomResponse.data?.error || '邀请码无效或房间不存在');
        return;
      }


      //  两步验证都成功，组装用户数据并回调
      // 从API返回的正确字段提取LiveKit Token
      const liveKitToken = roomResponse.data.connection?.livekit_token || roomResponse.data.token || '';

      // 兼容原有接口，继续调用回调
      const userData = {
        id: loginResponse.data.uid || loginResponse.data.user_id || loginResponse.data.id || 0,
        username: formData.username,
        nickname: loginResponse.data.user_nickname || formData.username,
        token: liveKitToken,
        user_roles: loginResponse.data.user_roles || 1,
        ws_url: loginResponse.data.ws_url || roomResponse.data.ws_url || roomResponse.data.connection?.wss_url,
        jwt_token: loginResponse.data.jwt_token,
        roomData: roomResponse.data.room ? {
          roomId: roomResponse.data.room.room_id || roomResponse.data.room_id || '',
          maxMicSlots: roomResponse.data.room.max_mic_slots || 10,
          roomName: roomResponse.data.room.room_name || '',
          roomState: roomResponse.data.room.room_state || 1,
          audioState: roomResponse.data.room.audio_state || 1,
          cameraState: roomResponse.data.room.camera_state || 1,
          chatState: roomResponse.data.room.chat_state || 1,
          hostUserId: roomResponse.data.room.host_user_id || 0,
          hostNickname: roomResponse.data.room.host_nickname || '',
          onlineCount: roomResponse.data.room.online_count || 0,
          availableSlots: roomResponse.data.room.available_slots || 10
        } : null
      };

      onLoginSuccess(userData);

    } catch (err) {
      console.error('登录错误:', err);
      // 更友好的错误提示
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('无法连接到服务器，请检查网络连接');
        } else if (err.message.includes('认证失败')) {
          setError('用户名或密码错误');
        } else if (err.message.includes('访问被拒绝')) {
          setError('邀请码无效或权限不足');
        } else {
          setError(err.message);
        }
      } else {
        setError('登录失败，请稍后再试');
      }
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleRegister = async () => {
    if (!formData.username || !formData.password || !formData.nickname) {
      setError('请填写所有必填字段');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (formData.password.length < 6) {
      setError('密码长度至少6位');
      return;
    }

    setLoading(true);
    setLoadingMessage('正在注册账户...');
    try {
      //  获取客户端IP（可选，与external-api-register.html保持一致）
      let clientIP = null;
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        clientIP = ipData.ip && ipData.ip.trim() !== '' ? ipData.ip.trim() : null;
      } catch (error) {
        // IP获取失败不影响注册流程
      }

      //  使用Gateway API注册，与external-api-register.html保持一致
      const registerRequest = {
        user_name: formData.username,
        user_nickname: formData.nickname,
        user_password: formData.password,
        user_ip: clientIP
      };

      const registerResponse = await callGatewayApi(
        await API_CONFIG.getEndpoint('gateway_auth_register'),
        registerRequest,
        { method: 'POST' }
      );

      if (!registerResponse.data || !registerResponse.data.success) {
        setError(registerResponse.data?.error || registerResponse.data?.message || '注册失败');
        return;
      }

      //  注册成功且自动登录，与external-api-register.html完全一致
      const data = registerResponse.data;

      // 注册成功后显示成功消息，切换到登录模式（与external-api-register.html一致）
      setError(''); // 清除错误信息
      setSuccessMessage(`注册成功！欢迎 ${data.user_nickname}，请使用邀请码登录进入房间。`);
      setFormData({
        username: formData.username, // 保留用户名，方便登录
        password: formData.password, // 保留密码，方便登录
        nickname: '',
        confirmPassword: '',
        inviteCode: ''
      }); // 清空表单（保留用户名和密码）
      setIsLogin(true); // 切换到登录模式

    } catch (err) {
      console.error('注册错误:', err);
      // 更友好的错误提示
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('无法连接到服务器，请检查网络连接');
        } else {
          setError(err.message);
        }
      } else {
        setError('注册失败，请稍后再试');
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
    try {
      const apiUrl = await getApiUrl('/force-login.php');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_name: formData.username,
          user_password: formData.password,
          room_id: roomName,
          force_login: true
        }),
      });

      // 检查响应的内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // 如果响应不是JSON格式，很可能是404页面
        if (response.status === 404) {
          setError('该房间不存在');
        } else {
          setError('服务器错误，请稍后再试');
        }
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        // JSON解析错误，通常是因为返回了HTML而不是JSON
        console.error('JSON解析错误:', jsonError);
        setError('该房间不存在');
        return;
      }

      if (!response.ok) {
        setError(data.error || '强制登录失败');
        return;
      }

      if (data.success) {
        // 强制登录成功
        const userData = {
          id: data.uid || data.user_id || data.id || 0, //  修复：使用正确的用户ID字段，提供默认值
          username: formData.username,
          nickname: data.user_nickname || formData.username,
          token: data.token,
          user_roles: data.user_roles || 1,
          ws_url: data.ws_url
        };

        onLoginSuccess(userData);
      } else {
        setError(data.error || '强制登录失败');
      }
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