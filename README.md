<div align="center">

# CC Statistics

**Multi-CLI AI Coding Statistics Dashboard**

Track token usage, costs, and productivity across Claude Code, Codex, Gemini, Opencode, Openclaw and more.

[![Release](https://img.shields.io/github/v/release/Talljack/cc-statistics?style=flat-square&color=blue)](https://github.com/Talljack/cc-statistics/releases)
[![Downloads](https://img.shields.io/github/downloads/Talljack/cc-statistics/total?style=flat-square&color=green)](https://github.com/Talljack/cc-statistics/releases)
[![License](https://img.shields.io/github/license/Talljack/cc-statistics?style=flat-square)](LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

</div>

---

## Features

- **Multi-Source Statistics** — Aggregate data from Claude Code, Codex CLI, Gemini CLI, Opencode, Openclaw
- **Token Usage Tracking** — Input, output, cache read/write tokens with per-model breakdown
- **Cost Estimation** — Dynamic pricing from OpenRouter API (300+ models), custom pricing overrides
- **Code Changes** — Track additions, deletions, and file counts by extension
- **Provider Filtering** — Filter by model provider (Anthropic, OpenAI, Google Gemini, xAI, Z.AI, etc.)
- **Custom Time Ranges** — Built-in (Today/Week/Month/All) + custom relative & absolute ranges
- **Project Filtering** — View stats for specific projects or all projects combined
- **Session Details** — Browse individual sessions with model, tokens, cost, duration, and git branch
- **Usage Report** — Daily activity chart, project leaderboard, and overview stats
- **System Tray** — Quick glance at today's cost, sessions, and tokens
- **Auto-Update** — Built-in updater with notification
- **i18n** — English, 简体中文, 日本語
- **Privacy First** — All data processed locally, nothing uploaded

## Download

Download the latest version from [GitHub Releases](https://github.com/Talljack/cc-statistics/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `CC.Statistics_x.x.x_aarch64.dmg` |
| macOS (Intel) | `CC.Statistics_x.x.x_x64.dmg` |
| Windows | `CC.Statistics_x.x.x_x64-setup.exe` or `.msi` |
| Linux (Debian/Ubuntu) | `CC.Statistics_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `CC.Statistics-x.x.x-1.x86_64.rpm` |
| Linux (AppImage) | `CC.Statistics_x.x.x_amd64.AppImage` |

## Supported CLI Tools

| CLI Tool | Data Location | Format | Status |
|----------|--------------|--------|--------|
| [Claude Code](https://claude.ai/claude-code) | `~/.claude/projects/` | JSONL | ✅ Full support |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/` | JSONL + SQLite | ✅ Full support |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `~/.gemini/` | JSON | ✅ Basic support |
| [Opencode](https://github.com/opencode-ai/opencode) | `~/.local/share/opencode/` | SQLite | ✅ Full support |
| [Openclaw](https://github.com/openclaw/openclaw) | `~/.openclaw/` | JSONL | ✅ Full support |

## Usage

1. **Install** — Download and install for your platform
2. **Open** — Launch CC Statistics, it automatically scans for CLI data
3. **Browse** — Use the dashboard to view aggregated statistics
4. **Filter** — Select project, provider, or time range from the header
5. **Customize** — Open Settings to toggle data sources, set custom pricing, or change language

### Custom Pricing

Settings > Advanced > Custom Pricing Override:

1. Enable custom pricing
2. Add a model name (e.g., `claude-opus-4-6`)
3. Price auto-fills from OpenRouter API — modify as needed
4. Your custom price takes priority over dynamic pricing

Preset models are stored in `~/.claude/cc-statistics-models.json` — edit this file to update the default model list without rebuilding.

### Custom Providers

Settings > Advanced > Custom Providers:

Add custom model-to-provider mappings. For example, add keyword `fireworks` to group all Fireworks AI models under a custom provider name.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri 2 |
| Frontend | React 19 + TypeScript |
| Backend | Rust |
| Styling | Tailwind CSS 4 |
| State | Zustand |
| Data Fetching | TanStack Query |
| Database | rusqlite (read-only) |

## Development

```bash
# Install dependencies
pnpm install

# Run in development
pnpm tauri dev

# Build for production
pnpm tauri build
```

## License

[MIT](LICENSE)
