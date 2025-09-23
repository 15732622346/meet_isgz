'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { callGatewayApi } from '@/lib/api-client';

interface UserInfo {
  uid: number;
  user_name: string;
  user_nickname: string;
  user_roles: number;  // 核心：用户角色（0=游客, 1=普通用户, 2=主持人, 3=管理员）
  user_status: number;
  jwt_token: string;
  access_token?: string;
  refresh_token?: string;
  access_expires_at?: number;
  refresh_expires_at?: number;
  livekit_token?: string;
}

interface UserContextValue {
  userInfo: UserInfo | null;
  setUserInfo: (info: UserInfo | null) => void;
  getCurrentUserRole: () => number;
  resolveGatewayToken: () => Promise<string>;
  performLogout: () => Promise<void>;
  clearUserInfo: () => void;
  isLoggedIn: boolean;
  isGuest: boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [userInfo, setUserInfoState] = useState<UserInfo | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  const setUserInfo = (info: UserInfo | null) => {
    setUserInfoState(info);
    // 同步角色信息到全局缓存（供非React环境使用）
    if (typeof window !== 'undefined') {
      (window as any).__USER_ROLE_CACHE__ = info?.user_roles ?? 1;
    }
  };

  const getCurrentUserRole = (): number => {
    return userInfo?.user_roles ?? 1; // 默认普通用户
  };

  // Token自动刷新机制
  const resolveGatewayToken = async (): Promise<string> => {
    if (!userInfo) {
      throw new Error('用户未登录');
    }

    const now = Date.now();
    const accessExpiresAt = userInfo.access_expires_at || 0;

    // 如果access token还有5分钟以上有效期，直接返回
    if (accessExpiresAt > now + 5 * 60 * 1000) {
      return userInfo.access_token || userInfo.jwt_token;
    }

    // 如果没有refresh token，返回现有token（游客模式）
    if (!userInfo.refresh_token) {
      return userInfo.access_token || userInfo.jwt_token;
    }

    // 防止并发刷新
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = async (): Promise<string> => {
      try {
        const response = await callGatewayApi<{
          access_token: string;
          refresh_token?: string;
          access_expires_at: number;
          refresh_expires_at?: number;
        }>('/api/v1/auth/refresh', {
          refresh_token: userInfo.refresh_token
        }, {
          method: 'POST'
        });

        if (!response.success || !response.data) {
          throw new Error('Token刷新失败');
        }

        // 更新用户信息
        const updatedUserInfo = {
          ...userInfo,
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token || userInfo.refresh_token,
          access_expires_at: response.data.access_expires_at,
          refresh_expires_at: response.data.refresh_expires_at || userInfo.refresh_expires_at,
          jwt_token: response.data.access_token // 兼容性
        };

        setUserInfo(updatedUserInfo);
        console.log('✅ Token自动刷新成功');

        return response.data.access_token;
      } catch (error) {
        console.error('❌ Token刷新失败:', error);
        // 刷新失败，清理用户状态
        clearUserInfo();
        throw new Error('Token过期，请重新登录');
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = refreshPromise();
    return refreshPromiseRef.current;
  };

  // 登出功能
  const performLogout = async (): Promise<void> => {
    try {
      if (userInfo?.jwt_token) {
        // 调用后端登出接口
        await callGatewayApi('/api/v1/auth/logout', {}, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userInfo.jwt_token}`
          }
        });
        console.log('✅ 后端登出成功');
      }
    } catch (error) {
      console.error('❌ 后端登出失败:', error);
      // 即使后端登出失败，也要清理本地状态
    } finally {
      clearUserInfo();
    }
  };

  const clearUserInfo = () => {
    setUserInfo(null);
    // 清理本地存储
    if (typeof window !== 'undefined') {
      localStorage.removeItem('livekit_user');
      localStorage.removeItem('livekit_tokens');
      localStorage.removeItem('user_info');
      (window as any).__USER_ROLE_CACHE__ = 1;
    }
  };

  // 持久化处理
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUserInfo = localStorage.getItem('user_info');
      if (savedUserInfo) {
        try {
          const parsedUserInfo = JSON.parse(savedUserInfo);
          setUserInfo(parsedUserInfo);
        } catch (error) {
          console.error('Failed to parse saved user info:', error);
          localStorage.removeItem('user_info');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (userInfo) {
        localStorage.setItem('user_info', JSON.stringify(userInfo));
      } else {
        localStorage.removeItem('user_info');
      }
    }
  }, [userInfo]);

  const value: UserContextValue = {
    userInfo,
    setUserInfo,
    getCurrentUserRole,
    resolveGatewayToken,
    performLogout,
    clearUserInfo,
    isLoggedIn: Boolean(userInfo),
    isGuest: userInfo?.user_roles === 0,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}

// 兼容性导出
export const useUser = useUserContext;

// 全局角色获取函数（供非React环境使用）
export function getCurrentUserRoleFromContext(): number {
  if (typeof window !== 'undefined') {
    return (window as any).__USER_ROLE_CACHE__ ?? 1;
  }
  return 1;
}