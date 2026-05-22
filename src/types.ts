export interface DiscordAttachment {
  id: string;
  name: string;
  url: string;
  contentType: string | null;
  size: number;
  width?: number;
  height?: number;
}

export interface DiscordMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorTag: string;
  authorAvatar: string | null;
  content: string;
  attachments: DiscordAttachment[];
  createdAt: string;
  channelId: string;
  channelName: string;
  isTest?: boolean;
  customBoxColor?: string;
  customGlow?: boolean;
}

export interface BotConfig {
  botToken: string;
  channelId: string;
  allowedOperators?: Record<string, { role: "mrz" | "mrzadmin" | "mrzmod"; username: string; id: string }>;
}

export interface BotStatus {
  connected: boolean;
  status: 'offline' | 'connecting' | 'online' | 'error';
  botName: string | null;
  botAvatarUrl: string | null;
  error: string | null;
  monitoredChannel: {
    id: string;
    name: string;
    guildName?: string;
  } | null;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface RealtimePayload {
  type: 'message' | 'status' | 'log' | 'messages_init' | 'message_delete' | 'message_update';
  data: any;
}
