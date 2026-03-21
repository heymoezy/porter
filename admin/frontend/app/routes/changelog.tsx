import { AdminShell } from "~/components/layout/admin-shell"
import { useQuery } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { FileText } from "lucide-react"

function ChangelogContent() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "changelog"],
    queryFn: () => api<{ content: string }>("/api/admin/email/changelog"),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  const lines = (data?.content || "").split("\n")

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="size-3 text-accent-porter" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Release Notes</span>
      </div>
      <div className="rounded-xl border border-border bg-surface p-3 overflow-y-auto max-h-[calc(100vh-var(--header-height)-6rem)]">
        <div className="prose prose-sm prose-invert max-w-none text-xs text-text2 leading-relaxed">
          {lines.map((line, i) => {
            if (line.startsWith("# ")) return <h1 key={i} className="text-base font-bold text-text mb-2">{line.slice(2)}</h1>
            if (line.startsWith("## ")) return <h2 key={i} className="text-sm font-bold text-text mt-3 mb-1">{line.slice(3)}</h2>
            if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-bold text-text mt-2 mb-0.5">{line.slice(4)}</h3>
            if (line.startsWith("- ")) return <p key={i} className="pl-3 text-text3">• {line.slice(2)}</p>
            if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-bold text-text mt-1">{line.replace(/\*\*/g, "")}</p>
            if (line.trim() === "") return <div key={i} className="h-1" />
            return <p key={i}>{line}</p>
          })}
        </div>
      </div>
    </div>
  )
}

export default function ChangelogPage() {
  return (
    <AdminShell>
      <ChangelogContent />
    </AdminShell>
  )
}
