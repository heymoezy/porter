import { motion } from 'framer-motion';
import { BrainCircuit, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store/app';

interface GSDModeToggleProps {
  projectId: string | null;
}

export function GSDModeToggle({ projectId }: GSDModeToggleProps) {
  const gsdModes = useAppStore((s) => s.gsdModes);
  const setGsdMode = useAppStore((s) => s.setGsdMode);

  if (!projectId) return null;

  const isGSD = gsdModes[projectId] ?? false;

  return (
    <motion.button
      layoutId="gsd-toggle"
      onClick={() => setGsdMode(projectId, !isGSD)}
      className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors ${
        isGSD
          ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
          : 'bg-[var(--raised)] text-[var(--text3)]'
      }`}
    >
      {isGSD ? (
        <BrainCircuit className="w-3 h-3" />
      ) : (
        <MessageCircle className="w-3 h-3" />
      )}
      <span>{isGSD ? 'GSD Plan' : 'Free chat'}</span>
    </motion.button>
  );
}
