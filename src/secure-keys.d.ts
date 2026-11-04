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
