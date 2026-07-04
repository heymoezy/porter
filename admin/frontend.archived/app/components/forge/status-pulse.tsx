import { cn } from "~/lib/utils"

type PulseStatus = "born" | "forging" | "ghost" | "error" | "idle"

const statusConfig: Record<PulseStatus, { color: string; animate: boolean; label: string }> = {
  born:    { color: "bg-[var(--forge-mint)]",   animate: false, label: "Born" },
  forging: { color: "bg-[var(--forge-ember)]",  animate: true,  label: "Forging" },
  ghost:   { color: "bg-[var(--forge-steel)]",  animate: false, label: "Pending" },
  error:   { color: "bg-[var(--forge-danger)]", animate: true,  label: "Error" },
  idle:    { color: "bg-[var(--text3)]",        animate: false, label: "Idle" },
}

interface StatusPulseProps {
  status: PulseStatus
  className?: string
  showLabel?: boolean
}

function StatusPulse({ status, className, showLabel = false }: StatusPulseProps) {
  const config = statusConfig[status]

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-2">
        {config.animate && (
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-50", config.color)} />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", config.color)} />
      </span>
      {showLabel && (
        <span className="text-2xs font-medium text-text2">{config.label}</span>
      )}
    </span>
  )
}

export { StatusPulse }
export type { PulseStatus }
