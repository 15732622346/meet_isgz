'use client';

import '@/lib/intercept-console-error';
import { UserProvider } from '@/contexts/UserContext';
import { API_CONFIG } from '@/lib/config';
import { ReactNode, useEffect } from 'react';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  useEffect(() => {
    API_CONFIG.load().catch(error => {
      console.warn('Failed to preload API config', error);
    });
  }, []);

  return (
    <UserProvider>
      {children}
    </UserProvider>
  );
}

