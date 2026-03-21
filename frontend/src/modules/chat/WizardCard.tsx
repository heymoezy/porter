import { motion } from 'framer-motion';
import { Check, Users, Milestone } from 'lucide-react';
import { animation } from '../../design-system/tokens';

interface AgentProposal {
  name: string;
  role: string;
  portrait: string;
  whyChosen: string;
}

interface WizardCardProps {
  proposal: {
    projectName: string;
    projectType: string;
    agents: AgentProposal[];
    milestones: string[];
    scopeLabel: string;
    explanation: string;
  };
  onApprove: () => void;
  isApproved?: boolean;
}

// Role-based color mapping using design system accent variants
const ROLE_COLORS: Record<string, string> = {
  researcher: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  developer: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  designer: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  analyst: 'bg-green-500/20 text-green-400 border-green-500/30',
  manager: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  writer: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
};

function roleColor(role: string): string {
  const key = role.toLowerCase();
  return ROLE_COLORS[key] ?? 'bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/30';
}

export function WizardCard({ proposal, onApprove, isApproved = false }: WizardCardProps) {
  return (
    <motion.div
      layoutId="wizard-proposal"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={animation.spring}
      className="max-w-lg w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mt-3 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-base font-bold text-[var(--text)] leading-tight">
          {proposal.projectName}
        </h3>
        <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
          {proposal.scopeLabel}
        </span>
      </div>

      {/* Agent strip */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text3)] mb-2.5 font-medium uppercase tracking-wider">
          <Users className="w-3 h-3" />
          <span>Proposed Team</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {proposal.agents.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...animation.spring, delay: i * 0.1 }}
              title={agent.whyChosen}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-default ${roleColor(agent.role)}`}
            >
              <span className="text-base leading-none">{agent.portrait}</span>
              <div>
                <div className="font-semibold">{agent.name}</div>
                <div className="opacity-75">{agent.role}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Milestones timeline */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text3)] mb-2.5 font-medium uppercase tracking-wider">
          <Milestone className="w-3 h-3" />
          <span>Milestones</span>
        </div>
        <div className="space-y-2">
          {proposal.milestones.map((milestone, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)]/60 border border-[var(--accent)]/40" />
                {i < proposal.milestones.length - 1 && (
                  <div className="w-px h-4 bg-[var(--border)] mt-0.5" />
                )}
              </div>
              <span className="text-sm text-[var(--text2)] leading-tight">{milestone}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-xs text-[var(--text3)] leading-relaxed mb-4 italic">
        {proposal.explanation}
      </p>

      {/* Approve button */}
      <div className="flex justify-end">
        <button
          onClick={onApprove}
          disabled={isApproved}
          className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] hover:brightness-110 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
        >
          {isApproved ? (
            <>
              <Check className="w-4 h-4" />
              Project Created
            </>
          ) : (
            'Approve & Start'
          )}
        </button>
      </div>
    </motion.div>
  );
}
