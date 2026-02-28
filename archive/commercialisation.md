# Porter — Commercialisation Strategy
**Version 0.1 · Last updated 2026-02-22**

---

## 1. Executive Summary

Porter operates in a fragmented, underserved market. Developers currently split their workflows between desktop SFTP clients (Cyberduck, Transmit, FileZilla) and general-purpose browser tools (Filestash, filebrowser) — with no dominant player offering a modern, purpose-built web file manager for self-hosted VPS environments.

The opportunity: a clean, fast, browser-based file manager that treats SSH tunnelling and Tailscale as first-class features, open source at its core, with a cloud-managed tier for revenue.

**The answer to web app vs Chrome extension: web app, decisively.** Chrome extension APIs cannot support remote server file management in any meaningful way. No viable extension exists in this space for good reason — the architecture doesn't fit. Porter is a web app.

---

## 2. Competitive Landscape

### Self-Hosted Web File Managers

| Product | Licence | Pricing | Weakness |
|---|---|---|---|
| **Filestash** | AGPL-3.0 | Free (self-hosted) | General-purpose, not VPS-optimised, AGPL limits commercial use |
| **FileBrowser** | Apache 2.0 | Free | Minimal features, dated UX, no active commercial strategy |
| **Cloud Commander** | MIT | Free | Small ecosystem, limited modern UX |
| **Termix** | Open source | Free | Terminal-first, file management secondary |
| **ShellNGN** | Proprietary | Unknown | SSH client with SFTP bolted on, no clear positioning |

**Key finding:** None of these are built specifically for the VPS developer workflow. All have dated or utilitarian UIs. None support Tailscale. None have a credible commercial strategy.

### Desktop SFTP Clients (Current Developer Default)

| Product | Platform | Price | Model |
|---|---|---|---|
| **Cyberduck** | Mac/Win | $39.99 or free | Donation/one-time |
| **Transmit** | Mac only | $45 | One-time |
| **FileZilla** | Cross-platform | Free | Open source |
| **WinSCP** | Windows only | Free | Open source |

**Key finding:** Developers use these by default, not because they love them. The UX is static and dated. Every one of them requires local installation, connection credential management, and produces friction when networks or firewalls change. None support Tailscale natively.

### Chrome/Browser Extensions

**Finding: this market does not exist.** The Chrome extension APIs (`chrome.fileBrowserHandler`, `chrome.fileSystemProvider`) are designed for local file management, not remote servers. No successful extension for remote SFTP/SSH file management has been built because the architecture genuinely doesn't support it. This is not an opportunity — it is a dead end.

---

## 3. Porter's Differentiation

| Feature | Cyberduck | FileZilla | Filestash | FileBrowser | **Porter** |
|---|---|---|---|---|---|
| Browser-based | ✗ | ✗ | ✓ | ✓ | ✓ |
| No installation | ✗ | ✗ | ✓ | ✓ | ✓ |
| SSH tunnel native | ✗ | ✗ | ✗ | ✗ | ✓ |
| Tailscale first-class | ✗ | ✗ | ✗ | ✗ | ✓ |
| Modern UX | ~ | ✗ | ~ | ~ | ✓ |
| Self-hosted | ✗ | ✗ | ✓ | ✓ | ✓ |
| Cloud option | ✗ | ✗ | ✗ | ✗ | ✓ (planned) |
| Open source | ✗ | ✓ | ✓ | ✓ | ✓ |
| VPS-optimised | ~ | ✓ | ~ | ~ | ✓ |

Porter's clearest positioning: **"The first file manager built for how developers actually work in 2026."** That means browser-based, Tailscale-aware, SSH-tunnel native, and beautiful.

---

## 4. Target Users

### Primary: The Solo Developer / Indie Hacker
- Runs 1–3 VPS instances (DigitalOcean, Hetzner, Vultr, etc.)
- Uses Tailscale or SSH for remote access
- Wants to avoid the CLI for file operations — especially uploads
- Privacy-conscious, prefers self-hosted
- Budget: $0–15/month for tooling they love
- **This is the beachhead. Win them first.**

### Secondary: Small Technical Teams (2–10 people)
- Shared VPS or dedicated server
- Need controlled access — not everyone should use the CLI
- Want auditability (who uploaded what, when)
- Budget: $20–50/month for team tooling
- **This is where revenue comes from.**

### Tertiary: DevOps / Sysadmins
- Managing multiple servers
- Want API access and automation
- Budget: $50–100/month
- **This is the enterprise wedge, future v2.x territory.**

---

## 5. Commercialisation Model

### Recommended: Open Source Core + Cloud Managed Tier

This is the proven model for developer tooling in 2026. Examples: Plausible, Coolify, Portainer, Dokku, Fathom.

**Why this works:**
- Open source builds trust — critical for a tool that touches your files
- Self-hosted free tier drives adoption, GitHub stars, and community
- Cloud tier converts the users who want it to just work
- No VC pressure required to reach break-even

---

### Tier 0 — Self-Hosted (Free, MIT Licence)

Everything Porter is today. Run it on your own VPS, access via SSH tunnel or Tailscale.

