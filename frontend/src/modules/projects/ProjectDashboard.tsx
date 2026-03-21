import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useProjectActivity } from '../../hooks/useProjectActivity';
import { ActivityFeed } from './ActivityFeed';
import { AgentStatusStrip, type AgentEntry } from './AgentStatusStrip';

interface Milestone {
  label: string;
  completed?: boolean;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string | null;
  milestones: Milestone[];
}

interface AgentRaw {
  id: string;
  name: string;
  role: string;
  status: string;
  project_id: string | null;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-[var(--accent)]/20 text-[var(--accent)]';
    case 'complete':
      return 'bg-[var(--success,#22c55e)]/20 text-[var(--success,#22c55e)]';
    case 'paused':
      return 'bg-[var(--warning)]/20 text-[var(--warning)]';
    case 'archived':
      return 'bg-[var(--text3)]/20 text-[var(--text3)]';
    default:
      return 'bg-[var(--border)] text-[var(--text2)]';
  }
}

function nextStepHint(agents: AgentEntry[], isLoading: boolean): string {
  if (isLoading) return '';
  if (agents.length === 0) return 'Add agents to this project to get started';
  const anyActive = agents.some(a => a.status === 'active' || a.status === 'running');
  if (anyActive) return 'Work in progress — agents are executing tasks';
  return 'Your agents are ready — assign them a task or let Porter propose one';
}

interface ProjectDashboardProps {
  projectId: string;
}

export function ProjectDashboard({ projectId }: ProjectDashboardProps) {
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<{ data: Project }>(`/api/v1/projects/${projectId}`),
    staleTime: 60_000,
  });

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<{ data: { agents: AgentRaw[] } }>('/api/v1/agents'),
    staleTime: 30_000,
  });

  const { events, isLoading: activityLoading } = useProjectActivity(projectId);

  const project = projectData?.data;

  // Filter agents belonging to this project (via project_id in config)
  const projectAgents: AgentEntry[] = (agentsData?.data?.agents ?? [])
    .filter((a) => a.project_id === projectId)
    .map((a) => ({ id: a.id, name: a.name, role: a.role, status: a.status }));

  const milestones: Milestone[] = project?.milestones ?? [];

  if (projectLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-[var(--text3)]">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-[var(--text3)]">Project not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl font-bold text-[var(--text)]">{project.name}</h2>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(project.status)}`}
          >
            {project.status}
          </span>
          {project.type && project.type !== 'custom' && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface)] text-[var(--text3)] capitalize">
              {project.type}
            </span>
          )}
        </div>
        {project.description && (
          <p className="text-sm text-[var(--text2)]">{project.description}</p>
        )}
        {/* Agent strip */}
        <div className="mt-3">
          <AgentStatusStrip agents={agentsLoading ? [] : projectAgents} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          {/* Activity feed — main column */}
          <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 pt-4 pb-2 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text2)]">Activity</h3>
            </div>
            <ActivityFeed events={events} isLoading={activityLoading} />
          </div>

          {/* Side column */}
          <div className="flex flex-col gap-4">
            {/* Milestones card */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[var(--text2)] mb-3">Milestones</h3>
              {milestones.length === 0 ? (
                <p className="text-sm text-[var(--text3)] italic">No milestones yet</p>
              ) : (
                <ul className="space-y-2">
                  {milestones.map((m, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          m.completed
                            ? 'border-[var(--success,#22c55e)] bg-[var(--success,#22c55e)]/20'
                            : 'border-[var(--border)]'
                        }`}
                      >
                        {m.completed && (
                          <svg className="w-2.5 h-2.5 text-[var(--success,#22c55e)]" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`text-sm leading-snug ${
                          m.completed ? 'text-[var(--text3)] line-through' : 'text-[var(--text)]'
                        }`}
                      >
                        {m.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Next steps card */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[var(--text2)] mb-2">Next steps</h3>
              <p className="text-sm text-[var(--text2)]">
                {nextStepHint(projectAgents, agentsLoading)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
