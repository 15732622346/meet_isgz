'use client';

// Gateway API 閰嶇疆
const GATEWAY_BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '';
const GATEWAY_API_KEY = process.env.NEXT_PUBLIC_GATEWAY_API_KEY || '';
const GATEWAY_API_SECRET = process.env.NEXT_PUBLIC_GATEWAY_API_SECRET || '';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface AuthStatusResponse {
  user_id: string;
  name: string;
  role: string;
  user_type: 'guest' | 'registered';
  token?: string;
}

interface RoomDetailResponse {
  room_id: string;
  room_name: string;
  ws_url: string;
  token: string;
  participant_name: string;
  user: {
    id: string;
    name: string;
    role: string;
  };
}

interface LoginRequest {
  username: string;
  password: string;
  room_id?: string;
  invite_code?: string;
  force_login?: boolean;
}

interface RegisterRequest {
  username: string;
  password: string;
  room_id?: string;
  invite_code?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = GATEWAY_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}/gateway?api=${endpoint}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getAuthStatus(): Promise<ApiResponse<AuthStatusResponse>> {
    return this.request<AuthStatusResponse>('/api/v1/auth/status');
  }

  async getRoomDetail(roomId: string, inviteCode: string): Promise<ApiResponse<RoomDetailResponse>> {
    return this.request<RoomDetailResponse>(
      `/api/v1/rooms/detail?room_id=${roomId}&invite_code=${inviteCode}`
    );
  }

  async login(data: LoginRequest): Promise<ApiResponse> {
    return this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async register(data: RegisterRequest): Promise<ApiResponse> {
    return this.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinRoom(roomId: string, inviteCode: string, participantName: string): Promise<ApiResponse<RoomDetailResponse>> {
    return this.request<RoomDetailResponse>('/api/v1/rooms/join', {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        invite_code: inviteCode,
        participant_name: participantName,
      }),
    });
  }

  async applyMic(roomId: string): Promise<ApiResponse> {
    return this.request('/api/v1/rooms/apply-mic', {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
      }),
    });
  }

  async controlParticipant(
    roomId: string,
    participantId: string,
    action: 'approve' | 'reject' | 'kick' | 'mute' | 'unmute'
  ): Promise<ApiResponse> {
    return this.request('/api/v1/rooms/control-participant', {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        participant_id: participantId,
        action,
      }),
    });
  }
}

// 瀵煎嚭鍗曚緥瀹炰緥
export const apiClient = new ApiClient();

// 瀵煎嚭绫诲瀷
export type {
  ApiResponse,
  AuthStatusResponse,
  RoomDetailResponse,
  LoginRequest,
  RegisterRequest,
};

// 瀵煎嚭绫?
export { ApiClient };



export interface NormalizedGatewayResponse<T> {
  payload?: T;
  success: boolean;
  message?: string;
  error?: string;
  raw: unknown;
}

export function normalizeGatewayResponse<T>(raw: unknown): NormalizedGatewayResponse<T> {
  if (!raw || typeof raw !== 'object') {
    return { payload: undefined, success: false, message: undefined, error: undefined, raw };
  }

  const envelope = raw as Record<string, unknown> & {
    data?: unknown;
    success?: unknown;
    message?: unknown;
    error?: unknown;
  };
  const hasData = Object.prototype.hasOwnProperty.call(envelope, 'data') && envelope.data !== undefined;
  const payload = (hasData ? (envelope.data as T | undefined) : (raw as T)) ?? undefined;

  let success = false;
  if (payload && typeof payload === 'object') {
    const payloadRecord = payload as Record<string, unknown>;
    if (typeof payloadRecord.success === 'boolean') {
      success = payloadRecord.success;
    }
  }
  if (!success && typeof envelope.success === 'boolean') {
    success = envelope.success;
  }

  const message = (() => {
    if (payload && typeof payload === 'object') {
      const payloadRecord = payload as Record<string, unknown>;
      if (typeof payloadRecord.message === 'string') {
        return payloadRecord.message;
      }
      if (typeof payloadRecord.error === 'string') {
        return payloadRecord.error;
      }
    }
    if (typeof envelope.message === 'string') {
      return envelope.message;
    }
    if (typeof envelope.error === 'string') {
      return envelope.error;
    }
    return undefined;
  })();

  const error = (() => {
    if (payload && typeof payload === 'object') {
      const payloadRecord = payload as Record<string, unknown>;
      if (typeof payloadRecord.error === 'string') {
        return payloadRecord.error;
      }
    }
    if (typeof envelope.error === 'string') {
      return envelope.error;
    }
    return undefined;
  })();

  return { payload, success, message, error, raw };
}

// 渚挎嵎鐨凣ateway API璋冪敤鍑芥暟
export async function callGatewayApi<T = any>(
  endpoint: string,
  dataOrOptions?: any,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    let finalOptions: RequestInit = {};
    let queryParams = '';

    // 澶勭悊鍙傛暟锛氬鏋滄湁3涓弬鏁帮紝绗簩涓槸鏁版嵁锛岀涓変釜鏄痮ptions
    // 濡傛灉鍙湁2涓弬鏁帮紝绗簩涓槸options
    if (options !== undefined) {
      // 3涓弬鏁扮殑鎯呭喌
      finalOptions = options;
      if (dataOrOptions && finalOptions.method?.toUpperCase() === 'GET') {
        // GET璇锋眰锛屽皢鏁版嵁杞崲涓烘煡璇㈠弬鏁?
        const params = new URLSearchParams();
        Object.entries(dataOrOptions).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
        queryParams = params.toString() ? `&${params.toString()}` : '';
      } else if (dataOrOptions && finalOptions.method?.toUpperCase() !== 'GET') {
        // 闈濭ET璇锋眰锛屾暟鎹斁鍦╞ody涓?
        finalOptions.body = JSON.stringify(dataOrOptions);
      }
    } else {
      // 2涓弬鏁扮殑鎯呭喌锛岀浜屼釜鍙傛暟鏄痮ptions
      finalOptions = dataOrOptions || {};
    }

    const url = `${GATEWAY_BASE_URL}/gateway?api=${endpoint}${queryParams}`;

    const headers = new Headers(finalOptions.headers as HeadersInit | undefined);
    headers.set('Content-Type', 'application/json');

    if (GATEWAY_API_KEY && !headers.has('X-API-Key')) {
      headers.set('X-API-Key', GATEWAY_API_KEY);
    }

    if (GATEWAY_API_SECRET && !headers.has('X-API-Secret')) {
      headers.set('X-API-Secret', GATEWAY_API_SECRET);
    }

    const response = await fetch(url, {
      ...finalOptions,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Gateway API request failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

