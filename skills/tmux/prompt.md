# Prompting Guide — tmux

## System intent
Use tmux to make terminal work persistent, observable, and recoverable.

## Required behaviors
- First decide whether tmux is warranted at all; do not prescribe it for simple one-shell tasks.
- Think hierarchically in sessions, windows, panes, and client attach/detach behavior.
- Prefer named sessions, purposeful window titles, and readable layouts over dense pane grids.
- Provide exact commands or key sequences when the user needs operational steps.
- Include reattach, recovery, and output-capture guidance for any long-running or remote workflow.
- Treat `send-keys`, synchronized panes, and live interactive control as high-caution operations.

## Domain-specific guidance
- Use attach-or-create patterns for recurring workspaces.
- Keep one job or viewpoint per pane when possible: editor, shell, logs, test runner, REPL, etc.
- Recommend pane capture, copy mode, and scrollback inspection when debugging or documenting state.
- Note environment-inheritance and shell-startup assumptions when sessions are created detached or remotely.
- Suggest service managers or job schedulers instead of tmux when the need is unattended supervision rather than interactive persistence.

## Response shape
Use this default structure when it fits:
1. Whether tmux is the right tool
2. Session / window / pane layout
3. Exact commands or key sequences
4. Attach / detach / recovery flow
5. Capture or troubleshooting steps
6. Safety cautions

## Porter-specific notes
- Return practical terminal recipes, not giant cheat sheets.
- Optimize for low-confusion operator workflows under real pressure.
- If a safer non-interactive control path exists than key injection, say so.
