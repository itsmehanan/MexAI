type Vault = { status(): Promise<Record<string, boolean>>; migrate(keys: Record<string, string>): Promise<Record<string, boolean>> };
export async function migrateSavedKeys(storage: Pick<Storage, 'getItem' | 'setItem'>, storageKey: string, vault?: Vault): Promise<Record<string, boolean>> {
  const raw = storage.getItem(storageKey);
  const legacy = raw ? JSON.parse(raw) : {};
  const keys: Record<string, string> = {};
  for (const id of ['gemini', 'openai', 'anthropic', 'openrouter']) {
    const key = legacy.providers?.[id]?.apiKey || (id === 'gemini' ? legacy.apiKey : '');
    if (typeof key === 'string' && key.trim()) keys[id] = key;
  }
  if (!vault) {
    if (Object.keys(keys).length) throw new Error('Legacy keys require migration in the desktop app.');
    return {};
  }
  const status = Object.keys(keys).length ? await vault.migrate(keys) : await vault.status();
  if (raw) {
    legacy.apiKey = '';
    for (const provider of Object.values(legacy.providers || {}) as any[]) if (provider && typeof provider === 'object') provider.apiKey = '';
    storage.setItem(storageKey, JSON.stringify(legacy));
  }
  return status;
}
