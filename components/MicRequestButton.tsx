'use client';

import React from 'react';
import { useParticipantContext } from '@livekit/components-react';
import { isUserDisabled, canRequestMic } from '../lib/token-utils';

interface MicRequestButtonProps {
  userRole?: number;
  disabled?: boolean;
}

export function MicRequestButton({ userRole = 1, disabled = false }: MicRequestButtonProps) {
  const participant = useParticipantContext();
  const attributes = participant?.attributes || {};
  
  // 移除自动显示的alert调试信息
  // 如果需要调试，可以在调试面板中查看
  
  // 如果用户是主持人以上角色，不显示申请上麦按钮
  if (userRole >= 2) {
    return null;
  }
  
  // 检查用户是否被禁用
  const isDisabled = isUserDisabled(attributes);
  
  // 如果用户被禁用，显示禁用状态按钮
  if (isDisabled) {
    return (
      <button 
        className="mic-request-button disabled"
        disabled={true}
      >
        无法申请上麦
        
        <style jsx>{`
          .mic-request-button {
            background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }

          .mic-request-button.disabled {
            background: #d1d5db;
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </button>
    );
  }

  const handleClick = () => {
    console.log('麦克风申请按钮点击 - LiveKit版本');
  };

  return (
    <button 
      className="mic-request-button"
      onClick={handleClick}
      disabled={disabled}
    >
       申请上麦
      
      <style jsx>{`
        .mic-request-button {
          background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mic-request-button:hover:not(:disabled) {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          transform: translateY(-1px);
        }

        .mic-request-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </button>
  );
}
