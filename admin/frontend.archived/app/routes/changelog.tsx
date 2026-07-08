import { useMemo } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft } from "lucide-react"
// Changelog renders the ONE curated release feed (PORTER_RELEASES), baked from
// the backend at deploy by gen-admin-release-info.ts — the SAME feed the group
// announce uses. So the changelog always matches what we actually shipped +
// announced (no separate/stale source).
import { PORTER_RELEASES } from "../lib/release-info.generated"

interface Release {
  version: string
  date: string
  highlight: string
  items: string[]
}

function feedToReleases(): Release[] {
  return PORTER_RELEASES.map((r) => ({
    version: `v${r.version}`,
    date: new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
    highlight: r.title,
    items: r.bullets,
  }))
}

export default function ChangelogPage() {
  const navigate = useNavigate()
  const releases = useMemo(() => feedToReleases(), [])

  return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <div className="max-w-2xl space-y-3 p-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-text3 hover:text-text2 transition-colors mb-2">
            <ArrowLeft className="size-3.5" /> Back
          </button>
          {releases.length === 0 ? (
            <p className="text-xs text-text3">No changelog entries</p>
          ) : (
            releases.map((r) => (
              <div key={r.version} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-text">{r.version}</h2>
                  <span className="text-2xs text-text3 font-mono">{r.date}</span>
                </div>
                {r.highlight && (
                  <p className="text-xs font-medium text-accent-porter mb-2">{r.highlight}</p>
                )}
                {r.items.length > 0 && (
                  <div className="space-y-1">
                    {r.items.map((item, i) => (
                      <p key={i} className="text-xs text-text2">• {item}</p>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
  )
}
