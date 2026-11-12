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
import { migrateSavedKeys } from './utils/key-migration';

const STORAGE_KEY_SETTINGS = 'hanex_shumex_settings_v2';
const STORAGE_KEY_MESSAGES = 'hanex_shumex_messages_v2';
const STORAGE_KEY_AGENT_MODELS = 'hanex_shumex_agent_models_v2';

const DEFAULT_PROVIDERS: Record<ProviderId, ProviderSettings> = {
  gemini: { id: 'gemini', enabled: true, apiKey: '' },
  openai: { id: 'openai', enabled: false, apiKey: '' },
  anthropic: { id: 'anthropic', enabled: false, apiKey: '' },
  openrouter: { id: 'openrouter', enabled: false, apiKey: '', openRouterModelId: 'openrouter/free' },
  custom: { id: 'custom', enabled: false, apiKey: '', baseUrl: '', customName: 'Custom', customModel: '' },
  ollama: { id: 'ollama', enabled: false, apiKey: '', baseUrl: 'http://localhost:11434' },
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  model: 'gemini-3.8-flash',
  providers: DEFAULT_PROVIDERS,
  openRouterFreeOnly: true,
  fallbacks: [],
  soundEffects: true,
  confettiEffects: true,
  speechSynthesis: false,
  sendVoiceImmediately: false,
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
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');

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
          apiKey: '',
          providers: {
            ...DEFAULT_PROVIDERS,
            ...Object.fromEntries(Object.entries(parsed.providers || {}).map(([id, value]: [string, any]) => [id, { ...value, apiKey: '' }])) ,
          },
        };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [undoMessage, setUndoMessage] = useState('');
  const [undoBusy, setUndoBusy] = useState(false);
  const [toolApproval, setToolApproval] = useState<ToolApproval | null>(null);
  useEffect(() => {
    if (!window.toolApprovals) return;
    let received = false;
    const off = window.toolApprovals.onApproval(request => { received = true; setToolApproval(request); });
    window.toolApprovals.current().then(request => { if (!received) setToolApproval(request); }).catch(() => {});
    return off;
  }, []);

  // Backend status & available environment keys
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({ version: '', status: 'unavailable' });
  useEffect(() => {
    if (!window.desktopUpdates) return;
    const unsubscribe = window.desktopUpdates.onState(setUpdateState);
    window.desktopUpdates.status().then(setUpdateState).catch(() => {});
    return unsubscribe;
  }, []);
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [keyStorageError, setKeyStorageError] = useState('');
  const [settingsReady, setSettingsReady] = useState(false);
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [envKeys, setEnvKeys] = useState<Record<string, boolean>>({});

  // Ollama dynamically fetched models
  const [ollamaModels, setOllamaModels] = useState<ModelOption[]>([]);
  const [isFetchingOllama, setIsFetchingOllama] = useState(false);

  const [openRouterModels, setOpenRouterModels] = useState<ModelOption[]>([]);
  const [isFetchingOpenRouter, setIsFetchingOpenRouter] = useState(false);
  const [openRouterError, setOpenRouterError] = useState('');
  const fetchOpenRouterModels = useCallback(async (refresh = false) => {
    setIsFetchingOpenRouter(true);
    setOpenRouterError('');
    try {
      const res = await fetch(`/api/providers/openrouter/models${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error('Could not load live free models.');
      const data = await res.json();
      if (!Array.isArray(data.models)) throw new Error('Invalid model catalog.');
      setOpenRouterModels(data.models);
    } catch { setOpenRouterModels([]); setOpenRouterError('Could not load live free models. Try refreshing.'); }
    finally { setIsFetchingOpenRouter(false); }
  }, []);
  useEffect(() => { if (settings.providers.openrouter?.enabled) void fetchOpenRouterModels(); }, [settings.providers.openrouter?.enabled, fetchOpenRouterModels]);

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

  // Move old renderer keys to the vault before replacing the legacy settings record.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await migrateSavedKeys(localStorage, STORAGE_KEY_SETTINGS, window.secureKeys);
        if (cancelled) return;
        setSavedKeys(status);
        setSettingsReady(true);
      } catch {
        if (!cancelled) setKeyStorageError('Secure key storage or migration is unavailable. Existing saved data was left untouched; reopen the app after resolving the issue.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); }
    catch (e) { console.warn('Failed to save settings', e); }
  }, [settings, settingsReady]);

  const saveSecureKey = async (provider: ProviderId, key: string) => {
    if (!window.secureKeys || !settingsReady) throw new Error('Secure key storage is unavailable.');
    await window.secureKeys.save(provider, key);
    setSavedKeys(prev => ({ ...prev, [provider]: true }));
  };
  const removeSecureKey = async (provider: ProviderId) => {
    if (!window.secureKeys || !settingsReady) throw new Error('Secure key storage is unavailable.');
    await window.secureKeys.remove(provider);
    setSavedKeys(prev => ({ ...prev, [provider]: false }));
  };

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
  const handleSendMessage = async (text: string, targetAgent: AgentId = activeAgentId, islandId?: string) => {
    if (!text.trim() || isGenerating || abortControllerRef.current) {
      if (islandId) window.islandChat?.status({ phase: 'rejected', agent: targetAgent, text: 'A response is already in progress.', id: islandId });
      return;
    }
    window.islandChat?.status({ phase: 'working', agent: targetAgent, text: 'Preparing your response…', id: islandId });

    if (settings.soundEffects) {
      soundFX.playSend();
    }

    const currentModelConfig = agentModels[targetAgent] || DEFAULT_AGENT_MODELS[targetAgent];
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
      agentId: targetAgent,
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
      agentId: targetAgent,
      provider: currentModelConfig.provider,
      model: currentModelConfig.model,
      status: 'streaming',
    };

    const updatedChat = [...(messages[targetAgent] || []), userMessage];
    setMessages((prev) => ({
      ...prev,
      [targetAgent]: [...updatedChat, assistantMessage],
    }));

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    const requestPayload = {
      agentId: targetAgent,
      provider: currentModelConfig.provider,
      model: currentModelConfig.model,
      messages: updatedChat.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      providerConfig: {
        baseUrl: providerConfig.baseUrl,
      },
      fallbacks: (settings.fallbacks || []).filter(f => settings.providers[f.provider]?.enabled && f.model?.trim()).map(f => ({ provider: f.provider, model: f.model, baseUrl: settings.providers[f.provider]?.baseUrl })),
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
              if (data.reset) {
                accumulatedText = '';
                setMessages(prev => ({ ...prev, [targetAgent]: prev[targetAgent].map(m => m.id === assistantPlaceholderId ? { ...m, content: '', provider: undefined, model: undefined } : m) }));
              } else if (data.answeringModel) {
                setMessages(prev => ({ ...prev, [targetAgent]: prev[targetAgent].map(m => m.id === assistantPlaceholderId ? { ...m, provider: data.answeringModel.provider, model: data.answeringModel.model } : m) }));
              } else if (data.progress) {
                setMessages(prev => ({ ...prev, [targetAgent]: prev[targetAgent].map(m => m.id === assistantPlaceholderId ? { ...m, progress: String(data.progress) } : m) }));
              } else if (data.toolCard) {
                setMessages(prev => ({ ...prev, [targetAgent]: prev[targetAgent].map(m => {
                  if (m.id !== assistantPlaceholderId) return m;
                  const cards = [...(m.toolCards || [])];
                  const index = cards.findIndex(card => card.id === data.toolCard.id);
                  if (index < 0) cards.push(data.toolCard); else cards[index] = data.toolCard;
                  return { ...m, toolCards: cards };
                }) }));
              } else if (data.error) {
                streamError = data.error;
              } else if (data.text) {
                accumulatedText += data.text;
                setMessages((prev) => ({
                  ...prev,
                  [targetAgent]: prev[targetAgent].map((m) =>
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

      // If still empty or error occurred:
      if (!accumulatedText.trim()) {
        const emptyMsg =
          streamError ||
          'The model returned an empty response. Try again or switch the model in Settings';
        setMessages((prev) => ({
          ...prev,
          [targetAgent]: prev[targetAgent].map((m) =>
            m.id === assistantPlaceholderId
              ? { ...m, content: emptyMsg, status: 'error', error: emptyMsg }
              : m
          ),
        }));
        window.islandChat?.status({ phase: 'error', agent: targetAgent, text: emptyMsg.slice(0, 1000), id: islandId });
        return;
      }

      window.islandChat?.status({ phase: 'result', agent: targetAgent, text: accumulatedText.slice(0, 1000), id: islandId });
      // Mark complete
      setMessages((prev) => ({
        ...prev,
        [targetAgent]: prev[targetAgent].map((m) =>
          m.id === assistantPlaceholderId
            ? { ...m, content: accumulatedText, progress: undefined, status: 'complete' }
            : m
        ),
      }));

      if (settings.soundEffects) {
        soundFX.playReceive(targetAgent);
      }

      if (settings.speechSynthesis && accumulatedText) {
        speakText(accumulatedText, targetAgent, settings.voiceSpeed);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        window.islandChat?.status({ phase: 'error', agent: targetAgent, text: 'Generation stopped.', id: islandId });
        setMessages((prev) => ({
          ...prev,
          [targetAgent]: prev[targetAgent].map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content: `${m.content}${m.content ? '\n\n' : ''}(Stopped by user. Some actions may already have completed; check the tool cards and undo log.)`,
                  progress: undefined,
                  toolCards: m.toolCards?.map(card => card.status === 'running' ? { ...card, status:'cancelled', error:'Stopped; some actions may already have completed. Check the undo log.' } : card),
                  status: 'complete',
                }
              : m
          ),
        }));
      } else {
        const errorMsg =
          err?.message ||
          `Failed to communicate with ${PROVIDERS_META[currentModelConfig.provider]?.name || 'provider'}. Check your API key in Settings.`;
        window.islandChat?.status({ phase: 'error', agent: targetAgent, text: errorMsg.slice(0, 1000), id: islandId });
        setMessages((prev) => ({
          ...prev,
          [targetAgent]: prev[targetAgent].map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content: errorMsg,
                  progress: undefined,
                  toolCards: m.toolCards?.map(card => card.status === 'running' ? { ...card, status:'failed', error:'Request ended; some actions may already have completed. Check the undo log.' } : card),
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

  const islandCommandRef = useRef(handleSendMessage);
  islandCommandRef.current = handleSendMessage;
  useEffect(() => {
    if (!window.islandChat) return;
    const offCommand = window.islandChat.onCommand(({ agent, text, id }) => {
      setActiveAgentId(agent);
      void islandCommandRef.current(text, agent, id);
    });
    const offAgent = window.islandChat.onAgent(agent => setActiveAgentId(agent));
    return () => { offCommand(); offAgent(); };
  }, []);
  useEffect(() => { window.islandChat?.activeAgent(activeAgentId); }, [activeAgentId]);
  useEffect(() => { window.islandChat?.voiceSetting(settings.sendVoiceImmediately); }, [settings.sendVoiceImmediately]);

  useEffect(() => window.browserControl?.onStop(() => abortControllerRef.current?.abort()), []);

  // Stop generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      void window.browserControl?.stop().catch(() => {});
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
      if (settings.confettiEffects) confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
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
      if (settings.confettiEffects) confetti({ particleCount: 50, spread: 80, origin: { y: 0.7 } });
    } catch {}
  };

  // Reset all data
  const handleResetAllData = async () => {
    try {
      if (!settingsReady) throw new Error('Secure migration must complete before resetting data.');
      if (window.secureKeys) {
        await window.secureKeys.clear();
        setSavedKeys({});
      }
    } catch {
      setKeyStorageError('Could not remove secure keys. Reset was cancelled.');
      return;
    }
    setMessages(INITIAL_MESSAGES);
    setSettings(DEFAULT_SETTINGS);
    setAgentModels(DEFAULT_AGENT_MODELS);
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_SETTINGS);
    localStorage.removeItem(STORAGE_KEY_AGENT_MODELS);
    setIsSettingsOpen(false);
  };

  const streamingMessage = [...activeMessages].reverse().find(message => message.status === 'streaming');
  const activeCharacterStatus = voicePhase === 'recording' || voicePhase === 'requesting' ? 'listening' : voicePhase === 'transcribing' ? 'typing' : isGenerating && streamingMessage ? (streamingMessage.content.trim() ? 'working' : 'typing') : 'online';

  const currentProviderConfig = settings.providers[activeModelSelection.provider];
  const isCurrentProviderKeyMissing =
    activeModelSelection.provider !== 'ollama' &&
    !savedKeys[activeModelSelection.provider] &&
    !envKeys[activeModelSelection.provider];

  return (
    <div className={`app-shell theme-${activeAgentId}`}>
      {toolApproval && <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-5" role="alertdialog" aria-modal="true" aria-labelledby="approval-title">
        <div className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl border border-cyan-300/30 bg-[#11182a] p-5 text-white shadow-2xl">
          <h2 id="approval-title" className="text-lg font-bold">Approve {toolApproval.oneTime ? 'browser' : 'file'} action: {toolApproval.name}</h2>
          <p className="text-sm text-slate-300 mt-2">{toolApproval.oneTime ? 'Review the site and exact action before approving. Browser pages can have unintended effects.' : toolApproval.name === 'rename_folder_batch' ? `Rename ${toolApproval.renames?.length || 0} folders in one batch.` : toolApproval.name === 'delete_file' ? 'Move this file to the Recycle Bin.' : toolApproval.name === 'move_file' ? 'Move this file to the destination.' : toolApproval.name === 'copy_file' ? 'Copy this file to the destination without overwriting.' : toolApproval.name === 'create_folder' ? 'Create this folder.' : toolApproval.overwrite ? 'Replace the existing file with this exact content.' : 'Create this file with this exact content.'}</p>
          <pre className="mt-3 max-h-[48vh] overflow-auto rounded-xl bg-black/30 p-3 text-xs whitespace-pre-wrap break-all select-text">{toolApproval.name === 'rename_folder_batch' ? toolApproval.renames?.map(r => `${r.source} → ${r.destination}`).join('\n') : JSON.stringify({ source:toolApproval.source, ...(toolApproval.destination ? {destination:toolApproval.destination} : {}), ...toolApproval.arguments }, null, 2)}</pre>
          <div className="mt-4 flex flex-wrap gap-2">{([['approve',toolApproval.name === 'rename_folder_batch' ? 'Approve all' : 'Approve'],['deny','Deny'],['always',toolApproval.name === 'rename_folder_batch' ? 'Always allow renames in these parent folders' : 'Always allow this kind of action in this folder']] as const).filter(([choice]) => !toolApproval.oneTime || choice !== 'always').map(([choice,label]) => <button key={choice} type="button" onClick={() => window.toolApprovals?.decide(toolApproval.id, choice)} className="rounded-xl bg-white/10 px-3 py-2 text-xs hover:bg-white/20">{label}</button>)}</div>
          <button type="button" onClick={handleStopGeneration} className="mt-3 text-xs text-rose-300 underline">Stop request</button>
          {['move_file','copy_file'].includes(toolApproval.name) && <p className="mt-2 text-xs text-slate-400">Always allow applies to this action and this source/destination folder pair.</p>}
        </div>
      </div>}
      {/* Desktop Window Title Header with Multi-Provider Model Dropdown */}
      <DesktopHeader
        activeAgent={activeAgent}
        onOpenQuickSwitcher={() => setIsQuickSwitcherOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        selectedModel={activeModelSelection}
        onSelectModel={handleSelectModelForActiveAgent}
        providers={settings.providers}
        openRouterModels={openRouterModels}
        isFetchingOpenRouter={isFetchingOpenRouter}
        openRouterError={openRouterError}
        onRefreshOpenRouter={() => fetchOpenRouterModels(true)}
        ollamaModels={ollamaModels}
        isFetchingOllama={isFetchingOllama}
        onRefreshOllama={() => fetchOllamaModels()}
      />

      {updateState.status === 'ready' && <div role="status" className="flex items-center justify-center gap-3 px-4 py-2 bg-[#1d3046] text-sm text-white">
        <span>Update ready. Restart to install</span>
        <button type="button" onClick={() => window.desktopUpdates?.restart()} className="rounded-full bg-[#B5DEFF] text-[#0A1020] px-4 py-1 text-xs font-bold">Restart</button>
        {updateState.restartError && <span className="text-xs text-amber-200">{updateState.restartError}</span>}
      </div>}
      {/* Main Desktop Container: Sidebar + Chat Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <Sidebar activeAgentId={activeAgentId} onSelectAgent={handleSelectAgent} providers={settings.providers} activeStatus={activeCharacterStatus} />

        {/* Chat Main Area */}
        <main className="chat-main">
          <div className="chat-heading">
            <div className="chat-heading-title"><Avatar agentId={activeAgentId} size="md" status={activeCharacterStatus} /><div><span className="eyebrow">YOUR CONVERSATION</span><h1>Chat with {activeAgent.name} <span className="heading-dot">✳</span></h1><p>{isHanex ? 'A little clarity, whenever you need it.' : 'A little inspiration, whenever you need it.'}</p></div></div>
            <div className="heading-actions">
              {window.browserControl && <button type="button" title="Open a separate browser to sign in yourself" onClick={async () => { setUndoMessage(''); try { await window.browserControl!.open(); setUndoMessage('Separate browser opened. Sign in yourself, then enable browser control. Never share passwords in chat.'); } catch (e: any) { setUndoMessage(e?.message || 'Could not open the browser.'); } }} className="text-xs rounded-xl bg-white/10 px-3 py-2">Open browser</button>}
              {window.browserControl && <button type="button" onClick={async () => { try { await window.browserControl!.enable(); setUndoMessage('Agent browser control enabled. Use the island Stop button to end it.'); } catch (e:any) { setUndoMessage(e?.message || 'Could not enable browser control.'); } }} className="text-xs rounded-xl bg-white/10 px-3 py-2">Enable browser control</button>}
              {window.toolApprovals && <button type="button" disabled={undoBusy || isGenerating} title="Undo last rename batch" onClick={async () => { setUndoBusy(true); setUndoMessage(''); try { const result = await window.toolApprovals!.undoRenames(); setUndoMessage(`Undid ${result.count} folder rename(s).`); } catch (e: any) { setUndoMessage(e?.message || 'Undo failed.'); } finally { setUndoBusy(false); } }} className="text-xs rounded-xl bg-white/10 px-3 py-2 disabled:opacity-50">Undo last batch</button>}
              <button onClick={() => { const prompt = activeAgent.suggestedPrompts[Math.floor(Math.random() * activeAgent.suggestedPrompts.length)]; handleSendMessage(prompt.prompt); }} disabled={isGenerating} title="Send a random prompt starter" aria-label="Send a random prompt starter"><Sparkles size={17} /></button>
              <button onClick={() => handleExportChat(activeAgentId)} title="Export chat history" aria-label="Export chat history"><Download size={17} /></button>
              <button onClick={() => handleClearChat(activeAgentId)} title="Clear this conversation" aria-label="Clear this conversation"><Trash2 size={17} /></button>
            </div>
          </div>

          {undoMessage && <p role="status" className="px-5 py-2 text-xs text-cyan-200">{undoMessage}</p>}
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
            {activeMessages.length <= 2 && (
              <div className="welcome-panel">
                <div className="welcome-avatar"><Avatar agentId={activeAgent.id} size="2xl" status={isGenerating ? 'typing' : 'online'} /></div>
                <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
                <h2>Good to see you <span>here.</span></h2>
                <p>Meet {activeAgent.name}, your {isHanex ? 'thoughtful partner for making sense of things' : 'creative partner for wherever ideas take you'}.</p>
                <div className="starter-label">NOT SURE WHERE TO START?</div>
                <div className="starter-grid">
                  {activeAgent.suggestedPrompts.map((p, idx) => (
                    <button key={idx} onClick={() => handleSendMessage(p.prompt)} disabled={isGenerating}>
                      <Sparkles size={15} /><span>{p.title}</span><span className="starter-arrow">↗</span>
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
            sendVoiceImmediately={settings.sendVoiceImmediately}
            onVoicePhaseChange={setVoicePhase}
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
        updateState={updateState}
        onCheckUpdates={() => window.desktopUpdates?.check().then(setUpdateState).catch(() => {})}
        savedKeys={savedKeys}
        secureStorageAvailable={Boolean(window.secureKeys) && settingsReady}
        keyStorageError={keyStorageError}
        onSaveKey={saveSecureKey}
        onRemoveKey={removeSecureKey}
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
