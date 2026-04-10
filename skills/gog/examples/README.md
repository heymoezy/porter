# GoG — Example Output Shapes

## Example 1 — Gmail retrieval

**Input:**
Find the latest thread with Acme about contract redlines.

**Good output shape:**
- search query used
- matching thread shortlist
- best match with sender, subject, date, and thread ID/link
- any ambiguity or missing attachments

## Example 2 — Calendar operation

**Input:**
Schedule a 30-minute follow-up with Moe and move it if there is a conflict.

**Good output shape:**
- calendars checked and conflict finding
- event created or updated with date/time/timezone
- attendees and event ID/link
- any unresolved scheduling constraint

## Example 3 — Drive + Docs discovery

**Input:**
Find the latest pricing deck and the spreadsheet behind it.

**Good output shape:**
- canonical file shortlist
- owner/folder/freshness notes
- exact file IDs or links
- confidence call on which file is source of truth

## Example 4 — Sheets update

**Input:**
Append these lead rows to the pipeline tracker.

**Good output shape:**
- target spreadsheet, tab, and range
- rows appended or updated
- any validation mismatch or skipped row
- resulting row count or confirmation signal

## Example 5 — Multi-app workflow

**Input:**
Pull next week’s recruiting interviews, create a summary sheet, and draft reminder emails.

**Good output shape:**
- source calendars/files used
- sheet created or updated with link
- draft emails created with recipients
- what was automated vs what still needs review
