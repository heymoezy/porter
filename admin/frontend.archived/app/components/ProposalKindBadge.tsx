import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

interface ProposalKindBadgeProps {
  kind: string
  className?: string
}

// Color encoding for the 4 dream-worker proposal kinds:
//   merge         → blue   (combining truths)
//   supersede     → amber  (replacing a single rule)
//   delete        → red    (archiving a rule)
//   new_directive → green  (adding a new rule)
const STYLES: Record<string, string> = {
  merge:         "bg-blue-500/10 text-blue-300 border-blue-500/30",
  supersede:     "bg-amber-500/10 text-amber-300 border-amber-500/30",
  delete:        "bg-red-500/10 text-red-300 border-red-500/30",
  new_directive: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
}

const LABELS: Record<string, string> = {
  merge:         "merge",
  supersede:     "supersede",
  delete:        "delete",
  new_directive: "new",
}

export function ProposalKindBadge({ kind, className }: ProposalKindBadgeProps) {
  const style = STYLES[kind] ?? ""
  const label = LABELS[kind] ?? kind
  return (
    <Badge variant="outline" className={cn(style, className)}>
      {label}
    </Badge>
  )
}
