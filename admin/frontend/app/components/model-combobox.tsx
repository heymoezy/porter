import { useState } from "react"
import { Badge } from "~/components/ui/badge"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { ChevronsUpDown } from "lucide-react"

const MODELS = [
  { id: "claude-opus", name: "Claude Opus", status: "online" as const },
  { id: "gpt-54", name: "GPT-5.4", status: "online" as const },
  { id: "qwen-25", name: "Qwen 2.5", status: "online" as const },
  { id: "gemini-flash", name: "Gemini Flash", status: "offline" as const },
  { id: "ollama-local", name: "Ollama Local", status: "online" as const },
]

export function ModelCombobox() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("claude-opus")
  const selected = MODELS.find(m => m.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex w-[280px] items-center justify-between rounded-lg border border-border2 bg-raised px-3 py-2 text-sm text-foreground transition-colors hover:border-accent-porter/40 focus:outline-none focus:ring-1 focus:ring-accent-porter">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${selected?.status === "online" ? "bg-success" : "bg-text3"}`} />
            <span>{selected?.name || "Select model..."}</span>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-text3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 bg-surface border-border2" align="start">
        <Command className="bg-surface">
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            <CommandGroup>
              {MODELS.map(m => (
                <CommandItem
                  key={m.id}
                  value={m.id}
                  onSelect={(v) => { setValue(v); setOpen(false) }}
                  data-checked={value === m.id}
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-foreground data-selected:bg-raised"
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${m.status === "online" ? "bg-success" : "bg-text3"}`} />
                  <span className="flex-1 text-sm">{m.name}</span>
                  <Badge className={`text-2xs px-1.5 py-0 ${m.status === "online" ? "bg-success/15 text-success" : "bg-raised text-text3"}`}>
                    {m.status}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
