export type AgentId = 'hanex' | 'shumex';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentId: AgentId;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

export interface AgentTheme {
  primary: string; // Tailwind color class or hex
  primaryHex: string;
  secondaryHex: string;
  accentGradient: string;
  glowClass: string;
  bgGlowHex: string;
  bubbleUser: string;
  bubbleAssistant: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  activeRing: string;
  avatarBg: string;
}

export interface AgentProfile {
  id: AgentId;
  name: string;
  genderTitle: string;
  roleTitle: string;
  personality: string;
  description: string;
  theme: AgentTheme;
  speechPitch: number;
  speechRate: number;
  suggestedPrompts: {
    title: string;
    prompt: string;
    icon: string;
  }[];
}

export interface AppSettings {
  apiKey: string;
  model: string;
  soundEffects: boolean;
  speechSynthesis: boolean;
  voiceSpeed: number;
  syncThemeWithAgent: boolean;
  fontSize: 'compact' | 'normal' | 'relaxed';
}

export interface SystemStatus {
  hasEnvKey: boolean;
  defaultModel: string;
}
