/**
 * API 相关类型定义
 */

// API Gateway 客户端配置
export interface GatewayClientConfig {
  gatewayUrl?: string;
  timeout?: number;
  debug?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  gatewayApiKey?: string;
  gatewayApiSecret?: string;
}

// HTTP 请求方法
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// API 请求选项
export interface ApiRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
}

// API 响应基础类型
export interface ApiResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
}

// 用户登录请求参数
export interface AuthLoginRequest {
  user_name: string;
  user_password: string;
}

// 用户登录响应数据
export interface AuthLoginResponse {
  success: boolean;
  message?: string;
  user_id?: number;
  id?: number;        // � 新增：用户ID字段
  uid?: number;       // � 新增：用户UID字段
  user_name?: string;
  user_nickname?: string;
  user_roles?: number;
  jwt_token?: string;
  refresh_token?: string;
  expires_at?: string;
  ws_url?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    access_expires_in?: number;
    refresh_expires_in?: number;
    device_type?: string;
    created_at?: string;
  };
}

// 房间详情请求参数
export interface RoomDetailRequest {
  room_id: string;
  invite_code: string;
  user_name: string;
  user_jwt_token: string;
}

// 房间详情响应数据
export interface RoomDetailResponse {
  success: boolean;
  error?: string;
  message?: string;
  room_id?: string;
  room_name?: string;
  token?: string; // LiveKit Token
  ws_url?: string;
  participant_name?: string;
  user_roles?: number;
  [key: string]: any; // 允许其他字段
}

// 游客身份响应数据
export interface AuthStatusResponse {
  success: boolean;
  user_type: 'guest' | 'user';
  user_name: string;
  user_nickname: string;
  jwt_token?: string;
  message?: string;
}

// 用户信息类型（用于登录成功回调）
export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  token: string;
  user_roles: number;
  ws_url?: string;
}

// 错误类型
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}
