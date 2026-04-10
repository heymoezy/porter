# Examples — tmux

## Representative requests

### 1. Durable dev workspace
“Set up a tmux workspace for backend logs, a shell, tests, and a REPL that survives SSH disconnects.”

Expected shape:
- decide session and window naming
- define a simple, readable pane layout
- provide create / attach-or-create commands
- explain how to reattach and confirm jobs are still running

### 2. Interactive CLI recovery
“My long-running CLI is stuck inside tmux. How do I inspect the pane output and intervene without blindly killing it?”

Expected shape:
- capture pane output first
- inspect scrollback / copy mode
- identify the correct pane target
- give cautious intervention steps and fallback options

### 3. Incident-response layout
“Create a repeatable tmux layout for incident response with app logs, metrics, shell access, and notes.”

Expected shape:
- separate windows or panes by function
- keep one source of truth per pane
- include naming conventions and attach flow
- note when synchronized panes or shared input would be risky

## Output expectation
A strong answer should:
- say whether tmux is actually appropriate
- give exact, usable commands or keys where needed
- account for detach/reattach and long-running process safety
- include capture and troubleshooting guidance when live panes are involved
