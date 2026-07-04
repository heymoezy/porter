import { useState } from "react"

/**
 * Manages chat panel state — matches product dashboard pattern exactly.
 */
function useChatPanel(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen)
  const [expanded, setExpanded] = useState(false)

  return {
    open,
    expanded,
    chatProps: {
      open,
      className: expanded ? "flex-1" : "w-[300px] shrink-0 border-l border-border",
      onToggle: () => setOpen(false),
      onExpandChat: () => setExpanded(prev => !prev),
    },
    reopen: () => { setOpen(true); setExpanded(false) },
  }
}

export { useChatPanel }
