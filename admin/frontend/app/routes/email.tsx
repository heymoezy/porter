import { useState, useRef, lazy, Suspense } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "~/lib/api"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  Inbox, Send, FileText, Trash2, Plus, ArrowLeft, Mail,
  Bold, Italic, Link, List, ListOrdered, Code, Heading,
  ChevronDown, Settings, Check, AlertTriangle, Archive,
  Reply, CornerUpLeft, Search, Paperclip, X, Download, RotateCw,
} from "lucide-react"
import { Label } from "~/components/ui/label"

// ── Types matching backend row shapes ──────────────────────────────────

interface Mailbox {
  id: string
  domain_id: string
  address: string
  local_part: string
  display_name: string
  mailbox_type: string
  status: string
  last_sync_at: number | null
}

interface ThreadRow {
  id: string
  mailbox_id: string
  subject_canonical: string
  last_message_at: number | null
  message_count: number
  participants_json: string[] | unknown
  created_at: number | null
}

interface AttachmentMeta {
  blobId: string
  name: string
  type: string
  size: number
}

interface MessageRow {
  id: string
  mailbox_id: string
  thread_id: string | null
  direction: string
  folder: string
  status: string
  from_address: string
  from_name: string
  to_addresses_json: string[] | unknown
  cc_addresses_json: string[] | unknown
  subject: string
  snippet: string
  text_body: string
  html_body: string
  read_at: number | null
  sent_at: number | null
  created_at: number | null
  attachments_json: AttachmentMeta[] | unknown
}

interface MailIdentity {
  mailboxId: string
  address: string
  displayName: string
  agentId: string
  agentName: string
  role: string
  isPrimary: boolean
}

type Folder = "inbox" | "sent" | "drafts" | "trash" | "archive"

const folderDefs: Array<{ id: Folder; label: string; icon: React.ElementType }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
]

// ── Helpers ────────────────────────────────────────────────────────────

function fmtDate(ts: number | null) {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, "")
    .replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""')
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === "string") { try { return JSON.parse(val) } catch { return [] } }
  return []
}

