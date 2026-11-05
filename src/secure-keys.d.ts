interface Window {
  secureKeys?: {
    status(): Promise<Record<string, boolean>>;
    save(provider: string, key: string): Promise<boolean>;
    remove(provider: string): Promise<boolean>;
    clear(): Promise<boolean>;
    setCustomEndpoint(url: string): Promise<string>;
    migrate(keys: Record<string, string>): Promise<Record<string, boolean>>;
  };
}

type DesktopUpdateState = {
  version: string;
  status: 'unavailable' | 'idle' | 'checking' | 'downloading' | 'not-available' | 'ready' | 'error';
  availableVersion?: string;
  restartError?: string;
};
interface Window {
  desktopUpdates?: {
    status(): Promise<DesktopUpdateState>;
    check(): Promise<DesktopUpdateState>;
    restart(): Promise<boolean>;
    onState(callback: (state: DesktopUpdateState) => void): () => void;
  };
}

interface Window {
  folderSettings?: {
    list(): Promise<string[]>;
    add(): Promise<string[]>;
    remove(folder: string): Promise<string[]>;
  };
}

interface Window {
  islandChat?: {
    onHidden(callback: () => void): () => void;
    onCommand(callback: (command: { agent: 'hanex' | 'shumex'; text: string; id: string }) => void): () => void;
    onAgent(callback: (agent: 'hanex' | 'shumex') => void): () => void;
    activeAgent(agent: 'hanex' | 'shumex'): void;
    voiceSetting(enabled: boolean): void;
    status(status: { phase: 'working' | 'result' | 'error' | 'rejected'; agent: 'hanex' | 'shumex'; text: string; id?: string }): void;
  };
}

type VoicePhase = 'idle' | 'requesting' | 'recording' | 'transcribing';
interface Window {
  MexVoice: { createVoiceRecorder(options: {
    transcribe(blob: Blob, signal: AbortSignal): Promise<string>;
    onState(phase: VoicePhase): void;
    onResult(text: string): void;
    onError(message: string): void;
  }): { start(): Promise<void>; stop(): void; dispose(): void; getState(): VoicePhase } };
}
