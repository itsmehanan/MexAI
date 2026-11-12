import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Copy, Check, Volume2, VolumeX, RotateCcw, AlertCircle } from 'lucide-react';
import { ChatMessage, AgentProfile } from '../types';
import { Avatar } from './Avatar';
import { MarkdownView } from './MarkdownView';
import { speakText, stopSpeaking } from '../utils/audio';

interface ChatBubbleProps {
  message: ChatMessage;
  agent: AgentProfile;
  isLast: boolean;
  onRegenerate?: () => void;
  voiceSpeed?: number;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  agent,
  isLast,
  onRegenerate,
  voiceSpeed = 1.0,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isUser = message.role === 'user';
  const isHanex = agent.id === 'hanex';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(message.content, agent.id, voiceSpeed, () => {
        setIsSpeaking(false);
      });
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-end my-3 px-4 max-w-3xl mx-auto w-full group"
      >
        <div className="flex items-end gap-2.5 max-w-[85%] md:max-w-[75%]">
          <div className="flex flex-col items-end">
            <div
              className="user-bubble"
            >
              <p className="whitespace-pre-wrap select-text">{message.content}</p>
            </div>
            <div className="flex items-center gap-2 mt-1 px-1">
              <span className="text-[10px] text-slate-500 select-none">{formatTime(message.timestamp)}</span>
              <button
                onClick={handleCopy}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                title="Copy prompt"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <Avatar agentId="user" size="sm" />
        </div>
      </motion.div>
    );
  }

  // Assistant Message
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-start my-3 px-4 max-w-3xl mx-auto w-full group"
    >
      <div className="flex items-start gap-3 w-full">
        <Avatar
          agentId={agent.id}
          size="md"
          showStatus={true}
          status={isSpeaking ? 'speaking' : message.status === 'streaming' ? (message.content.trim() ? 'working' : 'typing') : 'online'}
          className="mt-1"
        />

        <div className="flex-1 min-w-0 max-w-[90%] md:max-w-[85%]">
          {/* Header meta */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-sm font-bold text-slate-200 tracking-tight">{agent.name}</span>
            {message.model && message.status !== 'error' && <span className="text-[10px] text-slate-400">Answered by {message.provider} · {message.model}</span>}
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                isHanex
                  ? 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30'
                  : 'bg-rose-950/50 text-pink-300 border-pink-500/30'
              }`}
            >
              {agent.roleTitle}
            </span>
            <span className="text-[10px] text-slate-500 select-none ml-auto">
              {formatTime(message.timestamp)}
            </span>
          </div>

          {message.progress && message.status === 'streaming' && <p role="status" className="mb-2 text-xs text-cyan-200">{message.progress}</p>}
          {message.toolCards?.map(card => <div key={card.id} className="mb-2 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-200">
            <div className="flex justify-between gap-3"><strong>{card.name}</strong><span className="text-cyan-300">{card.status}</span></div>
            <pre className="mt-2 whitespace-pre-wrap break-all text-slate-400">{JSON.stringify(card.arguments, null, 2)}</pre>
            {(card.result !== undefined || card.error) && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-slate-300">{card.error || JSON.stringify(card.result, null, 2)}</pre>}
          </div>)}
          {/* Content Box */}
          <div
            className="assistant-bubble"
          >
            {message.status === 'error' ? (
              <div className="flex items-start gap-2.5 text-rose-300 bg-rose-950/30 p-3 rounded-xl border border-rose-500/30">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
                <div className="text-xs leading-relaxed">
                  <p className="font-semibold mb-0.5">Response interrupted</p>
                  <p className="text-slate-300 whitespace-pre-wrap break-words">{message.error || message.content}</p>
                </div>
              </div>
            ) : (
              <MarkdownView content={message.content} />
            )}

            {/* Streaming cursor pulse */}
            {message.status === 'streaming' && (
              <span
                className={`inline-block w-2 h-4 ml-1 rounded-sm animate-pulse ${
                  isHanex ? 'bg-cyan-400' : 'bg-pink-400'
                }`}
              />
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-1.5 mt-2 px-1 text-slate-400 text-xs">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 hover:text-slate-200 transition cursor-pointer text-[11px]"
              title="Copy message"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Read aloud TTS button */}
            <button
              onClick={handleToggleSpeech}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                isSpeaking
                  ? isHanex
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-pink-500/20 text-pink-300'
                  : 'hover:bg-white/5 hover:text-slate-200'
              }`}
              title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 animate-pulse" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Voice</span>
                </>
              )}
            </button>

            {/* Regenerate if last and not streaming */}
            {isLast && onRegenerate && message.status !== 'streaming' && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 hover:text-slate-200 transition cursor-pointer text-[11px]"
                title="Regenerate reply"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
