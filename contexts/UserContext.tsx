'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { callGatewayApi } from '@/lib/api-client';
import { getJwtExpiry } from '@/lib/token-utils';

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
  invite_code?: string;
}


interface UserContextValue {
  userInfo: UserInfo | null;
  setUserInfo: (info: UserInfo | null) => void;
  getCurrentUserRole: () => number;
  resolveGatewayToken: (options?: ResolveGatewayTokenOptions) => Promise<string>;
  performLogout: () => Promise<void>;
  clearUserInfo: () => void;
  inviteCode: string | null;
  setInviteCode: (code: string | null) => void;
  isLoggedIn: boolean;
  isGuest: boolean;
}

interface ResolveGatewayTokenOptions {
  forceRefresh?: boolean;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

const normalizeTimestamp = (value?: number | string | null): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
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

const normalizeUserInfo = (info: UserInfo | null): UserInfo | null => {
  if (!info) {
    return info;
  }

  const accessExpiresAt = normalizeTimestamp(info.access_expires_at);
  const refreshExpiresAt = normalizeTimestamp(info.refresh_expires_at);

  return {
    ...info,
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  };
};

const computeExpiresAt = (
  absolute?: number | string | null,
  relative?: number | string | null,
  now: number = Date.now(),
): number | undefined => {
  const absoluteTimestamp = normalizeTimestamp(absolute);
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

export function UserProvider({ children }: UserProviderProps) {
  const [userInfo, setUserInfoState] = useState<UserInfo | null>(null);
  const [inviteCode, setInviteCodeState] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number | null>(null);
  const cancelScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      if (typeof window !== 'undefined') {
        window.clearTimeout(refreshTimerRef.current);
      } else {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = null;
    }
  }, []);

  const updateInviteCode = (code: string | null) => {
    const normalized = code ?? null;
    setInviteCodeState(normalized);
    setUserInfoState(prev => {
      if (!prev) {
        return prev;
      }
      if ((prev.invite_code ?? null) === normalized) {
        return prev;
      }
      return {
        ...prev,
        invite_code: normalized ?? undefined,
      };
    });
  };

  const setUserInfo = (info: UserInfo | null) => {
    const normalizedInfo = normalizeUserInfo(info);

    setUserInfoState(normalizedInfo);
    setInviteCodeState(normalizedInfo?.invite_code ?? null);
    // 同步角色信息到全局缓存（供非React环境使用）
    if (typeof window !== 'undefined') {
      (window as any).__USER_ROLE_CACHE__ = normalizedInfo?.user_roles ?? 1;
    }
  };

  const getCurrentUserRole = (): number => {
    return userInfo?.user_roles ?? 1; // 默认普通用户
  };

