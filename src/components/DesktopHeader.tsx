import React from 'react';
import { ArrowLeftRight, Settings, Sparkles, ShieldCheck } from 'lucide-react';
import { AgentId, AgentProfile } from '../types';
import { AGENTS } from '../data/agents';
import { Avatar } from './Avatar';

interface DesktopHeaderProps {
  activeAgent: AgentProfile;
  onSwitchAgent: (id: AgentId) => void;
  onOpenSettings: () => void;
  model: string;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  activeAgent,
  onSwitchAgent,
  onOpenSettings,
  model,
}) => {
  const isHanex = activeAgent.id === 'hanex';
  const otherAgentId: AgentId = isHanex ? 'shumex' : 'hanex';
  const otherAgent = AGENTS[otherAgentId];

  return (
    <header className="h-14 px-4 bg-[#080d17]/90 border-b border-white/10 flex items-center justify-between select-none backdrop-blur-md relative z-10">
      {/* Left: Window Controls / Mac style traffic lights */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 mr-2">
          <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/50 cursor-pointer shadow-sm hover:opacity-80 transition" title="Close" />
          <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/50 cursor-pointer shadow-sm hover:opacity-80 transition" title="Minimize" />
          <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/50 cursor-pointer shadow-sm hover:opacity-80 transition" title="Maximize" />
        </div>
        <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
        <span className="text-xs font-semibold text-slate-300 hidden sm:inline tracking-tight">
          Hanex &amp; Shumex
        </span>
      </div>

      {/* Center: Active Agent Status Pill */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 shadow-inner">
        <Avatar agentId={activeAgent.id} size="xs" showStatus={true} status="online" />
        <span className="text-xs font-bold text-white tracking-tight">{activeAgent.name}</span>
        <span className="text-slate-500 text-[10px]">•</span>
        <span
          className={`text-[11px] font-medium hidden md:inline ${
            isHanex ? 'text-cyan-400' : 'text-pink-400'
          }`}
        >
          {activeAgent.roleTitle}
        </span>
      </div>

      {/* Right: Quick Agent Switcher & Settings */}
      <div className="flex items-center gap-2">
        {/* Model badge */}
        <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] font-mono text-slate-400">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>{model}</span>
        </div>

        {/* Switch Agent Button */}
        <button
          onClick={() => onSwitchAgent(otherAgentId)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-md ${
            isHanex
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
              : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
          }`}
          title={`Switch to ${otherAgent.name}`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Talk to {otherAgent.name}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer border border-white/5"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
