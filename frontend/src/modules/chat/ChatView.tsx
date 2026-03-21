import { useState } from 'react';
import { Send, History, BrainCircuit } from 'lucide-react';
import { WizardCard } from './WizardCard';
import { WizardQuestion } from './WizardQuestion';
import { GSDModeToggle } from './GSDModeToggle';
import { useAppStore } from '../../store/app';
import { api } from '../../lib/api';

export function ChatView() {
  const [input, setInput] = useState('');
  const {
    wizardStage,
    wizardProposal,
    wizardQuestions,
    setWizardStage,
    setWizardProposal,
    resetWizard,
    addWizardAnswer,
    activeProjectId,
  } = useAppStore();

  return (
    <div className="flex h-full bg-[var(--bg)]">
      {/* Sessions Sidebar */}
      <aside className="w-64 border-r border-[var(--border)] flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">
          <span>Recent Sessions</span>
          <History className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="p-3 rounded-lg bg-[var(--surface)] text-sm text-[var(--text)] cursor-pointer border border-[var(--border)] shadow-sm">
            Current Conversation
          </div>
          <div className="p-3 rounded-lg hover:bg-[var(--surface)]/50 text-sm text-[var(--text2)] cursor-pointer transition-colors">
            Phase 4 Extraction Plan
          </div>
          <div className="p-3 rounded-lg hover:bg-[var(--surface)]/50 text-sm text-[var(--text2)] cursor-pointer transition-colors">
            Memory [edit] fix audit
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* GSD Mode toggle header */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-[var(--border)]">
          <span className="text-xs text-[var(--text3)]">Chat</span>
          <GSDModeToggle projectId={activeProjectId} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                <BrainCircuit className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-[var(--text)]">Porter</p>
                <div className="text-sm text-[var(--text2)] leading-relaxed bg-[var(--raised)]/30 p-4 rounded-2xl rounded-tl-none border border-[var(--border)]">
                  Hello Moe! I'm ready to help you with Porter. I've successfully implemented the Onboarding Wizard and fixed several UI bugs. What should we work on next?
                </div>
              </div>
            </div>

            {/* Wizard question — rendered inline in message stream */}
            {wizardStage === 'questioning' && wizardQuestions.length > 0 && (
              <WizardQuestion
                question={wizardQuestions[wizardQuestions.length - 1]}
                onSelect={(optionId) => {
                  addWizardAnswer(optionId);
                  // If all questions answered, move to proposing
                  if (wizardQuestions.length <= 1) {
                    setWizardStage('proposing');
                  }
                }}
              />
            )}

            {/* Wizard proposal card — rendered inline in message stream */}
            {(wizardStage === 'proposing' || wizardStage === 'refining' || wizardStage === 'approved') && wizardProposal && (
              <WizardCard
                proposal={wizardProposal}
                onApprove={async () => {
                  try {
                    await api<{ data: { projectId: string } }>('/api/v1/projects/wizard', {
                      json: { action: 'approve', proposal: wizardProposal },
                    });
                    setWizardStage('approved');
                  } catch (e) {
                    console.error('Wizard approval failed:', e);
                  }
                }}
                isApproved={wizardStage === 'approved'}
              />
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="p-6">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute inset-0 bg-[var(--accent)]/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full"></div>
            <div className="relative flex items-end gap-2 bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--accent)]/50 p-2 rounded-2xl transition-all shadow-lg backdrop-blur-sm">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Porter... (type / for commands, @ for models)"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none min-h-[44px] max-h-48 text-[var(--text)]"
                rows={1}
              />
              <button
                className="p-2.5 bg-[var(--accent)] hover:brightness-110 text-white rounded-xl transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-[var(--accent)]/20"
                disabled={!input.trim()}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-[var(--text3)] font-mono">
              <span>Enter to send</span>
              <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
              <span>Shift + Enter for new line</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
