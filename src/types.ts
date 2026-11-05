export type AgentId = 'hanex' | 'shumex';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom';

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderId;
  isFree?: boolean;
  badge?: string;
  description?: string;
}

export interface ProviderSettings {
  id: ProviderId;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  customName?: string;
  customModel?: string;
  openRouterModelId?: string;
  freeOnlyFilter?: boolean; // for OpenRouter
}

export interface AgentModelSelection {
  provider: ProviderId;
  model: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentId: AgentId;
  provider?: ProviderId;
  model?: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
}

export interface AgentTheme {
  primary: string;
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
  apiKey: string; // Legacy Gemini fallback key
  model: string; // Legacy default
  providers: Record<ProviderId, ProviderSettings>;
  openRouterFreeOnly: boolean;
  fallbacks: AgentModelSelection[];
  soundEffects: boolean;
  confettiEffects: boolean;
  speechSynthesis: boolean;
  sendVoiceImmediately: boolean;
  voiceSpeed: number;
  syncThemeWithAgent: boolean;
  fontSize: 'compact' | 'normal' | 'relaxed';
}

export interface SystemStatus {
  hasEnvKey: boolean;
  defaultModel: string;
  envKeys: Record<string, boolean>;
}
