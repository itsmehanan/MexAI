import React from 'react';
import { Settings, Trash2, Download, Volume2, VolumeX, Sparkles, MessageSquare, Bot, Search } from 'lucide-react';
import { AgentId, AgentProfile, ChatMessage } from '../types';
import { AGENTS } from '../data/agents';
import { Avatar } from './Avatar';

interface SidebarProps {
  activeAgentId: AgentId;
  onSelectAgent: (id: AgentId) => void;
  messages: Record<AgentId, ChatMessage[]>;
  onClearChat: (id: AgentId) => void;
  onExportChat: (id: AgentId) => void;
  onOpenSettings: () => void;
  onOpenQuickSwitcher: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  hasCustomKey: boolean;
  hasEnvKey: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeAgentId,
  onSelectAgent,
  messages,
  onClearChat,
  onExportChat,
  onOpenSettings,
  onOpenQuickSwitcher,
  soundEnabled,
  onToggleSound,
  hasCustomKey,
  hasEnvKey,
}) => {
  const activeAgent = AGENTS[activeAgentId];
  const isHanex = activeAgentId === 'hanex';

  return (
    <aside className="w-72 md:w-80 flex-shrink-0 h-full flex flex-col bg-[#080d17]/95 border-r border-white/10 select-none relative z-10">
      {/* Brand Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            {/* Dual intertwined glowing badges */}
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50">
              <span className="text-[11px] font-black text-white">H</span>
            </div>
            <div className="w-7 h-7 -ml-2.5 rounded-xl bg-gradient-to-tr from-rose-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-pink-950/50 border border-[#080d17]">
              <span className="text-[11px] font-black text-white">S</span>
            </div>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>Hanex &amp; Shumex</span>
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">Dual AI Companions</p>
          </div>
        </div>

        {/* Quick Search / Command shortcut */}
        <button
          onClick={onOpenQuickSwitcher}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition border border-white/5 cursor-pointer text-xs flex items-center gap-1"
          title="Quick Switcher (Cmd+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <kbd className="hidden lg:inline text-[9px] font-mono text-slate-400 bg-white/5 px-1 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>

      {/* Agents Selection List */}
      <div className="p-3">
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
          <span>AI Companions</span>
          <span className="text-[10px] font-normal text-slate-500">Click to switch</span>
        </div>

        <div className="space-y-2">
          {(['hanex', 'shumex'] as AgentId[]).map((id) => {
            const agent = AGENTS[id];
            const isSelected = activeAgentId === id;
            const agentMessages = messages[id] || [];
            const lastMsg = agentMessages[agentMessages.length - 1];

            return (
              <button
                key={id}
                onClick={() => onSelectAgent(id)}
                className={`w-full p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                  isSelected
                    ? id === 'hanex'
                      ? 'bg-gradient-to-r from-cyan-950/60 to-slate-900/90 border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                      : 'bg-gradient-to-r from-pink-950/60 to-slate-900/90 border-pink-500/50 shadow-lg shadow-pink-950/30'
                    : 'bg-slate-900/40 border-white/5 hover:border-white/15 hover:bg-slate-900/70'
                }`}
              >
                {/* Active side indicator glow bar */}
                {isSelected && (
                  <span
                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${
                      id === 'hanex' ? 'bg-cyan-400' : 'bg-pink-400'
                    }`}
                  />
                )}

                <div className="flex items-start gap-3">
                  <Avatar agentId={id} size="md" showStatus={true} status="online" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                        {agent.name}
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded-md font-semibold tracking-wider uppercase border ${
                            id === 'hanex'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                          }`}
                        >
                          {agent.id === 'hanex' ? 'Boy' : 'Girl'}
                        </span>
                      </span>

                      {/* Message count badge */}
                      <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.5 rounded-full bg-white/5">
                        {agentMessages.length} msgs
                      </span>
                    </div>

                    <div
                      className={`text-xs font-medium truncate mb-1 ${
                        id === 'hanex' ? 'text-cyan-400/90' : 'text-pink-400/90'
                      }`}
                    >
                      {agent.roleTitle}
                    </div>

                    {/* Last message preview */}
                    <div className="text-[11px] text-slate-400 truncate">
                      {lastMsg ? lastMsg.content.slice(0, 45) : agent.personality}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Conversation Overview Card */}
      <div className="mx-3 mt-1 p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex-1 flex flex-col justify-between overflow-hidden">
        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
            <span className="flex items-center gap-1.5">
              <Bot className={`w-3.5 h-3.5 ${isHanex ? 'text-cyan-400' : 'text-pink-400'}`} />
              Active Chat Profile
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                isHanex ? 'bg-cyan-950 text-cyan-300' : 'bg-pink-950 text-pink-300'
              }`}
            >
              {activeAgent.name}
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 mb-3">
            {activeAgent.description}
          </p>

          <div className="space-y-1.5 pt-2 border-t border-white/5 text-[11px] text-slate-400">
            <div className="flex justify-between items-center">
              <span>Theme:</span>
              <span className="capitalize font-semibold text-slate-200">
                {activeAgent.theme.primary} ({isHanex ? 'Blue' : 'Pink'})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Tone:</span>
              <span className="text-slate-200">{isHanex ? 'Calm & Practical' : 'Warm & Creative'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Voice Pitch:</span>
              <span className="text-slate-200 font-mono">{activeAgent.speechPitch}x</span>
            </div>
          </div>
        </div>

        {/* Action Buttons for current conversation */}
        <div className="pt-3 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={() => onClearChat(activeAgentId)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer"
            title="Clear current agent's chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <button
            onClick={() => onExportChat(activeAgentId)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 border border-white/5 transition cursor-pointer"
            title="Export chat history"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Footer Settings & Key Status */}
      <div className="p-3 border-t border-white/10 space-y-2 bg-[#060a12]/70">
        {/* API Key Status Pill */}
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition border cursor-pointer ${
            hasCustomKey
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/50'
              : hasEnvKey
              ? 'bg-blue-950/30 border-blue-500/30 text-blue-300 hover:bg-blue-950/50'
              : 'bg-amber-950/30 border-amber-500/30 text-amber-300 hover:bg-amber-950/50'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <span
              className={`w-2 h-2 rounded-full ${
                hasCustomKey || hasEnvKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="truncate font-medium">
              {hasCustomKey ? 'Custom API Key Active' : hasEnvKey ? 'Gemini Key Ready' : 'Add Gemini API Key'}
            </span>
          </div>
          <span className="text-[10px] uppercase font-bold text-slate-400">Setup</span>
        </button>

        {/* Quick Toolbar */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border ${
              soundEnabled
                ? 'bg-white/10 text-slate-200 border-white/10'
                : 'text-slate-500 hover:text-slate-300 border-transparent'
            }`}
            title={soundEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            <span className="text-[11px] font-medium">{soundEnabled ? 'FX On' : 'Muted'}</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 transition cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
