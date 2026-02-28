# Porter: Localhost to Public Product — Deployment Research

**Date:** 2026-02-28
**Current state:** Python stdlib server on VPS at 127.0.0.1:8877, accessed via SSH tunnel
**Goal:** Map the path from personal tool to public-facing, distributable product

---

## 1. Domain & DNS

### The "Porter" Namespace Problem

The name "porter" is heavily contested in the developer tooling space:

| Domain | Status | Owner |
|--------|--------|-------|
| `porter.dev` | Taken | Used by Porter (getporter.dev) — CNAB package manager by Microsoft-adjacent team |
| `porter.run` | Taken | Porter Cloud PaaS — "Heroku meets Codespaces" |
| `porter.sh` | Taken | Porter package manager (CNAB bundles) |
| `getporter.dev` | Taken | Dashboard for Porter Cloud PaaS |
| `getporter.io` | Taken | Customer portal for Porter Cloud |
| `porter.app` | Likely taken | `.app` TLD is premium; Google-owned TLD, requires HTTPS (enforced at DNS level) |
| `porter.ai` | Likely taken | `.ai` is premium ($50-100/yr), highly contested |

### Realistic Domain Options

**Tier 1 — Strong, likely available:**
- `porterfiles.com` / `porterfiles.dev` — descriptive, unique to file management
- `useporter.app` / `useporter.dev` — common SaaS naming pattern
- `getporter.app` — `.app` enforces HTTPS at the TLD level (good for trust)
- `porterfile.dev` — singular, clean
- `porterhq.dev` — implies a product hub

**Tier 2 — Creative alternatives:**
- `porter.tools` — fits the "file manager + tools" positioning
- `porter.host` — plays on self-hosted nature
- `porterapp.dev` — unambiguous
- `withporter.com` — "Build with Porter" marketing angle

**Tier 3 — Completely different branding:**
- Consider whether "Porter" is the right public name given namespace collision
- A unique name avoids SEO competition with 3+ existing "Porter" projects
- If staying with Porter, a distinctive domain like `porterfiles.dev` creates separation

### DNS Setup Recommendation

**Cloudflare (free tier)** is the clear winner:
- Free DNS hosting with proxy (hides origin IP)
- DDoS protection included
- Edge caching for static assets
- Easy API for dynamic DNS updates
- Already in the ecosystem (ymc.capital likely uses similar infrastructure)

**DNS records needed:**
```
A     porter.example.com    → 76.13.190.52  (proxied)
CNAME www.porter.example.com → porter.example.com (proxied)
```

When Cloudflare proxy is enabled:
- Origin IP (76.13.190.52) is hidden from the public
- Traffic routes through Cloudflare's edge network
- Free SSL/TLS between client and Cloudflare
- Must configure Full (Strict) SSL mode with a valid cert on the origin

