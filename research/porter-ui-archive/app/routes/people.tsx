import { useState } from "react"
import { Link } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Users, Plus, Search, Mail, Phone, Briefcase, Loader2, UserPlus,
} from "lucide-react"
import { AppShell } from "~/components/layout/app-shell"
import { api } from "~/lib/api"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Badge } from "~/components/ui/badge"
import { ScrollArea } from "~/components/ui/scroll-area"
import { Separator } from "~/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"

/* ── Types ── */

interface ContactEmail {
  id?: number
  value: string
  label: string
  is_primary: boolean
}

interface ContactPhone {
  id?: number
  value: string
  country_code?: string
  label: string
  is_primary: boolean
}

interface Contact {
  id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  job_title: string | null
  company_id: string | null
  notes: string | null
  emails: ContactEmail[]
  phones: ContactPhone[]
  social: Record<string, string>
  created_at: number
  updated_at: number
}

/* ── Helpers ── */

function primaryEmail(contact: Contact): string | null {
  const primary = contact.emails.find(e => e.is_primary)
  return primary?.value ?? contact.emails[0]?.value ?? null
}

function primaryPhone(contact: Contact): string | null {
  const primary = contact.phones.find(p => p.is_primary)
  return primary?.value ?? contact.phones[0]?.value ?? null
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("")
}

/* ── Skeleton Row ── */

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="h-9 w-9 rounded-full bg-raised" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-36 rounded bg-raised" />
        <div className="h-2.5 w-48 rounded bg-raised" />
      </div>
      <div className="h-3 w-20 rounded bg-raised" />
    </div>
  )
}

/* ── Avatar Circle ── */

function ContactAvatar({ name }: { name: string }) {
  // Deterministic color from name
  const colors = [
    "bg-accent-porter/15 text-accent-porter",
    "bg-success/15 text-success",
    "bg-warning/15 text-warning",
    "bg-danger/15 text-danger",
    "bg-chart-1/15 text-chart-1",
    "bg-chart-3/15 text-chart-3",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  const colorClass = colors[Math.abs(hash) % colors.length]

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorClass}`}>
      {initials(name)}
    </div>
  )
}

/* ── Add Contact Dialog ── */

function AddContactDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  const createMut = useMutation({
    mutationFn: (body: {
      display_name: string
      job_title?: string
      emails?: { value: string; label: string; is_primary: boolean }[]
      phones?: { value: string; label: string; is_primary: boolean }[]
    }) => api("/api/v1/contacts", { method: "POST", json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] })
      onOpenChange(false)
      setDisplayName("")
      setJobTitle("")
      setEmail("")
      setPhone("")
    },
  })

  function handleCreate() {
    if (!displayName.trim()) return
    const body: any = { display_name: displayName.trim() }
    if (jobTitle.trim()) body.job_title = jobTitle.trim()
    if (email.trim()) body.emails = [{ value: email.trim(), label: "work", is_primary: true }]
    if (phone.trim()) body.phones = [{ value: phone.trim(), label: "mobile", is_primary: true }]
    createMut.mutate(body)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text2">Name *</Label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="John Smith"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text2">Job Title</Label>
            <Input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="Marketing Director"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text2">Email</Label>
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="john@example.com"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-text2">Phone</Label>
            <Input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              type="tel"
              placeholder="+1 234 567 8900"
              className="bg-raised border-border2 text-foreground focus-visible:ring-accent-porter"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!displayName.trim() || createMut.isPending}
            className="gap-1.5"
          >
            {createMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Page ── */

export default function PeoplePage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  // Debounced search -- use the query param directly
  const searchParam = search.trim()

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", searchParam],
    queryFn: () => {
      const params = new URLSearchParams()
      if (searchParam) params.set("q", searchParam)
      params.set("limit", "100")
      const qs = params.toString()
      return api<{ contacts: Contact[]; total: number }>(
        `/api/v1/contacts${qs ? `?${qs}` : ""}`,
      )
    },
  })

  const contacts = data?.contacts ?? []
  const total = data?.total ?? 0

  return (
    <AppShell>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              {!isLoading && total > 0 && (
                <Badge className="text-[10px] bg-text3/15 text-text3">
                  {total}
                </Badge>
              )}
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Contact
            </Button>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text3" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="pl-8 bg-raised border-border2 text-foreground focus-visible:ring-accent-porter h-8 text-xs"
            />
          </div>
        </div>

        <Separator className="bg-border" />

        {/* Column headers */}
        <div className="shrink-0 grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-6 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-text3 border-b border-border/50">
          <span>Name</span>
          <span>Title</span>
          <span>Email</span>
          <span>Phone</span>
        </div>

        {/* Contact list */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-1">
            {/* Loading */}
            {isLoading && (
              <div className="space-y-0.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            )}

            {/* Empty */}
            {!isLoading && contacts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-text3">
                <Users className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">
                  {searchParam ? "No matches" : "No contacts yet"}
                </p>
                <p className="text-xs mt-1">
                  {searchParam
                    ? `No contacts matching "${searchParam}"`
                    : "Add your first contact to get started."}
                </p>
              </div>
            )}

            {/* Rows */}
            {!isLoading && contacts.length > 0 && (
              <div className="animated-list">
                {contacts.map((c: Contact) => {
                  const email = primaryEmail(c)
                  const phone = primaryPhone(c)

                  return (
                    <Link
                      key={c.id}
                      to={`/people/${c.id}`}
                      className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2.5 rounded-md transition-colors duration-100 hover:bg-raised cursor-pointer group"
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <ContactAvatar name={c.display_name} />
                        <span className="text-xs font-medium text-foreground truncate group-hover:text-accent-porter transition-colors">
                          {c.display_name}
                        </span>
                      </div>

                      {/* Title */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {c.job_title ? (
                          <>
                            <Briefcase className="h-3 w-3 text-text3 shrink-0" />
                            <span className="text-xs text-text2 truncate">
                              {c.job_title}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-text3">--</span>
                        )}
                      </div>

                      {/* Email */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {email ? (
                          <>
                            <Mail className="h-3 w-3 text-text3 shrink-0" />
                            <span className="text-xs text-text2 truncate">
                              {email}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-text3">--</span>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {phone ? (
                          <>
                            <Phone className="h-3 w-3 text-text3 shrink-0" />
                            <span className="text-xs text-text2 truncate">
                              {phone}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-text3">--</span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <AddContactDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </AppShell>
  )
}
