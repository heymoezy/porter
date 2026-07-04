import { useState, useEffect } from "react"
import { cn } from "~/lib/utils"

interface TextScrambleProps {
  text: string
  duration?: number
  className?: string
}

const CHARS = "!<>-_\\/[]{}—=+*^?#_"

function TextScramble({ text, duration = 500, className }: TextScrambleProps) {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    let frame = 0
    const totalFrames = Math.ceil(duration / 30)
    const id = setInterval(() => {
      frame++
      const progress = frame / totalFrames
      const resolved = Math.floor(progress * text.length)
      const scrambled = text
        .split("")
        .map((char, i) => {
          if (i < resolved) return char
          if (char === " ") return " "
          return CHARS[Math.floor(Math.random() * CHARS.length)]
        })
        .join("")
      setDisplay(scrambled)
      if (frame >= totalFrames) {
        setDisplay(text)
        clearInterval(id)
      }
    }, 30)
    return () => clearInterval(id)
  }, [text, duration])

  return <span className={cn("font-mono", className)}>{display}</span>
}

export { TextScramble }
