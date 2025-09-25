'use client';

// 环境配置
export const config = {
  // LiveKit 配置
  livekit: {
    wsUrl: process.env.NEXT_PUBLIC_LIVEKIT_WS_URL || 'wss://meet.pge006.com/rtc',
    apiKey: process.env.NEXT_PUBLIC_LIVEKIT_API_KEY || 'devkey',
    apiSecret: process.env.NEXT_PUBLIC_LIVEKIT_API_SECRET || 'developmentSecretKeyFor32Chars2024',
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

// API_CONFIG ?? - ??API?????????
const DEFAULT_GATEWAY_BASE_URL = config.gateway.baseUrl;
const DEFAULT_ENDPOINTS: Record<string, string> = {
  ROOM_INFO: '/api/v1/rooms/detail',
  UPDATE_PARTICIPANT: '/api/update-participant.php',
  ADMIN_CONTROL_PARTICIPANTS: '/admin-control-participants.php',
  CHECK_BLOCKED_WORDS: '/api/check-blocked-words.php',
  CLEAR_SESSION: '/clear-session.php',
  GATEWAY_AUTH_STATUS: '/api/v1/auth/status',
  GATEWAY_ROOMS_DETAIL: '/api/v1/rooms/detail',
  GATEWAY_AUTH_LOGIN: '/api/v1/auth/login',
  GATEWAY_AUTH_REGISTER: '/api/v1/auth/register',
  gateway_auth_status: '/api/v1/auth/status',
  gateway_rooms_detail: '/api/v1/rooms/detail',
  gateway_auth_login: '/api/v1/auth/login',
  gateway_auth_register: '/api/v1/auth/register',
  gateway_auth_logout: '/api/v1/auth/logout',
  gateway_auth_refresh: '/api/v1/auth/refresh',
  gateway_participants_request_microphone: '/api/v1/participants/request-microphone',
  gateway_participants_grant_publish: '/api/v1/participants/grant-publish',
  gateway_participants_kick_mic: '/api/v1/participants/kick-mic',
  gateway_participants_batch_microphone: '/api/v1/participants/batch-set-microphone',
};

const RUNTIME_CONFIG_URL = (() => {
  const configured = process.env.NEXT_PUBLIC_API_CONFIG_URL?.trim();
  return configured && configured.length > 0 ? configured : null;
})();


type RawApiConfig = {
  BASE_URL?: string;
  baseUrl?: string;
  base_url?: string;
  ENDPOINTS?: Record<string, unknown>;
  endpoints?: Record<string, unknown>;
};

let runtimeBaseUrl = DEFAULT_GATEWAY_BASE_URL;
let runtimeEndpoints: Record<string, string> = { ...DEFAULT_ENDPOINTS };
let apiConfigLoaded = false;
let apiConfigPromise: Promise<void> | null = null;

const normalizeEndpointMap = (input?: Record<string, unknown>): Record<string, string> => {
  if (!input) {
    return {};
  }

  const normalized: Record<string, string> = {};

  Object.entries(input).forEach(([key, rawValue]) => {
    if (typeof rawValue !== 'string' || !key) {
      return;
    }

    normalized[key] = rawValue;
    const upperKey = key.toUpperCase();
    if (!(upperKey in normalized)) {
      normalized[upperKey] = rawValue;
    }
  });

  return normalized;
};

const applyRuntimeConfig = (raw?: RawApiConfig) => {
  if (!raw || typeof raw !== 'object') {
    return;
  }

  const baseUrlCandidate = raw.BASE_URL ?? raw.baseUrl ?? raw.base_url;
  if (typeof baseUrlCandidate === 'string' && baseUrlCandidate.trim().length > 0) {
    runtimeBaseUrl = baseUrlCandidate.trim();
  }

  const endpointsCandidate = (raw.ENDPOINTS ?? raw.endpoints) as Record<string, unknown> | undefined;
  if (endpointsCandidate && typeof endpointsCandidate === 'object') {
    runtimeEndpoints = {
      ...runtimeEndpoints,
      ...normalizeEndpointMap(endpointsCandidate),
    };
  }
};

const resolveEndpoint = (endpoint: string): string => {
  if (!endpoint) {
    return endpoint;
  }

  if (runtimeEndpoints[endpoint]) {
    return runtimeEndpoints[endpoint];
  }

  const upperKey = endpoint.toUpperCase();
  if (runtimeEndpoints[upperKey]) {
    return runtimeEndpoints[upperKey];
  }

  return endpoint;
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
  get ENDPOINTS(): Record<string, string> {
    return { ...runtimeEndpoints };
  },
  getLiveKitUrl: async (): Promise<string> => config.livekit.wsUrl,
  load: (force = false) => loadRuntimeApiConfig(force),
  async getEndpoint(endpoint: string): Promise<string> {
    await loadRuntimeApiConfig();
    return resolveEndpoint(endpoint);
  },
  getEndpointSync(endpoint: string): string {
    return resolveEndpoint(endpoint);
  },
  async getBaseUrl(): Promise<string> {
    await loadRuntimeApiConfig();
    return runtimeBaseUrl;
  },
};

export async function getApiUrl(path: string): Promise<string> {
  await loadRuntimeApiConfig();
  return `${runtimeBaseUrl}${path}`;
}
