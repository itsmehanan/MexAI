import React from 'react';
import { AgentId } from '../types';

interface AvatarProps {
  agentId: AgentId | 'user';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showStatus?: boolean;
  status?: 'online' | 'typing' | 'speaking' | 'idle';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ agentId, size = 'md', status = 'online', className = '' }) => {
  const sizes = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, '2xl': 80 };
  if (agentId === 'user') return <div className={`user-avatar ${className}`} style={{ width: sizes[size], height: sizes[size] }} aria-label="You">Y</div>;
  return (
    <span className={`avatar-wrap ${status === 'typing' ? 'avatar-thinking' : ''} ${className}`} style={{ width: sizes[size], height: sizes[size] }} role="img" aria-label={`${agentId} avatar`}>
      <span className={`avatar-dot avatar-${agentId}`}><span className="avatar-eyes"><i /><i /></span></span>
    </span>
  );
};
