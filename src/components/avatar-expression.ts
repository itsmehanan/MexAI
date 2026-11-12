export type CharacterExpression = 'happy' | 'thinking' | 'working' | 'listening' | 'sleeping';
export type AvatarStatus = 'online' | 'typing' | 'speaking' | 'idle' | 'working' | 'listening' | 'sleeping';

export function avatarExpression(status: AvatarStatus): CharacterExpression {
  if (status === 'typing') return 'thinking';
  if (status === 'speaking' || status === 'working') return 'working';
  if (status === 'listening' || status === 'sleeping') return status;
  return 'happy';
}