**Sources:**
- [How Cloudflare DNS Works](https://developers.cloudflare.com/fundamentals/concepts/how-cloudflare-works/)
- [Cloudflare DNS Proxy Status](https://developers.cloudflare.com/dns/proxy-status/)

---

## 2. Reverse Proxy & TLS

### Recommendation: Caddy

After evaluating three options, **Caddy is the clear winner** for Porter's use case.

| Criteria | Caddy | Nginx | Traefik |
|----------|-------|-------|---------|
| Automatic TLS | Built-in, zero-config | Manual (certbot cron) | Built-in but complex |
| Config complexity | 3-line Caddyfile | 50+ lines | Labels + YAML |
| Performance | 30,000+ req/s | 50,000+ req/s | 25,000+ req/s |
| Learning curve | Minutes | Hours | Days |
| Single binary | Yes | No (package) | Yes |
| Market share | 13% | 65% | 22% |

**Why Caddy wins for Porter:**
1. Single binary, just like Porter — philosophically aligned
2. Automatic HTTPS with Let's Encrypt — no certbot, no cron, no renewal scripts
3. Three-line config for the common case
4. Porter is not at 50K req/s scale — Caddy's 30K+ is more than sufficient
5. Perfect for self-hosters who want minimal ops burden

### Minimal Caddyfile for Porter

```caddyfile
porter.example.com {
    reverse_proxy 127.0.0.1:8877
}
```

That is the entire config. Caddy will:
- Obtain a Let's Encrypt certificate automatically
- Redirect HTTP to HTTPS
- Proxy all traffic to Porter
- Renew certificates automatically

### Keeping Other Services Private

Current architecture has multiple services on the VPS:
- Porter: 127.0.0.1:8877 (to be public)
- Ollama: 127.0.0.1:11434 (must stay private)
- OpenClaw: 127.0.0.1:18789 (must stay private)

**Strategy:**
1. Caddy only proxies the Porter domain — other services remain on localhost
2. Firewall (ufw) allows only ports 80, 443, 22 — blocks direct access to 8877, 11434, 18789
3. Tailscale remains for admin access to all services
4. Porter continues binding to 127.0.0.1 — only Caddy can reach it

```bash
# Firewall rules (requires sudo, so operator must do this)
ufw default deny incoming
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy redirect)
ufw allow 443/tcp   # HTTPS (Caddy)
ufw allow in on tailscale0  # All Tailscale traffic
ufw enable
```

### Alternative: Cloudflare Tunnel (Zero-Port Exposure)

For maximum security, Cloudflare Tunnel eliminates the need to open any ports:
- Install `cloudflared` on the VPS
- Create an outbound tunnel to Cloudflare's edge
- No ports 80/443 needed on the VPS at all
- DDoS protection, WAF, bot management included
- Free tier available

**Trade-off:** Adds dependency on Cloudflare's infrastructure. If Cloudflare goes down, Porter is unreachable. Caddy + direct DNS is more self-reliant.

**Recommendation for Porter:** Start with Caddy (simpler, self-contained, aligned with Porter's stdlib-only philosophy). Offer Cloudflare Tunnel as a documented alternative for security-conscious operators.

**Sources:**
- [Caddy Reverse Proxy Quick-Start](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- [Deploy Caddy Reverse Proxy on VPS](https://perlod.com/tutorials/deploy-a-reverse-proxy-with-caddy-in-vps/)
- [Reverse Proxy Showdown](https://hostim.dev/blog/reverse-proxy-showdown/)
- [Nginx vs Caddy vs Traefik 2025](https://drcodes.com/posts/nginx-vs-caddy-vs-traefik-best-reverse-proxy-for-microservices-2025)
- [Caddy vs Nginx Benchmark](https://blog.tjll.net/reverse-proxy-hot-dog-eating-contest-caddy-vs-nginx/)
- [Caddy + Tailscale Alternative to Cloudflare Tunnel](https://runtimeterror.dev/caddy-tailscale-alternative-cloudflare-tunnel/)

---

## 3. Deployment Models

### Model A: Self-Hosted (Primary — Matches Porter's DNA)

Porter is a single Python file with zero dependencies. This is its biggest distribution advantage.

**Distribution methods, ordered by effort:**

#### A1. Direct Download (Immediate)
```bash
curl -O https://porter.example.com/releases/porter.py
python3 porter.py
```
- Zero friction for developers
- No container runtime needed
- Works on any system with Python 3.10+
- User configures their own reverse proxy

#### A2. Docker / Docker Compose (Near-term)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY porter.py .
EXPOSE 8877
RUN useradd -m porter
USER porter
VOLUME /data
ENV PORTER_DATA_DIR=/data
CMD ["python3", "porter.py"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  porter:
    build: .
    ports:
      - "8877:8877"
    volumes:
      - porter_data:/data
      - /path/to/files:/files
    environment:
      - PORTER_DATA_DIR=/data
      - PORTER_PORT=8877
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

volumes:
  porter_data:
  caddy_data:
```

Advantages:
- Isolated environment
- Easy to ship with Caddy sidecar for automatic TLS
- Volume mounts for persistent data
- `docker compose up` — one command to full stack

#### A3. One-Click Cloud Deploy (Medium-term)

| Platform | Fit for Porter | Free Tier | Notes |
|----------|---------------|-----------|-------|
| Railway | Excellent | $5/mo hobby | Auto-detect Python, usage-based pricing |
| Render | Good | 750 hrs/mo free | Git-push deploy, managed SSL |
| Fly.io | Good | 3 shared VMs free | Edge deployment, scale-to-zero |
| DigitalOcean App Platform | Good | $5/mo basic | Droplet familiarity |

**Railway** is the best fit for Porter:
- Detects Python automatically via Railpack
- No Dockerfile required (but supports it)
- Template library for one-click "Deploy Porter" buttons
- Usage-based pricing means idle instances cost nearly nothing

**Fly.io** is the performance pick:
- Deploys to 35+ edge locations globally
- Scale-to-zero (pay nothing when idle)
- Persistent volumes for Porter data
- GPU instances available (future: AI features)

### Model B: Cloud SaaS (Future — Not Recommended Yet)

A centralized Porter instance serving multiple tenants.

**Requirements before this is viable:**
- Multi-user auth with proper isolation
- Per-user storage quotas and sandboxing
- Billing/subscription infrastructure
- GDPR/privacy compliance for file storage
- 10x the current infrastructure

**Verdict:** Premature. Porter's value is in self-hosting. SaaS commoditizes it against Dropbox/Google Drive. Stay self-hosted.

### Model C: Hybrid (Best Long-Term Strategy)

Self-hosted Porter instances with optional cloud features:

- **Cloud sync:** Sync settings/preferences across devices
- **Cloud backup:** Encrypted backup of Porter config to cloud
- **Update notifications:** Push updates to self-hosted instances
- **Telemetry (opt-in):** Usage analytics for product decisions
- **Extension marketplace:** Cloud-hosted skill/workflow registry

This model (used by Bitwarden, Gitea, Uptime Kuma) lets Porter stay self-hosted while building a revenue stream from optional cloud services.

**Sources:**
- [Self-Hosted SaaS Exodus 2026](https://blog.elest.io/the-great-saas-exodus-why-companies-are-moving-entire-stacks-to-self-hosted-in-2026/)
- [Railway vs Render vs Fly.io](https://codeyaan.com/blog/top-5/railway-vs-render-vs-flyio-comparison-2624)
- [Fly.io vs Railway 2026](https://thesoftwarescout.com/fly-io-vs-railway-2026-which-developer-platform-should-you-deploy-on/)
- [Python Hosting Options Compared](https://www.nandann.com/blog/python-hosting-options-comparison)
- [Docker Best Practices for Python](https://collabnix.com/10-essential-docker-best-practices-for-python-developers-in-2025/)

---

## 4. Multi-User Requirements

### Current Auth Architecture

Porter currently has:
- Single admin user (default: admin/porter)
- Password hashed with SHA-256 + salt
- Cookie-based sessions with 30-day TTL
- In-memory session store (`_sessions` dict — lost on restart)
- No user registration, no roles, no teams

### What Multi-User Needs

#### Phase 1: Before Public URL (Critical)
These are non-negotiable before exposing Porter to the internet:

1. **Session persistence** — Sessions are in-memory; a restart logs everyone out. Must persist to disk (JSON file or SQLite).

2. **Rate limiting** — Login endpoint must rate-limit to prevent brute force. Stdlib approach: track failed attempts per IP in a dict with TTL.

3. **CSRF protection** — Add CSRF tokens to all state-changing requests. Current cookie-based auth is vulnerable to CSRF.

4. **Secure password hashing** — SHA-256 with a salt is weak. Use `hashlib.pbkdf2_hmac()` (stdlib) with 600,000+ iterations, or `hashlib.scrypt()`.

5. **Session token security** — Ensure `HttpOnly`, `Secure`, `SameSite=Strict` flags on session cookies.

#### Phase 2: Multi-User (After Public URL, Before Teams)
When Porter serves more than one person:

1. **User management** — Registration, user list, role assignment (admin/editor/viewer).

2. **Per-user workspace isolation** — Each user sees only their directories. Admin sees all.

3. **Invite system** — Admin generates invite links rather than open registration.

4. **Audit logging** — Who uploaded/deleted/modified what, when.

#### Phase 3: Teams (When Product-Market Fit is Proven)

1. **Team workspaces** — Shared directories with team-level permissions.
2. **SSO/OIDC** — Enterprise customers need Google/Microsoft/SAML login.
3. **API keys** — Programmatic access for CI/CD, scripts, integrations.

### Auth Implementation Options

Given Porter's stdlib-only constraint:

| Approach | Complexity | Stdlib Compatible | Notes |
|----------|-----------|-------------------|-------|
| Custom JWT (HMAC) | Medium | Yes (`hmac`, `hashlib`, `base64`, `json`) | Stateless, scalable, but can't revoke without blacklist |
| Cookie + file sessions | Low | Yes (`http.cookies`, `json`) | Simple, Porter's current approach extended |
| Cookie + SQLite sessions | Low-Medium | Yes (`sqlite3`) | Durable, queryable, stdlib included |
| External auth (Clerk, Auth0) | Low (code) | No (API calls) | Offloads auth entirely, but adds dependency |

**Recommendation:** Evolve the current cookie + session approach:
1. Switch to SQLite for session persistence (`sqlite3` is stdlib)
2. Use `hashlib.scrypt()` for password hashing
3. Add CSRF tokens (random token per session, verified on POST)
4. Add rate limiting (in-memory dict with IP + timestamp)
5. Later: add JWT as an alternative for API access

### When Does Multi-User Become Critical?

**Before public URL:** Single-user hardening (Phase 1) is mandatory. You cannot expose the current auth to the internet.

**After public URL, before growth:** Multi-user (Phase 2) becomes critical when more than the operator wants access. This could be day one if Porter is shared with a team.

**Decision framework:** If Porter goes public as a "personal file manager" (like Nextcloud personal), multi-user can wait. If it goes public as a "team file manager," multi-user is a launch requirement.

**Sources:**
- [Python Authentication Guide 2026](https://workos.com/blog/python-authentication-guide-2026)
- [JWT in Python with HMAC](https://asecuritysite.com/jwt/jwt_python)
- [JWT Raw Implementation in Python3](https://injaelee.medium.com/json-web-token-jwt-raw-implementation-in-python3-e6df3907b8c6)
- [JWT vs Session Authentication](https://medium.com/@anas-issath/jwt-vs-session-authentication-in-django-which-one-should-you-use-in-2025-7e0fd4ea195f)

---

## 5. Infrastructure for the Current VPS

### Current Specs Assessment

| Resource | Current | Public-Facing Requirement |
|----------|---------|--------------------------|
| CPU | 2 vCPU AMD EPYC | Sufficient for ~50-100 concurrent users |
| RAM | 8GB + 8GB swap | Sufficient if Ollama is not running simultaneously |
| Disk | 96GB | Tight for file storage at scale; fine for personal/small team |
| Network | Unknown bandwidth | Most VPS providers offer 1TB+ transfer |
| GPU | None | Not needed for file management |

### Can This Handle a Public Product?

**For single-user public access:** Absolutely yes. Porter is a lightweight Python HTTP server. The current VPS is massively overprovisioned for one user.

**For 10-50 users:** Likely yes, with caveats:
- Porter serves files from disk — CPU is not the bottleneck, I/O is
- 8GB RAM is generous for Python HTTP serving
- Ollama (4.7GB) must not run simultaneously with heavy Porter traffic
- Static asset caching via Caddy/Cloudflare reduces load significantly

**For 100+ users:** Need to scale:
- Separate Ollama onto its own machine (or use cloud API)
- Add a CDN for static file serving
- Consider moving to a 4-vCPU / 16GB machine
- File storage will outgrow 96GB quickly

### Scaling Strategy

```
Phase 1 (Now → 50 users):     Current VPS + Caddy
Phase 2 (50 → 200 users):     Upgrade to 4 vCPU / 16GB / 200GB
Phase 3 (200+ users):         Separate compute + storage
                               - App server: 2 vCPU / 4GB (Porter only)
                               - Storage: S3-compatible object storage
                               - AI services: Separate GPU VPS or cloud API
```

### Monitoring & Alerting

#### Tier 1: Free, Minimal Setup (Start Here)

**UptimeRobot (free tier):**
- 50 monitors, 5-minute intervals
- HTTP, keyword, port monitoring
- Email/Slack/Discord alerts
- Zero server-side footprint
- Setup: 2 minutes, add Porter's public URL

**Caddy access logs:**
- Built into Caddy, zero extra setup
- JSON structured logs
- Pipe to any log aggregator later

#### Tier 2: Self-Hosted (When You Need More)

**Uptime Kuma:**
- Self-hosted monitoring dashboard
- Beautiful UI, lightweight (Node.js)
- Runs on the same VPS in Docker
- HTTP, TCP, DNS, ping monitoring
- Notifications: Slack, Discord, Telegram, email, 90+ services
- RAM usage: ~100MB

#### Tier 3: Full Observability (At Scale)

**Prometheus + Grafana:**
- Industry standard metrics collection
- Custom dashboards for Porter-specific metrics
- Historical data, trend analysis
- Heavier setup, justified only at 100+ users

### Logging Strategy for Porter

Porter should add structured logging:
```python
# Stdlib logging — no dependencies needed
import logging
logging.basicConfig(
    format='%(asctime)s %(levelname)s %(message)s',
    level=logging.INFO,
    handlers=[
        logging.StreamHandler(),  # stdout for systemd journal
        logging.handlers.RotatingFileHandler(
            data_dir / 'logs' / 'porter.log',
            maxBytes=10_000_000,  # 10MB
            backupCount=5
        )
    ]
)
```

Key events to log:
- Login attempts (success + failure with IP)
- File operations (upload, delete, rename)
- API errors with stack traces
- Startup/shutdown with config summary
- Request latency for slow requests (>1s)

**Sources:**
- [Uptime Kuma — Self-Hosted Monitoring](https://github.com/louislam/uptime-kuma)
- [Uptime Kuma Open-Source Monitoring](https://www.helpnetsecurity.com/2026/02/20/uptime-kuma-open-source-monitoring-tool/)
- [Top Self-Hosted Server Monitoring Tools](https://dedirock.com/blog/top-10-2025-self-hosted-server-monitoring-tools-for-centralized-management/)
- [UptimeRobot](https://uptimerobot.com/)

---

## 6. Onboarding Wizard Requirements

### Context

Porter already has `onboarding_complete: false` in default preferences and an empty `DEFAULT_MOUNTS` list. The wizard infrastructure exists conceptually but is planned for the final sprint (Sprint 12).

### What the Wizard Must Detect/Configure

#### Step 1: Environment Detection (Automatic, No User Input)

Run on first startup, results shown to the user:

| Detection | Method | Stdlib? |
|-----------|--------|---------|
| OS & architecture | `platform.system()`, `platform.machine()` | Yes |
| Python version | `sys.version` | Yes |
| Available disk space | `shutil.disk_usage()` | Yes |
| Network interfaces | `socket.getaddrinfo()` | Yes |
| Public IP | HTTP to ipify.org (already implemented) | Yes |
| Running as root? | `os.getuid()` | Yes |
| Systemd available? | `shutil.which('systemctl')` | Yes |
| Docker available? | `shutil.which('docker')` | Yes |
| Caddy/Nginx installed? | `shutil.which('caddy')`, `shutil.which('nginx')` | Yes |
| Ollama available? | HTTP probe to 127.0.0.1:11434 | Yes |
| OpenClaw available? | Check `~/.openclaw/` existence | Yes |
| Git available? | `shutil.which('git')` | Yes |
| ffmpeg available? | `shutil.which('ffmpeg')` | Yes |

#### Step 2: Admin Account Setup (Required)

- Username (default: admin)
- Password (minimum 8 chars, must change from default)
- Optional: recovery email (stored locally, for password reset)

#### Step 3: Storage Locations (Required)

- "Where are your files?" — file browser or path input
- Add one or more directories as Porter mount points
- Validate: directory exists, is readable, optionally writable
- Show disk space for each mount
- Default suggestion: `~/Documents`, `~/uploads`

#### Step 4: Network Configuration (Recommended)

- Bind address (default: 127.0.0.1 for safety)
- Port (default: 8877)
- "Make Porter accessible from the internet?" → guide to Caddy/reverse proxy setup
- Show detected public IP, Tailscale IP if available

#### Step 5: Integrations (Optional, Skip-able)

- Ollama: auto-detected, show model list if available
- OpenClaw: auto-detected, show gateway status if available
- These should be presented as "available capabilities" with setup guidance for missing ones

#### Step 6: Summary & Launch

- Recap all settings
- "Start Porter" button
- Show access URL(s)
- Set `onboarding_complete: true`

### First-Run Experience Best Practices

Based on research from UserPilot, UserGuiding, and Appcues:

1. **Progressive disclosure** — Don't overwhelm. Steps 1-3 are mandatory, 4-6 are optional with "Skip" buttons.

2. **Show immediate value** — After Step 3 (adding directories), show a preview of the file browser. Let them see Porter working before finishing setup.

3. **Visual progress** — Stepper/progress bar showing "Step 2 of 6."

4. **Re-runnable** — Settings page should have a "Re-run Setup Wizard" option for reconfiguration.

5. **Escape hatch** — "Skip wizard, use defaults" for power users who want to configure via config file.

6. **No dead ends** — Every "unavailable" feature should explain what's needed and how to install it, not just say "not found."

### Wizard UI Architecture

Two approaches within Porter's single-file constraint:

**Option A: In-browser wizard (recommended)**
- Serve a wizard HTML page at `/` when `onboarding_complete: false`
- Multi-step form with client-side validation
- POST results to `/api/setup` endpoint
- After completion, redirect to main Porter UI
- Consistent with Porter's existing architecture

**Option B: CLI wizard**
- Run `python3 porter.py --setup` for terminal-based wizard
- Uses `input()` prompts
- Writes config file, then starts server
- Better for headless/Docker deployments
- Can coexist with Option A

**Recommendation:** Implement both. In-browser wizard for interactive use, CLI `--setup` flag for automated/Docker deployments.

**Sources:**
- [Onboarding Wizard Best Practices](https://userpilot.com/blog/onboarding-wizard/)
- [What is an Onboarding Wizard](https://userguiding.com/blog/what-is-an-onboarding-wizard-with-examples)
- [In-App Onboarding Guide 2025](https://www.appcues.com/blog/in-app-onboarding)
- [JFrog Onboarding Wizard](https://jfrog.com/help/r/jfrog-installation-setup-documentation/onboarding-wizard)

---

## 7. Recommended Roadmap

### Phase 1: Security Hardening (Before Any Public Exposure)

**Must-do before going public:**
- [ ] Switch password hashing from SHA-256 to `hashlib.scrypt()` or `hashlib.pbkdf2_hmac()`
- [ ] Add CSRF protection to all POST endpoints
- [ ] Add login rate limiting (5 attempts per IP per 15 minutes)
- [ ] Persist sessions to SQLite (survive restarts)
- [ ] Set `HttpOnly`, `Secure`, `SameSite=Strict` on session cookies
- [ ] Add structured logging for security events
- [ ] Input validation audit on all API endpoints
- [ ] Path traversal audit (already has `safe_resolve()` — verify it's comprehensive)

**Estimated effort:** 1-2 sprints

### Phase 2: Public Access Infrastructure

- [ ] Register domain (porterfiles.dev or similar)
- [ ] Set up Cloudflare DNS with proxy enabled
- [ ] Install Caddy on VPS, configure reverse proxy
- [ ] Configure firewall (ufw) to expose only 80/443/22
- [ ] Set up UptimeRobot for basic monitoring
- [ ] Create Docker image + docker-compose.yml
- [ ] Write deployment documentation

**Estimated effort:** 1 sprint + DNS propagation time

### Phase 3: Distribution

- [ ] GitHub repository (public)
- [ ] Docker Hub image
- [ ] Railway "Deploy" button in README
- [ ] One-line install script: `curl -sSL https://porter.example.com/install | python3`
- [ ] Onboarding wizard (Sprint 12 — already planned)

**Estimated effort:** 1-2 sprints

### Phase 4: Multi-User & Growth

- [ ] User registration + invite system
- [ ] Per-user workspace isolation
- [ ] Role-based access (admin/editor/viewer)
- [ ] API keys for programmatic access
- [ ] Audit logging
- [ ] SQLite for user/session/audit data

**Estimated effort:** 2-3 sprints

---

## 8. Key Decisions Required

| Decision | Options | Recommendation | Urgency |
|----------|---------|----------------|---------|
| Domain name | porterfiles.dev, useporter.app, porter.tools, rebrand | porterfiles.dev (unique, descriptive) | Medium — needed before Phase 2 |
| Reverse proxy | Caddy, Nginx, Cloudflare Tunnel | Caddy (simplest, aligned with Porter philosophy) | High — needed for public access |
| Primary deployment model | Self-hosted, SaaS, hybrid | Self-hosted first, hybrid later | Low — self-hosted is default |
| Container strategy | Docker, Podman, none | Docker + docker-compose | Medium — needed for distribution |
| Session storage | In-memory, file, SQLite | SQLite (stdlib, durable) | High — needed before public |
| Password hashing | SHA-256, pbkdf2, scrypt | scrypt (stdlib, modern) | Critical — security debt |
| Multi-user timing | Before public, after public | Before public (at least Phase 1 hardening) | Critical |
| Monitoring | UptimeRobot, Uptime Kuma, Prometheus | UptimeRobot (free, zero overhead) | Low — nice to have for launch |
| Cloud platform for one-click | Railway, Fly.io, Render | Railway (simplest DX) | Low — Phase 3 |

---

## 9. Cost Estimate

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Domain (.dev) | ~$1/mo ($12/yr) | Namecheap/Cloudflare registrar |
| Cloudflare DNS | $0 | Free tier |
| Caddy | $0 | Open source, runs on existing VPS |
| UptimeRobot | $0 | Free tier (50 monitors) |
| Docker Hub | $0 | Free tier (public images) |
| Current VPS | Already paid | No additional cost |
| **Total additional** | **~$1/mo** | Just the domain |

Scaling costs (when needed):
- VPS upgrade to 4 vCPU/16GB: ~$24-48/mo (varies by provider)
- Railway hosting: ~$5-20/mo per instance (usage-based)
- S3-compatible storage: ~$5/mo per 100GB (Backblaze B2)

---

*Research compiled 2026-02-28. All recommendations assume Porter's stdlib-only constraint and single-file architecture are maintained.*
