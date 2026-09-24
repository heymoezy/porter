import * as React from "react"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

/**
 * The one status -> tone map for the admin. Every status, risk, severity,
 * health or kind string the API returns is listed here once. Feature code
 * never keeps its own colour map: it renders <StatusBadge status={...} />
 * or <StatusDot status={...} />, or reads statusTone() for text colour.
 * A string that is not listed renders neutral.
 */
export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral"

export const STATUS_TONE: Record<string, StatusTone> = {
  // done, healthy, allowed
  active: "success",
  approved: "success",
  completed: "success",
  delivered: "success",
  healthy: "success",
  idle: "success",
  improving: "success",
  low: "success",
  ok: "success",
  production: "success",
  trusted: "success",
  new_directive: "success",
  model_selection: "success",

  // waiting, degraded, needs a look
  baseline: "warning",
  deferred: "warning",
  degraded: "warning",
  high: "warning",
  medium: "warning",
  paused: "warning",
  pending: "warning",
  pending_dns: "warning",
  queued: "warning",
  review: "warning",
  rising: "warning",
  running: "warning",
  supersede: "warning",
  timeout: "warning",
  warning: "warning",
  tool_selection: "warning",

  // in flight, informational
  applied: "info",
  enhance: "info",
  "high-performing": "info",
  merge: "info",
  ready: "info",
  routing: "info",
  sent: "info",
  working: "info",

  // failed, refused, removed
  blocked: "danger",
  bounced: "danger",
  critical: "danger",
  delete: "danger",
  deprecate: "danger",
  error: "danger",
  escalation: "danger",
  expired: "danger",
  failed: "danger",
  rejected: "danger",
  scaffold: "danger",
  unavailable: "danger",

  // ended or inert
  archived: "neutral",
  cancelled: "neutral",
  delegation: "neutral",
  inactive: "neutral",
  offline: "neutral",
  specialize: "neutral",
  stale: "neutral",
}

export function statusTone(status: string | null | undefined): StatusTone {
  return (status && STATUS_TONE[status]) || "neutral"
}

const BADGE_VARIANT = {
  success: "success",
  warning: "warning",
  info: "info",
  danger: "destructive",
  neutral: "secondary",
} as const

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  neutral: "bg-text3",
}

const TEXT_CLASS: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  danger: "text-danger",
  neutral: "text-text3",
}

export function statusTextClass(status: string | null | undefined): string {
  return TEXT_CLASS[statusTone(status)]
}

export function statusDotClass(status: string | null | undefined): string {
  return DOT_CLASS[statusTone(status)]
}

interface StatusBadgeProps extends Omit<React.ComponentProps<typeof Badge>, "variant" | "children"> {
  status: string
  /** Text to show. Defaults to the status with underscores as spaces. */
  label?: React.ReactNode
}

export function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  return (
    <Badge
      variant={BADGE_VARIANT[statusTone(status)]}
      data-status={status}
      className={className}
      {...props}
    >
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  )
}

interface StatusDotProps extends React.ComponentProps<"span"> {
  status: string
  pulse?: boolean
}

export function StatusDot({ status, pulse = false, className, ...props }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={status.replace(/_/g, " ")}
      data-status={status}
      className={cn("inline-block size-2 shrink-0 rounded-full", DOT_CLASS[statusTone(status)], pulse && "animate-pulse-badge", className)}
      {...props}
    />
  )
}
