/**
 * bin/cli.ts
 *
 * atomic CLI — wrapper for managing the atomic-agent daemon via PM2.
 *
 * Commands:
 *   atomic --start [path]   Start the daemon (defaults to .env COMMIT_SCOPE)
 *   atomic --end            Stop the daemon
 *   atomic --rdir <path>    Restart with a new working directory
 *   atomic --status         Show current state + last 3 heartbeat log lines
 */

import { spawnSync }                              from 'child_process';
import { readFileSync, existsSync }               from 'fs';
import { join, resolve, normalize, dirname }      from 'path';
import { fileURLToPath }                          from 'url';
import { config as loadDotenv }                   from 'dotenv';
import { ConfigService }                          from '../src/services/ConfigService.js';

// ─── Paths ────────────────────────────────────────────────────────────────────
// cli.ts lives in bin/ — walk up one level to reach the project root.

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

const LOG_FILE   = join(ROOT, 'logs', 'agent.log');
const AGENT_NAME = 'atomic-agent';

const configService = new ConfigService();

// ─── Colours (ANSI, zero deps) ────────────────────────────────────────────────

const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  green  : '\x1b[32m',
  red    : '\x1b[31m',
  yellow : '\x1b[33m',
  cyan   : '\x1b[36m',
  grey   : '\x1b[90m',
};

function bold(s: string)   { return `${C.bold}${s}${C.reset}`; }
function green(s: string)  { return `${C.green}${s}${C.reset}`; }
function red(s: string)    { return `${C.red}${s}${C.reset}`; }
function yellow(s: string) { return `${C.yellow}${s}${C.reset}`; }
function cyan(s: string)   { return `${C.cyan}${s}${C.reset}`; }
function grey(s: string)   { return `${C.grey}${s}${C.reset}`; }
function dim(s: string)    { return `${C.dim}${s}${C.reset}`; }

// ─── Path normalisation ───────────────────────────────────────────────────────

function normalisePath(raw: string): string {
  return normalize(resolve(raw));
}

// ─── PM2 bridge ───────────────────────────────────────────────────────────────

function pm2(...args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync('npx', ['--yes', 'pm2', ...args], {
    encoding : 'utf8',
    shell    : true,
    env      : { ...process.env },
  });
  return {
    stdout : (result.stdout ?? '').trim(),
    stderr : (result.stderr ?? '').trim(),
    ok     : result.status === 0,
  };
}

interface PM2ProcessInfo {
  name   : string;
  status : string;
  pid    : number | null;
  uptime : number;
  memory : number;
}

function getProcessInfo(): PM2ProcessInfo | null {
  const { stdout, ok } = pm2('jlist');
  if (!ok || !stdout) return null;

  let list: unknown[];
  try {
    list = JSON.parse(stdout) as unknown[];
  } catch {
    return null;
  }

  const proc = (list as Record<string, unknown>[]).find(
    (p) => (p['name'] as string) === AGENT_NAME
  );
  if (!proc) return null;

  const monit  = proc['monit']   as Record<string, number>  | undefined;
  const pm2Env = proc['pm2_env'] as Record<string, unknown> | undefined;

  const uptimeMs = pm2Env?.['pm_uptime']
    ? Date.now() - (pm2Env['pm_uptime'] as number)
    : 0;

  return {
    name   : proc['name'] as string,
    status : (pm2Env?.['status'] as string) ?? 'unknown',
    pid    : (proc['pid'] as number) ?? null,
    uptime : uptimeMs,
    memory : (monit?.['memory'] as number) ?? 0,
  };
}

// ─── Uptime formatter ─────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Log tail helper ──────────────────────────────────────────────────────────

