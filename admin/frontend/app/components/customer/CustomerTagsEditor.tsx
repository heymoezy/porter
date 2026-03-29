import { useState } from "react"
import { X, Plus } from "lucide-react"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { useAddTag, useRemoveTag } from "~/hooks/use-admin-api"
import { cn } from "~/lib/utils"

interface CustomerTagsEditorProps {
  username: string
  tags: string[]
  readonly?: boolean
  className?: string
}

export function CustomerTagsEditor({ username, tags, readonly = false, className }: CustomerTagsEditorProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const addTag = useAddTag(username)
  const removeTag = useRemoveTag(username)

  // Empty tags + readonly → render nothing
  if (tags.length === 0 && readonly) return null

  function handleAdd() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    addTag.mutate(trimmed, {
      onSuccess: () => {
        setInputValue("")
        setOpen(false)
      },
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="gap-1 text-2xs h-5 px-1.5 cursor-default"
        >
          {tag}
          {!readonly && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                removeTag.mutate(tag)
              }}
              className="size-3 rounded-full hover:bg-foreground/20 flex items-center justify-center"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="size-2" />
            </button>
          )}
        </Badge>
      ))}

      {!readonly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 rounded-full"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(true)
              }}
              aria-label="Add tag"
            >
              <Plus className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tag name"
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={handleAdd}
                disabled={addTag.isPending || !inputValue.trim()}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
