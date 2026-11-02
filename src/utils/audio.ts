// Web Audio API sound synthesizer for responsive UI feedback
class SoundFX {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play gentle pop/send tone
  playSend() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(840, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // Audio not permitted or failed
    }
  }

  // Play pleasant chime on receiving message
  playReceive(agent: 'hanex' | 'shumex' = 'hanex') {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const baseFreq = agent === 'hanex' ? 523.25 : 659.25; // C5 vs E5
      const secondFreq = agent === 'hanex' ? 659.25 : 880.0; // E5 vs A5

      const now = this.ctx.currentTime;
      [baseFreq, secondFreq].forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.06, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.22);
      });
    } catch {
      // Audio not permitted or failed
    }
  }

  // Switch agent sound
  playSwitch(agent: 'hanex' | 'shumex') {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      const startFreq = agent === 'hanex' ? 380 : 540;
      const endFreq = agent === 'hanex' ? 480 : 680;

      osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + 0.09);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch {
      // Ignore
    }
  }
}

export const soundFX = new SoundFX();

// Web Speech API Text-to-Speech
export function speakText(
  text: string,
  agent: 'hanex' | 'shumex',
  speed = 1.0,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  window.speechSynthesis.cancel(); // Stop any ongoing speech

  // Strip markdown formatting for cleaner audio
  const cleanText = text
    .replace(/[#*`_~>[\]()]/g, '')
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .trim();

  if (!cleanText) return false;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = Math.max(0.7, Math.min(1.5, speed));

  if (agent === 'hanex') {
    utterance.pitch = 0.9; // Lower, calm, grounded
  } else {
    utterance.pitch = 1.25; // Higher, warm, melodic
  }

  // Select best voice if available
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
    if (agent === 'hanex') {
      const maleVoice = englishVoices.find((v) =>
        /male|guy|david|alex|daniel|george|james/i.test(v.name)
      );
      if (maleVoice) utterance.voice = maleVoice;
    } else {
      const femaleVoice = englishVoices.find((v) =>
        /female|girl|samantha|karen|victoria|zira|fiona/i.test(v.name)
      );
      if (femaleVoice) utterance.voice = femaleVoice;
    }
  }

  utterance.onend = () => {
    if (onEnd) onEnd();
  };
  utterance.onerror = () => {
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
