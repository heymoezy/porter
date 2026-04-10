import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"
import { LLMTerminal } from "~/components/llm-terminal"

const TERM_STREAM = [
  { text: "\u25b8 gpt-5.4 \u2192 writing SEO meta descriptions...", color: "text-warning" },
  { text: "  tokens: 892 in / 156 out \u00b7 0.8s", color: "text-text3" },
  { text: "\u25b8 claude-opus \u2192 code review: auth middleware", color: "text-chart-2" },
  { text: "\u25c6 decision: qwen-local for short reply (low latency)", color: "text-warning" },
  { text: "\u25b8 qwen-local \u2192 generating quick response...", color: "text-accent-porter" },
  { text: "\u2713 response delivered in 340ms", color: "text-success" },
  { text: "\u25b8 claude-opus \u2192 Brand Guide: typography rationale", color: "text-chart-2" },
  { text: "  tokens: 2,104 in / 518 out \u00b7 1.8s", color: "text-text3" },
  { text: "\u25b8 gpt-5.4 \u2192 Mobile App: wireframe descriptions", color: "text-warning" },
  { text: "\u25c6 memory: learned bakery industry SEO patterns", color: "text-chart-3" },
]

const INITIAL_LINES = [
  { text: "\u25b8 claude-opus \u2192 analyzing hero copy...", color: "text-chart-2", _key: 1 },
  { text: "\u25b8 gpt-5.4 \u2192 color palette rationale", color: "text-warning", _key: 2 },
  { text: "\u25b8 qwen-local \u2192 intent: project_creation", color: "text-accent-porter", _key: 3 },
  { text: "\u2713 routed to claude-opus (code analysis)", color: "text-success", _key: 4 },
]

interface LLMActivityProps {
  mounted: boolean
  className?: string
}

export function LLMActivity({ mounted, className }: LLMActivityProps) {
  const [termLines, setTermLines] = useState(INITIAL_LINES)

  useMountEffect(() => {
    let idx = 0
    const id = setInterval(() => {
      const l = TERM_STREAM[idx % TERM_STREAM.length]
      idx++
      setTermLines(p => [...p.slice(-3), { ...l, _key: Date.now() }])
    }, 2500)
    return () => clearInterval(id)
  })

  return (
    <div
      className={`transition-all duration-500 min-w-0 overflow-hidden ${mounted ? "opacity-100" : "opacity-0"} ${className || ""}`}
      style={{ transitionDelay: "700ms" }}
    >
      <LLMTerminal lines={termLines} className="h-full" />
    </div>
  )
}
