# Porter CRM Redesign Spec

Date: 2026-03-17
Status: Proposed
Owner: Porter product design

## Goal
Turn `People` from a disconnected directory into a usable relationship layer for Porter.
CRM in Porter should help users:
- find people and companies quickly
- attach them to projects
- give Porter and agents relevant context
- take action from chat and slash commands, not just tables

## Core Decision
Replace the current `Contacts / Team / Companies` split with one unified CRM surface.
Recommended structure:
- Primary nav can remain `People` or be renamed `CRM`
- Inside the page, use 2 views only: `Directory` and `Relationships`
Why:
- contacts and companies are tightly linked
- internal teammates should feel like a filter, not a separate product
- users need one search-first graph, then contextual views

## Product Model
First-class entities:
- `Person`
- `Company`
- `Project Link`
- `Agent Link`
`Person` can represent:
- external contact
- prospect
- partner
- customer stakeholder
- internal teammate
Do not keep `Team` as a separate top-level tab. Use person type badges and filters instead.
Relationship rules:
- a person belongs to zero or one primary company
- a person can link to many projects
- a person can link to one or more Porter agents
- a company can link to many people and many projects
- each project should show stakeholders, linked companies, internal owner, and linked agents
- each agent should show which people/companies it has context on and what role it plays

## CLI-First CRM
CRM must be chat-native.
Porter should be able to:
- answer "who owns Acme?" or "find my last contact at Stripe"
- create a contact or company inline from chat
- attach a person to the current project without leaving chat
- summarize relationship context before delegating to an agent
When a project is open, Porter should inject lightweight CRM context:
- linked stakeholders
- linked company
- internal owner
- recent notes or status
When an agent is invoked, Porter may pass:
- relevant contact/company summary
- relationship constraints
- communication preferences
This context transfer should be explicit and inspectable.
Every common CRM action should work through:
- slash commands in Porter chat
- command palette
- quick actions in project views

## Information Architecture
### 1. Directory
One unified searchable list with:
- always-visible inline search
- filter chips: `People`, `Companies`, `Internal`, `External`, `Project-linked`, `Unlinked`
- sort: relevance, recent, company, owner
Each row/card should show:
- name
- type badge
- company
- title/role
- linked project count
- owner
- last note or activity timestamp

### 2. Relationships
A contextual view grouped by:
- project
- company
- owner
This view should answer:
- who matters for this project?
- which relationships have no owner?
- which companies have active work but weak coverage?

## Project and Agent Integration
Projects need a stronger embedded CRM slice than the main CRM page.
In project detail, add a `People` panel that supports:
- quick attach from search
- stakeholder list
- company list
- internal owner
- linked agents
- "create and attach" in one flow
Recommended project filters:
- `Key Stakeholders`
- `Internal Team`
- `Companies`
Agents should support CRM links so Porter can reason about:
- which agent knows this account
- which agent should be used for outreach, research, support, or delivery
- whether CRM context is safe to auto-include

## UI Improvements
### Card Redesign
Cards should feel relationship-driven, not directory-driven.
Improve cards with:
- stronger name/company hierarchy
- compact metadata instead of whitespace
- visible project pills
- status badges like `Project-linked`, `Owner missing`, `Agent context`, `Internal`
- quick actions: `Open`, `Attach`, `Add note`, `Ask Porter`

### Detail Panels
Open people and companies in a side panel, not a full-page jump.
Person panel:
- identity block
- company + role
- linked projects
- linked agents
- owner/internal team
- notes/activity
- quick actions
Company panel:
- company summary
- key contacts
- active projects
- account owner
- linked agents/squads
- notes, risks, opportunities

### Empty States
Empty states should teach action:
- no records: "Add a person, company, or import from chat."
- no project links: "Attach stakeholders so Porter can use relationship context."
- no owner: "Assign an internal owner."
- no agent links: "Connect an agent if Porter should use CRM context automatically."

## Slash Commands
Required commands:
- `/people search <query>`
- `/people add`
- `/people open <name>`
- `/people link <person> /project <project>`
- `/people unlink <person> /project <project>`
- `/people owner <person-or-company> <teammate>`
- `/people note <person-or-company> <text>`
- `/people list --project <project>`
- `/people list --company <company>`
Company commands:
- `/company add`
- `/company search <query>`
- `/company open <name>`
- `/company link <company> /project <project>`
Recommended aliases:
- `/crm search <query>`
- `/crm add person`
- `/crm add company`
Porter should also understand natural language equivalents such as:
- "Add Jane from Acme to Apollo"
- "Who are the stakeholders on Mercury?"
- "Which agent has context on Acme?"

## Success Criteria
The redesign succeeds if:
- one search box can find any person or company
- project pages show who matters without extra navigation
- Porter can use CRM context in chat safely and visibly
- agents can be linked to relationships in a useful way
- CRM feels like an action layer for projects, not a static address book
