/**
 * Reorg #28 — canonical-layout MOVE runbook (planner only, executes nothing).
 *
 * Produces the exact, ordered, REVERSIBLE steps to relocate each scattered MCP
 * server + tool to the canonical layout:
 *   ~/porter/mcp/<product>/<server>     (MCP servers)
 *   ~/porter/tools/                     (tools — R8 already owns ~/porter/tools.env)
 *
 * Each move is paired with the config / systemd-unit / consumer edit it REQUIRES,
 * and every step ships with its rollback. Order matters: config that carries an
 * absolute path must be updated in the same step as the move, and the whole set
 * runs one-server-at-a-time with a verify between (do one, verify, next).
 *
 * NOTHING here touches the filesystem. It returns a plan object for an operator.
 */
import path from 'path';
import os from 'os';
import { buildRegistry, McpRegistryEntry } from './mcp-registry.js';

const HOME = process.env.HOME || os.homedir();

export interface RunbookStep {
  n: number;
  title: string;
  /** what changes, human readable */
  action: string;
  /** literal shell the operator would run (NOT executed here) */
  commands: string[];
  /** paired config/unit/consumer edits this move REQUIRES */
  configEdits: string[];
  /** how to verify before moving on */
  verify: string[];
  /** exact rollback for this step */
  rollback: string[];
}

export interface MoveTarget {
  name: string;
  product: string;
  from: string;
  to: string;
  reason: string;
}

export interface MovePlan {
  canonicalRoots: { mcp: string; tools: string };
  moves: MoveTarget[];
  runbook: RunbookStep[];
  loadBearingWarning: string;
  executes: false;
}

function mcpServerSteps(reg: McpRegistryEntry[]): { moves: MoveTarget[]; steps: RunbookStep[] } {
  const moves: MoveTarget[] = [];
  const steps: RunbookStep[] = [];
  let n = 1;

  for (const e of reg) {
    if (!e.needsMove || !e.currentDir || !e.canonicalDir) continue;
    const from = e.currentDir;
    const to = e.canonicalDir;
    moves.push({ name: e.name, product: e.product, from, to, reason: `scattered ${e.scope} MCP server → canonical ~/porter/mcp/${e.product}/` });

    const configEdits: string[] = [];
    // 1) CLI config edit that carries the absolute path
    if (e.scope === 'user') {
      configEdits.push(
        `~/.claude.json → mcpServers["${e.name}"].args: rewrite "${from}" → "${to}" ` +
          `(use the config generator: buildConfigGenPlan() proposedUserBlock — do NOT hand-edit).`,
      );
    } else if (e.scope === 'project') {
      configEdits.push(
        `~/.claude.json → projects["${from}"] KEY is the directory path itself — rename the ` +
          `project key "${from}" → "${to}" AND rewrite mcpServers["${e.name}"].args "${from}" → "${to}".`,
      );
    } else if (e.scope === 'local-settings') {
      configEdits.push(`~/.claude/settings.local.json → mcpServers["${e.name}"].args: rewrite "${from}" → "${to}".`);
    } else if (e.scope === 'unregistered') {
      configEdits.push('(not a CLI mcpServers entry — no ~/.claude.json edit)');
    }
    // 2) any absolute consumer references (e.g. Tom worker registry)
    for (const c of e.consumers ?? []) {
      configEdits.push(`consumer reference: ${c} — rewrite any "${from}" → "${to}".`);
    }
    // 3) local package.json / node_modules note
    configEdits.push(`after move: (cd "${to}" && npm ci) if the server has its own node_modules/build (e.g. dist/).`);

    steps.push({
      n: n++,
      title: `Move MCP server "${e.name}" (${e.product})`,
      action: `Relocate ${from} → ${to} and repoint every absolute reference in the SAME step.`,
      commands: [
        `mkdir -p "${path.dirname(to)}"`,
        `git -C "${from}" status >/dev/null 2>&1 && echo "NOTE: ${from} is a git repo — move preserves .git" || true`,
        `mv "${from}" "${to}"`,
      ],
      configEdits,
      verify: [
        `test -e "${to}" && echo OK-moved`,
        e.scope === 'user'
          ? `restart a Claude CLI session and confirm the "${e.name}" MCP tools load (no spawn error).`
          : e.scope === 'unregistered'
            ? `exercise the consumer (${(e.consumers ?? []).join(', ') || 'Tom worker'}) and confirm it resolves "${to}".`
            : `open a session in a project scoped to "${e.name}" and confirm its tools load.`,
      ],
      rollback: [
        `mv "${to}" "${from}"`,
        `revert the config/consumer edits above (restore "${from}" paths).`,
      ],
    });
  }
  return { moves, steps };
}

/**
 * Tools: R8 already generated ~/porter/tools.env pointing at the CURRENT canonical
 * locations (npm-global bins, .cache browsers, /usr/bin, ~/.local/bin). Those are
 * load-bearing (systemd units + .claude.json reference them) so this plan does NOT
 * relocate system/npm binaries — it only proposes gathering LOOSE user scripts
 * (~/bin, ~/.local/bin custom scripts) under ~/porter/tools and regenerating
 * tools.env. Binaries owned by npm/apt/browsers stay put; moving them would break
 * PATH + units with no benefit.
 */
function toolsStep(n: number): RunbookStep {
  const toolsDir = path.join(HOME, 'porter', 'tools');
  return {
    n,
    title: 'Gather loose user scripts under ~/porter/tools (opt-in, non-binary only)',
    action:
      'For each hand-written script in ~/bin or ~/.local/bin that is NOT a package/apt/npm ' +
      'binary and NOT already referenced by a systemd unit, copy (not move) it into ~/porter/tools, ' +
      'verify, then remove the original and regenerate tools.env.',
    commands: [
      `mkdir -p "${toolsDir}"`,
      `# per script:  cp -a ~/bin/<script> "${toolsDir}/" && "${toolsDir}/<script>" --help  # verify`,
      `# then:        rm ~/bin/<script>`,
      `# finally:     curl -s 'http://127.0.0.1:3001/api/admin/tools/registry?regenerateEnv=1'  # R8 regen`,
    ],
    configEdits: [
      'DO NOT move npm-global/.cache/apt binaries — tools.env + systemd units + ~/.claude.json ' +
        'reference their current absolute paths (PORTER_TOOL_* in ~/porter/tools.env).',
      'Add ~/porter/tools to PATH via ~/porter/tools.env (R8 owns generation) if any moved script is on PATH.',
    ],
    verify: [
      `test -d "${toolsDir}" && echo OK-toolsdir`,
      'each moved script runs from its new path; tools.env regenerated with unchanged binary paths.',
    ],
    rollback: [`mv "${toolsDir}/<script>" ~/bin/<script>` , 'regenerate tools.env.'],
  };
}

export function buildMovePlan(): MovePlan {
  const reg = buildRegistry();
  const { moves, steps } = mcpServerSteps(reg);
  steps.push(toolsStep(steps.length + 1));
  return {
    canonicalRoots: {
      mcp: path.join(HOME, 'porter', 'mcp'),
      tools: path.join(HOME, 'porter', 'tools'),
    },
    moves,
    runbook: steps,
    loadBearingWarning:
      'LOAD-BEARING: ~/.claude.json (absolute MCP paths) and systemd user units reference current ' +
      'locations. Never move a directory without applying its paired config/unit/consumer edit in the ' +
      'SAME step. Run one server at a time, verify, then proceed. Package servers (gmail-themozaic, ' +
      'firecrawl) run via npx — nothing to move.',
    executes: false,
  };
}
