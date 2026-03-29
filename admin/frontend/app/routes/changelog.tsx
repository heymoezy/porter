import { useMemo } from "react"
// Single monorepo changelog — root CHANGELOG.md covers both Brain + Admin
import changelogRaw from "../../../../CHANGELOG.md?raw"

interface Release {
  version: string
  date: string
  rawDate: string
  highlight: string
  items: string[]
}

/** Parse CHANGELOG.md into structured releases */
function parseChangelog(raw: string): Release[] {
  const releases: Release[] = []
  const sections = raw.split(/^## /m).filter(Boolean)

  for (const section of sections) {
    const lines = section.trim().split("\n")
    const header = lines[0] || ""

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
    }

    releases.push({ version, date, rawDate, highlight, items })
  }

  return releases
}

export default function ChangelogPage() {
  const releases = useMemo(() => parseChangelog(changelogRaw), [])

  return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <div className="max-w-2xl space-y-3 p-4">
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
