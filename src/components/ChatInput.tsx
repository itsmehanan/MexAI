import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Square, Sparkles, CornerDownLeft, Eraser } from 'lucide-react';
import { AgentProfile } from '../types';

interface ChatInputProps {
  agent: AgentProfile;
  onSend: (text: string) => void;
  onStop?: () => void;
  isGenerating: boolean;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  agent,
  onSend,
  onStop,
  isGenerating,
  onSelectPrompt,
}) => {
  const [text, setText] = useState('');
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isHanex = agent.id === 'hanex';

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (!text.trim() || isGenerating) return;
    onSend(text.trim());
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto px-4 pb-4">
      {/* Prompt Suggestions Popover */}
      {showPromptsMenu && (
        <div
          className={`absolute bottom-full mb-3 left-4 right-4 p-3 rounded-2xl backdrop-blur-xl border shadow-2xl z-20 ${
            isHanex
              ? 'bg-[#0c1322]/95 border-cyan-500/30 shadow-cyan-950/40'
              : 'bg-[#1a0f1e]/95 border-pink-500/30 shadow-pink-950/40'
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5">
              <Sparkles className={`w-3.5 h-3.5 ${isHanex ? 'text-cyan-400' : 'text-pink-400'}`} />
              {agent.name}'s Recommended Starters
            </span>
            <button
              onClick={() => setShowPromptsMenu(false)}
              className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {agent.suggestedPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSelectPrompt(p.prompt);
                  setShowPromptsMenu(false);
                }}
                className={`text-left p-2.5 rounded-xl border transition cursor-pointer text-xs group ${
                  isHanex
                    ? 'bg-slate-900/60 border-cyan-500/20 hover:border-cyan-400 hover:bg-cyan-950/30 text-slate-200'
                    : 'bg-slate-900/60 border-pink-500/20 hover:border-pink-400 hover:bg-pink-950/30 text-slate-200'
                }`}
              >
                <div className={`font-semibold mb-0.5 ${isHanex ? 'text-cyan-300' : 'text-pink-300'}`}>
                  {p.title}
                </div>
                <div className="text-slate-400 text-[11px] line-clamp-2 leading-tight">
                  {p.prompt}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Desktop Input Container */}
      <div
        className={`relative rounded-2xl backdrop-blur-xl border transition-all duration-300 shadow-2xl ${
          isHanex
            ? 'bg-[#0f172a]/90 border-cyan-500/30 focus-within:border-cyan-400 focus-within:shadow-[0_0_25px_-5px_rgba(6,182,212,0.35)]'
            : 'bg-[#18111e]/90 border-pink-500/30 focus-within:border-pink-400 focus-within:shadow-[0_0_25px_-5px_rgba(244,63,94,0.35)]'
        }`}
      >
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name} (${isHanex ? 'calm & practical' : 'warm & creative'})...`}
            rows={1}
            className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none text-[14px] leading-relaxed max-h-[180px] min-h-[44px] py-1 px-1"
          />

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1">
            <div className="flex items-center gap-1.5">
              {/* Starters suggestions toggle */}
              <button
                type="button"
                onClick={() => setShowPromptsMenu((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer border ${
                  showPromptsMenu
                    ? isHanex
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-pink-500/20 text-pink-300 border-pink-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-transparent'
                }`}
                title="Ideas & Starters"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Starters</span>
              </button>

              {/* Clear draft */}
              {text.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
                  title="Clear text"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>
              )}

              <span className="text-[11px] text-slate-500 hidden md:inline ml-2 select-none">
                Shift + Enter for new line
              </span>
            </div>

            <div className="flex items-center gap-2">
              {text.length > 0 && (
                <span className="text-[10px] text-slate-500 select-none">
                  {text.length} chars
                </span>
              )}

              {/* Stop Button when streaming */}
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white font-medium text-xs transition cursor-pointer shadow-md shadow-rose-950/40"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                /* Send Button */
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!text.trim()}
                  className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-200 cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                    isHanex
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-950/40 active:scale-95'
                      : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500 shadow-pink-950/40 active:scale-95'
                  }`}
                  title="Send message (Enter)"
                >
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
