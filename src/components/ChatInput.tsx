import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Square, Sparkles, Eraser, Mic } from 'lucide-react';
import '../../electron/voice-recorder.js';
import { AgentProfile } from '../types';

interface ChatInputProps {
  agent: AgentProfile;
  onSend: (text: string) => void;
  onStop?: () => void;
  isGenerating: boolean;
  sendVoiceImmediately: boolean;
  onVoicePhaseChange?: (phase: VoicePhase) => void;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  agent,
  onSend,
  onStop,
  isGenerating,
  sendVoiceImmediately,
  onVoicePhaseChange,
  onSelectPrompt,
}) => {
  const [text, setText] = useState('');
  const [showPromptsMenu, setShowPromptsMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [voiceError, setVoiceError] = useState('');
  const voiceRef = useRef<ReturnType<typeof window.MexVoice.createVoiceRecorder> | null>(null);
  const latest = useRef({ onSend, isGenerating, sendVoiceImmediately, onVoicePhaseChange });
  latest.current = { onSend, isGenerating, sendVoiceImmediately, onVoicePhaseChange };
  useEffect(() => {
    const voice = window.MexVoice.createVoiceRecorder({
      transcribe: async (blob, signal) => {
        const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Transcription failed.');
        return body.text;
      },
      onState: phase => { setVoicePhase(phase); latest.current.onVoicePhaseChange?.(phase); },
      onError: setVoiceError,
      onResult: transcript => {
        if (latest.current.sendVoiceImmediately && !latest.current.isGenerating) latest.current.onSend(transcript);
        else {
          setText(previous => [previous.trim(), transcript].filter(Boolean).join(' '));
          if (latest.current.sendVoiceImmediately && latest.current.isGenerating) setVoiceError('A response is in progress; the transcript was kept in the message box.');
          textareaRef.current?.focus();
        }
      },
    });
    voiceRef.current = voice;
    const offHidden = window.islandChat?.onHidden(() => {
      if (voice.getState() !== 'idle') { voice.dispose(); setVoicePhase('idle'); latest.current.onVoicePhaseChange?.('idle'); setVoiceError('Voice input stopped when the chat was hidden.'); }
    });
    return () => { offHidden?.(); voice.dispose(); voiceRef.current = null; };
  }, []);
  const toggleVoice = () => {
    setVoiceError('');
    if (voicePhase === 'recording') voiceRef.current?.stop();
    else if (voicePhase === 'idle') void voiceRef.current?.start();
  };

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

      <div className="composer">
        <button type="button" onClick={() => setShowPromptsMenu(prev => !prev)} className="composer-ideas" title="Ideas & Starters" aria-label="Ideas and starters"><Sparkles size={18} /></button>
        <textarea ref={textareaRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder={`Message ${agent.name}...`} rows={1} aria-label={`Message ${agent.name}`} />
        <button type="button" onClick={toggleVoice} disabled={voicePhase === 'requesting' || voicePhase === 'transcribing'} className={`composer-ideas ${voicePhase === 'recording' ? 'voice-listening' : ''}`} title={voicePhase === 'recording' ? 'Stop recording' : 'Record voice command'} aria-label={voicePhase === 'recording' ? 'Stop recording' : 'Record voice command'} aria-pressed={voicePhase === 'recording'}><Mic size={18} /></button>
        {text.trim() && <button type="button" onClick={() => setText('')} className="composer-clear" title="Clear text" aria-label="Clear text"><Eraser size={16} /></button>}
        {isGenerating ? <button type="button" onClick={onStop} className="composer-send" title="Stop generating"><Square size={15} fill="currentColor" /><span>Stop</span></button> : <button type="button" onClick={handleSubmit} disabled={!text.trim()} className="composer-send" title="Send message (Enter)"><span>Send</span><Send size={16} /></button>}
      </div>
      {(voicePhase !== 'idle' || voiceError) && <div role="status" className="composer-hint">{voiceError || (voicePhase === 'recording' ? '● Listening… tap the mic to stop' : voicePhase === 'transcribing' ? 'Transcribing with Gemini…' : 'Requesting microphone…')}</div>}
      <div className="composer-hint">Enter to send <span>·</span> Shift + Enter for a new line</div>
    </div>
  );
};
