import { useState } from "react"
import { useMountEffect } from "~/hooks/use-mount-effect"

interface AnimCountProps {
  to: number
  duration?: number
}

export function AnimCount({ to, duration = 1200 }: AnimCountProps) {
  const [val, setVal] = useState(0)

  useMountEffect(() => {
    let cur = 0
    const step = Math.ceil(to / (duration / 30))
    const id = setInterval(() => {
      cur += step
      if (cur >= to) {
        setVal(to)
        clearInterval(id)
      } else {
        setVal(cur)
      }
    }, 30)
    return () => clearInterval(id)
  })

  return <>{val}</>
}
