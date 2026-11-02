import { AgentProfile, AgentId, ChatMessage } from '../types';

export const AGENTS: Record<AgentId, AgentProfile> = {
  hanex: {
    id: 'hanex',
    name: 'Hanex',
    genderTitle: 'Boy AI Companion',
    roleTitle: 'Calm & Practical Strategist',
    personality: 'Calm, analytical, structured, and pragmatic',
    description: 'Level-headed problem solver who brings order to chaos, practical blueprints, and quiet clarity.',
    speechPitch: 0.9,
    speechRate: 1.0,
    theme: {
      primary: 'cyan',
      primaryHex: '#06b6d4',
      secondaryHex: '#3b82f6',
      accentGradient: 'from-cyan-500 via-blue-500 to-indigo-600',
      glowClass: 'theme-glow-hanex',
      bgGlowHex: 'rgba(6, 182, 212, 0.15)',
      bubbleUser: 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/40',
      bubbleAssistant: 'bg-[#111827]/90 border border-cyan-500/20 text-slate-100 shadow-xl shadow-cyan-950/20',
      badgeBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
      badgeText: 'text-cyan-400',
      borderColor: 'border-cyan-500/30',
      activeRing: 'ring-2 ring-cyan-500/60 shadow-lg shadow-cyan-500/20',
      avatarBg: 'bg-gradient-to-tr from-cyan-600 to-blue-700',
    },
    suggestedPrompts: [
      {
        title: 'Project Roadmap',
        prompt: 'Help me break down a complex project into 4 structured, realistic phases with key milestones.',
        icon: 'LayoutList',
      },
      {
        title: 'Pragmatic Decision',
        prompt: 'I have two choices ahead of me. Can you help me weigh pros, cons, and second-order consequences objectively?',
        icon: 'Scale',
      },
      {
        title: 'Debug & Optimize',
        prompt: 'Explain how to systematically debug an elusive software issue or performance bottleneck.',
        icon: 'Cpu',
      },
      {
        title: 'Daily Action Plan',
        prompt: 'Create a high-focus 3-hour deep work schedule to maximize output without burning out.',
        icon: 'Clock',
      },
    ],
  },

  shumex: {
    id: 'shumex',
    name: 'Shumex',
    genderTitle: 'Girl AI Companion',
    roleTitle: 'Warm & Creative Muse',
    personality: 'Warm, empathetic, poetic, and creatively inventive',
    description: 'Imaginative spirit who turns ideas into stories, infuses aesthetic flair, and offers uplifting encouragement.',
    speechPitch: 1.25,
    speechRate: 1.05,
    theme: {
      primary: 'pink',
      primaryHex: '#f43f5e',
      secondaryHex: '#ec4899',
      accentGradient: 'from-rose-500 via-pink-500 to-fuchsia-600',
      glowClass: 'theme-glow-shumex',
      bgGlowHex: 'rgba(244, 63, 94, 0.15)',
      bubbleUser: 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-950/40',
      bubbleAssistant: 'bg-[#1a121e]/90 border border-pink-500/20 text-slate-100 shadow-xl shadow-pink-950/20',
      badgeBg: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
      badgeText: 'text-pink-400',
      borderColor: 'border-pink-500/30',
      activeRing: 'ring-2 ring-pink-500/60 shadow-lg shadow-pink-500/20',
      avatarBg: 'bg-gradient-to-tr from-rose-500 to-fuchsia-600',
    },
    suggestedPrompts: [
      {
        title: 'Creative Brainstorm',
        prompt: 'Let’s brainstorm 5 whimsical, out-of-the-box product ideas that bring genuine joy to people.',
        icon: 'Sparkles',
      },
      {
        title: 'Vivid Story Crafting',
        prompt: 'Write an atmospheric scene opening set in a twilight glasshouse observatory filled with glowing flora.',
        icon: 'Feather',
      },
      {
        title: 'Design Aesthetics',
        prompt: 'Give me a rich color palette and mood board description for a modern cyber-editorial magazine.',
        icon: 'Palette',
      },
      {
        title: 'Warm Pep Talk',
        prompt: 'I’m feeling a bit stuck and overwhelmed right now. Can you share some comforting, empowering perspective?',
        icon: 'Heart',
      },
    ],
  },
};

export const INITIAL_MESSAGES: Record<AgentId, ChatMessage[]> = {
  hanex: [
    {
      id: 'init-hanex-1',
      role: 'assistant',
      content: `Hello! I'm **Hanex**. 

I'm your calm and practical companion. Whenever you need logical analysis, crisp roadmaps, sound decisions, or structured problem-solving, I'm right here with you.

How can I help you make progress today?`,
      timestamp: Date.now() - 1000 * 60 * 10,
      agentId: 'hanex',
      status: 'complete',
    },
  ],
  shumex: [
    {
      id: 'init-shumex-1',
      role: 'assistant',
      content: `Hey there! ✨ I'm **Shumex**.

I'm your warm and creative muse! Whether you want to spark wild new ideas, write something magical, explore gorgeous designs, or just talk through your day with an open heart, I'm so glad we're here.

What kind of inspiration are we diving into today?`,
      timestamp: Date.now() - 1000 * 60 * 8,
      agentId: 'shumex',
      status: 'complete',
    },
  ],
};
