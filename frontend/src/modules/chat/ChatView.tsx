import { useState } from 'react';
import { Send, History, BrainCircuit } from 'lucide-react';

export function ChatView() {
  const [input, setInput] = useState('');

  return (
    <div className="flex h-full bg-neutral-900/30">
      {/* Sessions Sidebar */}
      <aside className="w-64 border-r border-neutral-800 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          <span>Recent Sessions</span>
          <History className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="p-3 rounded-lg bg-neutral-800/50 text-sm text-neutral-200 cursor-pointer border border-neutral-700/50 shadow-sm">
            Current Conversation
          </div>
          <div className="p-3 rounded-lg hover:bg-neutral-800/30 text-sm text-neutral-400 cursor-pointer transition-colors">
            Phase 4 Extraction Plan
          </div>
          <div className="p-3 rounded-lg hover:bg-neutral-800/30 text-sm text-neutral-400 cursor-pointer transition-colors">
            Memory [edit] fix audit
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                <BrainCircuit className="w-5 h-5 text-orange-500" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-neutral-200">Porter</p>
                <div className="text-sm text-neutral-400 leading-relaxed bg-neutral-800/20 p-4 rounded-2xl rounded-tl-none border border-neutral-800/50">
                  Hello Moe! I'm ready to help you with Porter. I've successfully implemented the Onboarding Wizard and fixed several UI bugs. What should we work on next?
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="p-6">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute inset-0 bg-orange-500/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full"></div>
            <div className="relative flex items-end gap-2 bg-neutral-800/50 border border-neutral-700/50 focus-within:border-orange-500/50 p-2 rounded-2xl transition-all shadow-lg backdrop-blur-sm">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Porter... (type / for commands, @ for models)"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none min-h-[44px] max-h-48 text-neutral-200"
                rows={1}
              />
              <button 
                className="p-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-orange-500/20"
                disabled={!input.trim()}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-neutral-500 font-mono">
              <span>Enter to send</span>
              <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
              <span>Shift + Enter for new line</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
