import { useMemo } from "react"
import { AppShell } from "~/components/layout/app-shell"
// Vite imports at build time — UI changes + Brain changes merged
import uiChangelogRaw from "../../CHANGELOG.md?raw"
import brainChangelogRaw from "../../../RELEASE_NOTES.md?raw"

interface Release {
  version: string
  date: string
  rawDate: string
  source: "ui" | "brain"
  highlight: string
  items: string[]
}

/** Parse CHANGELOG.md into structured releases */
function parseChangelog(raw: string, source: "ui" | "brain"): Release[] {
  const releases: Release[] = []
  const sections = raw.split(/^## /m).filter(Boolean)

  for (const section of sections) {
    const lines = section.trim().split("\n")
    const header = lines[0] || ""

    // Parse "v0.2.3 (2026-03-24)"
    const match = header.match(/^(v[\d.]+)\s*\((\d{4}-\d{2}-\d{2})\)/)
    if (!match) continue

    const version = match[1]
    const rawDate = match[2]
    const d = new Date(rawDate + "T00:00:00")
    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })

    let highlight = ""
    const items: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      if (line.startsWith("**") && line.endsWith("**")) {
        highlight = line.replace(/\*\*/g, "")
        continue
      }

      if (line.startsWith("- ")) {
        items.push(line.slice(2))
        continue
      }

      if (line.endsWith(":")) continue
    }

    releases.push({ version, date, rawDate, source, highlight, items })
  }

  return releases
}

/** Merge UI + Brain changelogs, sorted newest first */
function mergeChangelogs(): Release[] {
  const ui = parseChangelog(uiChangelogRaw, "ui")
  const brain = parseChangelog(brainChangelogRaw, "brain")
  return [...ui, ...brain].sort((a, b) => b.rawDate.localeCompare(a.rawDate))
}

export default function ChangelogPage() {
  const releases = useMemo(() => mergeChangelogs(), [])

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        <div className="max-w-2xl space-y-3">
          {releases.map((r) => (
            <div key={r.version} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground">{r.version}</h2>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                    r.source === "brain"
                      ? "bg-accent-porter/15 text-accent-porter"
                      : "bg-foreground/10 text-text2"
                  }`}>
                    {r.source === "brain" ? "brain" : "ui"}
                  </span>
                </div>
                <span className="text-[10px] text-text3 font-mono">{r.date}</span>
              </div>
              {r.highlight && (
                <p className="text-xs font-medium text-accent-porter mb-2">{r.highlight}</p>
              )}
              {r.items.length > 0 && (
                <div className="space-y-1">
                  {r.items.map((item, i) => (
                    <p key={i} className="text-[12px] text-text2">• {item}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
