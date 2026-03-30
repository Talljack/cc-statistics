import { User, Bot, Wrench } from 'lucide-react';
import type { SessionMessage } from '../../types/statistics';

const ROLE_CONFIG = {
  user: { icon: User, color: '#3b82f6' },
  assistant: { icon: Bot, color: '#22c55e' },
  tool: { icon: Wrench, color: '#f59e0b' },
} as const;

export function MessageBubble({ message }: { message: SessionMessage }) {
  const config = ROLE_CONFIG[message.role] || ROLE_CONFIG.assistant;
  const Icon = config.icon;
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
        style={{ backgroundColor: `${config.color}20`, color: config.color }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div
        className={`flex-1 max-w-[80%] rounded-xl px-4 py-3 border border-[#2a2a2a] ${isUser ? 'ml-auto bg-[#1a2a3a]' : 'bg-[#1a1a1a]'}`}
      >
        {message.toolName && (
          <div className="text-xs text-[#f59e0b] mb-1 font-medium">{message.toolName}</div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words text-[#d0d0d0]">
          {message.content}
        </div>
        {message.timestamp && (
          <div className="text-[10px] text-[#505050] mt-2">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
