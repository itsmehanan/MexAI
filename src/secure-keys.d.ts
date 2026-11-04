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
