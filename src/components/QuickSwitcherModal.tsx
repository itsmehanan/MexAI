import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ArrowRight, Settings, Sparkles, Trash2, Bot, CornerDownLeft } from 'lucide-react';
import { AgentId } from '../types';
import { AGENTS } from '../data/agents';
import { Avatar } from './Avatar';

interface QuickSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent: (id: AgentId) => void;
  onOpenSettings: () => void;
  onSelectPrompt: (prompt: string) => void;
  activeAgentId: AgentId;
}

export const QuickSwitcherModal: React.FC<QuickSwitcherModalProps> = ({
  isOpen,
  onClose,
  onSelectAgent,
  onOpenSettings,
  onSelectPrompt,
  activeAgentId,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'switch-hanex',
      label: 'Switch to Hanex (Calm & Practical)',
      category: 'Agent',
      badge: 'Blue / Cyan',
      icon: <Avatar agentId="hanex" size="xs" />,
      perform: () => {
        onSelectAgent('hanex');
        onClose();
      },
    },
    {
      id: 'switch-shumex',
      label: 'Switch to Shumex (Warm & Creative)',
      category: 'Agent',
      badge: 'Pink / Rose',
      icon: <Avatar agentId="shumex" size="xs" />,
      perform: () => {
        onSelectAgent('shumex');
        onClose();
      },
    },
    {
      id: 'open-settings',
      label: 'Open App Settings & AI Model Providers',
      category: 'System',
      badge: 'Preferences',
      icon: <Settings className="w-4 h-4 text-cyan-400" />,
      perform: () => {
        onOpenSettings();
        onClose();
      },
    },
  ];

  // Add starters
  const starters = AGENTS[activeAgentId].suggestedPrompts.map((p, i) => ({
    id: `starter-${i}`,
    label: `Prompt: ${p.title} — "${p.prompt.slice(0, 50)}..."`,
    category: `${AGENTS[activeAgentId].name} Starters`,
    badge: 'Starter',
    icon: <Sparkles className="w-4 h-4 text-amber-400" />,
    perform: () => {
      onSelectPrompt(p.prompt);
      onClose();
    },
  }));

  const allItems = [...actions, ...starters].filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-lg bg-[#0e1422] border border-white/20 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center px-4 py-3 border-b border-white/10 gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or switch agent (Hanex, Shumex, Settings)..."
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="text-[10px] text-slate-400 bg-white/10 px-1.5 py-0.5 rounded font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No matching commands found.</div>
          ) : (
            allItems.map((item) => (
              <button
                key={item.id}
                onClick={item.perform}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/10 text-left transition cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0">{item.icon}</div>
                  <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                    {item.badge}
                  </span>
                  <CornerDownLeft className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};
