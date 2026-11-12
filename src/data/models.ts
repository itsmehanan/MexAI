import { ProviderId, ModelOption } from '../types';

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  tagline: string;
  description: string;
  keyPlaceholder: string;
  keyHelp: string;
  defaultBaseUrl?: string;
  accentColor: string;
  borderColor: string;
  badgeBg: string;
}

export const PROVIDERS_META: Record<ProviderId, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'High-speed multimodal intelligence',
    description: 'Fast, state-of-the-art models from Google DeepMind including Gemini 3.8 Flash.',
    keyPlaceholder: 'AIzaSy...',
    keyHelp: 'Get an API key from Google AI Studio (aistudio.google.com)',
    accentColor: '#38bdf8',
    borderColor: 'border-sky-500/30',
    badgeBg: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'Flagship GPT-4o & reasoning models',
    description: 'Industry-standard intelligence including GPT-4o, GPT-4o mini, and o3-mini.',
    keyPlaceholder: 'sk-proj-...',
    keyHelp: 'Get an API key from platform.openai.com',
    accentColor: '#10b981',
    borderColor: 'border-emerald-500/30',
    badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    tagline: 'Nuanced reasoning & eloquent writing',
    description: 'Claude 3.7 Sonnet with hybrid thinking, Claude 3.5 Sonnet, and Claude 3.5 Haiku.',
    keyPlaceholder: 'sk-ant-api03-...',
    keyHelp: 'Get an API key from console.anthropic.com',
    accentColor: '#d97706',
    borderColor: 'border-amber-500/30',
    badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Unified gateway with hundreds of models',
    description: 'Access models from DeepSeek, Meta Llama 3.3, Mistral, and free tier options.',
    keyPlaceholder: 'sk-or-v1-...',
    keyHelp: 'Get an API key from openrouter.ai/keys',
    accentColor: '#8b5cf6',
    borderColor: 'border-purple-500/30',
    badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  custom: { id: 'custom', name: 'Custom (OpenAI-compatible)', tagline: 'Your own endpoint', description: 'Use an OpenAI-compatible chat completions API.', keyPlaceholder: 'API key', keyHelp: 'Keys are stored securely in the desktop app.', accentColor: '#a78bfa', borderColor: 'border-purple-500/30', badgeBg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    tagline: 'Private on-device AI server',
    description: 'Run open-weight models locally on your machine with zero data leaving your device.',
    keyPlaceholder: 'http://localhost:11434',
    keyHelp: 'Download and run Ollama from ollama.com',
    defaultBaseUrl: 'http://localhost:11434',
    accentColor: '#f97316',
    borderColor: 'border-orange-500/30',
    badgeBg: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
};

export const DEFAULT_PROVIDER_MODELS: Record<ProviderId, ModelOption[]> = {
  custom: [],
  gemini: [
    {
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      provider: 'gemini',
      badge: 'Recommended',
      description: 'Latest high-efficiency flagship with balanced reasoning and low latency.',
    },
    {
      id: 'gemini-3.1-flash-lite',
      name: 'Gemini 3.1 Flash Lite',
      provider: 'gemini',
      badge: 'Ultra Fast',
      description: 'Extremely lightweight model built for rapid turns.',
    },
    {
      id: 'gemini-flash-latest',
      name: 'Gemini Flash Latest',
      provider: 'gemini',
      description: 'General-purpose fast flagship alias.',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      badge: 'Flagship',
      description: 'Most versatile multimodal model for complex reasoning and conversation.',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o mini',
      provider: 'openai',
      badge: 'Fast & Cheap',
      description: 'Fast, cost-effective model for everyday tasks.',
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      provider: 'openai',
      badge: 'Reasoning',
      description: 'High-speed reasoning model specialized in STEM and coding.',
    },
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      provider: 'openai',
      description: 'Advanced frontier reasoning and problem solving.',
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 mini',
      provider: 'openai',
      description: 'Next-generation fast intelligent assistant.',
    },
  ],
  anthropic: [
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      badge: 'Hybrid Thinking',
      description: 'Anthropic’s most intelligent model with configurable hybrid reasoning.',
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      badge: 'Nuanced & Eloquent',
      description: 'High-intelligence model with exceptional nuance and code quality.',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      badge: 'Lightning Fast',
      description: 'Rapid responses with near-Sonnet conversational skill.',
    },
  ],
  openrouter: [], // Populated from the live catalog.
  ollama: [
    {
      id: 'llama3.2',
      name: 'Llama 3.2',
      provider: 'ollama',
      description: 'Meta’s efficient local model.',
    },
    {
      id: 'mistral',
      name: 'Mistral 7B',
      provider: 'ollama',
      description: 'General-purpose local assistant.',
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      provider: 'ollama',
      description: 'Local reasoning model.',
    },
    {
      id: 'qwen2.5',
      name: 'Qwen 2.5',
      provider: 'ollama',
      description: 'Multilingual and code specialist.',
    },
  ],
};

// The live catalog is the only source of verified free models. Manually entered
// IDs and the current selection stay available, but are explicitly unverified.
export function getOpenRouterModels(modelId: string | undefined, live: ModelOption[], selectedId?: string): ModelOption[] {
  const curatedDefault: ModelOption = { id: 'openrouter/free', name: 'openrouter/free', provider: 'openrouter', isFree: true, badge: 'Default', description: 'OpenRouter free model router.' };
  const result: ModelOption[] = [];
  const ids = [modelId?.trim() || 'openrouter/free', ...(selectedId ? [selectedId] : []), 'openrouter/free'];
  for (const id of ids) {
    if (result.some(model => model.id === id)) continue;
    result.push(live.find(model => model.id === id) || (id === 'openrouter/free' ? curatedDefault : { id, name: id, provider: 'openrouter', badge: 'Unverified', description: 'Manually entered or previously selected. Check OpenRouter pricing.' }));
  }
  for (const model of live) if (!result.some(other => other.id === model.id)) result.push(model);
  return result;
}
