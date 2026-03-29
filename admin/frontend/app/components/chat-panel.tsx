/**
 * ChatPanel — Global chat component for all Porter surfaces.
 *
 * CANONICAL SOURCE: porter-admin/frontend/app/components/chat-panel.tsx
 * Porter UI symlinks to this file. Do not duplicate.
 *
 * Features: SSE streaming, session persistence, history browser, markdown + images,
 * slash commands, model switching, resize/expand, collapse, auto-scroll.
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { Send, ChevronRight, Maximize2, Minimize2, RotateCcw, History, ArrowLeft } from "lucide-react"
import { PixelPortrait } from "~/components/pixel-portrait"

// ── Markdown ─────────────────────────────────────────────
function MdText({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return (
    <>
      {blocks.map((block, bi) => {
        if (block.startsWith("```") && block.endsWith("```")) {
          const code = block.slice(3, -3).replace(/^\w*\n/, "")
          return <pre key={bi} className="my-1.5 rounded bg-black/20 px-2.5 py-1.5 text-2xs font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
        }
        return block.split("\n").map((line, li) => {
          const parts: React.ReactNode[] = []
          const re = /(!\[([^\]]*)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?\S*)?))/gi
          let last = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(line)) !== null) {
            if (m.index > last) parts.push(line.slice(last, m.index))
            if (m[3]) parts.push(<img key={`${bi}-${li}-${m.index}`} src={m[3]} alt={m[2] || ""} className="max-w-full rounded-lg mt-1.5 mb-1" />)
            else if (m[7]) parts.push(<img key={`${bi}-${li}-${m.index}`} src={m[7]} alt="" className="max-w-full rounded-lg mt-1.5 mb-1" />)
            else if (m[4]) parts.push(<strong key={`${bi}-${li}-${m.index}`} className="font-bold">{m[4]}</strong>)
            else if (m[5]) parts.push(<em key={`${bi}-${li}-${m.index}`}>{m[5]}</em>)
            else if (m[6]) parts.push(<code key={`${bi}-${li}-${m.index}`} className="text-xs bg-black/10 dark:bg-white/10 rounded px-1">{m[6]}</code>)
            last = m.index + m[0].length
          }
          if (last < line.length) parts.push(line.slice(last))
          return <span key={`${bi}-${li}`}>{parts}{li < block.split("\n").length - 1 && "\n"}</span>
        })
      })}
    </>
  )
}

// ── Types ────────────────────────────────────────────────
interface ChatMessage {
  id: number
  role: "user" | "assistant"
  content: string
  backend?: string
}

interface ChatPanelProps {
  /** API endpoint for streaming chat (POST, returns SSE) */
  streamEndpoint?: string
  /** API endpoint for non-streaming chat (POST, returns JSON) */
  endpoint?: string
  /** Extra JSON merged into request body */
  context?: Record<string, unknown>
  /** System context prompt */
  systemContext?: string
  /** Greeting message */
  greeting?: string
  /** Input placeholder */
  placeholder?: string
  /** Session storage key prefix */
  storageKey?: string
  /** Outer className */
  className?: string
  /** Panel is open */
  open?: boolean
  /** Toggle panel visibility */
  onToggle?: () => void
  /** Toggle expand/collapse */
  onExpandChat?: () => void
  /** Portrait override (default: PixelPortrait) */
  portrait?: { skin: string; hair: string; eyes: string; shirt: string; hairStyle: "short" | "long" | "mohawk" | "bald" | "parted" | "buzz" | "curly" | "ponytail" }
}

const DEFAULT_PORTRAIT = { skin: "#F5D0A9", hair: "#2C1810", eyes: "#1A1A2E", shirt: "#8B5CF6", hairStyle: "short" as const }
const AVAILABLE_BACKENDS = ["auto", "ollama", "openclaw"] as const
const MODEL_LABELS: Record<string, string> = {
  auto: "Smart routing — picks the best available model",
  ollama: "Local — qwen2.5-coder:1.5b (fast, basic)",
  openclaw: "Cloud — GPT-5.4 via OpenClaw gateway",
}