function lastHeartbeatLines(n: number): string[] {
  if (!existsSync(LOG_FILE)) return [];
  const raw = readFileSync(LOG_FILE, 'utf8');
  const lines = raw
    .split('\n')
    .filter((l) => l.trim().length > 0 && l.startsWith('['));
  return lines.slice(-n);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdStart(rawPath?: string): void {
  let dir: string;

  if (rawPath) {
    dir = normalisePath(rawPath);
  } else {
    loadDotenv({ path: join(ROOT, '.env') });
    const scope = process.env['COMMIT_SCOPE'];
    if (!scope?.trim()) {
      console.error(red('✗ No path provided and COMMIT_SCOPE is not set in .env.'));
      console.error(dim('  Usage: atomic --start [/absolute/path/to/repo]'));
      process.exit(1);
    }
    dir = normalisePath(scope);
  }

  console.log(cyan(`\n⚡ Starting ${bold(AGENT_NAME)}…`));
  console.log(dim(`   Directory : ${dir}`));

  pm2('delete', AGENT_NAME);

  // Entry point is now src/main.ts
  const entryPoint = join(ROOT, 'src', 'main.ts');

  const { ok, stderr } = pm2(
    'start', entryPoint,
    '--name', AGENT_NAME,
    '--interpreter', 'npx',
    '--interpreter-args', 'tsx',
    '--cwd', ROOT,
    '--env', 'production',
    '--update-env',
  );

  if (!ok) {
    console.error(red('\n✗ Failed to start agent via PM2:'));
    console.error(dim(stderr));
    process.exit(1);
  }

  configService.writeState(dir);
  pm2('set', `${AGENT_NAME}:COMMIT_SCOPE`, dir);

  console.log(green(`\n✔ ${bold(AGENT_NAME)} is now ACTIVE.`));
  console.log(dim(`  Run ${bold('atomic --status')} to monitor it.\n`));
}

function cmdEnd(): void {
  console.log(yellow(`\n⏹  Stopping ${bold(AGENT_NAME)}…`));

  const { ok, stderr } = pm2('delete', AGENT_NAME);

  if (!ok && !stderr.includes('not found')) {
    console.error(red('✗ Failed to stop agent:'));
    console.error(dim(stderr));
    process.exit(1);
  }

  console.log(green(`✔ ${bold(AGENT_NAME)} has been stopped.\n`));
}

function cmdRdir(rawPath: string): void {
  const dir = normalisePath(rawPath);

  console.log(cyan(`\n🔄 Restarting ${bold(AGENT_NAME)} with new directory…`));
  console.log(dim(`   Directory : ${dir}`));

  pm2('delete', AGENT_NAME);

  const entryPoint = join(ROOT, 'src', 'main.ts');

  const { ok, stderr } = pm2(
    'start', entryPoint,
    '--name', AGENT_NAME,
    '--interpreter', 'npx',
    '--interpreter-args', 'tsx',
    '--cwd', ROOT,
    '--update-env',
  );

  if (!ok) {
    console.error(red('\n✗ Failed to restart agent via PM2:'));
    console.error(dim(stderr));
    process.exit(1);
  }

  configService.writeState(dir);
  pm2('set', `${AGENT_NAME}:COMMIT_SCOPE`, dir);

  console.log(green(`\n✔ ${bold(AGENT_NAME)} restarted.`));
  console.log(dim(`  Now watching: ${bold(dir)}\n`));
}

function cmdStatus(): void {
  const info  = getProcessInfo();
  const state = configService.readState();
  const dir   = state?.directory ?? 'unknown';

  console.log('\n' + bold('═══════════════════════════════════════'));
  console.log(bold('  🤖  Atomic Agent — Status'));
  console.log(bold('═══════════════════════════════════════'));

  if (info && info.status === 'online') {
    const uptime = formatUptime(info.uptime);
    console.log(`  ${green('🟢')} Status    : ${green(bold('ACTIVE'))}`);
    console.log(`  📁 Directory : ${cyan(dir)}`);
    console.log(`  ⏱  Uptime    : ${yellow(uptime)}`);
    if (info.pid) {
      console.log(`  🔢 PID       : ${dim(String(info.pid))}`);
    }
    const memMB = (info.memory / 1024 / 1024).toFixed(1);
    console.log(`  💾 Memory    : ${dim(memMB + ' MB')}`);
  } else {
    console.log(`  ${red('🔴')} Status    : ${red(bold('INACTIVE'))}`);
    if (dir !== 'unknown') {
      console.log(`  📁 Last Dir  : ${grey(dir)}`);
    }
    if (state?.startedAt) {
      const last = new Date(state.startedAt).toLocaleString();
      console.log(`  🕑 Last seen : ${grey(last)}`);
    }
  }

  const lines = lastHeartbeatLines(3);
  console.log('\n' + bold('─── Last 3 heartbeat entries ───────────'));
  if (lines.length === 0) {
    console.log(dim('  (no log entries found)'));
  } else {
    for (const line of lines) {
      const coloured = line
        .replace(/\[ERROR  \]/g, red('[ERROR  ]'))
        .replace(/\[WARN   \]/g, yellow('[WARN   ]'))
        .replace(/\[INFO   \]/g, cyan('[INFO   ]'))
        .replace(/\[DORMANT\]/g, grey('[DORMANT]'));
      console.log('  ' + dim(coloured));
    }
  }

  console.log(bold('════════════════════════════════════════\n'));
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const printHelp = () => {
  console.log(`
🛡️  ${bold('Atomic Commit Machine (ACM) — CLI v1.0.0')}
-------------------------------------------
A headless observer agent for atomic conventional commits.

${bold('USAGE:')}
  atomic ${cyan('[command]')} ${grey('[options]')}

${bold('COMMANDS:')}
  ${cyan('--start')} ${grey('[path]')}    🚀 Initialize the observer. Defaults to .env scope.
  ${cyan('--rdir')} ${grey('<path>')}     🔄 Redirect observer to a new absolute directory path.
  ${cyan('--status')}          🔍 View current health, directory, and heartbeat logs.
  ${cyan('--end')}             🛑 Stop and delete the background daemon.
  ${cyan('--help')}            💡 Show this help menu.

${bold('EXAMPLES:')}
  atomic ${cyan('--start')} .
  atomic ${cyan('--rdir')} "C:/Users/MSI/Documents/ProjectB"
  atomic ${cyan('--status')}

${bold('NOTES:')}
  • ACM runs as a background process via PM2.
  • All Git commands are compressed via RTK to save tokens.
  • Ensure your .env is configured before starting.
  `);
};

const [,, flag, arg] = process.argv;

if (!flag || flag === '--help' || flag === '-h') {
  printHelp();
  process.exit(0);
}

switch (flag) {
  case '--start':
    cmdStart(arg);
    break;

  case '--end':
    cmdEnd();
    break;

  case '--rdir':
    if (!arg) {
      console.error(red('✗ --rdir requires an absolute path argument.'));
      console.error(dim('  Example: atomic --rdir C:\\Users\\me\\my-project'));
      process.exit(1);
    }
    cmdRdir(arg);
    break;

  case '--status':
    cmdStatus();
    break;

  default:
    console.error(red(`✗ Unknown command: ${flag ?? '(none)'}`));
    printHelp();
    process.exit(1);
}
