import { motion } from 'framer-motion';

interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

interface WizardQuestionProps {
  question: {
    id: string;
    text: string;
    options: QuestionOption[];
  };
  onSelect: (optionId: string) => void;
  disabled?: boolean;
}

export function WizardQuestion({ question, onSelect, disabled = false }: WizardQuestionProps) {
  return (
    <div className={`mt-3 max-w-lg w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <p className="text-sm text-[var(--text2)] mb-3 leading-relaxed">
        {question.text}
      </p>
      <div className="space-y-2">
        {question.options.map((option, i) => (
          <motion.button
            key={option.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(option.id)}
            disabled={disabled}
            className="w-full text-left p-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] bg-[var(--raised)] transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-xs font-mono text-[var(--text3)] mt-0.5 w-4">
                {i + 1}.
              </span>
              <div className="min-w-0">
                <div className="font-medium text-sm text-[var(--text)]">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-[var(--text3)] mt-0.5">{option.description}</div>
                )}
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
