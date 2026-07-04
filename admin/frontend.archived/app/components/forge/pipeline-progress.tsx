import { cn } from "~/lib/utils"

interface PipelineProgressProps {
  currentStation: 0 | 1 | 2 | 3 | 4
  className?: string
}

const STATIONS = [
  { label: "Q", title: "Queued" },
  { label: "W", title: "Writer" },
  { label: "T", title: "Trainer" },
  { label: "O", title: "Outfitter" },
]

function PipelineProgress({ currentStation, className }: PipelineProgressProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)} title={`Station ${currentStation}`}>
      {STATIONS.map((s, i) => {
        const done = i < currentStation
        const active = i === currentStation && currentStation < 4
        return (
          <div key={i} className="flex items-center gap-0.5">
            <div
              className={cn(
                "size-4 rounded-full flex items-center justify-center text-2xs font-bold transition-all",
                done && "bg-success text-white",
                active && "bg-[var(--forge-ember)] text-white animate-pulse",
                !done && !active && "bg-raised text-text3",
              )}
              title={s.title}
            >
              {done ? "✓" : s.label}
            </div>
            {i < STATIONS.length - 1 && (
              <div className={cn("w-2 h-px", done ? "bg-success" : "bg-raised")} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export { PipelineProgress }
