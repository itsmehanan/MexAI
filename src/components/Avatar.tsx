import React from 'react';
import { AgentId } from '../types';
import '../../electron/characters.css';
import { avatarExpression, type AvatarStatus } from './avatar-expression';

interface AvatarProps {
  agentId: AgentId | 'user';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showStatus?: boolean;
  status?: AvatarStatus;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ agentId, size = 'md', status = 'online', className = '' }) => {
  const sizes = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, '2xl': 80 };
  if (agentId === 'user') return <div className={`user-avatar ${className}`} style={{ width: sizes[size], height: sizes[size] }} aria-label="You">Y</div>;
  const expression = avatarExpression(status);
  return (
    <span className={`avatar-wrap ${className}`} style={{ width: sizes[size], height: sizes[size] }} role="img" aria-label={`${agentId === 'hanex' ? 'Hanex' : 'Shumex'}, ${expression}`}>
      <span className={`character character--${agentId}`} data-expression={expression} aria-hidden="true">
        <span className="character-detail" />
        <span className="character-body"><span className="character-eyes"><i className="character-eye" /><i className="character-eye" /></span><span className="character-cheek character-cheek--left" /><span className="character-cheek character-cheek--right" /><span className="character-mouth" /></span>
        <span className="character-thoughts"><i /><i /><i /></span>
      </span>
    </span>
  );
};
