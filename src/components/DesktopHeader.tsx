import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Settings,
  ChevronDown,
  Check,
  Cpu,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
  Globe,
  HardDrive,
  Filter,
} from 'lucide-react';
import { AgentId, AgentProfile, ProviderId, ProviderSettings, ModelOption, AgentModelSelection } from '../types';
import { AGENTS } from '../data/agents';
import { PROVIDERS_META, DEFAULT_PROVIDER_MODELS } from '../data/models';
import { Avatar } from './Avatar';

interface DesktopHeaderProps {
  activeAgent: AgentProfile;
  onOpenQuickSwitcher: () => void;
  onOpenSettings: () => void;
  selectedModel: AgentModelSelection;
  onSelectModel: (selection: AgentModelSelection) => void;
  providers: Record<ProviderId, ProviderSettings>;
  openRouterFreeOnly: boolean;
  onToggleFreeOnly: () => void;
  ollamaModels: ModelOption[];
  isFetchingOllama: boolean;
  onRefreshOllama: () => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  activeAgent,
  onOpenQuickSwitcher,
  onOpenSettings,
  selectedModel,
  onSelectModel,
  providers,
  openRouterFreeOnly,
  onToggleFreeOnly,
  ollamaModels,
  isFetchingOllama,
  onRefreshOllama,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isHanex = activeAgent.id === 'hanex';

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getProviderIcon = (provider: ProviderId) => {
    switch (provider) {
      case 'gemini':
        return <Zap className="w-3.5 h-3.5 text-sky-400" />;
      case 'openai':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400" />;
      case 'anthropic':
        return <Cpu className="w-3.5 h-3.5 text-amber-400" />;
      case 'openrouter':
        return <Globe className="w-3.5 h-3.5 text-purple-400" />;
      case 'ollama':
        return <HardDrive className="w-3.5 h-3.5 text-orange-400" />;
    }
  };

  // Build model list for enabled providers
  const enabledProvidersList = (['gemini', 'openai', 'anthropic', 'openrouter', 'ollama'] as ProviderId[]).filter(
    (p) => providers[p]?.enabled
  );

  const getModelsForProvider = (p: ProviderId): ModelOption[] => {
    if (p === 'ollama') {
      return ollamaModels.length > 0 ? ollamaModels : DEFAULT_PROVIDER_MODELS.ollama;
    }
    const list = DEFAULT_PROVIDER_MODELS[p] || [];
    if (p === 'openrouter' && openRouterFreeOnly) {
      return list.filter((m) => m.isFree);
    }
    return list;
  };

  // Find current model's display name
  const currentProviderMeta = PROVIDERS_META[selectedModel.provider];
  const allCurrentModels = getModelsForProvider(selectedModel.provider);
  const currentModelOption = allCurrentModels.find((m) => m.id === selectedModel.model);
  const currentModelDisplayName = currentModelOption?.name || selectedModel.model;

