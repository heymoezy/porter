import { useState, useRef } from "react"
import { Send, ChevronRight, Maximize2, Minimize2, RotateCcw, History, ArrowLeft } from "lucide-react"
import { PixelPortrait } from "~/components/pixel-portrait"
import { useMountEffect } from "~/hooks/use-mount-effect"

/** Render minimal inline markdown: **bold**, *italic*, `code` */
function MdText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="text-[12px] bg-black/10 dark:bg-white/10 rounded px-1">{p.slice(1, -1)}</code>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

interface ChatMessage {
  id: number
  role: "user" | "assistant"
  content: string
  backend?: string
}

const WELCOME: ChatMessage = {
  id: 0,
  role: "assistant",
  content: "Hey! I'm Porter. What are we working on today?\n\nNeed help? Type `/help`",
}

const STORAGE_KEY = "porter_dash_chat"
const CHAT_ID_KEY = "porter_dash_chat_id"
const BACKEND_KEY = "porter_dash_backend"
const AVAILABLE_BACKENDS = ["auto", "ollama", "openclaw"] as const
const MODEL_LABELS: Record<string, string> = {
  auto: "Auto · smart routing",
  ollama: "Ollama · qwen2.5",
  openclaw: "OpenClaw · GPT-5.4",
}
const MODEL_DESCRIPTIONS: Record<string, string> = {
  auto: "Smart routing — picks the best available model",
  ollama: "Local — qwen2.5-coder:1.5b (fast, basic)",
  openclaw: "Cloud — GPT-5.4 via OpenClaw gateway",
}

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return [WELCOME]
}

function getChatId(): string {
  let id = sessionStorage.getItem(CHAT_ID_KEY)
  if (!id) {
    id = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(CHAT_ID_KEY, id)
  }
  return id
}

