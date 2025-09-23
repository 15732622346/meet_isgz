'use client';

import React from 'react';
import { useParticipantContext } from '@livekit/components-react';
import { parseParticipantMetadata, canRequestMic, getParticipantMetadataSource } from '../lib/token-utils';

interface MicRequestButtonProps {
  userRole?: number;
  disabled?: boolean;
}

export function MicRequestButton({ userRole = 1, disabled = false }: MicRequestButtonProps) {
  const participant = useParticipantContext();
  const metadata = getParticipantMetadataSource(participant ?? undefined);
  const participantMeta = parseParticipantMetadata(metadata);

  if (userRole >= 2) {
    return null;
  }

  const isDisabled = participantMeta.isDisabledUser;
  const canRequest = canRequestMic(metadata);

  if (isDisabled) {
    return (
      <button
        className="mic-request-button disabled"
        disabled
      >
        无法申请发言

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

  };

  return (
    <button
      className="mic-request-button"
      onClick={handleClick}
      disabled={disabled || !canRequest}
    >
      申请发言

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
