# CC Statistics

A cross-platform desktop application for tracking and visualizing Claude Code usage statistics.

## Features

- **Tokens Statistics**: Track input_tokens, output_tokens, cache_read, and cache_creation
- **Sessions Count**: Count total sessions
- **Instructions Count**: Track user messages (type=user)
- **Duration Tracking**: Monitor turn_duration timing
- **Code Changes**: Track code additions/deletions by file extension
- **Project Filtering**: Select specific projects or view all
- **Time Filtering**: Filter by Today, Week, Month, or All time

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Tauri 2.10.x |
| Frontend | React 19 + TypeScript |
| Build Tool | Vite |
| Package Manager | pnpm |
| UI | Tailwind CSS v4 |
| Charts | Recharts |
| State | Zustand |
| Data Fetching | TanStack Query |

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Build Output

After running `pnpm tauri build`, the following artifacts are generated:

- macOS App: `src-tauri/target/release/bundle/macos/CC Statistics.app`
- DMG Installer: `src-tauri/target/release/bundle/dmg/CC Statistics_0.1.0_aarch64.dmg`

## Data Source

The app reads from Claude Code's data directory:
- `~/.claude/projects/<project-hash>/*.jsonl`

## License

MIT
