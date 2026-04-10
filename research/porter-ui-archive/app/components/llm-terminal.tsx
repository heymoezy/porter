/**
 * LLMTerminal — Log viewer / activity feed component.
 *
 * CANONICAL SOURCE: porter-admin/frontend/app/components/llm-terminal.tsx
 * Porter UI symlinks to this file. Do not duplicate.
 *
 * Follows light/dark theme via CSS variables. Always fills container height.
 * Set `pulse` to true for a breathing border effect on active feeds.
 */
import { Cpu } from "lucide-react"
import { cn } from "~/lib/utils"

interface TermLine {
  text: string
  color: string
}

interface LLMTerminalProps {
  lines: (TermLine & { _key: number })[]
  title?: string
  pulse?: boolean
  className?: string
}

export function LLMTerminal({ lines, title = "LLM Activity", pulse = false, className }: LLMTerminalProps) {
  return (
    <div className={cn(
      "rounded-lg border overflow-hidden flex flex-col transition-all",
      pulse && lines.length > 0 ? "border-accent-porter/40 shadow-[0_0_20px_rgba(139,92,246,0.08)]" : "border-border",
      className
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-raised px-3 py-1.5 border-b border-border">
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
          <span className={cn("h-1.5 w-1.5 rounded-full bg-success", pulse ? "animate-pulse" : "animate-pulse-badge")} />
          live
        </span>
      </div>

      {/* Terminal body — fills container */}
      <div className="bg-background p-2.5 font-mono text-[10px] leading-[1.8] flex-1 overflow-y-auto">
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