function threadParticipants(thread: ThreadRow): string {
  const arr = parseJsonArray(thread.participants_json)
  if (arr.length === 0) return "Unknown"
  if (arr.length === 1) return arr[0]
  return `${arr[0]} +${arr.length - 1}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function parseAttachments(val: unknown): AttachmentMeta[] {
  if (Array.isArray(val)) return val as AttachmentMeta[]
  if (typeof val === "string") { try { return JSON.parse(val) } catch { return [] } }
  return []
}

// ── Main component ─────────────────────────────────────────────────────

function EmailContent() {
  const qc = useQueryClient()
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeData, setComposeData] = useState({ from: "", to: "", subject: "", body: "" })
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showSmtp, setShowSmtp] = useState(false)
  const [smtpForm, setSmtpForm] = useState<Record<string, string>>({})
  const [replyText, setReplyText] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const editorRef = useRef<HTMLDivElement>(null)

  // ── SMTP config (separate concern, keep) ──────────────────────────
  const { data: smtpData } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => api<{ configured: boolean; host: string; port: number; user: string; hasPassword: boolean; fromName: string; fromEmail: string; replyTo: string }>("/api/admin/email/config"),
  })

  const saveSmtp = useMutation({
    mutationFn: (data: Record<string, string>) => api("/api/admin/email/config", { method: "PUT", json: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "email", "config"] }),
  })

  // ── Identities (for compose picker) ───────────────────────────────
  const identitiesQuery = useQuery({
    queryKey: ["mail", "identities"],
    queryFn: () => api<{ identities: MailIdentity[] }>("/api/v1/mail"),
  })

  const senders = (identitiesQuery.data?.identities ?? []).map(i => ({
    id: i.mailboxId,
    name: i.displayName || i.agentName,
    email: i.address,
    role: i.role || "Agent",
    agentId: i.agentId,
  }))

  const primaryIdentity = identitiesQuery.data?.identities?.find(i => i.isPrimary)
  const defaultSenderId = primaryIdentity?.mailboxId ?? senders[0]?.id ?? ""
  const activeSender = senders.find(s => s.id === (composeData.from || defaultSenderId)) ?? senders[0]

  // ── Mailboxes ─────────────────────────────────────────────────────
  const mailboxesQuery = useQuery({
    queryKey: ["mail", "mailboxes"],
    queryFn: () => api<{ mailboxes: Mailbox[] }>("/api/v1/mail/mailboxes"),
  })

  const mailboxes = mailboxesQuery.data?.mailboxes ?? []

  // Auto-select porter mailbox, fall back to first
  const porterMailbox = mailboxes.find(m => m.local_part === "porter")
  const activeMailboxId = selectedMailboxId ?? porterMailbox?.id ?? mailboxes[0]?.id ?? null
  const activeMailbox = mailboxes.find(m => m.id === activeMailboxId)

  // ── Folder counts ─────────────────────────────────────────────────
  const foldersQuery = useQuery({
    queryKey: ["mail", "folders", activeMailboxId],
    queryFn: () => api<{ mailboxId: string; folders: Record<string, number> }>(`/api/v1/mail/mailboxes/${activeMailboxId}/folders`),
    enabled: !!activeMailboxId,
    refetchInterval: 30_000,
  })

  const folderCounts = foldersQuery.data?.folders ?? {}

  // ── Threads ───────────────────────────────────────────────────────
  const threadsQuery = useQuery({
    queryKey: ["mail", "threads", activeMailboxId, activeFolder],
    queryFn: () => api<{ threads: ThreadRow[]; total: number }>(`/api/v1/mail/mailboxes/${activeMailboxId}/threads?folder=${activeFolder}&limit=50`),
    enabled: !!activeMailboxId,
    refetchInterval: activeFolder === "inbox" ? 15_000 : undefined,
  })

  const allThreads = threadsQuery.data?.threads ?? []
  const threads = searchQuery.trim()
    ? allThreads.filter(t => {
        const q = searchQuery.toLowerCase()
        return (t.subject_canonical || "").toLowerCase().includes(q)
          || threadParticipants(t).toLowerCase().includes(q)
      })
    : allThreads

  // ── Thread messages ───────────────────────────────────────────────
  const threadMessagesQuery = useQuery({
    queryKey: ["mail", "thread-messages", selectedThreadId, activeMailboxId],
    queryFn: () => api<{ messages: MessageRow[] }>(`/api/v1/mail/threads/${selectedThreadId}/messages?mailboxId=${activeMailboxId}`),
    enabled: !!selectedThreadId && !!activeMailboxId,
  })

  const threadMessages = threadMessagesQuery.data?.messages ?? []
  const selectedThread = threads.find(t => t.id === selectedThreadId)

  // ── Mark read on view ─────────────────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: (messageId: string) => api(`/api/v1/mail/messages/${messageId}/read`, { method: "POST", json: { mailboxId: activeMailboxId } }),
  })

  // Auto-mark unread messages as read when thread is viewed
  const markThreadMessagesRead = (messages: MessageRow[]) => {
    for (const msg of messages) {
      if (!msg.read_at && msg.direction === "inbound") {
        markReadMutation.mutate(msg.id, {
          onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["mail", "folders", activeMailboxId] })
          },
        })
      }
    }
  }

  // ── Attachment state ───────────────────────────────────────────────
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentMeta[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("mailboxId", activeSender?.id ?? activeMailboxId ?? "")
      const res = await fetch("/api/v1/mail/attachments/upload", { method: "POST", body: formData, credentials: "include" })
      if (!res.ok) throw new Error("Upload failed")
      const json = await res.json()
      return json.data as AttachmentMeta
    },
    onSuccess: (att) => setPendingAttachments(prev => [...prev, att]),
  })

  // ── Send ──────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: (data: { mailboxId: string; to: string[]; subject: string; textBody: string; htmlBody?: string; attachments?: AttachmentMeta[] }) => {
      setSelectedMailboxId(data.mailboxId)
      return api("/api/v1/mail/messages/send", { method: "POST", json: data })
    },
    onSuccess: () => {
      setComposing(false)
      setComposeData({ from: "", to: "", subject: "", body: "" })
      setPendingAttachments([])
      if (editorRef.current) editorRef.current.innerHTML = ""
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Draft ─────────────────────────────────────────────────────────
  const draftMutation = useMutation({
    mutationFn: (data: { mailboxId: string; to?: string[]; subject?: string; textBody?: string; htmlBody?: string }) =>
      api("/api/v1/mail/drafts", { method: "POST", json: data }),
    onSuccess: () => {
      setComposing(false)
      setComposeData({ from: "", to: "", subject: "", body: "" })
      setPendingAttachments([])
      if (editorRef.current) editorRef.current.innerHTML = ""
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Reply ─────────────────────────────────────────────────────────
  const replyMutation = useMutation({
    mutationFn: (data: { messageId: string; textBody: string }) =>
      api(`/api/v1/mail/messages/${data.messageId}/reply`, { method: "POST", json: { mailboxId: activeMailboxId, textBody: data.textBody } }),
    onSuccess: () => {
      setReplyText("")
      setReplyingToId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Archive ───────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}/archive`, { method: "POST", json: { mailboxId: activeMailboxId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Trash ─────────────────────────────────────────────────────────
  const trashMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}/trash`, { method: "POST", json: { mailboxId: activeMailboxId } }),
    onSuccess: () => {
      setSelectedThreadId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Permanent delete (from trash) ──────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api(`/api/v1/mail/messages/${messageId}?mailboxId=${activeMailboxId}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedThreadId(null)
      qc.invalidateQueries({ queryKey: ["mail"] })
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────

  function execFormat(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleSend(asDraft: boolean) {
    if (!activeSender) return
    const mailboxId = activeSender.id
    const html = editorRef.current?.innerHTML || ""
    const text = editorRef.current?.textContent || ""
    const toList = composeData.to.split(",").map(s => s.trim()).filter(Boolean)

    if (asDraft) {
      draftMutation.mutate({
        mailboxId,
        to: toList.length > 0 ? toList : undefined,
        subject: composeData.subject || undefined,
        textBody: text || undefined,
        htmlBody: html || undefined,
      })
    } else {
      if (!toList.length || !composeData.subject || !text) return
      sendMutation.mutate({
        mailboxId, to: toList, subject: composeData.subject, textBody: text, htmlBody: html,
        attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      })
    }
  }

  function handleReply(messageId: string) {
    if (!replyText.trim()) return
    replyMutation.mutate({ messageId, textBody: replyText.trim() })
  }

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId)
    setComposing(false)
    // Mark messages read after a short delay to allow query to populate
    setTimeout(() => {
      const cached = qc.getQueryData<{ messages: MessageRow[] }>(["mail", "thread-messages", threadId])
      if (cached?.messages) markThreadMessagesRead(cached.messages)
    }, 500)
  }

  function handleArchiveThread() {
    // Archive all messages in the thread
    for (const msg of threadMessages) {
      if (msg.folder !== "archive") archiveMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  function handleTrashThread() {
    // Trash all messages in the thread
    for (const msg of threadMessages) {
      if (msg.folder !== "trash") trashMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  function handleDeleteThread() {
    // Permanently delete all messages in the thread
    for (const msg of threadMessages) {
      deleteMutation.mutate(msg.id)
    }
    setSelectedThreadId(null)
  }

  // ── Loading state ─────────────────────────────────────────────────
  if (mailboxesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
      </div>
    )
  }

  // Resolve reply target — last inbound or last message
  const replyTarget = [...threadMessages].reverse().find(m => m.direction === "inbound") ?? threadMessages[threadMessages.length - 1]

  return (
    <div className="flex h-[calc(100vh-var(--header-height)-2rem)]">
      {/* ── Left sidebar (mailboxes) ──────────────────────────────── */}
      <div className="w-[200px] shrink-0 flex flex-col border-r border-border bg-background px-3 py-3">
        <Button
          className="w-full gap-2 mb-4 h-10 text-sm font-semibold rounded-2xl shadow-sm"
          onClick={() => { setComposing(true); setSelectedThreadId(null) }}
        >
          <Plus className="size-4" /> Compose
        </Button>

        <nav className="flex flex-col gap-1 flex-1 min-h-0">
          {mailboxes.map(mb => {
            const isActive = mb.id === activeMailboxId
            const unread = folderCounts.inbox ?? 0
            return (
              <button
                key={mb.id}
                onClick={() => { setSelectedMailboxId(mb.id); setSelectedThreadId(null); setComposing(false); setActiveFolder("inbox") }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? "bg-accent-porter/10" : "hover:bg-raised"
                }`}
              >
                <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isActive ? "bg-accent-porter text-white" : "bg-raised text-text3"
                }`}>
                  {(mb.display_name || mb.local_part)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <span className={`text-sm block truncate ${isActive ? "font-semibold text-accent-porter" : "text-text"}`}>
                    {mb.display_name || mb.local_part}
                  </span>
                  <span className="text-2xs text-text3 block truncate">{mb.local_part}@</span>
                </div>
                {isActive && unread > 0 && (
                  <span className="text-2xs font-bold bg-accent-porter text-white rounded-full size-5 flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Main content area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Folder tabs */}
        <div className="shrink-0 flex items-center px-4 py-2 border-b border-border bg-surface gap-0.5">
          {folderDefs.map(f => {
            const count = folderCounts[f.id] ?? 0
            const isActive = activeFolder === f.id
            const Icon = f.icon
            return (
              <button
                key={f.id}
                onClick={() => { setActiveFolder(f.id); setSelectedThreadId(null); setComposing(false) }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-accent-porter/10 text-accent-porter font-semibold"
                    : "text-text3 hover:text-text2 hover:bg-raised"
                }`}
              >
                <Icon className="size-4" />
                <span>{f.label}</span>
                {count > 0 && (
                  <span className={`text-xs tabular-nums ${isActive ? "text-accent-porter" : "text-text3"}`}>{count}</span>
                )}
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { qc.invalidateQueries({ queryKey: ["mail"] }) }}
              className={`flex size-8 items-center justify-center rounded-lg text-text3 hover:text-text hover:bg-raised transition-colors ${threadsQuery.isFetching ? "pointer-events-none" : ""}`}
              title="Refresh"
            >
              <RotateCw className={`size-4 ${threadsQuery.isFetching ? "animate-spin" : ""}`} />
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text3" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8 w-[200px] rounded-lg"
                placeholder="Search mail..."
              />
            </div>
          </div>
        </div>

        {/* Thread list + detail split */}
        <div className="flex-1 flex min-h-0">
          {/* ── Thread list ──────────────────────────────────── */}
          <div className="w-[360px] shrink-0 border-r border-border overflow-y-auto">
            {threadsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
              </div>
            ) : !activeMailboxId ? (
              <div className="px-4 py-12 text-center text-sm text-text3">No mailbox selected</div>
            ) : threads.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Mail className="size-10 text-text3/20 mx-auto mb-3" />
                <p className="text-sm text-text3">No messages in {activeFolder}</p>
              </div>
            ) : (
              threads.map(thread => {
                const isSelected = thread.id === selectedThreadId
                const sender = threadParticipants(thread)
                const initial = sender[0]?.toUpperCase() || "?"
                return (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left border-b border-border/20 transition-colors ${
                      isSelected ? "bg-accent-porter/8" : "hover:bg-raised/50"
                    }`}
                  >
                    <div className={`size-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? "bg-accent-porter text-white" : "bg-raised text-text3"
                    }`}>
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text truncate">{sender}</span>
                        <span className="text-xs text-text3 ml-auto shrink-0">{fmtDate(thread.last_message_at)}</span>
                      </div>
                      <p className="text-sm text-text2 truncate">{thread.subject_canonical || "(no subject)"}</p>
                    </div>
                    {thread.message_count > 1 && (
                      <span className="text-xs text-text3 bg-raised rounded-full px-1.5 py-0.5 shrink-0">{thread.message_count}</span>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* ── Thread detail / Compose / Empty ──────────────── */}
          <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
            {composing ? (
              /* ── Compose ─────────────────────────────────────── */
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setComposing(false)} className="text-text3 hover:text-text"><ArrowLeft className="size-4" /></button>
                    <span className="text-base font-semibold text-text">New Message</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleSend(true)} disabled={!activeSender || draftMutation.isPending}>
                      {draftMutation.isPending ? "Saving..." : "Save Draft"}
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => handleSend(false)} disabled={!activeSender || sendMutation.isPending}>
                      <Send className="size-3.5" /> {sendMutation.isPending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto">
                  {/* From */}
                  {senders.length > 0 && (
                    <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3 relative">
                      <span className="text-sm text-text3 w-12">From</span>
                      <button
                        onClick={() => setShowFromPicker(!showFromPicker)}
                        className="flex items-center gap-1.5 text-sm hover:bg-raised rounded px-2 py-1 transition-colors"
                      >
                        <span className="font-medium text-text">{activeSender?.name}</span>
                        <span className="text-text3">&lt;{activeSender?.email}&gt;</span>
                        <ChevronDown className="size-3 text-text3" />
                      </button>
                      {showFromPicker && (
                        <div className="absolute top-full left-16 z-50 mt-1 rounded-lg border border-border bg-surface shadow-lg py-1 w-[300px]">
                          {senders.map(s => (
                            <button
                              key={s.id}
                              onClick={() => { setComposeData(d => ({ ...d, from: s.id })); setShowFromPicker(false) }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-raised transition-colors ${s.id === (composeData.from || defaultSenderId) ? "bg-accent-porter/10" : ""}`}
                            >
                              <span className="font-medium text-text">{s.name}</span>
                              <span className="text-text3 text-xs">{s.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* To */}
                  <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3">
                    <span className="text-sm text-text3 w-12">To</span>
                    <Input
                      value={composeData.to}
                      onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                      className="text-sm bg-transparent border-0 focus-visible:ring-0 p-0 h-auto"
                      placeholder="Recipients"
                    />
                  </div>

                  {/* Subject */}
                  <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3">
                    <span className="text-sm text-text3 w-12">Subject</span>
                    <Input
                      value={composeData.subject}
                      onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                      className="text-sm bg-transparent border-0 focus-visible:ring-0 p-0 h-auto"
                      placeholder="Subject"
                    />
                  </div>

                  {/* Toolbar */}
                  <div className="flex items-center gap-1 px-5 py-2 border-b border-border/40">
                    {[
                      { icon: Bold, cmd: "bold" },
                      { icon: Italic, cmd: "italic" },
                      { icon: Code, cmd: "insertHTML", val: "<code>" },
                      { icon: List, cmd: "insertUnorderedList" },
                      { icon: ListOrdered, cmd: "insertOrderedList" },
                      { icon: Link, cmd: "createLink", val: "prompt" },
                    ].map(({ icon: Icon, cmd, val }) => (
                      <button
                        key={cmd + (val || "")}
                        onClick={() => {
                          if (cmd === "createLink") {
                            const url = window.prompt("URL:")
                            if (url) execFormat(cmd, url)
                          } else {
                            execFormat(cmd, val)
                          }
                        }}
                        className="flex size-8 items-center justify-center rounded-md text-text3 hover:bg-raised hover:text-text transition-colors"
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                    <div className="w-px h-5 bg-border/50 mx-1" />
                    <input ref={fileInputRef} type="file" className="hidden" multiple onChange={e => {
                      const files = e.target.files
                      if (files) for (const f of Array.from(files)) uploadMutation.mutate(f)
                      e.target.value = ""
                    }} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex size-8 items-center justify-center rounded-md text-text3 hover:bg-raised hover:text-text transition-colors"
                      title="Attach file"
                    >
                      <Paperclip className="size-4" />
                    </button>
                    {uploadMutation.isPending && (
                      <div className="size-4 animate-spin rounded-full border-2 border-accent-porter border-t-transparent ml-1" />
                    )}
                  </div>

                  {/* Attachments */}
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-5 py-2 border-b border-border/40">
                      {pendingAttachments.map((att, i) => (
                        <span key={att.blobId + i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-xs text-text2 bg-raised">
                          <Paperclip className="size-3 text-text3" />
                          <span className="max-w-[140px] truncate">{att.name}</span>
                          <span className="text-text3">({formatFileSize(att.size)})</span>
                          <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} className="text-text3 hover:text-danger ml-0.5">
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Editor */}
                  <div
                    ref={editorRef}
                    contentEditable
                    className="flex-1 px-5 py-4 text-sm text-text leading-relaxed focus:outline-none overflow-y-auto [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                    suppressContentEditableWarning
                    data-placeholder="Write your message..."
                  />
                </div>
              </div>
            ) : selectedThreadId && selectedThread ? (
              /* ── Thread detail ───────────────────────────────── */
              <div className="flex-1 flex flex-col">
                {/* Subject header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => setSelectedThreadId(null)} className="text-text3 hover:text-text shrink-0 lg:hidden"><ArrowLeft className="size-4" /></button>
                    <h2 className="text-sm font-semibold text-text truncate">{selectedThread.subject_canonical || "(no subject)"}</h2>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {activeFolder === "trash" ? (
                      <Button variant="ghost" size="sm" className="text-danger" onClick={handleDeleteThread}>
                        <Trash2 className="size-3.5 mr-1" /> Delete
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={handleArchiveThread}>
                          <Archive className="size-3.5 mr-1" /> Archive
                        </Button>
                        <Button variant="ghost" size="sm" className="text-danger" onClick={handleTrashThread}>
                          <Trash2 className="size-3.5 mr-1" /> Trash
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto">
                  {threadMessagesQuery.isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" />
                    </div>
                  ) : (
                    <div className="max-w-3xl mx-auto py-4 px-5 space-y-4">
                      {threadMessages.map((msg) => {
                        const senderName = msg.from_name || msg.from_address.split("@")[0]
                        const initial = senderName[0]?.toUpperCase() || "?"
                        const isOut = msg.direction === "outbound"
                        return (
                          <div key={msg.id} className={`rounded-lg border overflow-hidden ${
                            isOut
                              ? "border-accent-porter/20 bg-accent-porter/[0.03] border-l-2 border-l-accent-porter/40"
                              : "border-border/60 bg-surface"
                          }`}>
                            {/* Message header */}
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className={`size-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                isOut ? "bg-accent-porter/15 text-accent-porter" : "bg-raised text-text3"
                              }`}>
                                {initial}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-text">{senderName}</span>
                                  <span className="text-xs text-text3">&lt;{msg.from_address}&gt;</span>
                                </div>
                                <div className="text-xs text-text3">
                                  to {parseJsonArray(msg.to_addresses_json).join(", ") || "—"}
                                </div>
                              </div>
                              <span className="text-xs text-text3 shrink-0">{fmtDate(msg.sent_at || msg.created_at)}</span>
                            </div>
                            {/* Body */}
                            <div className="px-4 pb-4 pt-1">
                              {msg.html_body ? (
                                <div className="text-sm text-text2 leading-relaxed [&_code]:bg-raised [&_code]:px-1 [&_code]:rounded [&_a]:text-accent-porter [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.html_body) }} />
                              ) : (
                                <div className="text-sm text-text2 leading-relaxed whitespace-pre-wrap">{msg.text_body || "(empty)"}</div>
                              )}
                              {/* Attachments */}
                              {parseAttachments(msg.attachments_json).length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40">
                                  {parseAttachments(msg.attachments_json).map((att, ai) => (
                                    <a
                                      key={att.blobId + ai}
                                      href={`/api/v1/mail/attachments/${msg.mailbox_id}/${encodeURIComponent(att.blobId)}/${encodeURIComponent(att.name || "attachment")}`}
                                      target="_blank"
                                      rel="noopener"
                                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-text2 hover:bg-raised transition-colors"
                                    >
                                      <Download className="size-3.5 text-text3" />
                                      <span className="max-w-[180px] truncate">{att.name || "attachment"}</span>
                                      <span className="text-text3">({formatFileSize(att.size)})</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Reply box at bottom of thread (Gmail-style) */}
                      <div className="rounded-lg border border-border/60 bg-surface overflow-hidden">
                        <div className="px-4 py-3 flex items-start gap-3">
                          <div className="size-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-accent-porter/15 text-accent-porter mt-0.5">
                            {(activeMailbox?.display_name || "P")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <textarea
                              value={replyText}
                              onChange={e => setReplyText(e.target.value)}
                              placeholder="Reply..."
                              rows={replyText ? 4 : 1}
                              className="w-full text-sm text-text bg-transparent resize-none focus:outline-none placeholder:text-text3/50"
                              onFocus={e => { if (e.target.rows === 1) e.target.rows = 4 }}
                              onKeyDown={e => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault()
                                  if (replyTarget && replyText.trim()) handleReply(replyTarget.id)
                                }
                              }}
                            />
                            {replyText.trim() && (
                              <div className="flex justify-end gap-2 mt-2">
                                <Button variant="ghost" size="sm" onClick={() => setReplyText("")}>Discard</Button>
                                <Button
                                  size="sm"
                                  className="gap-1.5"
                                  disabled={replyMutation.isPending || !replyText.trim()}
                                  onClick={() => { if (replyTarget) handleReply(replyTarget.id) }}
                                >
                                  <Send className="size-3.5" /> {replyMutation.isPending ? "Sending..." : "Send"}
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Empty state ────────────────────────────────── */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Mail className="size-12 text-text3/15 mx-auto mb-3" />
                  <p className="text-base text-text3">Select a conversation</p>
                  <p className="text-sm text-text3/60 mt-1">Choose from the thread list to read</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const LazyMailOps = lazy(() => import("~/components/mail-ops").then(m => ({ default: m.MailOps })))

export default function EmailPage() {
  const [view, setView] = useState<"email" | "ops">("email")
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-1 px-4 py-1.5 border-b border-border bg-background">
        <button onClick={() => setView("email")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "email" ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>
          Email
        </button>
        <button onClick={() => setView("ops")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === "ops" ? "bg-accent-porter/10 text-accent-porter" : "text-text3 hover:text-text2"}`}>
          Mail Ops
        </button>
      </div>
      {view === "email" ? (
        <EmailContent />
      ) : (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-5 animate-spin rounded-full border-2 border-accent-porter border-t-transparent" /></div>}>
          <LazyMailOps />
        </Suspense>
      )}
    </div>
  )
}
