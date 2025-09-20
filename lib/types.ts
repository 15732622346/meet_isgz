// 类型定义文件
export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
}

export interface UserInfo {
  id: string;
  name: string;
  role: string;
  user_type: 'guest' | 'registered';
}

export interface RoomInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  participant_count: number;
}