import { StatusBadge } from "~/components/ui/status-badge"

interface ProposalKindBadgeProps {
  kind: string
  className?: string
}

// The four dream-worker proposal kinds. Colour comes from the shared status map
// (merge info, supersede warning, delete danger, new_directive success).
const LABELS: Record<string, string> = {
  new_directive: "new",
}

export function ProposalKindBadge({ kind, className }: ProposalKindBadgeProps) {
  return <StatusBadge status={kind} label={LABELS[kind] ?? kind} className={className} />
}
