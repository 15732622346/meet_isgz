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

// API_CONFIG 对象 - 提供API配置和端点获取功能
export const API_CONFIG = {
  getLiveKitUrl: async (): Promise<string> => {
    return config.livekit.wsUrl;
  },

  getEndpoint: (endpoint: string): string => {
    const endpoints: Record<string, string> = {
      'gateway_auth_status': '/api/v1/auth/status',
      'gateway_rooms_detail': '/api/v1/rooms/detail',
      'gateway_auth_login': '/api/v1/auth/login',
      'gateway_auth_register': '/api/v1/auth/register',
    };
    return endpoints[endpoint] || endpoint;
  }
};

// 获取API URL
export function getApiUrl(path: string): string {
  return `${config.gateway.baseUrl}${path}`;
}