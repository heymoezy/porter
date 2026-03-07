import { useEffect } from 'react';
import { useMemoryStore } from '../../store/memory';
import { Sparkles, Database, RefreshCw } from 'lucide-react';

function FlowArrow() {
  return (
    <div className="flex justify-center my-4">
      <svg width="40" height="60" viewBox="0 0 40 60" className="text-orange-500/30">
        <path d="M20 0 L20 50" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animate-[flow-dash_1.5s_linear_infinite]" />
        <path d="M15 45 L20 55 L25 45" fill="currentColor" />
      </svg>
    </div>
  );
}

export function MemoryView() {
  const { sessions, activeFacts, isLoading, fetchSessions, flushMemory } = useMemoryStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-neutral-900/30">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Memory Architecture</h1>
          <p className="text-sm text-neutral-500">Shared multi-model state and long-term knowledge.</p>
        </div>
        <button 
          onClick={fetchSessions}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Layer 1: Transient */}
        <section className="p-6 bg-neutral-800/20 border border-neutral-800 rounded-3xl relative group">
          <div className="absolute -top-3 left-6 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Layer 1: Transient Context
          </div>
          <div className="flex items-start gap-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-bold text-neutral-200">Active Conversations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map(s => (
                  <div key={s.id} className="p-3 bg-neutral-900/50 border border-neutral-800 rounded-xl flex items-center justify-between group/item">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-300 truncate">{s.name}</div>
                      <div className="text-[10px] text-neutral-600">{(s.size / 1024).toFixed(1)} KB cached</div>
                    </div>
                    <button 
                      onClick={() => flushMemory(s.id)}
                      className="px-2 py-1 rounded-lg bg-orange-500/10 text-orange-500 text-[10px] font-bold opacity-0 group-hover/item:opacity-100 transition-all hover:bg-orange-500 hover:text-white"
                    >
                      FLUSH
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <FlowArrow />

        {/* Layer 2: Hub */}
        <div className="p-8 bg-orange-500/5 border border-orange-500/20 rounded-[40px] relative overflow-hidden text-center space-y-6">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />
          <div className="relative space-y-2">
            <h3 className="text-2xl font-black text-orange-500 tracking-tighter italic">PORTER HUB</h3>
            <p className="text-xs text-neutral-500 uppercase font-bold tracking-[0.2em]">Context Synthesis & Fact Extraction</p>
          </div>
          <div className="flex justify-center gap-4 relative">
            {['De-duplication', 'Privacy Masking', 'Priority Ranking'].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-[10px] font-bold text-neutral-400">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <FlowArrow />

        {/* Layer 3: Persistent */}
        <section className="p-6 bg-neutral-800/20 border border-neutral-800 rounded-3xl relative group">
          <div className="absolute -top-3 left-6 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Layer 3: Persistent Memory
          </div>
          <div className="flex items-start gap-6">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-orange-500" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-neutral-200">Global Knowledge Base</h3>
                <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">Encrypted at rest</span>
              </div>
              <div className="space-y-2">
                {activeFacts.length === 0 && (
                  <div className="py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-600 text-sm italic">
                    No persistent facts extracted yet.
                  </div>
                )}
                {activeFacts.map(f => (
                  <div key={f.id} className="p-3 bg-neutral-900/30 border border-neutral-800/50 rounded-xl text-xs text-neutral-400 leading-relaxed">
                    {f.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
