import React from 'react';
import { motion } from 'motion/react';
import { AgentId } from '../types';
import { Avatar } from './Avatar';

interface TypingIndicatorProps {
  agentId: AgentId;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ agentId }) => {
  const isHanex = agentId === 'hanex';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 my-4 px-4 max-w-3xl mx-auto"
    >
      <Avatar agentId={agentId} size="sm" showStatus={true} status="typing" />
      <div
        className={`px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-3 backdrop-blur-md border shadow-lg ${
          isHanex
            ? 'bg-slate-900/80 border-cyan-500/30 text-cyan-200 shadow-cyan-950/20'
            : 'bg-slate-900/80 border-pink-500/30 text-pink-200 shadow-pink-950/20'
        }`}
      >
        <span className="text-xs font-medium tracking-wide">
          {isHanex ? 'Hanex is analyzing' : 'Shumex is creating'}
        </span>
        <div className="flex items-center gap-1.5 py-0.5">
          <motion.span
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            className={`w-1.5 h-1.5 rounded-full ${isHanex ? 'bg-cyan-400' : 'bg-pink-400'}`}
          />
          <motion.span
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
            className={`w-1.5 h-1.5 rounded-full ${isHanex ? 'bg-cyan-400' : 'bg-pink-400'}`}
          />
          <motion.span
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
            className={`w-1.5 h-1.5 rounded-full ${isHanex ? 'bg-cyan-400' : 'bg-pink-400'}`}
          />
        </div>
      </div>
    </motion.div>
  );
};
