Atomic Commit Machine (ACM)
A headless TypeScript observer agent designed to automate the Conventional Commit lifecycle. ACM acts as a Last Line of Defense, monitoring local filesystem changes and utilizing RTK (Rust Token Killer) to generate surgical, incremental commit messages via SumoPod.

Core Philosophy
Update, Don't Rebuild: The agent analyzes deltas relative to existing code. It avoids summarizing file structures and focuses exclusively on the logic changed in the current 30-minute window.

Zero-Cost Observation: Uses a local Git status check to gate AI calls. If no changes are detected, no API tokens are consumed.

Token Efficiency: Leverages RTK to prune diff noise (whitespace, lockfiles, boilerplate) before sending data to the LLM.

Technical Stack
Runtime: Node.js (TypeScript via tsx)

Compression: RTK (Rust Token Killer) (on the way)

AI Gateway: SumoPod (DeepSeek-V3/R1 optimized)

Pattern: Heartbeat Observer

Installation & Setup

1. Prerequisites
   Node.js 18+

rtk binary installed and available in Windows PATH

Active SumoPod API Key

2. Configuration
   Create a .env file in the root directory:

Code snippet
SUMOPOD_API_KEY="your_key_here"
SUMOPOD_BASE_URL="https://api.sumopod.com/v1"
COMMIT_SCOPE="C:/path/to/your/project"
HEARTBEAT_INTERVAL=1800000 # 30 minutes 3. Deployment
Install dependencies and start the daemon:

Bash
npm install
npm start / npm run dev
Internal Architecture

1. The Heartbeat (lib/heartbeat.ts)
   Manages the execution loop. It performs a "Zero-Cost Scan" using rtk git status --porcelain. If the working tree is clean, the process remains dormant.

2. Domain Handlers (lib/domain-handlers.ts)
   Detects file extensions (.ts, .vue, .py) and injects specific context.

Nuxt/Vue: Prioritizes component lifecycle and styling deltas.

Logic/TS: Focuses on type definitions and interface changes.

3. AI Orchestrator (lib/ai-client.ts)
   Communicates with SumoPod. The system prompt is hard-coded to ignore unchanged code and strictly output Conventional Commit headers based on the incremental update.

List of Commands:

in your terminal
cd to where you have the package installed e.g. d:\Documents\stuff\atomic-git-commit\node_modules\.bin\atomic.cmd

atomic --start [absolute-path] Start the daemon (defaults to .env)
atomic --end Stop the daemon
atomic --rdir [absolute-path] Restart with a new working directory
atomic --status Show current state + last 3 heartbeat log lines
atomic --help Show help message

Operational Safety
Automatic Rollback: If a commit fails or the AI response is malformed, the agent executes git restore --staged to prevent workspace corruption.

Path Safety: Handles Windows-specific pathing and avoids os error 3 by validating the .claude configuration directory on startup.

Conflict Prevention: The agent will automatically skip any files containing merge conflict markers (<<<<<<<).

Maintained by Robert
