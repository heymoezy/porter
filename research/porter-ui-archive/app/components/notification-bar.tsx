import { Bell, ChevronLeft, ChevronRight, Sparkles, EyeOff } from "lucide-react"

export interface NotificationItem {
  id: number
  text: string
  type: string
  color: string
  action: string
}

interface NotificationBarProps {
  items: NotificationItem[]
  activeIdx: number
  total: number
  onPrev: () => void
  onNext: () => void
  onDismiss: (id: number) => void
  onAction: (id: number) => void
  onAutoHandle: (id: number) => void
}

const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  danger:  { border: "border-danger/30",  bg: "bg-danger/5",  text: "text-danger",  icon: "text-danger" },
  success: { border: "border-success/30", bg: "bg-success/5", text: "text-success", icon: "text-success" },
  warning: { border: "border-warning/30", bg: "bg-warning/5", text: "text-warning", icon: "text-warning" },
}

export function NotificationBar({ items, activeIdx, total, onPrev, onNext, onDismiss, onAction, onAutoHandle }: NotificationBarProps) {
  const item = items[activeIdx]
  if (!item) return null

  const c = colorMap[item.color] ?? colorMap.warning
  const visible = items.length

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} transition-all duration-[var(--duration-slow)] hover:shadow-[var(--shadow-sm)]`}>
      {/* Top row: icon + message + nav */}
      <div className="flex items-center gap-3 px-3 py-2">
        <Bell className={`h-3.5 w-3.5 shrink-0 ${c.icon}`} />
        <p
          className="text-[12px] font-medium text-foreground animate-carousel-in truncate min-w-0 flex-1"
          key={item.id}
        >
          {item.text}
        </p>
        <div className="flex items-center shrink-0">
          <button onClick={onPrev} className="flex h-5 w-5 items-center justify-center rounded text-text3 hover:bg-raised/50">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-[10px] tabular-nums text-text3 mx-0.5">{activeIdx + 1}/{visible}</span>
          <button onClick={onNext} className="flex h-5 w-5 items-center justify-center rounded text-text3 hover:bg-raised/50">
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Bottom row: actions — pushed right */}
      <div className="flex items-center gap-3 px-3 pb-2 -mt-0.5 justify-end">
        <button
          onClick={() => onAction(item.id)}
          className={`text-[10px] font-bold ${c.text} hover:underline`}
        >
          {item.action}
        </button>
        <button
          onClick={() => onAutoHandle(item.id)}
          className="flex items-center gap-1 text-[10px] font-bold text-accent-porter hover:underline"
        >
          <Sparkles className="h-2.5 w-2.5" /> Auto-handle
        </button>
        <button
          onClick={() => onDismiss(item.id)}
          className="flex items-center gap-1 text-[10px] text-text3 hover:text-foreground"
        >
          <EyeOff className="h-2.5 w-2.5" /> Dismiss
        </button>
      </div>
    </div>
  )
}