// ── Component ────────────────────────────────────────────
export function ChatPanel({
  streamEndpoint,
  endpoint,
  context,
  systemContext,
  greeting = "Hey! I'm Porter. What are we working on today?\n\nNeed help? Type `/help`",
  placeholder = "Message Porter...",
  storageKey = "porter_chat",
  className,
  open,
  onToggle,
  onExpandChat,
  portrait = DEFAULT_PORTRAIT,
}: ChatPanelProps) {
  const msgKey = `${storageKey}_msgs`
  const idKey = `${storageKey}_id`
  const backendKey = `${storageKey}_backend`

  const welcomeMsg: ChatMessage = { id: 0, role: "assistant", content: greeting }

  function loadMessages(): ChatMessage[] {
    try { const raw = sessionStorage.getItem(msgKey); if (raw) return JSON.parse(raw) } catch {}
    return [welcomeMsg]
  }

  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatId = useRef<string>((() => {
    let id = sessionStorage.getItem(idKey)
    if (!id) { id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem(idKey, id) }
    return id
  })())
  const [backend, setBackend] = useState<string>(() => sessionStorage.getItem(backendKey) || "auto")
  const [showHistory, setShowHistory] = useState(false)
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; messages: number }>>([])

  const saveMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs)
    try { sessionStorage.setItem(msgKey, JSON.stringify(msgs)) } catch {}
  }, [msgKey])

  // Auto-scroll
  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }))
  }, [messages, streaming])

  // Focus on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  function scrollToBottom() { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }

  function handleClear() {
    saveMessages([welcomeMsg])
    const newId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(idKey, newId)
    chatId.current = newId
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return

    // Slash commands
    if (text === "/clear") { setInput(""); handleClear(); return }
    if (text === "/models") {
      setInput("")
      const modelList = AVAILABLE_BACKENDS.map(b => `• **${b}** — ${MODEL_LABELS[b]}`).join("\n")
      saveMessages([...messages, { id: Date.now(), role: "assistant", content: `${modelList}\n\nCurrent: **${backend}**\nUse \`/switch <name>\` to change.` }])
      return
    }
    if (text.startsWith("/switch ")) {
      setInput("")
      const model = text.slice(8).trim().toLowerCase()
      if ((AVAILABLE_BACKENDS as readonly string[]).includes(model)) {
        setBackend(model); sessionStorage.setItem(backendKey, model)
        saveMessages([...messages, { id: Date.now(), role: "assistant", content: `Switched to **${model}**` }])
      } else {
        saveMessages([...messages, { id: Date.now(), role: "assistant", content: `Unknown model "${model}". Available: ${AVAILABLE_BACKENDS.join(", ")}` }])
      }
      return
    }
    if (text === "/history") { setInput(""); setShowHistory(true); return }
    if (text === "/help") {
      setInput("")
      saveMessages([...messages, { id: Date.now(), role: "assistant", content: `/clear — new chat\n/models — list available models\n/switch <model> — change model\n/history — view past chats\n/help — this message` }])
      return
    }

    const userMsg: ChatMessage = { id: Date.now(), role: "user", content: text }
    setMessages(prev => [...prev, userMsg])
    setTimeout(scrollToBottom, 50)
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
    setStreaming(true)

    // Try SSE streaming first, fall back to JSON endpoint
    const useStream = !!streamEndpoint
    try {
      if (useStream) {
        const res = await fetch(streamEndpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: text, chat_id: chatId.current, backend: backend !== "auto" ? backend : undefined, system_context: systemContext, ...context }),
        })
        if (!res.ok || !res.body) {
          saveMessages([...messages, userMsg, { id: Date.now(), role: "assistant", content: "Sorry, I couldn't connect. Try again." }])
          setStreaming(false); return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ""
        const assistantId = Date.now() + 1
        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }])
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of decoder.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.token) { fullText += data.token; setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)); scrollToBottom() }
              if (data.done) { const bk = data.backend || data.backend_used || data.runtime_label; if (bk) setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, backend: bk } : m)); break }
            } catch {}
          }
        }
      } else if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: text, model: backend !== "auto" ? backend : undefined, system_context: systemContext, ...context }),
        })
        const data = await res.json()
        const response = data.data?.response ?? data.response ?? "No response"
        const model = data.data?.model ?? data.model
        saveMessages([...messages, userMsg, { id: Date.now() + 1, role: "assistant", content: response, backend: model }])
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: "assistant", content: "Connection lost. Try again." }])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
      setTimeout(scrollToBottom, 100)
      setMessages(prev => { try { sessionStorage.setItem(msgKey, JSON.stringify(prev)) } catch {}; return prev })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className={`flex flex-col bg-background ${className ?? ""}`}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <PixelPortrait {...portrait} size="xs" />
        <span className="text-xs font-bold text-foreground">Porter</span>
        <span className="text-2xs text-text3 ml-auto font-mono">{backend !== "auto" ? backend : ""}</span>
        <button onClick={async () => {
          try { const res = await fetch("/api/v1/chat/sessions", { credentials: "include" }); const d = await res.json(); setChatSessions((d.data?.sessions || []).slice(0, 20)) } catch {}
          setShowHistory(true)
        }} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="Chat history">
          <History className="h-3 w-3" />
        </button>
        <button onClick={handleClear} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="New chat">
          <RotateCcw className="h-3 w-3" />
        </button>
        {onExpandChat && (
          <button onClick={onExpandChat} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="Expand / shrink chat">
            {className?.includes("flex-1") || className?.includes("w-[50%]") ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        )}
        {onToggle && (
          <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="Close chat">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* History overlay — matches design system Chat Session List */}
      {showHistory && (
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold text-foreground">Conversations</span>
            <button onClick={() => setShowHistory(false)} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors">
              <ArrowLeft className="h-3 w-3" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
            {chatSessions.length === 0 ? (
              <p className="px-2.5 py-4 text-xs text-text3 text-center">No conversations yet</p>
            ) : (
              chatSessions.map(s => (
                <button key={s.id} onClick={() => {
                  chatId.current = s.id; sessionStorage.setItem(idKey, s.id)
                  fetch("/api/v1/chat/sessions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", chat_id: s.id }) })
                    .then(r => r.json()).then(d => {
                      const msgs: ChatMessage[] = [welcomeMsg]
                      for (const m of (d.data?.chat?.messages || [])) msgs.push({ id: Date.now() + Math.random(), role: m.role, content: m.content, backend: m.model_id || undefined })
                      saveMessages(msgs); setShowHistory(false)
                    }).catch(() => setShowHistory(false))
                }} className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                  chatId.current === s.id ? "bg-accent-porter/10" : "hover:bg-raised"
                }`}>
                  <div className="flex items-center gap-2">
                    <p className={`flex-1 text-xs truncate ${chatId.current === s.id ? "font-bold text-accent-porter" : "font-medium text-foreground"}`}>{s.title || "Untitled"}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="flex-1 text-2xs text-text3 truncate">{s.messages} messages</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {!showHistory && <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin min-h-0">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div className={`rounded-[10px] px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-[2px] bg-accent-porter text-white"
                  : "rounded-bl-[2px] border border-border bg-raised text-foreground"
              }`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {!m.content ? (
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-text3 animate-[chat-think_1.4s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />)}
                  </span>
                ) : <MdText text={m.content} />}
              </div>
              {m.backend && <p className="text-2xs text-text3 mt-0.5 font-mono opacity-60">{m.backend}</p>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>}

      {/* Composer */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="composer-gradient rounded-2xl border border-[color-mix(in_srgb,var(--accent-porter)_28%,var(--border))] bg-gradient-to-b from-[color-mix(in_srgb,var(--surface)_98%,transparent)] to-[color-mix(in_srgb,var(--accent-porter)_3%,var(--background))] p-3 shadow-[inset_0_1px_0_var(--inset-highlight)]">
          <div className="flex items-center gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px" }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 resize-none bg-transparent text-sm leading-[1.4] text-foreground placeholder:text-text3 focus:placeholder:opacity-0 focus:outline-none max-h-[120px] overflow-y-auto"
              style={{ height: "auto" }}
            />
            <button onClick={handleSend} disabled={!input.trim() || streaming}
              className="btn-send flex h-8 items-center gap-1.5 px-3 text-2xs font-extrabold uppercase tracking-[0.08em] disabled:opacity-40 shrink-0">
              <Send className="h-3 w-3" />Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { ChatPanelProps, ChatMessage }
