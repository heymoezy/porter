import { AdminShell } from "~/components/layout/admin-shell"
import { useEmailConfig, useEmailQueue } from "~/hooks/use-admin-api"
import { Mail, Send, AlertCircle } from "lucide-react"

function EmailContent() {
  const { data: config } = useEmailConfig()
  const { data: queue } = useEmailQueue()

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="animate-card-deal-in rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-warning/15">
              <Send className="size-3.5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-text3">Pending</p>
              <p className="text-lg font-bold text-text">{queue?.pending ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="animate-card-deal-in deal-2 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-success/15">
              <Mail className="size-3.5 text-success" />
            </div>
            <div>
              <p className="text-xs text-text3">Sent</p>
              <p className="text-lg font-bold text-text">{queue?.sent ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="animate-card-deal-in deal-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-danger/15">
              <AlertCircle className="size-3.5 text-danger" />
            </div>
            <div>
              <p className="text-xs text-text3">Failed</p>
              <p className="text-lg font-bold text-text">{queue?.failed ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Config Status */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <h3 className="mb-2 text-sm font-semibold text-text">SMTP Configuration</h3>
        {config?.configured ? (
          <p className="text-sm text-success">SMTP configured and ready</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-text3">
              Email engine not yet configured. Phase 2 will add SMTP setup, queue management, and template editing.
            </p>
            <div className="rounded-lg bg-background px-3 py-2 text-xs text-text3">
              Coming: SMTP config form, template preview, queue table, retry/cancel actions
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmailPage() {
  return (
    <AdminShell>
      <EmailContent />
    </AdminShell>
  )
}
