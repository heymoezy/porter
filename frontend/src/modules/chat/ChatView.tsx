import { useState } from 'react';
import { Send, History, BrainCircuit } from 'lucide-react';
import { WizardCard } from './WizardCard';
import { WizardQuestion } from './WizardQuestion';
import { GSDModeToggle } from './GSDModeToggle';
import { useAppStore } from '../../store/app';
import { useWizardFlow } from '../../hooks/useWizardFlow';
import { useGSDMode } from '../../hooks/useGSDMode';

export function ChatView() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    type?: 'text' | 'wizard-card' | 'wizard-question';
  }>>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm Porter. Tell me about a project you'd like to start, or just chat freely.",
      type: 'text',
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    wizardStage,
    wizardProposal,
    wizardQuestions,
    addWizardAnswer,
    activeProjectId,
  } = useAppStore();

  const { detectIntent, approveProposal, refineProposal, completeQuestions } = useWizardFlow();
  const { isGSD, routeGSD } = useGSDMode(activeProjectId);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput('');
    setIsProcessing(true);

    // Add user message to list
    const userMsg = { id: crypto.randomUUID(), role: 'user' as const, content: text, type: 'text' as const };
    setMessages(prev => [...prev, userMsg]);

    try {
      // If wizard is in proposing/refining state, treat as refinement
      if (wizardStage === 'proposing' || wizardStage === 'refining') {
        await refineProposal(text);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "I've updated the proposal based on your feedback.",
          type: 'text',
        }]);
        return;
      }

      // If GSD mode is active, route through GSD
      if (isGSD) {
        const gsdResponse = await routeGSD(text);
        if (gsdResponse) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: gsdResponse,
            type: 'text',
          }]);
          return;
        }
      }

      // Try wizard intent detection first (only if wizard is idle)
      if (wizardStage === 'idle') {
        const isProjectIntent = await detectIntent(text);
        if (isProjectIntent) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: "I see a project idea! Let me put together a proposal for you...",
            type: 'text',
          }]);
          return;
        }
      }

      // Regular chat — just echo for now (full chat integration is existing useChat hook)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I heard you: "${text}". (Chat dispatch integration coming in Phase 6.)`,
        type: 'text',
      }]);
    } catch (e) {
      console.error('Message handling error:', e);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Something went wrong. Please try again.",
        type: 'text',
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

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
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-4">
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
                    <BrainCircuit className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                )}
                <div className={`space-y-1.5 ${msg.role === 'user' ? 'ml-auto' : ''}`}>
                  <p className="text-sm font-medium text-[var(--text)]">
                    {msg.role === 'assistant' ? 'Porter' : 'You'}
                  </p>
                  <div className={`text-sm leading-relaxed p-4 rounded-2xl border border-[var(--border)]/50 ${
                    msg.role === 'user'
                      ? 'bg-[var(--accent)]/10 text-[var(--text)] rounded-tr-none'
                      : 'bg-[var(--raised)]/30 text-[var(--text2)] rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Wizard question — rendered inline in message stream */}
            {wizardStage === 'questioning' && wizardQuestions.length > 0 && (
              <WizardQuestion
                question={wizardQuestions[wizardQuestions.length - 1]}
                onSelect={(optionId) => {
                  addWizardAnswer(optionId);
                  const { wizardAnswers, wizardQuestions: wq } = useAppStore.getState();
                  // wizardAnswers[0] = original goal, rest = question answers
                  // Complete when we have enough answers for all questions
                  if (wizardAnswers.length - 1 >= wq.length) {
                    completeQuestions();
                  }
                }}
              />
            )}

            {/* Wizard proposal card — rendered inline in message stream */}
            {(wizardStage === 'proposing' || wizardStage === 'refining' || wizardStage === 'approved') && wizardProposal && (
              <WizardCard
                proposal={wizardProposal}
                onApprove={approveProposal}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message Porter... (type / for commands, @ for models)"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none min-h-[44px] max-h-48 text-[var(--text)]"
                rows={1}
              />
              <button
                onClick={handleSend}
                className="p-2.5 bg-[var(--accent)] hover:brightness-110 text-white rounded-xl transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-[var(--accent)]/20"
                disabled={!input.trim() || isProcessing}
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
