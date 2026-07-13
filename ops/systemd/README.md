# systemd units (tracked — the box is not the source of truth)

## Why the unit is in the repo

On 2026-07-13 Porter — the backbone every CLI, the MCP server and the memory layer
depend on — **exited cleanly and stayed dead**.

Root cause: it was the ONLY critical service with `Restart=on-failure`, while
`ymc-backend`, `ymc-site` and `openclaw-gateway` all use `Restart=always`. A clean exit
(status 0) does not match `on-failure`, so systemd left the backbone down and nothing
brought it back.

Fixed to `Restart=always` + `RestartSec=5`, and **proven**: a clean SIGTERM to the main
pid now brings Porter straight back. The unit lives here so the fix survives a rebuild —
an invariant that exists on one box only is not an invariant.

## Secrets are NOT in the unit

`heymoezy/porter` is a **public** repo. Runtime secrets (`DATABASE_URL`, `OPENCLAW_TOKEN`,
`PORTER_SERVICE_TOKEN`, `STALWART_API_KEY`) live in `~/.config/porter/porter.env`
(mode 600, untracked) and are pulled in with `EnvironmentFile=`. Template:
`porter.env.example`. The unit itself carries only non-secret config.

## Install on a fresh box

    install -m 600 ops/systemd/porter.env.example ~/.config/porter/porter.env
    $EDITOR ~/.config/porter/porter.env          # fill in the secrets
    cp ops/systemd/porter-fastify.service ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now porter-fastify

## Verify the policy actually took

    systemctl --user show porter-fastify -p Restart --value    # must print: always
    curl -s http://127.0.0.1:3001/health
