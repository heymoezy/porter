import { AgentPresenceSummary } from "~/components/agent-presence"
import { SkillsStudio } from "~/components/forge/skills-studio"

export default function SkillsPage() {
  return (
    <div className="overflow-y-auto p-4 flex-1">
      <AgentPresenceSummary surface="skills" className="mb-3" />
      <SkillsStudio />
    </div>
  )
}
