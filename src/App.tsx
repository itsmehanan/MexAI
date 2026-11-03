/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Bot,
  Trash2,
  Download,
  Share2,
  RotateCcw,
  Volume2,
  VolumeX,
  Sliders,
  ChevronDown,
  Info,
  Cpu,
} from 'lucide-react';

import {
  AgentId,
  ChatMessage,
  AppSettings,
  ProviderId,
  ProviderSettings,
  AgentModelSelection,
  ModelOption,
} from './types';
import { AGENTS, INITIAL_MESSAGES } from './data/agents';
import { PROVIDERS_META, DEFAULT_PROVIDER_MODELS } from './data/models';
import { soundFX, speakText, stopSpeaking } from './utils/audio';
import { Sidebar } from './components/Sidebar';
import { DesktopHeader } from './components/DesktopHeader';
import { ChatBubble } from './components/ChatBubble';
import { ChatInput } from './components/ChatInput';
import { TypingIndicator } from './components/TypingIndicator';
import { SettingsModal } from './components/SettingsModal';
import { QuickSwitcherModal } from './components/QuickSwitcherModal';
import { Avatar } from './components/Avatar';

const STORAGE_KEY_SETTINGS = 'hanex_shumex_settings_v2';
const STORAGE_KEY_MESSAGES = 'hanex_shumex_messages_v2';
const STORAGE_KEY_AGENT_MODELS = 'hanex_shumex_agent_models_v2';

const DEFAULT_PROVIDERS: Record<ProviderId, ProviderSettings> = {
  gemini: { id: 'gemini', enabled: true, apiKey: '' },
  openai: { id: 'openai', enabled: false, apiKey: '' },
  anthropic: { id: 'anthropic', enabled: false, apiKey: '' },
  openrouter: { id: 'openrouter', enabled: false, apiKey: '' },
  ollama: { id: 'ollama', enabled: false, apiKey: '', baseUrl: 'http://localhost:11434' },
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'gemini-3.8-flash',
  providers: DEFAULT_PROVIDERS,
  openRouterFreeOnly: true,
  soundEffects: true,
  speechSynthesis: false,
  voiceSpeed: 1.0,
  syncThemeWithAgent: true,
  fontSize: 'normal',
};

const DEFAULT_AGENT_MODELS: Record<AgentId, AgentModelSelection> = {
  hanex: { provider: 'gemini', model: 'gemini-3.8-flash' },
  shumex: { provider: 'gemini', model: 'gemini-3.8-flash' },
};

