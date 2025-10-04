import React from 'react';

import styles from './CustomChatPanel.module.css';

export interface CustomChatMessage {
  id: string;
  userUid: number;
  nickname: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
}

interface CustomChatPanelProps {
  messages: CustomChatMessage[];
  onSend: (message: string) => Promise<boolean | void>;
  isSending: boolean;
  inputDisabled: boolean;
  bannerMessage?: string;
  validationMessage?: string | null;
  maxLength?: number;
  isGuest: boolean;
  onGuestIntercept: () => void;
  placeholder?: string;
  isCollapsed?: boolean;
}

const formatTime = (timestamp: number) => {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch (error) {
    return '';
  }
};

export function CustomChatPanel({
  messages,
  onSend,
  isSending,
  inputDisabled,
  bannerMessage: _bannerMessage,
  validationMessage,
  maxLength = 60,
  isGuest,
  onGuestIntercept,
  placeholder = '说点什么吧...',
  isCollapsed = false,
}: CustomChatPanelProps) {
  const [draft, setDraft] = React.useState('');
  void _bannerMessage;
  const messageListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isCollapsed) {
      return;
    }

    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    const lastMessage = messages[messages.length - 1];

    if (nearBottom || lastMessage?.isSelf) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isCollapsed]);

  const submitDraft = React.useCallback(async () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    if (inputDisabled || isSending) {
      return;
    }

    const result = await onSend(value);
    if (result !== false) {
      setDraft('');
    }
  }, [draft, inputDisabled, isSending, onSend]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void submitDraft();
    },
    [submitDraft],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitDraft();
    }
  };

  const handleFocus = () => {
    if (isGuest) {
      onGuestIntercept();
    }
  };

  return (
    <div className={styles.chatPanel}>
      {!isCollapsed && (
        <div ref={messageListRef} className={styles.messageList}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>还没有聊天消息，快来打个招呼吧～</div>
          ) : (
            messages.map(message => (
              <div
                key={message.id}
                className={styles.message}
                title={formatTime(message.timestamp)}
              >
                <span className={styles.name}>{message.nickname}</span>
                <span className={styles.separator}>：</span>
                <span className={styles.content}>{message.content}</span>
              </div>
            ))
          )}
        </div>
      )}
      <div className={styles.footer}>
        {validationMessage && <div className={styles.validation}>{validationMessage}</div>}
        <form onSubmit={handleSubmit} className={styles.inputRow}>
          <textarea
            className={styles.input}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={1}
            onFocus={handleFocus}
            onClick={() => {
              if (isGuest) {
                onGuestIntercept();
              }
            }}
            readOnly={isGuest}
            disabled={inputDisabled || isSending}
          />
          <button
            type="submit"
            className={styles.button}
            disabled={inputDisabled || isSending || !draft.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

