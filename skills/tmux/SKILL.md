---
name: tmux
description: Operate, script, debug, and design tmux-based terminal workflows using sessions, windows, panes, layouts, copy mode, pane capture, and safe key injection. Use when work involves durable CLI workspaces, remote-shell resilience, long-running jobs, multi-pane observability, session naming/layout conventions, or controlled interaction with live terminal programs through tmux. Do not use for ordinary one-shell tasks that do not benefit from multiplexing.
---

# tmux

Use tmux as a durable control plane for terminal work.

This skill owns tmux judgment: when tmux is worth using, how to shape sessions and panes so operators stay oriented, how to preserve long-running work across disconnects, how to capture pane output, and how to intervene safely in interactive terminals.

## Scope

Use this skill for:
- designing tmux session/window/pane layouts
- naming conventions for durable terminal workspaces
- attach/detach workflows for remote or unstable connections
- long-running CLI job management
- pane capture, scrollback, and copy-mode workflows
- safe use of `send-keys` or synchronized panes
- incident-response or debugging workspaces
- repeatable tmux startup recipes and lightweight automation
- troubleshooting lost sessions, confusing layouts, or environment-inheritance surprises
- operator guidance for multi-window monitoring and control

## Do not use this skill for

Do not use this skill for:
- ordinary one-command shell usage with no persistence or multiplexing need
- general Linux process supervision where `systemd`, `cron`, or a job runner is the real answer
- application-specific debugging where tmux is incidental, not the core workflow issue
- GUI terminal setup questions that are mostly about the emulator rather than tmux behavior
- blind automation against live panes when safer non-interactive control surfaces exist

## Routing rules

Route to **tmux** when the main challenge is deciding:
- how to structure terminal work that must survive disconnects
- how to monitor logs, shells, builds, and REPLs at once without losing context
- how to capture, inspect, and control interactive CLI state safely
- how to standardize a repeatable terminal workspace for a team or recurring task
- how to recover or debug long-running processes managed through tmux

Do **not** route here just because the user happens to run tmux.
If the real issue is process supervision, deployment, or app debugging, use the skill centered on that problem.

## Inputs to gather

Before recommending a layout or command flow, identify:
- the tasks that must stay visible at the same time
- whether the operator is local, over SSH, or on unreliable links
- which processes are long-running, interactive, or risky to interrupt
- whether output must be captured or shared
- expected session lifetime: minutes, days, or persistent project workspace
- naming and context requirements for multiple projects or hosts
- whether automation will send keys into live panes
- shell, remote-host, and environment-loading assumptions

If the workflow does not need persistence, multitasking, or observability, say tmux may be unnecessary.

## Output expectations

Return outputs such as:
- tmux layout plans
- exact commands and key sequences
- attach/detach and recovery recipes
- pane capture / copy-mode steps
- safe automation notes for `send-keys` or synchronized panes
- troubleshooting guidance for lost context, stuck panes, or session confusion

Prefer operational recipes over shortcut dumps.

## Working method

### 1. Decide whether tmux is the right tool
Use tmux when the workflow benefits from persistence, multiplexing, or live observability.
If a single shell or service manager is enough, say so.

### 2. Model the hierarchy clearly
Think in:
- sessions for projects or major contexts
- windows for task groups
- panes for simultaneous views inside one task group

The hierarchy should reduce confusion, not create it.

### 3. Name things so reattachment is obvious
Use session and window names that answer:
- which project or host is this?
- what job is running here?
- which pane is safe to type into?

Anonymous clutter is the enemy of durable terminal work.

### 4. Design for detachment and recovery
Assume disconnects happen.
Specify:
- how to create or reattach
- how to tell whether work is still running
- how to recover scrollback or captured output
- how to avoid killing a live job accidentally

### 5. Capture evidence when it matters
Use pane capture and copy mode deliberately for:
- debugging
- handoff
- incident timelines
- command/result verification

Do not rely on memory when the terminal state matters.

### 6. Be careful with live-pane automation
When sending keys or synchronizing panes, state:
- the exact target
- the current context assumptions
- the blast radius if the wrong pane is active
- safer alternatives when available

Interactive pane control is powerful and easy to misuse.

## Heuristics

Prefer:
- named sessions and windows
- attach-or-create patterns for repeatability
- detached sessions for fragile connections and long jobs
- pane capture before destructive intervention
- layouts that keep one source of truth per pane
- small operational recipes people can remember

Avoid:
- recommending tmux when one shell is enough
- pane grids so dense nobody can read them
- anonymous sessions like `0` or `default` for serious work
- synchronized-pane use without explicit caution
- brittle automation that assumes prompt state blindly
- treating tmux like a process supervisor when it is not one

## Adjacent skill boundaries

- **tmux** manages terminal multiplexing and live CLI control
- **site-reliability** or **incident-responder** own the incident itself; this skill structures the terminal workspace for handling it
- **coding-agent** or other coding skills own code changes; this skill helps manage the interactive terminal environment around them
- **release-manager** may own launch choreography; this skill handles tmux recipes only when terminal orchestration is the real problem

## Quick routing examples

Use **tmux** for:
- setting up a durable SSH workspace with logs, shell, and tests in separate panes
- capturing output from a stuck interactive CLI and intervening safely
- creating a repeatable incident-response layout with named sessions and windows
- teaching a team how to reattach to long-running jobs without losing context

Do **not** use **tmux** for:
- supervising a production service that should live under `systemd` or another supervisor
- generic shell questions with no need for multiplexing or persistence
- application debugging where the terminal arrangement is not the main challenge

## Quality bar

A strong result should:
- justify tmux use instead of assuming it
- produce a clear session/window/pane model
- include exact commands or key sequences when execution detail matters
- account for detach/reattach, output capture, and long-running jobs
- warn clearly before sending keys into live panes
- leave the operator with a calmer, more recoverable terminal workflow

## Use with

- `prompt.md` for execution posture and response style
- `examples/README.md` for representative requests and output shape
- `guides/qa-checklist.md` for final review standards
- `meta/skill.json` for machine-readable metadata
