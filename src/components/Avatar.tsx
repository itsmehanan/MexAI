import React from 'react';
import { AgentId } from '../types';

interface AvatarProps {
  agentId: AgentId | 'user';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showStatus?: boolean;
  status?: 'online' | 'typing' | 'speaking' | 'idle';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  agentId,
  size = 'md',
  showStatus = false,
  status = 'online',
  className = '',
}) => {
  const sizeMap = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    '2xl': 'w-20 h-20 text-xl',
  };

  const statusDotSize = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
    xl: 'w-3.5 h-3.5',
    '2xl': 'w-4 h-4',
  };

  if (agentId === 'user') {
    return (
      <div className={`relative flex-shrink-0 ${className}`}>
        <div
          className={`${sizeMap[size]} rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-600/50 flex items-center justify-center text-slate-200 shadow-md font-semibold select-none`}
        >
          <svg className="w-1/2 h-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </div>
    );
  }

  const isHanex = agentId === 'hanex';

  return (
    <div className={`relative flex-shrink-0 group ${className}`}>
      {/* Dynamic speaking / pulsing glow rings */}
      {status === 'speaking' && (
        <span
          className={`absolute -inset-1 rounded-2xl animate-ping opacity-60 ${
            isHanex ? 'bg-cyan-400' : 'bg-pink-400'
          }`}
        />
      )}

      <div
        className={`${sizeMap[size]} relative rounded-2xl p-0.5 overflow-hidden transition-transform duration-300 group-hover:scale-105 shadow-lg ${
          isHanex
            ? 'bg-gradient-to-b from-cyan-400 via-blue-500 to-indigo-700 shadow-cyan-950/50'
            : 'bg-gradient-to-b from-rose-400 via-pink-500 to-fuchsia-700 shadow-pink-950/50'
        }`}
      >
        <div className="w-full h-full rounded-[14px] bg-[#0c1322] flex items-center justify-center overflow-hidden">
          {isHanex ? (
            /* Hanex - Boy AI Avatar (Calm, Cyan-themed, Tech Headphones, Thoughtful) */
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="hanexBg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#082f49" />
                  <stop offset="1" stopColor="#030712" />
                </linearGradient>
                <linearGradient id="hanexHair" x1="20" y1="10" x2="80" y2="70" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#1e293b" />
                  <stop offset="0.6" stopColor="#0f172a" />
                  <stop offset="1" stopColor="#06b6d4" />
                </linearGradient>
                <linearGradient id="hanexCyanGlow" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#38bdf8" />
                  <stop offset="1" stopColor="#0284c7" />
                </linearGradient>
              </defs>

              {/* Background */}
              <rect width="100" height="100" fill="url(#hanexBg)" />

              {/* Tech Hoodie / Collar */}
              <path d="M22 88 Q50 78 78 88 L85 100 L15 100 Z" fill="#0f172a" stroke="#0284c7" strokeWidth="1.5" />
              <path d="M40 85 L50 96 L60 85" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />

              {/* Neck */}
              <path d="M42 66 L42 78 Q50 82 58 78 L58 66 Z" fill="#fbcfe8" fillOpacity="0.8" />

              {/* Face Shape */}
              <path d="M30 40 Q30 72 50 74 Q70 72 70 40 Q70 24 50 24 Q30 24 30 40 Z" fill="#fde047" fillOpacity="0.15" />
              <path d="M32 42 Q32 70 50 73 Q68 70 68 42 Q68 26 50 26 Q32 26 32 42 Z" fill="#fed7aa" />

              {/* Eyes (Calm, Intelligent) */}
              <ellipse cx="42" cy="48" rx="4.5" ry="5.5" fill="#0f172a" />
              <circle cx="43.5" cy="46.5" r="1.8" fill="#38bdf8" />
              <circle cx="41.5" cy="49.5" r="0.8" fill="#ffffff" />

              <ellipse cx="58" cy="48" rx="4.5" ry="5.5" fill="#0f172a" />
              <circle cx="59.5" cy="46.5" r="1.8" fill="#38bdf8" />
              <circle cx="57.5" cy="49.5" r="0.8" fill="#ffffff" />

              {/* Eyebrows (Focused & Calm) */}
              <path d="M37 40 Q43 38 47 40" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
              <path d="M53 40 Q57 38 63 40" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />

              {/* Subtle smile */}
              <path d="M46 62 Q50 64 54 62" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />

              {/* Stylish Spiky Boy Hair with Blue Streak */}
              <path
                d="M28 38 Q32 18 50 16 Q68 18 72 38 Q74 24 62 18 Q50 14 38 20 Q26 26 28 38 Z"
                fill="url(#hanexHair)"
              />
              <path d="M30 36 Q38 30 48 34 Q40 24 32 32 Z" fill="#06b6d4" />
              <path d="M46 16 Q52 24 48 32 Q58 22 66 32 Q62 18 50 16 Z" fill="#0284c7" />

              {/* Modern Cyber Headphones with Cyan Light Ring */}
              <path d="M22 45 Q20 20 50 18 Q80 20 78 45" stroke="#334155" strokeWidth="4" strokeLinecap="round" fill="none" />
              {/* Left Earcup */}
              <rect x="18" y="40" width="8" height="18" rx="4" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
              <circle cx="22" cy="49" r="2.5" fill="#38bdf8" />
              {/* Right Earcup */}
              <rect x="74" y="40" width="8" height="18" rx="4" fill="#1e293b" stroke="#06b6d4" strokeWidth="1.5" />
              <circle cx="78" cy="49" r="2.5" fill="#38bdf8" />
            </svg>
          ) : (
            /* Shumex - Girl AI Avatar (Warm, Creative, Star Hairpins, Rosy Pink Glow) */
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="shumexBg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4c0519" />
                  <stop offset="1" stopColor="#0f0715" />
                </linearGradient>
                <linearGradient id="shumexHair" x1="20" y1="10" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#4a044e" />
                  <stop offset="0.5" stopColor="#831843" />
                  <stop offset="1" stopColor="#f43f5e" />
                </linearGradient>
                <linearGradient id="shumexBlush" x1="0" y1="0" x2="1" y2="0">
                  <stop stopColor="#fda4af" stopOpacity="0.6" />
                  <stop offset="1" stopColor="#fb7185" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              {/* Background */}
              <rect width="100" height="100" fill="url(#shumexBg)" />

              {/* Creative Collar & Choker */}
              <path d="M22 88 Q50 78 78 88 L85 100 L15 100 Z" fill="#2e1065" stroke="#f43f5e" strokeWidth="1.5" />
              <circle cx="50" cy="82" r="3.5" fill="#f43f5e" />
              <path d="M46 82 L54 82" stroke="#ffffff" strokeWidth="1" />

              {/* Neck */}
              <path d="M42 66 L42 78 Q50 82 58 78 L58 66 Z" fill="#ffe4e6" />

              {/* Soft Face */}
              <path d="M30 42 Q30 72 50 74 Q70 72 70 42 Q70 24 50 24 Q30 24 30 42 Z" fill="#fed7aa" />

              {/* Rosy Cheeks */}
              <circle cx="37" cy="54" r="5" fill="#fb7185" fillOpacity="0.4" />
              <circle cx="63" cy="54" r="5" fill="#fb7185" fillOpacity="0.4" />

              {/* Eyes (Warm, Sparkling, Creative) */}
              <ellipse cx="41" cy="48" rx="4.8" ry="6" fill="#1e1b4b" />
              <circle cx="42.5" cy="46" r="2" fill="#f43f5e" />
              <circle cx="40" cy="49" r="1.2" fill="#ffffff" />
              <circle cx="43.5" cy="50.5" r="0.6" fill="#ffffff" />

              <ellipse cx="59" cy="48" rx="4.8" ry="6" fill="#1e1b4b" />
              <circle cx="60.5" cy="46" r="2" fill="#f43f5e" />
              <circle cx="58" cy="49" r="1.2" fill="#ffffff" />
              <circle cx="61.5" cy="50.5" r="0.6" fill="#ffffff" />

              {/* Friendly Eyebrows */}
              <path d="M35 40 Q41 37 47 39" stroke="#4a044e" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M53 39 Q59 37 65 40" stroke="#4a044e" strokeWidth="1.8" strokeLinecap="round" />

              {/* Sweet smile */}
              <path d="M45 61 Q50 66 55 61" stroke="#be123c" strokeWidth="2" strokeLinecap="round" />

              {/* Flowing Soft Hair with bangs and side ribbons */}
              <path
                d="M24 45 Q22 18 50 16 Q78 18 76 45 Q74 65 78 78 Q72 75 70 56 Q66 30 50 28 Q34 30 30 56 Q28 75 22 78 Q26 65 24 45 Z"
                fill="url(#shumexHair)"
              />
              <path d="M34 26 Q42 36 50 36 Q58 36 66 26 Q58 20 50 20 Q42 20 34 26 Z" fill="#be185d" />

              {/* Golden Star Hairpin */}
              <polygon
                points="32,26 33.5,30 38,30 34.5,32.5 36,36.5 32,34 28,36.5 29.5,32.5 26,30 30.5,30"
                fill="#fbbf24"
                stroke="#d97706"
                strokeWidth="0.8"
              />

              {/* Cute Rose Gold Earbuds/Puffs */}
              <circle cx="21" cy="46" r="6" fill="#fb7185" stroke="#f43f5e" strokeWidth="1.5" />
              <circle cx="21" cy="46" r="2.5" fill="#fff1f2" />
              <circle cx="79" cy="46" r="6" fill="#fb7185" stroke="#f43f5e" strokeWidth="1.5" />
              <circle cx="79" cy="46" r="2.5" fill="#fff1f2" />
            </svg>
          )}
        </div>
      </div>

      {/* Online / Active Status Badge */}
      {showStatus && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#080c14] ${
            statusDotSize[size]
          } ${
            status === 'typing'
              ? isHanex
                ? 'bg-cyan-400 animate-bounce'
                : 'bg-pink-400 animate-bounce'
              : status === 'speaking'
              ? isHanex
                ? 'bg-cyan-300'
                : 'bg-pink-300'
              : 'bg-emerald-400'
          }`}
          title={status === 'typing' ? 'Thinking...' : status === 'speaking' ? 'Speaking...' : 'Online'}
        />
      )}
    </div>
  );
};
