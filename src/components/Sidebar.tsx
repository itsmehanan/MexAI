import React from 'react';
import { AgentId, ProviderSettings, ProviderId } from '../types';
import { AGENTS } from '../data/agents';
import { Avatar } from './Avatar';

interface SidebarProps {
  activeAgentId: AgentId;
  onSelectAgent: (id: AgentId) => void;
  providers: Record<ProviderId, ProviderSettings>;
  isGenerating: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeAgentId, onSelectAgent, providers, isGenerating }) => {
  const enabledCount = Object.values(providers).filter(p => p.enabled).length;
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand"><div className="brand-mark"><span /><span /></div><div className="sidebar-copy"><strong>hanex <span>&</span> shumex</strong><small>YOUR AI COMPANIONS</small></div></div>
      <div className="sidebar-label">YOUR COMPANIONS <span>02</span></div>
      <nav className="agent-list" aria-label="Choose a companion">
        {(['hanex', 'shumex'] as AgentId[]).map(id => (
          <button key={id} onClick={() => onSelectAgent(id)} className={`agent-button ${activeAgentId === id ? 'selected' : ''}`} aria-current={activeAgentId === id ? 'true' : undefined} title={AGENTS[id].name}>
            <Avatar agentId={id} size="md" status={activeAgentId === id && isGenerating ? 'typing' : 'online'} />
            <span className="sidebar-copy agent-copy"><strong>{AGENTS[id].name}</strong><small>{id === 'hanex' ? 'Thoughtful & practical' : 'Warm & creative'}</small></span>
            {activeAgentId === id && <span className="selected-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-status"><span className="status-dot" /><span className="sidebar-copy">{enabledCount} provider{enabledCount === 1 ? '' : 's'} active</span></div>
    </aside>
  );
};
