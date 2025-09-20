'use client';

import React from 'react';

interface SettingsMenuProps {
  isOpen?: boolean;
  onClose?: () => void;
  room?: any;
}

export function SettingsMenu({ isOpen, onClose, room }: SettingsMenuProps) {
  const [selectedCamera, setSelectedCamera] = React.useState<string>('');
  const [selectedMicrophone, setSelectedMicrophone] = React.useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = React.useState<string>('');

  if (!isOpen) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#1a1a1a',
        borderRadius: '8px',
        padding: '24px',
        width: '400px',
        maxWidth: '90vw',
        color: 'white'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <h3 style={{ margin: 0 }}>设置</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>摄像头</label>
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #333',
              background: '#333',
              color: 'white'
            }}
          >
            <option value="">选择摄像头</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>麦克风</label>
          <select
            value={selectedMicrophone}
            onChange={(e) => setSelectedMicrophone(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #333',
              background: '#333',
              color: 'white'
            }}
          >
            <option value="">选择麦克风</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>扬声器</label>
          <select
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #333',
              background: '#333',
              color: 'white'
            }}
          >
            <option value="">选择扬声器</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}