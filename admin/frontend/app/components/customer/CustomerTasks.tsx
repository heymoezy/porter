import { useState } from "react"
import {
  useCustomerTasks,
  useAddTask,
  usePatchTask,
  useDeleteTask,
  type CustomerTask,
} from "~/hooks/use-admin-api"
import { Card, CardContent } from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { CheckSquare, Trash2, Plus } from "lucide-react"

// ── Helpers ──────────────────────────────────────────────
function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date(new Date().toDateString())
}

// ── Component ────────────────────────────────────────────
export function CustomerTasks({ username }: { username: string }) {
  const { data, isLoading, isError } = useCustomerTasks(username)
  const addTask = useAddTask(username)
  const patchTask = usePatchTask(username)
  const deleteTask = useDeleteTask(username)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [assignee, setAssignee] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const tasks: CustomerTask[] = data?.tasks ?? []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await addTask.mutateAsync({
        title: title.trim(),
        assignee: assignee.trim() || undefined,
        due_date: dueDate || undefined,
      })
      setTitle("")
      setAssignee("")
      setDueDate("")
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="ring-0 border border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text3">Tasks</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="size-3" />
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-2">
            <div className="h-8 bg-border/20 rounded animate-pulse w-full" />
            <div className="h-8 bg-border/20 rounded animate-pulse w-full" />
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-2xs text-danger">
            Failed to load tasks
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && tasks.length === 0 && !showForm && (
          <div className="flex flex-col items-center gap-1.5 py-4 text-text3">
            <CheckSquare className="size-5 opacity-30" />
            <p className="text-2xs">No tasks yet</p>
          </div>
        )}

        {/* Task list */}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="group flex items-start gap-2.5 rounded-lg border border-border/30 bg-raised/20 px-2.5 py-2"
          >
            <Checkbox
              id={task.id}
              checked={task.status === "done"}
              onCheckedChange={(checked) =>
                patchTask.mutate({
                  taskId: task.id,
                  status: checked ? "done" : "open",
                })
              }
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <Label
                htmlFor={task.id}
                className={`text-xs cursor-pointer ${
                  task.status === "done" ? "line-through text-text3" : "text-text"
                }`}
              >
                {task.title}
              </Label>
              <div className="flex items-center gap-2 mt-0.5">
                {task.assignee && (
                  <span className="text-2xs text-text3/50">@{task.assignee}</span>
                )}
                {task.due_date && (
                  <span
                    className={`text-2xs ${
                      isOverdue(task.due_date) && task.status !== "done"
                        ? "text-danger"
                        : "text-text3/50"
                    }`}
                  >
                    due {task.due_date}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 h-5 px-1 text-text3/40 hover:text-danger transition-opacity shrink-0"
              onClick={() => deleteTask.mutate(task.id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}

        {/* Add task form */}
        {showForm && (
          <form
            onSubmit={handleAdd}
            className="rounded-lg border border-border/50 bg-surface p-3 space-y-2"
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="h-8 text-xs"
              autoFocus
            />
            <div className="flex gap-2">
              <Input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Assignee (optional)"
                className="h-7 text-2xs flex-1"
              />
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-7 text-2xs w-[130px]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={!title.trim() || submitting}>
                {submitting ? "Adding..." : "Add Task"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
