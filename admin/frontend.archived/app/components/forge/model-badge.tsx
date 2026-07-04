import { cn } from "~/lib/utils"
import { Badge } from "~/components/ui/badge"

type ModelProvider = "claude" | "gpt" | "gemini" | "unknown"

function detectProvider(model: string): ModelProvider {
  const m = model.toLowerCase()
  if (m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) return "claude"
  if (m.includes("gpt") || m.includes("openai") || m.includes("codex")) return "gpt"
  if (m.includes("gemini") || m.includes("google")) return "gemini"
  return "unknown"
}

const providerStyles: Record<ModelProvider, string> = {
  claude:  "bg-[var(--forge-model-claude)]/15 text-[var(--forge-model-claude)]",
  gpt:     "bg-[var(--forge-model-gpt)]/15 text-[var(--forge-model-gpt)]",
  gemini:  "bg-[var(--forge-model-gemini)]/15 text-[var(--forge-model-gemini)]",
  unknown: "bg-raised text-text3",
}

interface ModelBadgeProps {
  model: string
  className?: string
}

function ModelBadge({ model, className }: ModelBadgeProps) {
  const provider = detectProvider(model)
  return (
    <Badge className={cn("text-2xs px-1.5 py-0 h-4 font-medium border-0", providerStyles[provider], className)}>
      {model}
    </Badge>
  )
}

export { ModelBadge, detectProvider }
export type { ModelProvider }
