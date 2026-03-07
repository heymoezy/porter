import { useEffect } from 'react';
import { useExtensionStore } from '../../store/extensions';
import type { ExtensionTool } from '../../store/extensions';
import { Puzzle, Search, Power, RefreshCw } from 'lucide-react';

function ToolCard({ tool, onToggle }: { tool: ExtensionTool, onToggle: (id: string, active: boolean) => void }) {
  const isActive = tool.status === 'active';
  
  return (
    <div className={`p-5 rounded-2xl border transition-all group ${
      isActive 
        ? 'bg-orange-500/5 border-orange-500/20' 
        : 'bg-neutral-800/20 border-neutral-800'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
          isActive ? 'bg-orange-500/10 border-orange-500/20' : 'bg-neutral-900 border-neutral-800'
        }`}>
          <Puzzle className={`w-5 h-5 ${isActive ? 'text-orange-500' : 'text-neutral-600'}`} />
        </div>
        <button 
          onClick={() => onToggle(tool.id, !isActive)}
          className={`p-2 rounded-lg transition-all ${
            isActive 
              ? 'text-orange-500 bg-orange-500/10 hover:bg-orange-500 hover:text-white' 
              : 'text-neutral-600 bg-neutral-900 hover:text-neutral-300'
          }`}
        >
          <Power className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1 mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-200">{tool.name}</h3>
          {tool.version && <span className="text-[9px] font-mono text-neutral-600 uppercase">v{tool.version}</span>}
        </div>
        <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">{tool.description}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-4 border-t border-neutral-800/50">
        {tool.capabilities.map(cap => (
          <span key={cap} className="px-1.5 py-0.5 rounded bg-neutral-900 text-[9px] font-bold text-neutral-500 uppercase tracking-tighter">
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ExtensionsView() {
  const { tools, isLoading, fetchTools, toggleTool } = useExtensionStore();

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-neutral-900/30">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Extensions</h1>
          <p className="text-sm text-neutral-500">Connect Porter to external tools and services.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search tools..." 
              className="bg-neutral-800/50 border border-neutral-700/50 focus:border-orange-500/50 rounded-xl pl-10 pr-4 py-2 text-sm text-neutral-200 focus:ring-0 transition-all w-64"
            />
          </div>
          <button 
            onClick={fetchTools}
            className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tools.map(tool => (
          <ToolCard key={tool.id} tool={tool} onToggle={toggleTool} />
        ))}
        
        {/* Marketplace Placeholder */}
        <div className="p-5 rounded-2xl border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center space-y-3 group hover:border-neutral-700 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center border border-neutral-800 group-hover:border-orange-500/30 transition-all">
            <PlusIcon className="w-5 h-5 text-neutral-700 group-hover:text-orange-500/60 transition-all" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-neutral-500 group-hover:text-neutral-400 transition-all">Browse Marketplace</h3>
            <p className="text-[10px] text-neutral-600">Discover more tools for your agents.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlusIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
