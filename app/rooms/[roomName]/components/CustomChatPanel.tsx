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
  bannerMessage,
  validationMessage,
  maxLength = 60,
  isGuest,
  onGuestIntercept,
  placeholder = '说点什么…（最多60字）',
}: CustomChatPanelProps) {
  const [draft, setDraft] = React.useState('');
  const messageListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
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
  }, [messages]);

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
      <div className={styles.header}>点我收起聊天</div>
      <div ref={messageListRef} className={styles.messageList}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>还没有消息，快来打个招呼吧～</div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`${styles.message} ${message.isSelf ? styles.messageSelf : ''}`.trim()}
            >
              <div className={`${styles.meta} ${message.isSelf ? styles.metaSelf : ''}`.trim()}>
                <span className={styles.name}>{message.nickname}</span>
                <span className={styles.time}>{formatTime(message.timestamp)}</span>
              </div>
              <div className={`${styles.bubble} ${message.isSelf ? styles.bubbleSelf : ''}`.trim()}>
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>
      <div className={styles.footer}>
        {bannerMessage && <div className={styles.banner}>{bannerMessage}</div>}
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
