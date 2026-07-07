import { AgentPresenceSummary } from "~/components/agent-presence"
import { ToolsStudio } from "~/components/studio/tools-studio"

export default function ToolsPage() {
  return (
    <div className="overflow-y-auto p-4 flex-1">
      <AgentPresenceSummary surface="tools" className="mb-3" />
      <ToolsStudio />
    </div>
  )
}
