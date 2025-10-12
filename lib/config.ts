'use client';

// 环境配置
export const config = {
  // LiveKit 配置
  livekit: {
    wsUrl: process.env.NEXT_PUBLIC_LIVEKIT_WS_URL || 'wss://meet.pge006.com/rtc',
  },

  // Gateway API 配置
  gateway: {
    baseUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://met.pge006.com',
    timeout: 10000,
  },

  // 应用配置
  app: {
    name: 'LiveKit Meet',
    version: '0.2.0',
    environment: process.env.NEXT_PUBLIC_ENV || 'development',
    debug: process.env.NODE_ENV === 'development',
  },

  // 媒体设备配置
  media: {
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: {
      resolution: {
        width: 1280,
        height: 720,
      },
      frameRate: 30,
    },
  },

  // 房间配置
  room: {
    maxParticipants: 50,
    autoSubscribe: true,
    dynacast: true,
    adaptiveStream: true,
  },

  // 功能开关
  features: {
    e2ee: true,
    recording: false,
    screenshare: true,
    chat: true,
    handRaise: true,
    noiseFilter: false,
  },
};

// 获取配置值的工具函数
export function getConfig<T>(path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let value: any = config;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue as T;
    }
  }

  return value as T;
}

// 检查功能是否启用
export function isFeatureEnabled(feature: keyof typeof config.features): boolean {
  return config.features[feature];
}

// 获取环境信息
export function getEnvironment() {
  return {
    isDevelopment: config.app.environment === 'development',
    isProduction: config.app.environment === 'production',
    isDebug: config.app.debug,
  };
}

// API_CONFIG 配置 - Gateway API 相关配置
const DEFAULT_GATEWAY_BASE_URL = config.gateway.baseUrl;
const DEFAULT_LIVEKIT_URL = config.livekit.wsUrl;

const RUNTIME_CONFIG_URL = (() => {
  const configured = process.env.NEXT_PUBLIC_API_CONFIG_URL?.trim();
  return configured && configured.length > 0 ? configured : null;
})();

type RawApiConfig = {
  BASE_URL?: string;
  baseUrl?: string;
  base_url?: string;
  LIVEKIT_URL?: string;
  livekitUrl?: string;
  livekit_url?: string;
};

let runtimeBaseUrl = DEFAULT_GATEWAY_BASE_URL;
let runtimeLiveKitUrl = DEFAULT_LIVEKIT_URL;
let apiConfigLoaded = false;
let apiConfigPromise: Promise<void> | null = null;

const coerceString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const applyRuntimeConfig = (raw?: RawApiConfig) => {
  if (!raw || typeof raw !== 'object') {
    return;
  }

  const baseUrlCandidate =
    coerceString(raw.BASE_URL) ?? coerceString(raw.baseUrl) ?? coerceString(raw.base_url);
  if (baseUrlCandidate) {
    runtimeBaseUrl = baseUrlCandidate;
  }

  const livekitUrlCandidate =
    coerceString(raw.LIVEKIT_URL) ?? coerceString(raw.livekitUrl) ?? coerceString(raw.livekit_url);
  if (livekitUrlCandidate) {
    runtimeLiveKitUrl = livekitUrlCandidate;
  }
};

const loadRuntimeApiConfig = async (force = false): Promise<void> => {
  if (typeof window === 'undefined') {
    apiConfigLoaded = true;
    return;
  }

  if (!RUNTIME_CONFIG_URL) {
    apiConfigLoaded = true;
    return;
  }

  if (apiConfigLoaded && !force) {
    return;
  }

  if (apiConfigPromise && !force) {
    return apiConfigPromise;
  }

  apiConfigPromise = (async () => {
    try {
      const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load API config: ${response.status}`);
      }

      const payload = (await response.json()) as RawApiConfig;
      applyRuntimeConfig(payload);
    } catch (error) {
      console.warn('Failed to load runtime API config', error);
    } finally {
      apiConfigLoaded = true;
      apiConfigPromise = null;
    }
  })();

  return apiConfigPromise;
};

export const API_CONFIG = {
  get BASE_URL(): string {
    return runtimeBaseUrl;
  },
  get LIVEKIT() {
    return {
      URL: runtimeLiveKitUrl,
    };
  },
  load: (force = false) => loadRuntimeApiConfig(force),
  async getBaseUrl(): Promise<string> {
    await loadRuntimeApiConfig();
    return runtimeBaseUrl;
  },
  getBaseUrlSync(): string {
    return runtimeBaseUrl;
  },
  async getLiveKitUrl(): Promise<string> {
    await loadRuntimeApiConfig();
    return runtimeLiveKitUrl;
  },
};

export async function getApiUrl(path: string): Promise<string> {
  await loadRuntimeApiConfig();
  const trimmed = path.trim();
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${runtimeBaseUrl}${normalized}`;
}
