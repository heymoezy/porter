---
name: gog
description: Operate Google Workspace through the `gog` / Google Workspace CLI for Gmail, Calendar, Drive, Docs, Sheets, Contacts, and related workspace actions. Use when the task is to search mail, manage calendar events, find or move Drive files, inspect or update spreadsheets/docs, fetch workspace records, or automate cross-app Google Workspace workflows. Do not use for generic web research, non-Google file systems, deep analytical synthesis, or unsupported writes without verifying the target object first.
---

# GoG

Use this skill for Google Workspace CLI work.

## Work from verified objects

Before changing anything, identify:
- which Workspace app is involved: Gmail, Calendar, Drive, Docs, Sheets, Contacts, etc.
- the exact account or tenant context if multiple are possible
- the target object: message thread, file, folder, event, sheet, doc, contact, or query
- whether the job is read-only discovery, structured extraction, or write/update automation
- safety constraints: who may see the data, whether the write is reversible, and what confirmation evidence you need

Prefer looking up the object first, then operating on it.

## Core workflow

1. **Clarify the object and scope**
   - Find the exact mail thread, file, folder, event, sheet, or doc.
   - Narrow by owner, date range, folder, label, or query rather than scanning everything.
2. **Verify before writing**
   - Confirm IDs, titles, recipients, dates, and current state.
   - For writes, make sure you are touching the intended item and not a similarly named duplicate.
3. **Use the smallest reliable action**
   - Search, fetch, list, inspect, append, update, move, share, or create only what is needed.
   - Avoid broad or destructive operations when a narrower one works.
4. **Preserve traceability**
   - Report what object was used, what changed, and any resulting link/ID/reference.
   - If a write partially succeeds or the API surface behaves oddly, say exactly what happened.
5. **Package the result for handoff**
   - Return the useful artifact: event summary, file shortlist, sheet update summary, draft email, or workflow status.

## What good output looks like

Return practical results such as:
- the right Gmail threads or a draft-ready email package
- calendar event creation or conflict analysis
- Drive file discovery with canonical file IDs/links
- Sheets or Docs update summaries tied to exact ranges/sections
- workspace automation steps across multiple Google apps
- missing-permission or ambiguous-object diagnosis

## Heuristics

Prefer:
- exact object lookup before mutation
- narrow queries and bounded writes
- explicit IDs, links, sheet tabs, and event timestamps
- reversible or auditable changes where possible
- concise post-action reporting

Avoid:
- writing to a guessed file or thread
- broad mailbox, Drive, or calendar changes without verification
- treating similarly named files as interchangeable
- mixing unsupported assumptions into administrative actions

## Boundary calls

Use adjacent skills instead when needed:
- **research-analyst** for interpreting the retrieved material
- **knowledge-manager** for durable taxonomy and documentation architecture
- **email-writer** for high-touch message drafting when the content itself is the main work
- **calendar / scheduling specialist** if a future dedicated scheduling skill exists and the problem is strategy rather than tool operation

## Final check

Before finishing, verify:
- the target object is the correct one
- the account/context is right
- any writes are limited, intentional, and reported clearly
- links, IDs, dates, recipients, or ranges are preserved in the handoff

Use `prompt.md` for response structure, `examples/README.md` for output shapes, `guides/qa-checklist.md` for final review, and `meta/skill.json` for boundaries and metadata.
