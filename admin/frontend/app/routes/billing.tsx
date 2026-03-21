import { AdminShell } from "~/components/layout/admin-shell"
import { useBillingSubscriptions, useBillingStats } from "~/hooks/use-admin-api"
import { CreditCard, Users, Clock } from "lucide-react"

function BillingContent() {
  const { data: stats } = useBillingStats()
  const { data: subs, isLoading } = useBillingSubscriptions()

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="animate-card-deal-in rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-accent-porter/15">
              <CreditCard className="size-3.5 text-accent-porter" />
            </div>
            <div>
              <p className="text-xs text-text3">Active</p>
              <p className="text-lg font-bold text-text">{stats?.active ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="animate-card-deal-in deal-2 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-warning/15">
              <Clock className="size-3.5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-text3">Trialing</p>
              <p className="text-lg font-bold text-text">{stats?.trialing ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="animate-card-deal-in deal-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-lg bg-text3/15">
              <Users className="size-3.5 text-text3" />
            </div>
            <div>
              <p className="text-xs text-text3">Total</p>
              <p className="text-lg font-bold text-text">{stats?.total ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <h3 className="mb-2 text-sm font-semibold text-text">Subscriptions</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
          </div>
        ) : !subs?.subscriptions.length ? (
          <p className="py-4 text-center text-sm text-text3">No subscriptions yet</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  <th className="px-3 py-2 text-left font-medium text-text3">User</th>
                  <th className="px-3 py-2 text-left font-medium text-text3">Plan</th>
                  <th className="px-3 py-2 text-left font-medium text-text3">Status</th>
                </tr>
              </thead>
              <tbody>
                {subs.subscriptions.map((sub: any, i: number) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-text">{sub.username}</td>
                    <td className="px-3 py-2 text-text2">{sub.plan}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                          sub.status === "active"
                            ? "bg-success/15 text-success"
                            : sub.status === "trialing"
                              ? "bg-warning/15 text-warning"
                              : "bg-text3/15 text-text3"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <AdminShell>
      <BillingContent />
    </AdminShell>
  )
}
