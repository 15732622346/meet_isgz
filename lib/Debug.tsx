'use client';

import React from 'react';

interface DebugProps {
  logProps?: Record<string, any>;
}

export function Debug({ logProps }: DebugProps) {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '12px',
      maxWidth: '300px',
      zIndex: 9999
    }}>
      <h4>Debug Info</h4>
      {logProps && (
        <pre style={{ fontSize: '10px', overflow: 'auto', maxHeight: '200px' }}>
          {JSON.stringify(logProps, null, 2)}
        </pre>
      )}
    </div>
  );
}

// 导出DebugMode作为Debug的别名
export const DebugMode = Debug;