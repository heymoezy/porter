import { useEffect } from 'react';
import { useOrchStore } from '../../store/orch';
import type { Agent, Usage } from '../../store/orch';
import { Cpu, Globe, Activity, RefreshCw } from 'lucide-react';

const MODEL_OPTIMIZED: Record<string, string> = {
  'gpt-5.3-codex':    'Agentic coding, long-running tasks, tool use',
  'codex':            'Agentic coding, long-running tasks, tool use',
  'claude-opus-4-6':  'Deep reasoning, security audits, architecture',
  'claude-sonnet-4-6':'Implementation, debugging, tool calling',
  'gemini-2.5-pro':   'Research, extended context (1M tokens), multimodal',
};

function getModelDisplayName(modelId?: string) {
  if (!modelId) return 'Unknown';
  const mid = modelId.toLowerCase();
  if (mid.includes('codex') || mid.includes('gpt-5')) return 'GPT-5.3 Codex';
  if (mid.includes('opus')) return 'Claude Opus 4.6';
  if (mid.includes('sonnet')) return 'Claude Sonnet 4.6';
  if (mid.includes('gemini')) return 'Gemini 2.5 Pro';
  return modelId;
}

function AgentCard({ agent, usage }: { agent: Agent; usage?: Usage }) {
  const isConnected = !!(agent.raw_key || agent.id);
  const dotColor = isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-neutral-600';
  
  const consumedPct = usage?.usage_percent ? Math.max(0, Math.min(100, Number(usage.usage_percent))) : null;
  const availablePct = consumedPct === null ? null : (100 - consumedPct);
  
  return (
    <div className="p-4 bg-neutral-800/40 border border-neutral-800 rounded-xl hover:border-orange-500/30 transition-all group relative overflow-hidden">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <h3 className="text-sm font-semibold text-neutral-200 truncate flex-1">{agent.name}</h3>
        <Activity className="w-3.5 h-3.5 text-neutral-500 group-hover:text-orange-500 transition-colors" />
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] text-neutral-500 uppercase font-bold tracking-wider">
          <span>{agent.type}</span>
          <span>{agent.role}</span>
        </div>
        
        {availablePct !== null && (
          <div className="space-y-1.5 pt-1">
            <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${
                  availablePct <= 10 ? 'bg-red-500' : availablePct <= 25 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${availablePct}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-neutral-400 font-medium">{availablePct}% remaining</span>
              {usage?.window_resets_at && (
                <span className="text-neutral-600">resets {new Date(usage.window_resets_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowConnector({ id, reverse = false }: { id: string, reverse?: boolean }) {
  return (
    <div id={id} className="h-16 w-full relative">
      <svg className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--color-orange-500)" stopOpacity="0.2" />
            <stop offset="50%" stopColor="var(--color-orange-500)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--color-orange-500)" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <line 
          x1="50%" y1="0" x2="50%" y2="100%" 
          stroke={`url(#grad-${id})`} 
          strokeWidth="2" 
          strokeDasharray="4 4"
          className="animate-[flow-dash_1.2s_linear_infinite]"
        />
        <path 
          d={reverse ? "M 46% 15 L 50% 5 L 54% 15" : "M 46% 85 L 50% 95 L 54% 85"}
          fill="rgba(249, 115, 22, 0.6)"
          className="animate-pulse"
        />
      </svg>
    </div>
  );
}

export function OrchView() {
  const { agents, usage, isLoading, fetchData, refreshUsage } = useOrchStore();

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Primary agents: OpenClaw, Codex, Claude, Gemini
  const primaryAgents = agents.filter(a => {
    const s = ((a.name || '') + ' ' + (a.type || '')).toLowerCase();
    return s.includes('openclaw') || s.includes('codex') || s.includes('claude') || s.includes('gemini');
  });

  // Unique models from agents
  const models = Array.from(new Set(agents.map(a => a.model_id).filter(Boolean)));

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Orchestration</h1>
          <p className="text-sm text-neutral-500">How AI work flows through Porter.</p>
        </div>
        <button 
          onClick={() => { fetchData(); refreshUsage(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 text-xs hover:bg-neutral-700 transition-all border border-neutral-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Connected Agents */}
      <section className="space-y-4">
        <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em]">Connected Agents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {primaryAgents.map(agent => (
            <AgentCard key={agent.id} agent={agent} usage={usage[agent.id]} />
          ))}
          {primaryAgents.length === 0 && (
            <div className="col-span-full py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-600 text-sm">
              No primary agents connected.
            </div>
          )}
        </div>
      </section>

      <FlowConnector id="flow-merge" />

      {/* Porter Hub */}
      <div className="max-w-xl mx-auto p-8 bg-neutral-800/20 border border-neutral-800 rounded-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-orange-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative flex flex-col items-center text-center space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-orange-500 tracking-wider">PORTER</h3>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Orchestration Layer</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-2">
            {['Prompt cleanup', 'Model routing', 'Task dispatch', 'Shared memory', 'Task registry', 'Scheduler'].map(feat => (
              <span key={feat} className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-500/80">
                {feat}
              </span>
            ))}
          </div>
        </div>
      </div>

      <FlowConnector id="flow-fanout" />

      {/* Models */}
      <section className="space-y-4">
        <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em]">Models</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {models.map(modelId => (
            <div key={modelId} className="p-4 bg-neutral-800/40 border border-neutral-800 rounded-xl hover:border-orange-500/30 transition-all">
              <div className="flex items-center gap-3 mb-2">
                <Cpu className="w-4 h-4 text-orange-500/60" />
                <h3 className="text-sm font-semibold text-neutral-200 truncate flex-1">{getModelDisplayName(modelId!)}</h3>
              </div>
              <p className="text-[10px] text-neutral-500 line-clamp-2 leading-relaxed">
                {MODEL_OPTIMIZED[modelId!] || 'General purpose inference and reasoning.'}
              </p>
              <div className="mt-4 pt-4 border-t border-neutral-800/50 flex items-center justify-between">
                <span className="text-[9px] font-mono text-neutral-600 uppercase">{modelId}</span>
                <Globe className="w-3 h-3 text-neutral-700" />
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <div className="col-span-full py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-600 text-sm">
              No models detected.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