export default function App() {
  // Active Agent state
  const [activeAgentId, setActiveAgentId] = useState<AgentId>('hanex');

  // Per-Agent Model Memory: Hanex and Shumex each remember their chosen model
  const [agentModels, setAgentModels] = useState<Record<AgentId, AgentModelSelection>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AGENT_MODELS);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          hanex: parsed.hanex || DEFAULT_AGENT_MODELS.hanex,
          shumex: parsed.shumex || DEFAULT_AGENT_MODELS.shumex,
        };
      }
    } catch (e) {
      console.warn('Failed to load agent models from localStorage:', e);
    }
    return DEFAULT_AGENT_MODELS;
  });

  // Chat messages for each agent separately
  const [messages, setMessages] = useState<Record<AgentId, ChatMessage[]>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          hanex: parsed.hanex?.length ? parsed.hanex : INITIAL_MESSAGES.hanex,
          shumex: parsed.shumex?.length ? parsed.shumex : INITIAL_MESSAGES.shumex,
        };
      }
    } catch (e) {
      console.warn('Failed to load chat history from localStorage:', e);
    }
    return INITIAL_MESSAGES;
  });

  // Settings state (multi-provider keys, toggles, audio)
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          providers: {
            ...DEFAULT_PROVIDERS,
            ...(parsed.providers || {}),
          },
        };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Backend status & available environment keys
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [envKeys, setEnvKeys] = useState<Record<string, boolean>>({});

  // Ollama dynamically fetched models
  const [ollamaModels, setOllamaModels] = useState<ModelOption[]>([]);
  const [isFetchingOllama, setIsFetchingOllama] = useState(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false);

  // Streaming & Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll ref
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const activeAgent = AGENTS[activeAgentId];
  const activeMessages = messages[activeAgentId] || [];
  const isHanex = activeAgentId === 'hanex';
  const activeModelSelection = agentModels[activeAgentId] || DEFAULT_AGENT_MODELS[activeAgentId];

  // Fetch Ollama models from backend
  const fetchOllamaModels = useCallback(async (customBaseUrl?: string) => {
    setIsFetchingOllama(true);
    const host = customBaseUrl || settings.providers.ollama?.baseUrl || 'http://localhost:11434';
    try {
      const res = await fetch('/api/providers/ollama/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: host }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) {
          setOllamaModels(data.models);
        }
      }
    } catch (err) {
      console.warn('Could not auto-fetch Ollama models:', err);
    } finally {
      setIsFetchingOllama(false);
    }
  }, [settings.providers.ollama?.baseUrl]);

  // Check backend status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.hasEnvKey) setHasEnvKey(true);
        if (data.envKeys) setEnvKeys(data.envKeys);
      })
      .catch((err) => {
        console.warn('Backend status check error:', err);
      });

    // If Ollama is enabled, scan for models
    if (settings.providers.ollama?.enabled) {
      fetchOllamaModels();
    }
  }, [fetchOllamaModels, settings.providers.ollama?.enabled]);

  // Save agent models to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_AGENT_MODELS, JSON.stringify(agentModels));
    } catch (e) {
      console.warn('Failed to save agent models', e);
    }
  }, [agentModels]);

  // Save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to save chat history', e);
    }
  }, [messages]);

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings', e);
    }
  }, [settings]);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [activeMessages.length, isGenerating]);

  // Switch agent
  const handleSelectAgent = (agentId: AgentId) => {
    if (agentId === activeAgentId) return;
    if (settings.soundEffects) {
      soundFX.playSwitch(agentId);
    }
    stopSpeaking();
    setActiveAgentId(agentId);
  };

  // Update selected model for currently active agent
  const handleSelectModelForActiveAgent = (selection: AgentModelSelection) => {
    setAgentModels((prev) => ({
      ...prev,
      [activeAgentId]: selection,
    }));
  };

  // Update settings handler
  const handleSaveSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Send message handler with multi-provider streaming and fallback retry
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isGenerating) return;

    if (settings.soundEffects) {
      soundFX.playSend();
    }

    const currentModelConfig = agentModels[activeAgentId] || DEFAULT_AGENT_MODELS[activeAgentId];
    const providerConfig = settings.providers[currentModelConfig.provider] || {
      id: currentModelConfig.provider,
      enabled: true,
      apiKey: '',
    };

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      agentId: activeAgentId,
      provider: currentModelConfig.provider,
      model: currentModelConfig.model,
      status: 'complete',
    };

    const assistantPlaceholderId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      agentId: activeAgentId,
      provider: currentModelConfig.provider,
      model: currentModelConfig.model,
      status: 'streaming',
    };

    const updatedChat = [...activeMessages, userMessage];
    setMessages((prev) => ({
      ...prev,
      [activeAgentId]: [...updatedChat, assistantMessage],
    }));

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    const requestPayload = {
      agentId: activeAgentId,
      provider: currentModelConfig.provider,
      model: currentModelConfig.model,
      messages: updatedChat.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      providerConfig: {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
      },
    };

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch((jsonErr) => {
          console.warn('Failed to parse error JSON from /api/chat/stream:', jsonErr);
          return {};
        });
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No readable response body.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let streamError = '';
      let buffer = '';

      const processEventBlock = (block: string) => {
        const lines = block.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.error) {
                streamError = data.error;
              } else if (data.text) {
                accumulatedText += data.text;
                setMessages((prev) => ({
                  ...prev,
                  [activeAgentId]: prev[activeAgentId].map((m) =>
                    m.id === assistantPlaceholderId
                      ? { ...m, content: accumulatedText, status: 'streaming' }
                      : m
                  ),
                }));
                scrollToBottom('auto');
              }
            } catch (err) {
              console.warn('Failed to parse SSE JSON payload:', jsonStr, err);
            }
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (part.trim()) {
            processEventBlock(part);
          }
        }
      }

      if (buffer.trim()) {
        processEventBlock(buffer);
        buffer = '';
      }

      if (streamError) {
        throw new Error(streamError);
      }

      // Retry once via non-streaming /api/chat if stream returned empty text and no error
      if (!accumulatedText.trim()) {
        console.warn(
          'Stream finished with empty text and no error. Retrying once via non-streaming /api/chat...'
        );
        try {
          const fallbackRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload),
            signal: abortControllerRef.current.signal,
          });

          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData.text && fallbackData.text.trim()) {
              accumulatedText = fallbackData.text.trim();
            }
          } else {
            const fallbackErrorData = await fallbackRes.json().catch((jsonErr) => {
              console.warn('Failed to parse fallback error JSON:', jsonErr);
              return {};
            });
            if (fallbackErrorData.error) {
              streamError = fallbackErrorData.error;
            }
          }
        } catch (fallbackErr: any) {
          if (fallbackErr.name === 'AbortError') throw fallbackErr;
          console.warn('Fallback /api/chat attempt failed:', fallbackErr);
        }
      }

      // If still empty or error occurred:
      if (!accumulatedText.trim()) {
        const emptyMsg =
          streamError ||
          'The model returned an empty response. Try again or switch the model in Settings';
        setMessages((prev) => ({
          ...prev,
          [activeAgentId]: prev[activeAgentId].map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: emptyMsg, status: 'error', error: emptyMsg }
              : m
          ),
        }));
        return;
      }

      // Mark complete
      setMessages((prev) => ({
        ...prev,
        [activeAgentId]: prev[activeAgentId].map((m) =>
          m.id === assistantPlaceholderId
            ? { ...m, content: accumulatedText, status: 'complete' }
            : m
        ),
      }));

      if (settings.soundEffects) {
        soundFX.playReceive(activeAgentId);
      }

      if (settings.speechSynthesis && accumulatedText) {
        speakText(accumulatedText, activeAgentId, settings.voiceSpeed);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) => ({
          ...prev,
          [activeAgentId]: prev[activeAgentId].map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content: m.content || '(Generation stopped by user)',
                  status: 'complete',
                }
              : m
          ),
        }));
      } else {
        const errorMsg =
          err?.message ||
          `Failed to communicate with ${PROVIDERS_META[currentModelConfig.provider]?.name || 'provider'}. Check your API key in Settings.`;
        setMessages((prev) => ({
          ...prev,
          [activeAgentId]: prev[activeAgentId].map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content: errorMsg,
                  status: 'error',
                  error: errorMsg,
                }
              : m
          ),
        }));
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Stop generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    if (isGenerating || activeMessages.length < 2) return;
    const lastUserMessage = [...activeMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      setMessages((prev) => ({
        ...prev,
        [activeAgentId]: prev[activeAgentId].filter(
          (m, idx) => idx !== prev[activeAgentId].length - 1
        ),
      }));
      handleSendMessage(lastUserMessage.content);
    }
  };

  // Clear chat for an agent
  const handleClearChat = (agentId: AgentId) => {
    setMessages((prev) => ({
      ...prev,
      [agentId]: INITIAL_MESSAGES[agentId],
    }));
  };

  // Export chat for single agent
  const handleExportChat = (agentId: AgentId) => {
    const agent = AGENTS[agentId];
    const chatData = messages[agentId];
    const assigned = agentModels[agentId];
    let markdown = `# Chat History with ${agent.name} (${agent.roleTitle})\n\n`;
    markdown += `*Assigned Model: ${assigned?.model || 'default'} (${assigned?.provider || 'gemini'})*\n`;
    markdown += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

    chatData.forEach((m) => {
      const sender = m.role === 'user' ? 'You' : agent.name;
      const time = new Date(m.timestamp).toLocaleTimeString();
      markdown += `### ${sender} [${time}]\n\n${m.content}\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name.toLowerCase()}-chat-history.md`;
    a.click();
    URL.revokeObjectURL(url);

    try {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
    } catch {}
  };

  // Export all conversations
  const handleExportAll = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      agentModels,
      agents: {
        hanex: {
          profile: AGENTS.hanex,
          selectedModel: agentModels.hanex,
          messages: messages.hanex,
        },
        shumex: {
          profile: AGENTS.shumex,
          selectedModel: agentModels.shumex,
          messages: messages.shumex,
        },
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanex-and-shumex-conversations.json`;
    a.click();
    URL.revokeObjectURL(url);

    try {
      confetti({ particleCount: 50, spread: 80, origin: { y: 0.7 } });
    } catch {}
  };

  // Reset all data
  const handleResetAllData = () => {
    setMessages(INITIAL_MESSAGES);
    setSettings(DEFAULT_SETTINGS);
    setAgentModels(DEFAULT_AGENT_MODELS);
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_SETTINGS);
    localStorage.removeItem(STORAGE_KEY_AGENT_MODELS);
    setIsSettingsOpen(false);
  };

  const currentProviderConfig = settings.providers[activeModelSelection.provider];
  const isCurrentProviderKeyMissing =
    activeModelSelection.provider !== 'ollama' &&
    !currentProviderConfig?.apiKey?.trim() &&
    !envKeys[activeModelSelection.provider];

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-[#070b13] text-slate-100 overflow-hidden font-sans transition-colors duration-500 relative ${
        isHanex ? 'selection:bg-cyan-500/30 selection:text-cyan-200' : 'selection:bg-rose-500/30 selection:text-rose-200'
      }`}
    >
      {/* Background Ambient Glow Spots */}
      <div
        className={`pointer-events-none fixed -top-40 -right-40 w-96 h-96 rounded-full blur-[140px] opacity-25 transition-colors duration-700 ${
          isHanex ? 'bg-cyan-500' : 'bg-rose-500'
        }`}
      />
      <div
        className={`pointer-events-none fixed -bottom-40 -left-40 w-96 h-96 rounded-full blur-[160px] opacity-20 transition-colors duration-700 ${
          isHanex ? 'bg-blue-600' : 'bg-fuchsia-600'
        }`}
      />

      {/* Desktop Window Title Header with Multi-Provider Model Dropdown */}
      <DesktopHeader
        activeAgent={activeAgent}
        onSwitchAgent={handleSelectAgent}
        onOpenSettings={() => setIsSettingsOpen(true)}
        selectedModel={activeModelSelection}
        onSelectModel={handleSelectModelForActiveAgent}
        providers={settings.providers}
        openRouterFreeOnly={settings.openRouterFreeOnly}
        onToggleFreeOnly={() =>
          handleSaveSettings({ openRouterFreeOnly: !settings.openRouterFreeOnly })
        }
        ollamaModels={ollamaModels}
        isFetchingOllama={isFetchingOllama}
        onRefreshOllama={() => fetchOllamaModels()}
      />

      {/* Main Desktop Container: Sidebar + Chat Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <Sidebar
          activeAgentId={activeAgentId}
          onSelectAgent={handleSelectAgent}
          messages={messages}
          onClearChat={handleClearChat}
          onExportChat={handleExportChat}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenQuickSwitcher={() => setIsQuickSwitcherOpen(true)}
          soundEnabled={settings.soundEffects}
          onToggleSound={() => handleSaveSettings({ soundEffects: !settings.soundEffects })}
          hasCustomKey={Boolean(currentProviderConfig?.apiKey?.trim())}
          hasEnvKey={hasEnvKey}
          activeModelSelection={activeModelSelection}
          agentModels={agentModels}
          providers={settings.providers}
        />

        {/* Chat Main Area */}
        <main className="flex-1 flex flex-col h-full bg-[#0a0f1c]/70 relative overflow-hidden backdrop-blur-sm">
          {/* Subtle Top Chat Subheader for Active Agent */}
          <div className="px-6 py-2.5 border-b border-white/5 flex items-center justify-between bg-black/10 select-none z-10">
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  isHanex ? 'bg-cyan-400' : 'bg-pink-400'
                }`}
              />
              <span className="text-xs font-semibold text-slate-300">
                {activeAgent.name}'s Workspace
              </span>
              <span className="text-slate-600 text-xs">•</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Powered by{' '}
                <strong className="text-slate-200 font-mono">
                  {activeModelSelection.model}
                </strong>{' '}
                ({PROVIDERS_META[activeModelSelection.provider]?.name || activeModelSelection.provider})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const randomPrompt =
                    activeAgent.suggestedPrompts[
                      Math.floor(Math.random() * activeAgent.suggestedPrompts.length)
                    ];
                  handleSendMessage(randomPrompt.prompt);
                }}
                disabled={isGenerating}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer disabled:opacity-40 ${
                  isHanex
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                    : 'bg-pink-500/10 text-pink-300 border-pink-500/30 hover:bg-pink-500/20'
                }`}
                title="Send a random prompt starter"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden md:inline">Surprise Prompt</span>
              </button>

              <button
                onClick={() => handleClearChat(activeAgentId)}
                className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition cursor-pointer"
                title="Clear this conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Missing Key Banner Notice if currently selected provider lacks a key */}
          {isCurrentProviderKeyMissing && (
            <div className="mx-4 mt-3 p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>
                  {PROVIDERS_META[activeModelSelection.provider]?.name} is selected for {activeAgent.name}, but no API key is configured.
                </span>
              </div>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 transition cursor-pointer whitespace-nowrap"
              >
                Add Key in Settings
              </button>
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 overflow-y-auto py-4 space-y-1 relative">
            {/* Ambient agent greeting header banner if few messages */}
            {activeMessages.length <= 2 && (
              <div className="max-w-xl mx-auto my-6 px-4 text-center">
                <div className="inline-flex p-3 rounded-3xl bg-white/[0.02] border border-white/5 mb-3 shadow-xl">
                  <Avatar agentId={activeAgent.id} size="xl" showStatus={true} status="online" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight mb-1">
                  Meet {activeAgent.name}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto mb-2">
                  {activeAgent.description}
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300 mb-4">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Model: {activeModelSelection.model}</span>
                </div>

                {/* Prompt Starters Chips */}
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {activeAgent.suggestedPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(p.prompt)}
                      disabled={isGenerating}
                      className={`text-left text-xs px-3 py-2 rounded-xl border transition cursor-pointer flex items-center gap-2 group ${
                        isHanex
                          ? 'bg-slate-900/60 border-cyan-500/20 hover:border-cyan-400 text-slate-300 hover:text-white'
                          : 'bg-slate-900/60 border-pink-500/20 hover:border-pink-400 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Sparkles
                        className={`w-3.5 h-3.5 ${
                          isHanex ? 'text-cyan-400' : 'text-pink-400'
                        } group-hover:scale-110 transition-transform`}
                      />
                      <span>{p.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Render Chat Messages */}
            {activeMessages.map((msg, index) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                agent={activeAgent}
                isLast={index === activeMessages.length - 1}
                onRegenerate={handleRegenerate}
                voiceSpeed={settings.voiceSpeed}
              />
            ))}

            {/* Typing Indicator while waiting */}
            {isGenerating &&
              activeMessages.length > 0 &&
              activeMessages[activeMessages.length - 1].role === 'user' && (
                <TypingIndicator agentId={activeAgentId} />
              )}

            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Dock */}
          <ChatInput
            agent={activeAgent}
            onSend={handleSendMessage}
            onStop={handleStopGeneration}
            isGenerating={isGenerating}
            onSelectPrompt={(p) => handleSendMessage(p)}
          />
        </main>
      </div>

      {/* Settings Modal with Multi-Provider Configuration */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onClearAgentChat={handleClearChat}
        onResetAllData={handleResetAllData}
        onExportAll={handleExportAll}
        hasEnvKey={hasEnvKey}
        envKeys={envKeys}
        onRefreshOllama={() => fetchOllamaModels()}
        isFetchingOllama={isFetchingOllama}
        ollamaModelsCount={ollamaModels.length}
      />

      {/* Quick Switcher / Command Palette (Cmd+K) */}
      <QuickSwitcherModal
        isOpen={isQuickSwitcherOpen}
        onClose={() => setIsQuickSwitcherOpen(false)}
        onSelectAgent={handleSelectAgent}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectPrompt={(p) => handleSendMessage(p)}
        activeAgentId={activeAgentId}
      />
    </div>
  );
}
