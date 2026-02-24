# UI Wireframes and User Flows

## Screen 1: First-run Welcome
- Title: "Set up Porter"
- Subtitle: "Connect locations, then connect agents."
- Buttons:
  - Start setup (primary)
  - Skip for now (secondary)

## Screen 2: Add Location
Cards:
1. Local directory
2. SSH server
3. GitHub repository

Form fields by type:
- Local: Label, absolute path
- SSH: Label, host, port, username, key path, root path
- GitHub: Label, owner/repo, branch, token(optional), path prefix

Actions:
- Test connection
- Save location

## Screen 3: Connect Agent
Cards:
- OpenClaw
- Claude Code
- Generic API client

Fields:
- Agent name
- Agent type
- Issue API key (generated)
- Optional callback/base URL

Actions:
- Create agent
- Copy key

## Screen 4: Assign Permissions
Permission presets:
- Viewer
- Writer
- Operator
- Admin

Advanced matrix:
Rows: namespaces (`projects`, `compliance`, `runtime`, `pointers`, `decisions`)
Columns: capabilities (`read`, `write`, `checkpoint`, `finalize`, `admin`)

Actions:
- Apply preset
- Fine-tune matrix
- Save policy

## Screen 5: Setup Complete
Checklist:
- Location connected
- Agent key issued
- Permissions saved
- Test read/write successful

Button: "Open Porter"

---

## Settings IA (post-setup)
Tabs:
1. Locations
2. Agents
3. Permissions
4. Memory
5. Runtime
6. Security

### Locations tab
- list, reorder, add/edit/remove, test
- set default landing location

### Agents tab
- list agents and status
- key create/revoke/rotate
- role assign

### Permissions tab
- matrix editor
- namespace policy templates

### Memory tab
- pointer max length
- snippet size
- hot/warm/cold policy toggle

### Runtime tab
- checkpoint interval (default 30s)
- lease TTL
- auto-resume toggle

### Security tab
- session timeout
- API auth mode
- audit export

---

## Upload UX correction
- Remove fixed "uploads" root from default sidebar.
- Keep Upload as contextual action in writable locations.
- Allow users to add an Uploads location manually if desired.
