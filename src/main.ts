/**
 * src/main.ts
 *
 * Thin orchestrator — wires services together and starts the observer.
 * This is the file PM2 runs as the atomic-agent daemon.
 */

import 'dotenv/config';
import { ConfigService } from './services/ConfigService.js';
import { GitService }    from './services/GitService.js';
import { AIService }     from './services/AIService.js';
import { Observer }      from './observer.js';
import { AppError }      from './types/index.js';

const config = new ConfigService();

let env;
try {
  env = config.loadEnv();
} catch (err: unknown) {
  if (err instanceof AppError && err.fatal) {
    console.error(`\n🚨 ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

console.log(`
╔══════════════════════════════════════════════════╗
║      🤖  Atomic Commit Machine  — Observer       ║
║         Domain-Aware · RTK-Compressed · Safe     ║
╚══════════════════════════════════════════════════╝
  Repo   : ${env.COMMIT_SCOPE}
  AI     : ${env.SUMOPOD_BASE_URL}
  Cycle  : every 30 minutes
`);

const git      = new GitService();
const ai       = new AIService(env);
const logFile  = config.getLogPath();

new Observer(git, ai, env, logFile).start();
