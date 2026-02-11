export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
}

export enum WidgetState {
  CLOSED = 'closed',
  CHAT = 'chat',
  VOICE = 'voice'
}

export interface VisualizerData {
  volume: number;
}
