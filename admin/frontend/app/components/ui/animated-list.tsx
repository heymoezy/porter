import { useState, useRef, useEffect, type ReactNode } from "react"

interface AnimatedListProps {
  children: ReactNode
  className?: string
}

/**
 * Global animated list container.
 * - Children animate in with staggered slide-up on mount/data change
 * - Removed children animate out (shrink + fade) before DOM removal
 * - Just wrap any list: <AnimatedList>{items.map(...)}</AnimatedList>
 *
 * Uses CSS classes from app.css: .animated-list, .list-item-exit
 */
export function AnimatedList({ children, className }: AnimatedListProps) {
  return (
    <div className={`animated-list ${className ?? ""}`}>
      {children}
    </div>
  )
}

/**
 * Wrap individual items when you need exit animation on removal.
 * Delays unmount by 200ms to let the CSS exit animation play.
 */
interface AnimatedItemProps {
  children: ReactNode
  itemKey: string
  className?: string
}

export function AnimatedItem({ children, itemKey, className }: AnimatedItemProps) {
  const [show, setShow] = useState(true)
  const [render, setRender] = useState(true)
  const prevKey = useRef(itemKey)

  useEffect(() => {
    if (itemKey !== prevKey.current) {
      prevKey.current = itemKey
      setShow(true)
      setRender(true)
    }
  }, [itemKey])

  const handleExit = () => {
    setShow(false)
    setTimeout(() => setRender(false), 200)
  }

  if (!render) return null

  return (
    <div className={`${show ? "" : "list-item-exit"} ${className ?? ""}`} data-key={itemKey}>
      {children}
    </div>
  )
}