export function ChatPanel({ className, open, onToggle, onExpandChat }: { className?: string; open?: boolean; onToggle?: () => void; onExpandChat?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatId = useRef(getChatId())
  const [backend, setBackend] = useState<string>(() => sessionStorage.getItem(BACKEND_KEY) || "auto")
  const [showHistory, setShowHistory] = useState(false)
  const [backendStatus, setBackendStatus] = useState<Record<string, "up" | "down">>({})
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; messages: number }>>([])


  // Persist messages to sessionStorage on change
  const saveMessages = (msgs: ChatMessage[]) => {
    setMessages(msgs)
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)) } catch {}
  }

  useMountEffect(() => {
    inputRef.current?.focus()
    fetch("/api/v1/chat/warm", { method: "POST", credentials: "include" }).catch(() => {})
    // Fetch backend status on mount
    fetch("/api/v1/health", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const s: Record<string, "up" | "down"> = { auto: "up" }
        for (const b of (d.data?.backends || [])) s[b.name.toLowerCase()] = b.status
        setBackendStatus(s)
      })
      .catch(() => {})
  })

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  function handleClear() {
    saveMessages([WELCOME])
    // New chat session
    const newId = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(CHAT_ID_KEY, newId)
    chatId.current = newId
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || streaming) return

    // Slash commands
    if (text === "/clear") {
      setInput("")
      handleClear()
      return
    }
    if (text === "/models") {
      setInput("")
      const modelList = AVAILABLE_BACKENDS.map(b => `• **${b}** — ${MODEL_DESCRIPTIONS[b]}`).join("\n")
      const sysMsg: ChatMessage = { id: Date.now(), role: "assistant", content: `${modelList}\n\nCurrent: **${backend}**\nUse the model picker in the header or \`/switch <name>\`.` }
      saveMessages([...messages, sysMsg])
      return
    }
    if (text.startsWith("/switch ")) {
      setInput("")
      const model = text.slice(8).trim().toLowerCase()
      if (AVAILABLE_BACKENDS.includes(model as any)) {
        setBackend(model)
        sessionStorage.setItem(BACKEND_KEY, model)
        const sysMsg: ChatMessage = { id: Date.now(), role: "assistant", content: `Switched to **${model}**` }
        saveMessages([...messages, sysMsg])
      } else {
        const sysMsg: ChatMessage = { id: Date.now(), role: "assistant", content: `Unknown model "${model}". Available: ${AVAILABLE_BACKENDS.join(", ")}` }
        saveMessages([...messages, sysMsg])
      }
      return
    }
    if (text === "/history") {
      setInput("")
      setShowHistory(true)
      return
    }
    if (text === "/help") {
      setInput("")
      const sysMsg: ChatMessage = { id: Date.now(), role: "assistant", content: `/clear — new chat\n/models — list available models\n/switch <model> — change model\n/history — view past chats\n/help — this message` }
      saveMessages([...messages, sysMsg])
      return
    }

    const userMsg: ChatMessage = { id: Date.now(), role: "user", content: text }
    setMessages(prev => [...prev, userMsg])
    setTimeout(scrollToBottom, 50)
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
    setStreaming(true)

    try {
      const res = await fetch("/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, chat_id: chatId.current, backend: backend !== "auto" ? backend : undefined }),
      })

      if (!res.ok || !res.body) {
        saveMessages([...messages, userMsg, { id: Date.now(), role: "assistant", content: "Sorry, I couldn't connect. Try again." }])
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""
      const assistantId = Date.now() + 1

      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        // Parse SSE data lines
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.token) {
              fullText += data.token
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m))
              scrollToBottom()
            }
            if (data.done) {
              if (data.backend) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, backend: data.backend } : m))
              }
              break
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: "assistant", content: "Connection lost. Try again." }])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
      setTimeout(scrollToBottom, 100)
      // Persist final state
      setMessages(prev => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev)) } catch {}; return prev })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`flex flex-col border-l border-border bg-background ${className ?? ""}`}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <PixelPortrait skin="#F5D0A9" hair="#2C1810" eyes="#1A1A2E" shirt="#8B5CF6" hairStyle="short" size="xs" />
        <span className="text-xs font-bold text-foreground">Porter</span>
        <span className="ml-auto" />
        <button onClick={async () => {
          if (showHistory) {
            setShowHistory(false)
            return
          }
          try {
            const res = await fetch("/api/v1/chat/sessions", { credentials: "include" })
            const d = await res.json()
            setChatSessions((d.data?.sessions || []).slice(0, 20))
          } catch {}
          setShowHistory(true)
        }} className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${showHistory ? "text-accent-porter bg-accent-porter/10" : "text-text3 hover:text-foreground hover:bg-raised"}`} title="Chat history">
          <History className="h-3 w-3" />
        </button>
        <button onClick={handleClear} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="New chat">
          <RotateCcw className="h-3 w-3" />
        </button>
        {onExpandChat && (
          <button onClick={onExpandChat} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="Expand / shrink chat">
            {className?.includes("flex-1") ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
        )}
        {onToggle && (
          <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-text3 hover:text-foreground hover:bg-raised transition-colors" title="Close chat">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Model pills */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-border/50 bg-background/50">
        {AVAILABLE_BACKENDS.map(b => (
          <button
            key={b}
            onClick={() => { setBackend(b); sessionStorage.setItem(BACKEND_KEY, b) }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              backend === b
                ? "bg-accent-porter/15 text-accent-porter shadow-sm"
                : "text-text3 hover:text-text2 hover:bg-raised"
            }`}
          >
            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${backendStatus[b] === "down" ? "bg-danger" : "bg-success"}`} />
            {MODEL_LABELS[b]}
          </button>
        ))}
      </div>

      {/* History overlay */}
      {showHistory && (
        <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin min-h-0">
          <button onClick={() => setShowHistory(false)} className="flex items-center gap-1 text-xs text-text3 hover:text-accent-porter mb-3">
            <ArrowLeft className="h-3 w-3" /> Back to chat
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text3 mb-2">Recent Chats</p>
          {chatSessions.length === 0 ? (
            <p className="text-xs text-text3">No chat history yet</p>
          ) : (
            <div className="space-y-1">
              {chatSessions.map(s => (
                <button key={s.id} onClick={() => {
                  chatId.current = s.id
                  sessionStorage.setItem(CHAT_ID_KEY, s.id)
                  // Load messages for this session from API
                  fetch(`/api/v1/chat/sessions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load", chat_id: s.id }) })
                    .then(r => r.json())
                    .then(d => {
                      const msgs: ChatMessage[] = [WELCOME]
                      for (const m of (d.data?.chat?.messages || [])) {
                        msgs.push({ id: Date.now() + Math.random(), role: m.role, content: m.content, backend: m.model_id || undefined })
                      }
                      saveMessages(msgs)
                      setShowHistory(false)
                    })
                    .catch(() => setShowHistory(false))
                }} className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 hover:border-accent-porter/30 transition-colors">
                  <p className="text-xs font-medium text-text truncate">{s.title || "Untitled"}</p>
                  <p className="text-[10px] text-text3">{s.messages} messages</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {!showHistory && <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin min-h-0">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%]">
              <div className={`rounded-[10px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-[2px] bg-accent-porter text-white"
                  : "rounded-bl-[2px] border border-border bg-raised text-foreground"
              }`} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {!m.content ? (
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="h-1.5 w-1.5 rounded-full bg-text3 animate-[chat-think_1.4s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </span>
                ) : (
                  <MdText text={m.content} />
                )}
              </div>
              {m.backend && (
                <p className="text-[9px] text-text3 mt-0.5 font-mono opacity-60">{m.backend}</p>
              )}
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
              onChange={(e) => {
                setInput(e.target.value)
                // Auto-grow
                e.target.style.height = "auto"
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message Porter..."
              className="flex-1 resize-none bg-transparent text-[13px] leading-[1.4] text-foreground placeholder:text-text3 focus:placeholder:opacity-0 focus:outline-none max-h-[120px] overflow-y-auto"
              style={{ height: "auto" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="btn-send flex h-8 items-center gap-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.08em] disabled:opacity-40 shrink-0"
            >
              <Send className="h-3 w-3" />Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
