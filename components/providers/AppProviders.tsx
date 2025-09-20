'use client';

import { UserProvider } from '@/contexts/UserContext';
import { ReactNode } from 'react';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <UserProvider>
      {children}
    </UserProvider>
  );
}