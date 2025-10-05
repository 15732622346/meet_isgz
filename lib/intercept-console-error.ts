'use client';

/**
 * Suppress duplicate console.error spam from repeated LiveKit retries
 * while keeping the first occurrence available for debugging.
 */
const LOG_SUPPRESSION_INTERVAL_MS = 8000;

type ConsoleWithFlag = Console & { __lkIntercepted?: boolean };

type InterceptedConsoleError = Console['error'] & {
  __lkRecentErrors?: Map<string, number>;
};

const consoleRef = globalThis.console as ConsoleWithFlag;

if (typeof window !== 'undefined' && !consoleRef.__lkIntercepted) {
  const originalError = consoleRef.error.bind(consoleRef) as InterceptedConsoleError;
  const recentErrors = new Map<string, number>();

  const normalizeArg = (value: unknown): string => {
    if (value instanceof Error) {
      return `${value.name}:${value.message}`;
    }
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (jsonError) {
      return String(value);
    }
  };

  const intercepted: InterceptedConsoleError = (...args: unknown[]) => {
    const signature = args.map(normalizeArg).join('|');
    const now = Date.now();
    const lastLoggedAt = recentErrors.get(signature) ?? 0;

    if (now - lastLoggedAt < LOG_SUPPRESSION_INTERVAL_MS) {
      return;
    }

    recentErrors.set(signature, now);
    originalError(...(args as Parameters<typeof console.error>));
  };

  intercepted.__lkRecentErrors = recentErrors;
  consoleRef.error = intercepted;
  consoleRef.__lkIntercepted = true;
}

export const resetConsoleErrorSuppression = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const consoleWithFlag = globalThis.console as ConsoleWithFlag;
  if (!consoleWithFlag.__lkIntercepted) {
    return;
  }

  const intercepted = consoleWithFlag.error as InterceptedConsoleError;
  intercepted.__lkRecentErrors?.clear();
};
