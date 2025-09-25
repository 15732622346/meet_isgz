'use client';

import { useEffect, useRef } from 'react';
import { useUserContext } from '@/contexts/UserContext';

const REFRESH_INTERVAL_MS = 60_000;

export function RefreshTokenTicker() {
  const { userInfo, resolveGatewayToken } = useUserContext();
  const resolverRef = useRef(resolveGatewayToken);
  const hasAlertedRef = useRef(false);

  useEffect(() => {
    resolverRef.current = resolveGatewayToken;
  }, [resolveGatewayToken]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const refreshToken = userInfo?.refresh_token;
    if (!refreshToken) {
      hasAlertedRef.current = false;
      return;
    }

    if (!hasAlertedRef.current) {
      window.alert('Refresh timer started: /api/v1/auth/refresh, interval ' + (REFRESH_INTERVAL_MS / 1000) + ' s');
      hasAlertedRef.current = true;
    }

    const invokeRefresh = () => {
      const resolver = resolverRef.current;
      if (!resolver) {
        return;
      }

      resolver({ forceRefresh: true }).catch(error => {
        console.error('定时刷新 token 失败:', error);
      });
    };

    const intervalId = window.setInterval(invokeRefresh, REFRESH_INTERVAL_MS);
    invokeRefresh();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userInfo?.refresh_token]);

  return null;
}
