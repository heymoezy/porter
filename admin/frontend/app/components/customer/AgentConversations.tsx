import { useState } from "react"
import { useCustomerConversations, type ConversationThread, type ConversationStep } from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import { Badge } from "~/components/ui/badge"
import { PixelPortrait } from "~/components/pixel-portrait"
import { getAgent } from "~/lib/agent-registry"
import { Bot, ChevronDown, ChevronRight } from "lucide-react"

// ── Avatar helper ─────────────────────────────────────

const DEFAULT_AVATAR = {
  skin: "#F5D0A9",
  hair: "#2C1810",
  eyes: "#1A1A2E",
  shirt: "#6B7280",
  hairStyle: "bald" as const,
}

function agentAvatar(agentName: string) {
  const normalized = agentName.toLowerCase().replace(/\s+/g, "-")
  const def = getAgent(normalized) ?? getAgent(agentName)
  return def?.avatar ?? DEFAULT_AVATAR
}

// ── Timestamp helper ──────────────────────────────────

function fmtTs(ts: number): string {
  const d = Date.now() / 1000 - ts
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Agent avatar + label ──────────────────────────────

function AgentChip({ name }: { name: string }) {
  const av = agentAvatar(name)
  return (
    <div className="flex items-center gap-1">
      <PixelPortrait
        skin={av.skin}
        hair={av.hair}
        eyes={av.eyes}
        shirt={av.shirt}
        hairStyle={av.hairStyle}
        size="xs"
      />
    </div>
  )
}

// ── Thread view (collapsible) ─────────────────────────

function ThreadView({ thread }: { thread: ConversationThread }) {
  const [open, setOpen] = useState(false)

  const MAX_AVATARS = 4
  const shownAgents = thread.agents_involved.slice(0, MAX_AVATARS)
  const extraCount = thread.agents_involved.length - MAX_AVATARS

  return (
    <div className="rounded-lg border border-border/30 hover:border-border/60 transition-colors bg-raised/20 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* Agent portraits */}
        <div className="flex items-center -space-x-1.5 shrink-0">
          {shownAgents.map((name, i) => (
            <div key={i} className="ring-1 ring-surface rounded-sm">
              <AgentChip name={name} />
            </div>
          ))}
          {extraCount > 0 && (
            <div className="ring-1 ring-surface rounded-sm flex items-center justify-center size-4 bg-border/40">
              <span className="text-2xs font-bold text-text3">+{extraCount}</span>
            </div>
          )}
        </div>

        {/* Agent names */}
        <p className="text-2xs text-text3 flex-1 truncate min-w-0">
          {thread.agents_involved.join(" → ")}
        </p>

        {/* Step count */}
        <Badge variant="secondary" className="text-2xs shrink-0 px-1.5 py-0">
          {thread.step_count} {thread.step_count === 1 ? "step" : "steps"}
        </Badge>

        {/* Last activity */}
        <span className="text-2xs text-text3/50 shrink-0 tabular-nums">
          {fmtTs(thread.last_activity_at)}
        </span>

        {/* Toggle */}
        <div className="shrink-0 text-text3/40">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </div>
      </button>

      {/* Expanded steps */}
      {open && (
        <div className="border-t border-border/20 px-3 py-2 space-y-3">
          {thread.steps.map((step: ConversationStep, i: number) => (
            <div key={`${step.run_id}-${i}`} className="space-y-1.5">
              {/* from_agent message — left aligned */}
              <div className="flex items-start gap-2">
                <div className="shrink-0 mt-0.5">
                  <AgentChip name={step.from_agent} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xs font-semibold text-text3/60 mb-0.5">{step.from_agent}</p>
                  <div className="rounded-md bg-border/15 px-2.5 py-1.5">
                    <p className="text-2xs text-text leading-snug break-words">{step.message}</p>
                  </div>
                </div>
              </div>

              {/* to_agent response — right aligned */}
              {step.response && (
                <div className="flex items-start gap-2 flex-row-reverse">
                  <div className="shrink-0 mt-0.5">
                    <AgentChip name={step.to_agent} />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col items-end">
                    <p className="text-2xs font-semibold text-text3/60 mb-0.5">{step.to_agent}</p>
                    <div className="rounded-md bg-accent-porter/10 px-2.5 py-1.5 max-w-[90%]">
                      <p className="text-2xs text-text leading-snug break-words">{step.response}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {step.status === "error" && step.error && (
                <p className="text-2xs text-danger/70 pl-6">{step.error}</p>
              )}

              {/* Timestamp */}
              <p className="text-2xs text-text3/40 text-center tabular-nums">
                {fmtTs(step.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────

export function AgentConversations({ username }: { username: string }) {
  const { data, isLoading, isError } = useCustomerConversations(username)
  const conversations = data?.conversations ?? []

  return (
    <Card className="ring-0 border border-border/30 bg-gradient-to-br from-accent-porter/3 via-transparent to-transparent">
      <CardContent className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <Bot className="size-3.5 text-accent-porter/70" />
          <p className="text-xs font-bold uppercase tracking-wider text-accent-porter/70">Agent Conversations</p>
          {conversations.length > 0 && (
            <Badge variant="secondary" className="text-2xs ml-auto">{conversations.length}</Badge>
          )}
        </div>

        {/* Loading — 3 skeleton rows */}
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-10 w-full rounded-lg bg-border/20 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <p className="text-2xs text-danger/70 text-center py-4">Could not load conversations</p>
        )}

        {/* Empty */}
        {!isLoading && !isError && conversations.length === 0 && (
          <div className="py-6 text-center">
            <Bot className="size-6 text-text3/20 mx-auto mb-2" />
            <p className="text-2xs text-text3/40">No agent conversations yet</p>
            <p className="text-2xs text-text3/30 mt-0.5">Agents will discuss this customer here</p>
          </div>
        )}

        {/* Conversation threads */}
        {!isLoading && !isError && conversations.length > 0 && (
          <div className="space-y-2">
            {conversations.map((thread: ConversationThread) => (
              <ThreadView key={thread.chain_id} thread={thread} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
