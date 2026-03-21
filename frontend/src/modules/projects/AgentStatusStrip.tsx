import { motion } from 'framer-motion';

export interface AgentEntry {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface AgentStatusStripProps {
  agents: AgentEntry[];
}

function statusDot(status: string): string {
  switch (status) {
    case 'active':
    case 'running':
      return 'w-2 h-2 rounded-full bg-[var(--success,#22c55e)] animate-pulse';
    case 'retired':
      return 'w-2 h-2 rounded-full bg-[var(--danger)] opacity-50';
    default:
      return 'w-2 h-2 rounded-full bg-[var(--text3)]';
  }
}

export function AgentStatusStrip({ agents }: AgentStatusStripProps) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-[var(--text3)] italic px-1 py-2">
        No agents assigned yet
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto py-2 px-1">
      {agents.map((agent, i) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
        >
          <div className={statusDot(agent.status)} />
          <div>
            <p className="text-sm font-medium text-[var(--text)] leading-none">{agent.name}</p>
            <p className="text-xs text-[var(--text3)] leading-none mt-0.5">{agent.role}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
