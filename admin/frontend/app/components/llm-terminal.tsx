import { Cpu } from "lucide-react"
import { cn } from "~/lib/utils"

interface TermLine {
  text: string
  color: string
}

interface LLMTerminalProps {
  lines: (TermLine & { _key: number })[]
  title?: string
  className?: string
}

export function LLMTerminal({ lines, title = "LLM Activity", className }: LLMTerminalProps) {
  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      {/* Traffic light header */}
      <div className="flex items-center gap-2 bg-[color-mix(in_srgb,var(--background)_90%,black)] px-3 py-1.5 border-b border-border">
        <div className="flex gap-1">
          <div className="h-2 w-2 rounded-full bg-danger/60" />
          <div className="h-2 w-2 rounded-full bg-warning/60" />
          <div className="h-2 w-2 rounded-full bg-success/60" />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <Cpu className="h-3 w-3 text-chart-2" />
          <span className="text-[10px] font-mono text-text3">{title}</span>
        </div>
        <span className="flex items-center gap-1 text-[9px] text-success font-mono">
          <span className="h-1 w-1 rounded-full bg-success animate-pulse-badge" />
          live
        </span>
      </div>

      {/* Terminal body */}
      <div className="bg-[color-mix(in_srgb,var(--background)_90%,black)] p-2.5 font-mono text-[10px] leading-[1.8]">
        {lines.map((l, i) => (
          <p
            key={l._key}
            className={cn(
              l.color,
              i === lines.length - 1 && "animate-list-stagger-in streaming-cursor inline-block"
            )}
          >
            {l.text}
          </p>
        ))}
      </div>
    </div>
  )
}
