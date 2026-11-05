export interface FreeOpenRouterModel { id: string; name: string; provider: 'openrouter'; isFree: true; supportsTools: boolean }

// Require known prompt/completion costs and reject any non-zero or unknown listed fee.
export function parseFreeModels(data: unknown): FreeOpenRouterModel[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as any).data)) throw new Error('Invalid OpenRouter model catalog.');
  const result: FreeOpenRouterModel[] = [];
  const seen = new Set<string>();
  for (const item of (data as any).data) {
    if (typeof item?.id !== 'string' || !item.id.trim() || item.id.length > 256 || seen.has(item.id)) continue;
    const pricing = item.pricing;
    if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) continue;
    const zero = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Number(value) === 0;
    if (!zero(pricing.prompt) || !zero(pricing.completion) || !Object.values(pricing).every(zero)) continue;
    seen.add(item.id);
    result.push({ id: item.id, name: typeof item.name === 'string' && item.name.trim() ? item.name : item.id, provider: 'openrouter', isFree: true, supportsTools: Array.isArray(item.supported_parameters) && item.supported_parameters.includes('tools') });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
let cached: { models: FreeOpenRouterModel[]; time: number } | undefined;
export async function getFreeOpenRouterModels(refresh = false): Promise<FreeOpenRouterModel[]> {
  if (!refresh && cached && Date.now() - cached.time < 5 * 60_000) return cached.models;
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`OpenRouter catalog returned HTTP ${response.status}.`);
  const models = parseFreeModels(await response.json());
  cached = { models, time: Date.now() };
  return models;
}