**What's included:**
- Full file browser (all roots/directories)
- Upload, download, rename, delete, create folder
- Read-only protection for system paths
- Toast notifications, modal confirmations
- SSH tunnel + Tailscale access patterns

**Licence:** MIT. Not AGPL. The AGPL viral clause kills commercial adoption — companies won't integrate AGPL tools. MIT lets enterprises use Porter without legal friction, which drives corporate GitHub stars and eventual paid upgrades.

---

### Tier 1 — Porter Cloud (Paid SaaS, Planned)

**Price:** $12/month (Starter) · $24/month (Team)

**What Starter adds over self-hosted:**
- Managed hosting — no VPS or Python required
- Zero-configuration Tailscale integration (OAuth, no manual tunnel)
- Automatic updates and backups
- 99.5% uptime SLA
- SSL/TLS handled

**What Team adds:**
- Multi-user access with per-user permissions
- Activity log (who uploaded/deleted what, when)
- Up to 5 VPS connections
- Email support

**Revenue maths:**
- Break-even at ~40 Starter users or ~20 Team users (assuming ~$500/month infra)
- 100 Starter + 20 Team = ~$1,680/month by end of year 1 (conservative)
- 5–10% of self-hosted users convert — so 1,000 self-hosted installs = 50–100 paid users

---

### Tier 2 — Porter Pro (Self-Hosted Premium, Future)

**Price:** $29/month (individual) · $79/month (team)

One-time or annual purchase for power users who want extra features but prefer self-hosting.

**What Pro adds:**
- Multiple server connections (manage 5+ VPS from one Porter instance)
- Full-text search across files
- File preview (images, PDFs, Markdown rendered)
- Inline text editor
- REST API for automation
- Plugin system

**This tier is v2.x territory.** Don't build it until the free tier has 500+ GitHub stars.

---

## 6. Go-to-Market

### Phase 1: Open Source Launch (Now → 3 months)

1. **GitHub** — Clean repo, good README, demo GIF, one-click deploy instructions
2. **awesome-selfhosted** — Submit Porter; this list has massive organic traffic
3. **Hacker News** — "Show HN: Porter, a modern self-hosted file manager for your VPS"
4. **r/selfhosted** and **r/homelab** — Genuine community posts, not spam
5. **Product Hunt** — Launch once the UI is polished enough to screenshot well

**Goal:** 200 GitHub stars in 3 months. This is the threshold for FOSS fund eligibility.

### Phase 2: Community & Integrations (3–6 months)

1. **Coolify integration** — One-click Porter deployment from Coolify dashboard
2. **Portainer integration** — Docker Compose template in Portainer catalogue
3. **Discord community** — Small but active community signals legitimacy
4. **Documentation site** — Proper docs (not just a README) build trust

### Phase 3: Cloud Tier Launch (6–12 months)

1. **Stripe integration** — Subscription billing
2. **Waitlist during beta** — Signals demand, builds email list
3. **Price anchoring** — Launch at $9/month, raise to $12 after 50 users
4. **Case studies** — 2–3 early users willing to go on record

---

## 7. Pricing Philosophy

- **Never freemium-trap the core.** If a feature is useful to solo developers, it's in the free tier. This is what Plausible and Coolify get right. Artificial limits (5 files, 1 folder) create resentment.
- **Price on value, not cost.** Porter saves 30 minutes/week of CLI fumbling. At a developer's hourly rate, $12/month is trivial.
- **Team pricing per seat is wrong for this product.** Charge per server connection or per organisation, not per user. Developers hate per-seat pricing for infra tools.

---

## 8. What Not To Do

- **Don't build a Chrome extension.** The technical constraints make this a dead end. The browser extension APIs do not support remote server file management. Time spent here is wasted.
- **Don't use AGPL.** It limits adoption and triggers legal reviews at companies who might otherwise use and promote Porter.
- **Don't chase enterprise before the community.** Enterprise deals require sales calls, legal reviews, and procurement cycles. Win developers first — they bring Porter into their companies.
- **Don't add a terminal.** Termix and ShellNGN have already gone there. Porter's clarity of purpose (file management, nothing else) is a feature. The moment you add a terminal, you become "just another web SSH client."

---

## 9. Financial Projections

| Scenario | Year 1 Users | MRR | ARR |
|---|---|---|---|
| Conservative | 30 Starter + 5 Team | ~$480 | ~$5,800 |
| Base case | 80 Starter + 20 Team | ~$1,440 | ~$17,300 |
| Optimistic | 200 Starter + 50 Team | ~$3,600 | ~$43,200 |

These numbers are modest by design — they reflect organic developer adoption without paid marketing. The base case is achievable with a solid GitHub presence and one viral HN post.

**The real value is not year 1 revenue. It is the open source community, the GitHub stars, and the brand equity that makes a cloud tier viable at year 2.**

---

## 10. One-Line Positioning

> **Porter is the file manager your VPS deserves — browser-based, Tailscale-ready, and actually beautiful.**

---

*This document should be revisited quarterly as traction data becomes available.*
