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
  ShieldAlert,
  Sparkles,
  Volume2,
  Trash2,
  Download,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { AppSettings, AgentId } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => void;
  onClearAgentChat: (id: AgentId) => void;
  onResetAllData: () => void;
  onExportAll: () => void;
  hasEnvKey: boolean;
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
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'api' | 'voice' | 'general' | 'data'>('api');

  if (!isOpen) return null;

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKeyInput(text.trim());
      }
    } catch {
      // Clipboard denied
    }
  };

  const handleTestKey = async () => {
    setTestStatus('testing');
    setTestMessage('Validating connection to Gemini API...');
    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTestStatus('success');
        setTestMessage('API Key is valid and connected to Gemini 3.8 Flash!');
        // Automatically save if valid
        onSaveSettings({ apiKey: apiKeyInput.trim() });
      } else {
        setTestStatus('error');
        setTestMessage(data.error || 'Failed to authenticate with Gemini API.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err?.message || 'Network error while testing API key.');
    }
  };

  const handleSaveKey = () => {
    onSaveSettings({ apiKey: apiKeyInput.trim() });
    setTestStatus('success');
    setTestMessage('Key saved locally.');
  };

  const handleClearKey = () => {
    setApiKeyInput('');
    onSaveSettings({ apiKey: '' });
    setTestStatus('idle');
    setTestMessage('');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-xl bg-[#0c1220] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#080d17]/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-rose-500 text-white shadow-md">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">App Settings</h2>
                <p className="text-xs text-slate-400">Configure Gemini API key, agents, voice, and data</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center px-6 pt-3 border-b border-white/10 bg-slate-900/30 gap-2">
            {[
              { id: 'api', label: 'Gemini API Key', icon: Key },
              { id: 'voice', label: 'Audio & Speech', icon: Volume2 },
              { id: 'general', label: 'Models & Layout', icon: Sparkles },
              { id: 'data', label: 'Data & Backup', icon: Trash2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
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

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
            {/* TAB 1: API KEY */}
            {activeTab === 'api' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Paste Your Gemini API Key
                  </label>
                  <p className="text-xs text-slate-400 mb-3">
                    Paste your personal Google Gemini API key below. Requests will be securely routed through the desktop server backend.
                  </p>

                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setTestStatus('idle');
                      }}
                      placeholder="AIzaSy..."
                      className="w-full bg-[#111928] border border-white/15 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none transition"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handlePasteKey}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        title="Paste from clipboard"
                      >
                        <ClipboardPaste className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status message */}
                {testStatus !== 'idle' && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                      testStatus === 'success'
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : testStatus === 'error'
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                    }`}
                  >
                    {testStatus === 'success' ? (
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                    ) : testStatus === 'error' ? (
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
                    ) : (
                      <div className="w-4 h-4 mt-0.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin flex-shrink-0" />
                    )}
                    <span className="leading-relaxed">{testMessage}</span>
                  </div>
                )}

                {/* Buttons for testing & saving */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleTestKey}
                    disabled={testStatus === 'testing' || (!apiKeyInput && !hasEnvKey)}
                    className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs transition border border-white/15 disabled:opacity-40 cursor-pointer text-center"
                  >
                    {testStatus === 'testing' ? 'Testing Connection...' : 'Test & Validate Key'}
                  </button>

                  <button
                    onClick={handleSaveKey}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs shadow-md shadow-cyan-950/40 transition cursor-pointer text-center"
                  >
                    Save API Key
                  </button>

                  {apiKeyInput && (
                    <button
                      onClick={handleClearKey}
                      className="py-2 px-3 rounded-xl text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 text-xs transition cursor-pointer"
                      title="Clear custom key"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Key Status Pill */}
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
                  <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Key Source</span>
                    {apiKeyInput ? (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Custom User Key
                      </span>
                    ) : hasEnvKey ? (
                      <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-500/30">
                        Built-in AI Studio Key
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30">
                        No Key Set
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    {apiKeyInput
                      ? 'Your custom key is stored safely in your browser localStorage and forwarded server-side for Gemini calls.'
                      : hasEnvKey
                      ? 'The app is using the pre-configured environment Gemini API key. You can override it anytime by pasting your own key above.'
                      : 'To talk to Hanex & Shumex, paste an API key from Google AI Studio (aistudio.google.com).'}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: VOICE & AUDIO */}
            {activeTab === 'voice' && (
              <div className="space-y-5">
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
                    <p className="text-xs text-slate-400">Enable voice audio playback for both Hanex and Shumex</p>
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

            {/* TAB 3: GENERAL & MODELS */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Default Gemini Model
                  </label>
                  <div className="space-y-2">
                    {[
                      {
                        id: 'gemini-3.8-flash',
                        name: 'Gemini 3.8 Flash',
                        badge: 'Recommended',
                        desc: 'State-of-the-art fast intelligence, balanced thinking, ideal for dual agents.',
                      },
                      {
                        id: 'gemini-3.1-flash-lite',
                        name: 'Gemini 3.1 Flash Lite',
                        badge: 'Ultra Fast',
                        desc: 'Extremely lightweight and low-latency for rapid conversational turns.',
                      },
                      {
                        id: 'gemini-flash-latest',
                        name: 'Gemini Flash Latest',
                        badge: 'Latest Release',
                        desc: 'General purpose fast flagship model.',
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onSaveSettings({ model: m.id })}
                        className={`w-full p-3 rounded-2xl border text-left transition cursor-pointer ${
                          settings.model === m.id
                            ? 'bg-cyan-950/40 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                            : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-white">{m.name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {m.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Dynamic Accent Switching</h4>
                    <p className="text-xs text-slate-400">Automatically switch window accent to Blue for Hanex &amp; Pink for Shumex</p>
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
                    <p className="text-xs text-rose-300/70">Wipe all stored keys, preferences, and chats</p>
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
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
