import { Monitor } from "lucide-react"
import { AppShell } from "~/components/layout/app-shell"

export default function ToolsPage() {
  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center flex-1 text-text3">
        <Monitor className="size-10 opacity-30 mb-3" />
        <p className="text-sm font-medium">Coming soon</p>
        <p className="text-xs mt-1">Tool management is on the way.</p>
      </div>
    </AppShell>
  )
}
