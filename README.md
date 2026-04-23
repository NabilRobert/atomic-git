# 🤖 Atomic Commit Machine — Self-Observing Git Agent

A safe, domain-aware Git agent that observes filesystem changes and produces atomic Conventional Commits.
Runs silently in the background, respecting file semantics and avoiding noisy merges.

## 🌟 Key Features

- 🎯 **Domain-Specific Context** — Specialized handlers for frontend, backend, docs, and infrastructure ensure context-aware commits
- 🧠 **RTK-Compressed Diffs** — Uses a novel Real-Time Kinetic (RTK) approach to compress diffs, preserving semantic meaning while dramatically reducing token usage
- ⚖️ **Commit Safety** — Strict bounds checking, semantic diff filtering, and automatic restoration of staged files prevent accidental commits
- 🎨 **Conventional Commits** — Enforces `<type>(<scope>): <subject>` format with optional breaking-change footer when needed
- 🔍 **Pre-Commit Validation** — Rejects diffs containing multi-line merges, WIP markers, or generic "update" statements
- 🕒 **Scheduled Heartbeat** — Runs automatically every 30 minutes with configurable interval
- 📚 **Comprehensive Logging** — Detailed session and diff logs for debugging and auditing
- ⚙️ **Environment-Aware** — Respects `SUMOPOD_MODEL` to allow easy switching between models (e.g., `gpt-4o-mini` vs `gpt-4o`)

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- A SumoPod account with API key

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd atomic-git-commit
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

4. Configure your environment in `.env`:
   ```env
   SUMOPOD_API_KEY="your-sumopod-api-key"
   SUMOPOD_BASE_URL="https://ai.sumopod.com"
   COMMIT_SCOPE="/path/to/your/repository"
   SUMOPOD_MODEL="gpt-4o-mini"  # optional, defaults to gpt-4o-mini
   ```

### Usage

Start the agent in development mode (auto-restarts on changes):

```bash
npm run dev
```

Or run in production mode:

```bash
npm start
```

### Running Manually (Ad-Hoc)

You can also run it manually for immediate execution without the timer:

```bash
tsx main.ts
```

## 🛠️ How It Works

### The Observer Pattern

1. **Watch** — Monitors the `COMMIT_SCOPE` directory for filesystem changes
2. **Scan** — Runs `git diff` to capture changes between scheduled intervals
3. **Filter** — Applies semantic checks to discard irrelevant or noisy changes:
   - Removes whitespace-only changes
   - Discards merge commits (`^Merge`) and merge conflict markers (`<<<<<<<`, `>>>>>>>`)
   - Rejects "WIP" or generic update statements
4. **Compress** — Uses RTK compression to reduce diff size while preserving meaning
5. **Understand** — Routes the diff to a domain-specific handler (frontend, backend, docs, etc.)
6. **Reason** — Passes the context-aware diff to SumoPod AI for commit message generation
7. **Commit** — Uses `rtk git add` and `rtk git commit` to create a conventional commit
8. **Restore** — Runs `rtk git restore --staged` to clean the working directory

### Domain-Aware Handlers

Each domain has a specialized handler that primes the AI with relevant context:

- **Frontend** — Focuses on components, templates, styling, and user-facing changes
- **Backend** — Prioritizes controllers, services, models, and API logic
- **Docs** — Analyzes markdown/documentation changes for clarity and accuracy
- **Infrastructure** — Handles CI/CD, Docker, and deployment configurations
- **General** — Fallback for mixed or uncategorized changes

## ⚙️ Configuration

You can tune the agent's behavior via `.env` variables:

| Variable             | Description                       | Default                  |
| -------------------- | --------------------------------- | ------------------------ |
| `SUMOPOD_API_KEY`    | Required. SumoPod API key         | -                        |
| `SUMOPOD_BASE_URL`   | Required. SumoPod endpoint        | `https://ai.sumopod.com` |
| `COMMIT_SCOPE`       | Required. Path to repo to observe | -                        |
| `SUMOPOD_MODEL`      | AI model to use                   | `gpt-4o-mini`            |
| `HEARTBEAT_INTERVAL` | Interval in milliseconds          | `1800000` (30 minutes)   |
| `MAX_LINE_LENGTH`    | Max diff line length to process   | `300`                    |
| `MAX_DIFF_CHARS`     | Max total diff size               | `12000`                  |

### Example Custom Configuration

To use GPT-4, increase the interval, and reduce the diff size limit:

```env
SUMOPOD_API_KEY="sk-your-key"
SUMOPOD_MODEL="gpt-4"
HEARTBEAT_INTERVAL="3600000"       # 1 hour
MAX_DIFF_CHARS="6000"              # reduce from 12k
```

## 🛡️ Safety Features

### Semantic Diff Filtering

The agent automatically filters out:

- Merge commits (`^Merge` in commit messages)
- Merge conflict markers (`<<<<<<<`, `>>>>>>>`, `|||||||`)
- Auto-generated timestamp lines (beginning with `@`)
- Files in `.gitignore`

### Commit Safety Checks

Before committing, the agent verifies:

1. **Scope exists** — Ensures `COMMIT_SCOPE` points to a valid directory
2. **Changes exist** — Validates that `git diff` returns meaningful content
3. **No merge conflicts** — Rejects diffs containing merge conflict markers
4. **Single-line commits** — Prevents commits with multi-line messages (except approved breaking changes)
5. **Valid types** — Ensures the AI uses one of the approved commit types

## 📚 Documentation

### Code Structure

- `lib/heartbeat.ts` — Main observer loop and scheduling
- `lib/ai-client.ts` — SumoPod AI client with OpenAI SDK
- `lib/domain-handlers.ts` — Domain-specific context handlers
- `lib/rtk.ts` — Real-Time Kinetic diff compression (experimental)
- `main.ts` — Entry point and environment setup

### License

MIT

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the branch (`git push origin feat/AmazingFeature`)
5. Open a Pull Request

## 📝 Testing

Run tests (if available) or manually verify the agent's behavior:

1. Start the agent in development mode
2. Make changes in your repository (observe `atomic-git-commit` terminal)
3. Verify it creates appropriate commits

## 🔑 Security

- Never commit your `.env` file or API keys
- Use environment variables for sensitive credentials
- Review all AI-generated commits before pushing (unless fully automated)

---

**Made with ❤️ by Robert and AI**
