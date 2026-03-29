import { useState } from "react"
import {
  useCustomerNotes,
  useAddNote,
  useDeleteNote,
  type CustomerNote,
} from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { Trash2, FileText, Plus } from "lucide-react"

// ── Helpers ──────────────────────────────────────────────
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ── Inline Markdown ──────────────────────────────────────
/** Lightweight markdown→React: **bold**, *italic*, `code`, ```blocks``` */
function renderMarkdown(text: string): React.ReactNode {
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return blocks.map((block, bi) => {
    if (block.startsWith("```") && block.endsWith("```")) {
      const code = block.slice(3, -3).replace(/^\w*\n/, "")
      return (
        <pre
          key={bi}
          className="my-1.5 rounded bg-black/20 px-2.5 py-1.5 text-2xs font-mono overflow-x-auto whitespace-pre-wrap"
        >
          {code}
        </pre>
      )
    }
    return block.split("\n").map((line, li) => {
      const parts: React.ReactNode[] = []
      const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
      let last = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(line.slice(last, m.index))
        if (m[2])
          parts.push(
            <strong key={`${bi}-${li}-${m.index}`} className="font-bold">
              {m[2]}
            </strong>
          )
        else if (m[3])
          parts.push(<em key={`${bi}-${li}-${m.index}`}>{m[3]}</em>)
        else if (m[4])
          parts.push(
            <code
              key={`${bi}-${li}-${m.index}`}
              className="rounded bg-black/20 px-1 py-0.5 text-2xs font-mono"
            >
              {m[4]}
            </code>
          )
        last = m.index + m[0].length
      }
      if (last < line.length) parts.push(line.slice(last))
      return (
        <span key={`${bi}-${li}`}>
          {parts}
          {li < block.split("\n").length - 1 && "\n"}
        </span>
      )
    })
  })
}

// ── Component ────────────────────────────────────────────
export function CustomerNotes({ username }: { username: string }) {
  const { data, isLoading, isError } = useCustomerNotes(username)
  const addNote = useAddNote(username)
  const deleteNote = useDeleteNote(username)
  const [draft, setDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const notes: CustomerNote[] = data?.notes ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await addNote.mutateAsync(trimmed)
      setDraft("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="ring-0 border border-border">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-text3">Notes</p>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2">
            <div className="h-4 bg-border/20 rounded animate-pulse w-full" />
            <div className="h-4 bg-border/20 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-border/20 rounded animate-pulse w-1/2" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-2xs text-danger">
            Failed to load notes
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && notes.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 py-6 text-text3">
            <FileText className="size-5 opacity-30" />
            <p className="text-2xs">No notes yet</p>
          </div>
        )}

        {/* Note cards */}
        {notes.map((note) => (
          <div
            key={note.id}
            className="group relative rounded-lg border border-border/50 bg-raised/30 px-3 py-2.5"
          >
            <div className="text-xs text-text leading-relaxed">
              {renderMarkdown(note.content)}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xs text-text3/40">{fmtDate(note.created_at)}</span>
              <span className="text-2xs text-text3/40">by {note.created_by}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-5 px-1.5 opacity-0 group-hover:opacity-100 text-text3/50 hover:text-danger transition-opacity"
                onClick={() => deleteNote.mutate(note.id)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}

        {/* Add note form */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note... (markdown supported)"
            className="min-h-[80px] text-xs bg-background border-border/50 resize-none"
            disabled={submitting}
          />
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={!draft.trim() || submitting}>
              <Plus className="size-3 mr-1" />
              {submitting ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
