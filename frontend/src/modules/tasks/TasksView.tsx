import { useEffect, useState } from 'react';
import { useTaskStore } from '../../store/tasks';
import type { Task } from '../../store/tasks';
import { CheckCircle2, Clock, PlayCircle, AlertCircle, Plus, Search, Filter } from 'lucide-react';

function StatusBadge({ status }: { status: Task['status'] }) {
  const configs = {
    pending: { color: 'text-neutral-500 bg-neutral-500/10 border-neutral-500/20', icon: Clock, label: 'Queued' },
    in_progress: { color: 'text-orange-500 bg-orange-500/10 border-orange-500/20', icon: PlayCircle, label: 'Active' },
    completed: { color: 'text-green-500 bg-green-500/10 border-green-500/20', icon: CheckCircle2, label: 'Done' },
    failed: { color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: AlertCircle, label: 'Failed' },
  };
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export function TasksView() {
  const { tasks, isLoading, fetchTasks } = useTaskStore();
  const [filter, setFilter] = useState<Task['status'] | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = tasks
    .filter(t => filter === 'all' || t.status === filter)
    .filter(t => t.title.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at));

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-900/30">
      <div className="p-8 border-b border-neutral-800 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-100">Tasks</h1>
            <p className="text-sm text-neutral-500">Track and manage AI-driven project work.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-all shadow-lg shadow-orange-500/20">
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[240px] relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-orange-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-800/50 border border-neutral-700/50 focus:border-orange-500/50 rounded-xl pl-10 pr-4 py-2 text-sm text-neutral-200 focus:ring-0 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-1 bg-neutral-800/50 p-1 rounded-xl border border-neutral-700/50">
            {(['all', 'pending', 'in_progress', 'completed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  filter === s 
                    ? 'bg-neutral-700 text-neutral-100 shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {s === 'all' ? 'All' : s === 'pending' ? 'Queued' : s === 'in_progress' ? 'Active' : 'Done'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-3">
          {filteredTasks.map((task) => (
            <div 
              key={task.id} 
              className="group p-4 bg-neutral-800/20 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-neutral-200 truncate">{task.title}</h3>
                    <StatusBadge status={task.status} />
                    {task.priority === 'high' || task.priority === 'critical' ? (
                      <span className="text-[9px] font-black text-red-500/80 uppercase tracking-tighter bg-red-500/5 px-1 rounded border border-red-500/10">Priority</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-neutral-500 line-clamp-1">{task.description}</p>
                </div>
                
                <div className="text-right space-y-1">
                  <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-wider">{task.id.split('-')[0]}</div>
                  <div className="text-[10px] text-neutral-500">
                    {new Date((task.updated_at || task.created_at) * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>
              
              {task.tags && task.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {task.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[9px] text-neutral-400 font-medium lowercase">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {!isLoading && filteredTasks.length === 0 && (
            <div className="py-20 text-center space-y-4 border border-dashed border-neutral-800 rounded-3xl">
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
                <Filter className="w-5 h-5 text-neutral-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-neutral-400">No tasks found</h3>
                <p className="text-xs text-neutral-600">Try adjusting your filters or search terms.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
