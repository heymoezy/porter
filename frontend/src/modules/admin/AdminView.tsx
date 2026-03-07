import { useEffect } from 'react';
import { useAdminStore } from '../../store/admin';
import { Activity, ShieldCheck, Database, HardDrive, Terminal, HeartPulse } from 'lucide-react';

export function AdminView() {
  const { health, logs, fetchHealth, fetchLogs } = useAdminStore();

  useEffect(() => {
    fetchHealth();
    fetchLogs();
    const hTimer = setInterval(fetchHealth, 10000);
    const lTimer = setInterval(fetchLogs, 5000);
    return () => {
      clearInterval(hTimer);
      clearInterval(lTimer);
    };
  }, [fetchHealth, fetchLogs]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-neutral-900/30 overflow-y-auto">
      <div className="p-8 border-b border-neutral-800">
        <h1 className="text-2xl font-bold text-neutral-100">Admin Control</h1>
        <p className="text-sm text-neutral-500">System health, performance, and audit logs.</p>
      </div>

      <div className="p-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* System Health Column */}
        <div className="xl:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
              <HeartPulse className="w-3 h-3" />
              System Status
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'CPU Usage', val: `${health?.cpu_percent || 0}%`, icon: Activity },
                { label: 'RAM Used', val: `${health?.memory_used_mb || 0} MB`, icon: Database },
                { label: 'Disk Free', val: `${health?.disk_free_gb || 0} GB`, icon: HardDrive },
                { label: 'Uptime', val: `${Math.round((health?.uptime || 0) / 3600)}h`, icon: ClockIcon },
              ].map((stat, i) => (
                <div key={i} className="p-4 bg-neutral-800/20 border border-neutral-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase">{stat.label}</span>
                    <stat.icon className="w-3.5 h-3.5 text-neutral-600" />
                  </div>
                  <div className="text-xl font-bold text-neutral-200">{stat.val}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              Services
            </h2>
            <div className="bg-neutral-800/20 border border-neutral-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase font-bold">
                    <th className="px-6 py-3">Service</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Version</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {health?.services.map((svc) => (
                    <tr key={svc.name} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-neutral-300">{svc.name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 ${
                          svc.status === 'up' ? 'text-green-500' : 'text-red-500'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            svc.status === 'up' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          {svc.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs text-neutral-500">{svc.version || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Logs Column */}
        <section className="space-y-4 flex flex-col min-h-[500px]">
          <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
            <Terminal className="w-3 h-3" />
            Live Logs
          </h2>
          <div className="flex-1 bg-black/40 border border-neutral-800 rounded-2xl p-4 font-mono text-[11px] overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 leading-relaxed">
                <span className="text-neutral-600 shrink-0">{new Date(log.ts * 1000).toLocaleTimeString([], {hour12:false})}</span>
                <span className={`shrink-0 font-bold ${
                  log.level === 'ERROR' ? 'text-red-500' : 
                  log.level === 'WARNING' ? 'text-yellow-500' : 'text-blue-500'
                }`}>{log.level}</span>
                <span className="text-neutral-400 break-all">{log.msg}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ClockIcon(props: any) {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
