import { cn } from "~/lib/utils"

interface DiffBlockProps {
  before: string
  after: string
  className?: string
}

/**
 * Minimal line-by-line diff display. NOT a real LCS/Myers diff — does a simple
 * set-difference to show what's only in `before` (removed) and only in `after`
 * (added). Good enough for proposal previews where the model produces wholesale
 * rewrites of directive content. Defer LCS to a follow-up phase if needed.
 *
 * No external dependency — uses existing Tailwind palette + cn() helper.
 *
 * Used by ProposalDetailDrawer for supersede/merge kind previews.
 */
export function DiffBlock({ before, after, className }: DiffBlockProps) {
  const beforeLines = (before || "").split("\n")
  const afterLines = (after || "").split("\n")

  const beforeSet = new Set(beforeLines)
  const afterSet = new Set(afterLines)

  return (
    <div
      className={cn(
        "font-mono text-xs leading-relaxed border border-border rounded overflow-hidden",
        className,
      )}
    >
      <div className="bg-surface/50 px-2 py-1 text-2xs uppercase tracking-wide text-text3 border-b border-border">
        Before → After
      </div>
      <div className="divide-y divide-border/40">
        {beforeLines.map((line, i) => (
          <div
            key={`b-${i}`}
            className={cn(
              "px-2 py-0.5 whitespace-pre-wrap",
              afterSet.has(line) ? "" : "bg-red-500/10 text-red-300",
            )}
          >
            {afterSet.has(line) ? (
              <span className="text-text3 mr-1"> </span>
            ) : (
              <span className="text-red-400 mr-1">−</span>
            )}
            {line || <span className="text-text3">∅</span>}
          </div>
        ))}
        {afterLines
          .filter((l) => !beforeSet.has(l))
          .map((line, i) => (
            <div
              key={`a-${i}`}
              className="px-2 py-0.5 whitespace-pre-wrap bg-green-500/10 text-green-300"
            >
              <span className="text-green-400 mr-1">+</span>
              {line || <span className="text-text3">∅</span>}
            </div>
          ))}
      </div>
    </div>
  )
}
