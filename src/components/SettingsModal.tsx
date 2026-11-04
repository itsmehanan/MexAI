import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Key,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ClipboardPaste,
  Sparkles,
  Volume2,
  Trash2,
  Download,
  RotateCcw,
  Sliders,
  Zap,
  Globe,
  HardDrive,
  Cpu,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { AppSettings, AgentId, ProviderId, ProviderSettings } from '../types';
import { PROVIDERS_META, DEFAULT_PROVIDER_MODELS } from '../data/models';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => void;
  onClearAgentChat: (id: AgentId) => void;
  onResetAllData: () => void;
  onExportAll: () => void;
  hasEnvKey: boolean;
  savedKeys: Record<string, boolean>;
  secureStorageAvailable: boolean;
  keyStorageError: string;
  onSaveKey: (id: ProviderId, key: string) => Promise<void>;
  onRemoveKey: (id: ProviderId) => Promise<void>;
  envKeys?: Record<string, boolean>;
  onRefreshOllama?: () => void;
  isFetchingOllama?: boolean;
  ollamaModelsCount?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onClearAgentChat,
  onResetAllData,
  onExportAll,
  hasEnvKey,
  savedKeys, secureStorageAvailable, keyStorageError, onSaveKey, onRemoveKey,
  envKeys = {},
  onRefreshOllama,
  isFetchingOllama = false,
  ollamaModelsCount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'models' | 'voice' | 'general' | 'data'>('models');
  const [customUrlDraft, setCustomUrlDraft] = useState(settings.providers.custom?.baseUrl || '');
  const [customUrlMessage, setCustomUrlMessage] = useState('');
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [keyMessage, setKeyMessage] = useState<Record<string, string>>({});

  const [testStates, setTestStates] = useState<
    Record<ProviderId, { status: 'idle' | 'testing' | 'success' | 'error'; message: string }>
  >({
    gemini: { status: 'idle', message: '' },
    openai: { status: 'idle', message: '' },
    anthropic: { status: 'idle', message: '' },
    openrouter: { status: 'idle', message: '' },
    ollama: { status: 'idle', message: '' },
    custom: { status: 'idle', message: '' },
  });

  if (!isOpen) return null;

  const handleUpdateProvider = (id: ProviderId, updates: Partial<ProviderSettings>) => {
    const current = settings.providers[id] || {
      id,
      enabled: id === 'gemini',
      apiKey: '',
      baseUrl: id === 'ollama' ? 'http://localhost:11434' : undefined,
    };
    const updatedProviders = {
      ...settings.providers,
      [id]: { ...current, ...updates },
    };
    onSaveSettings({ providers: updatedProviders });
  };

  const saveKey = async (id: ProviderId) => {
    try {
      await onSaveKey(id, draftKeys[id] || '');
      setDraftKeys(prev => ({ ...prev, [id]: '' }));
      setKeyMessage(prev => ({ ...prev, [id]: 'Key securely saved.' }));
    } catch { setKeyMessage(prev => ({ ...prev, [id]: 'Could not save key securely. Existing key was not changed.' })); }
  };
  const removeKey = async (id: ProviderId) => {
    try { await onRemoveKey(id); setDraftKeys(prev => ({ ...prev, [id]: '' })); setKeyMessage(prev => ({ ...prev, [id]: 'Key removed.' })); }
    catch { setKeyMessage(prev => ({ ...prev, [id]: 'Could not remove key.' })); }
  };

  const handleTestConnection = async (id: ProviderId) => {
    const prov = settings.providers[id] || { id, enabled: true, apiKey: '' };
    setTestStates((prev) => ({
      ...prev,
      [id]: { status: 'testing', message: `Validating connection to ${PROVIDERS_META[id].name}...` },
    }));

    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: id,
          model: id === 'custom' ? prov.customModel : undefined,
          baseUrl: prov.baseUrl || 'http://localhost:11434',
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTestStates((prev) => ({
          ...prev,
          [id]: { status: 'success', message: data.reply || 'Connection verified successfully!' },
        }));
      } else {
        setTestStates((prev) => ({
          ...prev,
          [id]: { status: 'error', message: data.error || 'Failed to authenticate connection.' },
        }));
      }
    } catch (err: any) {
      setTestStates((prev) => ({
        ...prev,
        [id]: { status: 'error', message: err?.message || 'Network error while testing connection.' },
      }));
    }
  };

  const getProviderIcon = (id: ProviderId) => {
    switch (id) {
      case 'gemini':
        return <Zap className="w-4 h-4 text-sky-400" />;
      case 'openai':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'anthropic':
        return <Cpu className="w-4 h-4 text-amber-400" />;
      case 'openrouter':
        return <Globe className="w-4 h-4 text-purple-400" />;
      case 'custom':
        return <Globe className="w-4 h-4 text-purple-400" />;
      case 'ollama':
        return <HardDrive className="w-4 h-4 text-orange-400" />;
    }
  };

  const providerList: ProviderId[] = ['gemini', 'openai', 'anthropic', 'openrouter', 'ollama', 'custom'];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl bg-[#0c1220] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#080d17]/90">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 via-purple-500 to-rose-500 text-white shadow-md">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">App Settings</h2>
                <p className="text-xs text-slate-400">Configure AI Model Providers, Voice, and Preferences</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center px-6 pt-3 border-b border-white/10 bg-slate-900/30 gap-2">
            {[
              { id: 'models', label: 'Models & Providers', icon: Cpu },
              { id: 'voice', label: 'Audio & Speech', icon: Volume2 },
              { id: 'general', label: 'Preferences', icon: Sparkles },
              { id: 'data', label: 'Data & Backup', icon: Trash2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
                    isActive
                      ? 'border-cyan-400 text-cyan-300 bg-white/5'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Body Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
            {/* TAB 1: MODELS & PROVIDERS */}
            {activeTab === 'models' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Connected AI Providers
                    </h3>
                    <p className="text-xs text-slate-400">
                      Desktop keys are encrypted by the operating system and never displayed after saving. In a browser, configure keys via server environment variables.
                    </p>
                  </div>

                  {settings.providers.openrouter?.enabled && (
                    <button
                      onClick={() =>
                        onSaveSettings({ openRouterFreeOnly: !settings.openRouterFreeOnly })
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                        settings.openRouterFreeOnly
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                      }`}
                      title="Filter OpenRouter models to free tier only"
                    >
                      <Filter className="w-3 h-3" />
                      <span>Free Models Only</span>
                      {settings.openRouterFreeOnly && <Check className="w-3 h-3 text-purple-400" />}
                    </button>
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-white/10 space-y-2">
                  <h4 className="font-bold text-sm">Fallback order</h4><p className="text-xs text-slate-400">On a 429, 503 or empty response, retry once, then try enabled entries in this order. Each fallback receives the conversation and may have different privacy or billing terms. Partial answers are not retried.</p>
                  {(settings.fallbacks || []).map((entry, index) => <div key={index} className="flex flex-wrap gap-2 items-center">
                    <select aria-label={`Fallback ${index + 1} provider`} value={entry.provider} onChange={e => { const next = [...settings.fallbacks]; next[index] = { ...entry, provider: e.target.value as ProviderId }; onSaveSettings({ fallbacks: next }); }} className="bg-slate-800 rounded-lg p-2 text-xs">{providerList.map(p => <option key={p} value={p}>{PROVIDERS_META[p].name}</option>)}</select>
                    <input aria-label={`Fallback ${index + 1} model`} value={entry.model} placeholder="Model name" onChange={e => { const next = [...settings.fallbacks]; next[index] = { ...entry, model: e.target.value }; onSaveSettings({ fallbacks: next }); }} className="bg-slate-800 rounded-lg p-2 text-xs flex-1 min-w-32" />
                    <button type="button" disabled={index === 0} onClick={() => { const next = [...settings.fallbacks]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onSaveSettings({ fallbacks: next }); }} className="text-xs disabled:opacity-30">↑</button>
                    <button type="button" disabled={index === settings.fallbacks.length - 1} onClick={() => { const next = [...settings.fallbacks]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onSaveSettings({ fallbacks: next }); }} className="text-xs disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => onSaveSettings({ fallbacks: settings.fallbacks.filter((_, i) => i !== index) })} className="text-xs text-rose-300">Remove</button>
                  </div>)}
                  <button type="button" onClick={() => onSaveSettings({ fallbacks: [...(settings.fallbacks || []), { provider: 'gemini', model: '' }] })} className="text-xs text-cyan-300">+ Add fallback</button>
                </div>
                {keyStorageError && <p role="alert" className="text-xs text-amber-300">{keyStorageError}</p>}
                <div className="space-y-3">
                  {providerList.map((id) => {
                    const meta = PROVIDERS_META[id];
                    const provConfig = settings.providers[id] || {
                      id,
                      enabled: id === 'gemini',
                      apiKey: '',
                      baseUrl: id === 'ollama' ? 'http://localhost:11434' : undefined,
                    };
                    const isEnabled = provConfig.enabled;
                    const test = testStates[id];
                    const hasEnv = Boolean(envKeys[id] || (id === 'gemini' && hasEnvKey));
                    const isOllama = id === 'ollama';

                    return (
                      <div
                        key={id}
                        className={`rounded-2xl border transition-all duration-200 p-4 ${
                          isEnabled
                            ? 'bg-slate-900/70 border-white/15 shadow-lg'
                            : 'bg-white/[0.01] border-white/5 opacity-60'
                        }`}
                      >
                        {/* Provider Header with On/Off Switch */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                              {getProviderIcon(id)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white">{meta.name}</span>
                                {hasEnv && (
                                  <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    Env Key Available
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">{meta.tagline}</p>
                            </div>
                          </div>

                          {/* Toggle Switch */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono">
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateProvider(id, { enabled: !isEnabled })}
                              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                                isEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                  isEnabled ? 'left-6' : 'left-1'
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Input & Testing Controls when Enabled */}
                        {isEnabled && (
                          <div className="space-y-3 pt-2 border-t border-white/5">
                            {id === 'custom' && <div className="space-y-2">
                              <label className="block text-xs text-slate-300">Provider name<input aria-label="Custom provider name" value={provConfig.customName || ''} onChange={e => handleUpdateProvider(id, { customName: e.target.value })} className="mt-1 w-full bg-[#0a0f1c] border border-white/15 rounded-xl px-3 py-2 text-xs text-white" /></label>
                              <label className="block text-xs text-slate-300">Model name<input aria-label="Custom model name" value={provConfig.customModel || ''} onChange={e => handleUpdateProvider(id, { customModel: e.target.value })} className="mt-1 w-full bg-[#0a0f1c] border border-white/15 rounded-xl px-3 py-2 text-xs text-white" /></label>
                              <label className="block text-xs text-slate-300">Base URL (HTTPS, or HTTP on localhost)<input aria-label="Custom base URL" value={customUrlDraft} onChange={e => setCustomUrlDraft(e.target.value)} className="mt-1 w-full bg-[#0a0f1c] border border-white/15 rounded-xl px-3 py-2 text-xs text-white" /></label>
                              <button type="button" disabled={!secureStorageAvailable} onClick={async () => { try { if (!window.secureKeys) throw new Error(); const url = await window.secureKeys.setCustomEndpoint(customUrlDraft); handleUpdateProvider('custom', { baseUrl: url }); setCustomUrlDraft(url); setCustomUrlMessage('Endpoint saved.'); } catch { setCustomUrlMessage('Could not save URL. Use HTTPS or localhost HTTP without credentials, query, or fragment.'); } }} className="px-3 py-1.5 rounded-full bg-white/10 text-xs disabled:opacity-40">Save endpoint</button> <span className="text-xs text-slate-400">{customUrlMessage}</span>
                            </div>}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                                  {isOllama ? 'Ollama Server URL' : `${meta.name} API Key`}
                                </label>
                                <span className="text-[10px] text-slate-500">{meta.keyHelp}</span>
                              </div>

                              {isOllama ? (
                                <input type="text" value={provConfig.baseUrl || 'http://localhost:11434'} onChange={e => handleUpdateProvider(id, { baseUrl: e.target.value })} className="w-full bg-[#0a0f1c] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white" />
                              ) : (
                                <div className="space-y-2">
                                  <input type="password" autoComplete="off" value={draftKeys[id] || ''} onChange={e => setDraftKeys(prev => ({ ...prev, [id]: e.target.value }))} disabled={!secureStorageAvailable} placeholder={savedKeys[id] ? '•••••••• (saved) — enter a new key to replace' : 'Enter API key'} aria-label={`${meta.name} API key`} className="w-full bg-[#0a0f1c] border border-white/15 focus:border-cyan-400 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder:text-slate-500 disabled:opacity-50" />
                                  <div className="flex items-center gap-2">
                                    <button type="button" disabled={!secureStorageAvailable || !draftKeys[id]?.trim()} onClick={() => saveKey(id)} className="px-3 py-1.5 rounded-full bg-cyan-600 text-white text-xs disabled:opacity-40">Save key</button>
                                    {savedKeys[id] && <button type="button" disabled={!secureStorageAvailable} onClick={() => removeKey(id)} className="px-3 py-1.5 rounded-full bg-white/10 text-white text-xs disabled:opacity-40">Remove key</button>}
                                    <span className="text-xs text-slate-400">{keyMessage[id] || (savedKeys[id] ? '•••••••• saved' : !secureStorageAvailable ? 'Desktop secure storage required' : 'Not saved')}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Test Results Banner */}
                            {test.status !== 'idle' && (
                              <div
                                className={`p-2.5 rounded-xl border flex items-start gap-2 text-xs ${
                                  test.status === 'success'
                                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                                    : test.status === 'error'
                                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                                    : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                                }`}
                              >
                                {test.status === 'success' ? (
                                  <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-400" />
                                ) : test.status === 'error' ? (
                                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-rose-400" />
                                ) : (
                                  <div className="w-3.5 h-3.5 mt-0.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin flex-shrink-0" />
                                )}
                                <span className="leading-tight">{test.message}</span>
                              </div>
                            )}

                            {/* Actions: Test Connection + Ollama Fetch */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleTestConnection(id)}
                                disabled={test.status === 'testing'}
                                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs border border-white/10 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {test.status === 'testing' ? (
                                  <>
                                    <div className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                                    <span>Testing...</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Test Connection</span>
                                  </>
                                )}
                              </button>

                              {isOllama && onRefreshOllama && (
                                <button
                                  type="button"
                                  onClick={onRefreshOllama}
                                  disabled={isFetchingOllama}
                                  className="px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 font-medium text-xs border border-orange-500/20 transition cursor-pointer flex items-center gap-1.5"
                                >
                                  <RefreshCw className={`w-3 h-3 ${isFetchingOllama ? 'animate-spin' : ''}`} />
                                  <span>
                                    {isFetchingOllama
                                      ? 'Scanning...'
                                      : `Fetch Installed Models (${ollamaModelsCount})`}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: VOICE & AUDIO */}
            {activeTab === 'voice' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div><h4 className="text-sm font-semibold text-white">Confetti Effects</h4><p className="text-xs text-slate-400">Celebrate when exporting conversations</p></div>
                  <button type="button" role="switch" aria-label="Confetti effects" aria-checked={settings.confettiEffects} onClick={() => onSaveSettings({ confettiEffects: !settings.confettiEffects })} className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${settings.confettiEffects ? 'bg-cyan-500' : 'bg-slate-700'}`}><span className={`absolute top-1 w-4 h-4 rounded-full bg-white ${settings.confettiEffects ? 'left-6' : 'left-1'}`} /></button>
                </div>
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Sound Effects</h4>
                    <p className="text-xs text-slate-400">Play subtle high-tech chimes on send, receive, and switch</p>
                  </div>
                  <button
                    onClick={() => onSaveSettings({ soundEffects: !settings.soundEffects })}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.soundEffects ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.soundEffects ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Text-to-Speech (TTS)</h4>
                    <p className="text-xs text-slate-400">Enable synthesized voice audio playback for Hanex and Shumex</p>
                  </div>
                  <button
                    onClick={() => onSaveSettings({ speechSynthesis: !settings.speechSynthesis })}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.speechSynthesis ? 'bg-rose-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.speechSynthesis ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">Speech Rate</span>
                    <span className="text-xs font-mono text-cyan-400">{settings.voiceSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.4"
                    step="0.05"
                    value={settings.voiceSpeed}
                    onChange={(e) => onSaveSettings({ voiceSpeed: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Deliberate (0.8x)</span>
                    <span>Standard (1.0x)</span>
                    <span>Brisk (1.4x)</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-white/10 bg-slate-900/40 text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">Agent Voice Personas:</p>
                  <p>• <strong>Hanex</strong>: Calm, measured, lower pitch (0.9x)</p>
                  <p>• <strong>Shumex</strong>: Warm, expressive, lively melodic pitch (1.25x)</p>
                </div>
              </div>
            )}

            {/* TAB 3: GENERAL PREFERENCES */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Dynamic Accent Switching</h4>
                    <p className="text-xs text-slate-400">
                      Automatically morph accent colors to Blue for Hanex &amp; Pink for Shumex
                    </p>
                  </div>
                  <button
                    onClick={() => onSaveSettings({ syncThemeWithAgent: !settings.syncThemeWithAgent })}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      settings.syncThemeWithAgent ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        settings.syncThemeWithAgent ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
                  <h4 className="text-sm font-semibold text-white">Independent Agent Memory</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Hanex and Shumex remember their own selected AI provider and model. You can pair Hanex with a pragmatic coding model (like GPT-4o or Qwen 2.5 Coder) and Shumex with an imaginative writer (like Claude 3.7 Sonnet or Gemini 3.8 Flash).
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: DATA & BACKUP */}
            {activeTab === 'data' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Export All Chat History</h4>
                    <p className="text-xs text-slate-400">Download conversations with Hanex &amp; Shumex as JSON</p>
                  </div>
                  <button
                    onClick={onExportAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Reset Hanex Chat</h4>
                    <p className="text-xs text-slate-400">Clear all messages with Hanex and restore greeting</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Clear all conversation history with Hanex?')) {
                        onClearAgentChat('hanex');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Hanex</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Reset Shumex Chat</h4>
                    <p className="text-xs text-slate-400">Clear all messages with Shumex and restore greeting</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Clear all conversation history with Shumex?')) {
                        onClearAgentChat('shumex');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Shumex</span>
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-500/20 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-rose-300">Factory Reset</h4>
                    <p className="text-xs text-rose-300/70">Wipe all stored provider keys, settings, and chats</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to reset all app settings and chat histories?')) {
                        onResetAllData();
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition cursor-pointer shadow-lg shadow-rose-950/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset All</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-white/10 bg-[#080d17]/90 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
