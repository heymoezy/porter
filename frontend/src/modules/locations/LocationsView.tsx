import { useEffect } from 'react';
import { useLocationStore } from '../../store/locations';
import type { Node, Location } from '../../store/locations';
import { HardDrive, Share2, Cloud, Plus, Trash2, Globe, Server, Activity } from 'lucide-react';

function NodeCard({ node }: { node: Node }) {
  const isOnline = node.status === 'online';
  return (
    <div className="p-4 bg-neutral-800/20 border border-neutral-800 rounded-xl space-y-3 hover:border-orange-500/30 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-neutral-500" />
          <h3 className="text-sm font-semibold text-neutral-200">{node.name}</h3>
        </div>
        <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500 uppercase font-bold tracking-wider">
        <span>{node.ip || 'Local'}</span>
        <span>{node.version || 'v0.x'}</span>
      </div>
    </div>
  );
}

function LocationCard({ loc, onRemove }: { loc: Location, onRemove: (id: string) => void }) {
  const Icon = loc.type === 'cloud' ? Cloud : loc.type === 'remote' ? Share2 : HardDrive;
  return (
    <div className="p-4 bg-neutral-800/40 border border-neutral-800 rounded-xl group hover:border-neutral-700 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center border border-neutral-800">
            <Icon className="w-5 h-5 text-orange-500/60" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-200 truncate">{loc.name}</h3>
            <p className="text-[11px] text-neutral-500 font-mono truncate">{loc.path}</p>
          </div>
        </div>
        <button 
          onClick={() => onRemove(loc.id)}
          className="p-1.5 text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-4 pt-4 border-t border-neutral-800/50 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5 text-neutral-500">
          <Globe className="w-3 h-3" />
          <span>{loc.node_id}</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-bold uppercase tracking-widest">{loc.type}</span>
      </div>
    </div>
  );
}

export function LocationsView() {
  const { nodes, locations, fetchData, removeLocation } = useLocationStore();

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-neutral-900/30">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Locations</h1>
          <p className="text-sm text-neutral-500">Manage storage nodes and mount points.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-all shadow-lg shadow-orange-500/20">
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      <section className="space-y-4">
        <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
          <Activity className="w-3 h-3" />
          Active Nodes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map(node => <NodeCard key={node.id} node={node} />)}
          {nodes.length === 0 && (
            <div className="col-span-full py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-600 text-sm">
              No nodes detected.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
          <DatabaseIcon className="w-3 h-3" />
          Mount Points
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map(loc => (
            <LocationCard key={loc.id} loc={loc} onRemove={removeLocation} />
          ))}
          {locations.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-4 border border-dashed border-neutral-800 rounded-3xl">
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto text-neutral-600">
                <HardDrive className="w-5 h-5" />
              </div>
              <p className="text-sm text-neutral-500">No mount points configured.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DatabaseIcon(props: any) {
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
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