  return (
    <header className="app-header">
      <div className="header-intro"><span className="header-sparkle">✳</span><span>YOUR SPACE TO THINK <b> / </b> <strong>Chat</strong></span></div>

      {/* Right: Model Dropdown & Quick Switch */}
      <div className="flex items-center gap-2 relative">
        {/* Model Selector Dropdown Trigger */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition cursor-pointer text-xs font-medium ${
              isDropdownOpen
                ? isHanex
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                  : 'bg-pink-500/15 border-pink-500/40 text-pink-200'
                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
            title={`Active model for ${activeAgent.name}: ${currentModelDisplayName}`}
          >
            {getProviderIcon(selectedModel.provider)}
            <span className="max-w-[130px] sm:max-w-[170px] truncate font-mono text-[11px]">
              {currentModelDisplayName}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Popover Dropdown Menu */}
          {isDropdownOpen && (
            <div
              className={`absolute right-0 top-full mt-2 w-[min(20rem,85vw)] sm:w-96 rounded-2xl bg-[#0c1220] border border-white/15 shadow-2xl overflow-hidden z-50 backdrop-blur-2xl flex flex-col max-h-[80vh] ${
                isHanex ? 'shadow-cyan-950/50' : 'shadow-pink-950/50'
              }`}
            >
              {/* Dropdown Header */}
              <div className="p-3 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Select Model for {activeAgent.name}</span>
                    <span
                      className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold ${
                        isHanex ? 'bg-cyan-500/20 text-cyan-300' : 'bg-pink-500/20 text-pink-300'
                      }`}
                    >
                      {isHanex ? 'Boy' : 'Girl'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">Each agent remembers its chosen model independently</p>
                </div>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="Configure Providers in Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Special Filters / Actions Bar */}
              {(providers.openrouter?.enabled || providers.ollama?.enabled) && (
                <div className="px-3 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between gap-2 text-xs">
                  {providers.openrouter?.enabled && (
                    <button
                      onClick={onToggleFreeOnly}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                        openRouterFreeOnly
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-white/5 text-slate-400 border-white/5 hover:text-slate-200'
                      }`}
                      title="Show only free tier models on OpenRouter"
                    >
                      <Filter className="w-3 h-3" />
                      <span>Free Models Only</span>
                      {openRouterFreeOnly && <Check className="w-3 h-3 ml-0.5 text-purple-400" />}
                    </button>
                  )}

                  {providers.ollama?.enabled && (
                    <button
                      onClick={onRefreshOllama}
                      disabled={isFetchingOllama}
                      className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-orange-500/10 text-orange-300 border border-orange-500/20 hover:bg-orange-500/20 transition cursor-pointer disabled:opacity-50"
                      title="Fetch installed models from Ollama server"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingOllama ? 'animate-spin' : ''}`} />
                      <span>{isFetchingOllama ? 'Scanning...' : 'Sync Ollama'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Models List grouped by Provider */}
              <div className="overflow-y-auto p-2 space-y-3 flex-1 text-xs">
                {enabledProvidersList.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 space-y-2">
                    <p>All providers are currently disabled.</p>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenSettings();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition cursor-pointer text-xs"
                    >
                      Enable Providers in Settings
                    </button>
                  </div>
                ) : (
                  enabledProvidersList.map((p) => {
                    const meta = PROVIDERS_META[p];
                    const models = getModelsForProvider(p);

                    return (
                      <div key={p} className="space-y-1">
                        <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="flex items-center gap-1.5">
                            {getProviderIcon(p)}
                            <span>{meta.name}</span>
                          </span>
                          <span className="font-mono text-[9px] text-slate-500">
                            {models.length} model{models.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          {models.length === 0 ? (
                            <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                              {p === 'ollama'
                                ? 'No local models detected. Make sure Ollama is running and has pulled models.'
                                : 'No matching models available.'}
                            </div>
                          ) : (
                            models.map((m) => {
                              const isSelected =
                                selectedModel.provider === p && selectedModel.model === m.id;

                              return (
                                <button
                                  key={m.id}
                                  onClick={() => {
                                    onSelectModel({ provider: p, model: m.id });
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition cursor-pointer group ${
                                    isSelected
                                      ? isHanex
                                        ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200'
                                        : 'bg-pink-950/60 border border-pink-500/40 text-pink-200'
                                      : 'hover:bg-white/5 text-slate-300 hover:text-white border border-transparent'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="font-semibold text-xs truncate">{m.name}</span>
                                      {m.badge && (
                                        <span
                                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium ${
                                            m.isFree
                                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                              : 'bg-white/10 text-slate-300'
                                          }`}
                                        >
                                          {m.badge}
                                        </span>
                                      )}
                                    </div>
                                    {m.description && (
                                      <p className="text-[10px] text-slate-400 truncate leading-tight">
                                        {m.description}
                                      </p>
                                    )}
                                  </div>

                                  {isSelected && (
                                    <Check
                                      className={`w-4 h-4 flex-shrink-0 ${
                                        isHanex ? 'text-cyan-400' : 'text-pink-400'
                                      }`}
                                    />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Dropdown Footer */}
              <div className="p-2.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400">Provider keys stored locally</span>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenSettings();
                  }}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition cursor-pointer"
                >
                  <span>Manage Providers</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button onClick={onOpenQuickSwitcher} className="header-settings" title="Quick switcher" aria-label="Quick switcher"><Search className="w-4 h-4" /></button>
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="header-settings"
          title="Open Settings &amp; Models"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