  // Token自动刷新机制
  const resolveGatewayToken = async (
    options?: ResolveGatewayTokenOptions,
  ): Promise<string> => {
    if (!userInfo) {
      throw new Error('用户未登录');
    }

    const forceRefresh = options?.forceRefresh === true;

    const now = Date.now();
    if (forceRefresh) {
    }
    let accessExpiresAt = Number(userInfo.access_expires_at || 0);

    if (!Number.isFinite(accessExpiresAt) || accessExpiresAt <= 0) {
      const fallbackExpiry = getJwtExpiry(userInfo.access_token || userInfo.jwt_token);
      if (fallbackExpiry) {
        accessExpiresAt = fallbackExpiry;
        setUserInfo({
          ...userInfo,
          access_expires_at: fallbackExpiry,
        });
      } else if (!forceRefresh) {
        return userInfo.access_token || userInfo.jwt_token;
      }
    }

    if (!forceRefresh && accessExpiresAt > now + 5 * 60 * 1000) {
      return userInfo.access_token || userInfo.jwt_token;
    }

    if (!userInfo.refresh_token) {
      return userInfo.access_token || userInfo.jwt_token;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = async (): Promise<string> => {
      try {
        const startedAt = Date.now();
        const response = await callGatewayApi<any>('/api/v1/auth/refresh', {
          refresh_token: userInfo.refresh_token
        }, {
          method: 'POST'
        });

        if (!response || response.success === false) {
          const message =
            (response as any)?.message ||
            (response as any)?.error ||
            ((response as any)?.data && typeof (response as any).data === 'object'
              ? (response as any).data?.message
              : undefined) ||
            'Token刷新失败';
          throw new Error(message);
        }

        const nowTimestamp = Date.now();
        const candidates: Record<string, unknown>[] = [];

        if (response && typeof response === 'object') {
          if (response.data && typeof response.data === 'object') {
            const dataRecord = response.data as Record<string, unknown>;
            if (dataRecord.tokens && typeof dataRecord.tokens === 'object') {
              candidates.push(dataRecord.tokens as Record<string, unknown>);
            }
            candidates.push(dataRecord);
          }

          if ((response as any).tokens && typeof (response as any).tokens === 'object') {
            candidates.push((response as any).tokens as Record<string, unknown>);
          }

          candidates.push(response as unknown as Record<string, unknown>);
        }

        let payload: Record<string, unknown> | undefined;
        for (const record of candidates) {
          if (record && typeof record['access_token'] === 'string') {
            payload = record;
            break;
          }
        }
        if (!payload && candidates.length > 0) {
          payload = candidates[0];
        }
        const resolvedPayload: Record<string, unknown> = payload ?? {};

        const accessTokenValue =
          resolvedPayload['access_token'] ?? resolvedPayload['token'];
        const accessToken =
          typeof accessTokenValue === 'string' ? accessTokenValue : undefined;

        if (!accessToken) {
          throw new Error('Token刷新失败');
        }

        const refreshTokenValue = resolvedPayload['refresh_token'];
        const refreshToken =
          typeof refreshTokenValue === 'string' && refreshTokenValue.length > 0
            ? refreshTokenValue
            : undefined;

        const computedAccessExpiresAt = computeExpiresAt(
          (resolvedPayload['access_expires_at'] ?? resolvedPayload['expires_at']) as number | string | null,
          (resolvedPayload['access_expires_in'] ?? resolvedPayload['expires_in']) as number | string | null,
          nowTimestamp
        );

        const computedRefreshExpiresAt = computeExpiresAt(
          resolvedPayload['refresh_expires_at'] as number | string | null,
          resolvedPayload['refresh_expires_in'] as number | string | null,
          nowTimestamp
        );

        const resolvedAccessExpiresAt =
          computedAccessExpiresAt ?? getJwtExpiry(accessToken);
        const resolvedRefreshExpiresAt =
          computedRefreshExpiresAt ?? getJwtExpiry(refreshToken);


        const updatedUserInfo = {
          ...userInfo,
          access_token: accessToken,
          refresh_token: refreshToken || userInfo.refresh_token,
          access_expires_at: resolvedAccessExpiresAt ?? userInfo.access_expires_at,
          refresh_expires_at: resolvedRefreshExpiresAt ?? userInfo.refresh_expires_at,
          jwt_token: accessToken // 兼容旧逻辑
        };

        setUserInfo(updatedUserInfo);

        const completedAt = Date.now();
        lastRefreshAtRef.current = completedAt;


        return accessToken;
      } catch (error) {
        console.error('Token刷新失败:', error);
        clearUserInfo();
        throw new Error('Token过期，请重新登录');
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = refreshPromise();
    return refreshPromiseRef.current;
  };

  const resolveGatewayTokenRef = useRef(resolveGatewayToken);

  useEffect(() => {
    resolveGatewayTokenRef.current = resolveGatewayToken;
  }, [resolveGatewayToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    cancelScheduledRefresh();

    if (!userInfo?.refresh_token) {
      return;
    }

    const safetyWindowMs = 5 * 60 * 1000;
    const now = Date.now();

    let accessExpiresAt = normalizeTimestamp(userInfo.access_expires_at);
    if (accessExpiresAt === undefined) {
      const fallbackToken = userInfo.access_token || userInfo.jwt_token;
      accessExpiresAt = getJwtExpiry(fallbackToken);
    }

    if (accessExpiresAt === undefined) {
      return;
    }

    const triggerAt = accessExpiresAt - safetyWindowMs;
    const delay = triggerAt - now;

    const invokeRefresh = () => {
      const resolver = resolveGatewayTokenRef.current;
      if (!resolver) {
        return;
      }
      const firedAt = Date.now();
      const previousRefreshAt = lastRefreshAtRef.current;

      resolver({ forceRefresh: true }).catch(error => {
        console.error('定时刷新 token 失败', error);
      });
    };

    if (delay <= 0) {
      console.debug('timer immediately invoking refresh', {
        accessExpiresAt,
        safetyWindowMs,
        now,
        triggerAt: accessExpiresAt - safetyWindowMs,
        triggerAtIso: new Date(accessExpiresAt - safetyWindowMs).toISOString(),
      });
      invokeRefresh();
      return;
    }

    refreshTimerRef.current = window.setTimeout(invokeRefresh, delay);


    return cancelScheduledRefresh;
  }, [
    userInfo?.access_expires_at,
    userInfo?.access_token,
    userInfo?.jwt_token,
    userInfo?.refresh_token,
    cancelScheduledRefresh,
  ]);

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

      }
    } catch (error) {
      console.error('❌ 后端登出失败:', error);
      // 即使后端登出失败，也要清理本地状态
    } finally {
      clearUserInfo();
    }
  };

  const clearUserInfo = () => {
    cancelScheduledRefresh();
    lastRefreshAtRef.current = null;
    setUserInfo(null);
    setInviteCodeState(null);
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
    inviteCode,
    setInviteCode: updateInviteCode,
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
