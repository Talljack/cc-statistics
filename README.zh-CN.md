<div align="center">

# CC Statistics

**多 CLI AI 编程统计仪表盘**

统一追踪 Claude Code、Codex、Gemini、Opencode、Openclaw 等工具的 Token 用量、费用和生产力数据。

[![Release](https://img.shields.io/github/v/release/Talljack/cc-statistics?style=flat-square&color=blue)](https://github.com/Talljack/cc-statistics/releases)
[![Downloads](https://img.shields.io/github/downloads/Talljack/cc-statistics/total?style=flat-square&color=green)](https://github.com/Talljack/cc-statistics/releases)
[![License](https://img.shields.io/github/license/Talljack/cc-statistics?style=flat-square)](LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

</div>

---

## 功能特色

- **多数据源统计** — 聚合 Claude Code、Codex CLI、Gemini CLI、Opencode、Openclaw 的使用数据
- **Token 用量追踪** — 输入、输出、缓存读取/写入 Token 数，按模型分类统计
- **费用估算** — OpenRouter API 动态定价（300+ 模型），支持自定义定价覆盖
- **代码变更** — 按文件扩展名统计新增、删除行数和文件数
- **供应商筛选** — 按模型供应商过滤（Anthropic、OpenAI、Google Gemini、xAI、Z.AI 等）
- **自定义时间范围** — 内置（今天/本周/本月/全部）+ 自定义相对和绝对范围
- **项目筛选** — 查看指定项目或全部项目的聚合统计
- **会话详情** — 浏览每个会话的模型、Token、费用、时长、Git 分支
- **使用报告** — 每日活动图表、项目排行榜、概览统计
- **系统托盘** — 快速查看今日费用、会话数、Token 数
- **自动更新** — 内置更新器，有新版本时自动通知
- **多语言** — 中文、English、日本語
- **隐私优先** — 所有数据在本地处理，不上传任何服务器

## 下载

从 [GitHub Releases](https://github.com/Talljack/cc-statistics/releases) 下载最新版本：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `CC.Statistics_x.x.x_aarch64.dmg` |
| macOS (Intel) | `CC.Statistics_x.x.x_x64.dmg` |
| Windows | `CC.Statistics_x.x.x_x64-setup.exe` 或 `.msi` |
| Linux (Debian/Ubuntu) | `CC.Statistics_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `CC.Statistics-x.x.x-1.x86_64.rpm` |
| Linux (AppImage) | `CC.Statistics_x.x.x_amd64.AppImage` |

## 支持的 CLI 工具

| CLI 工具 | 数据目录 | 格式 | 状态 |
|---------|---------|------|------|
| [Claude Code](https://claude.ai/claude-code) | `~/.claude/projects/` | JSONL | ✅ 完整支持 |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/` | JSONL + SQLite | ✅ 完整支持 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `~/.gemini/` | JSON | ✅ 基础支持 |
| [Opencode](https://github.com/opencode-ai/opencode) | `~/.local/share/opencode/` | SQLite | ✅ 完整支持 |
| [Openclaw](https://github.com/openclaw/openclaw) | `~/.openclaw/` | JSONL | ✅ 完整支持 |

## 使用方法

1. **安装** — 下载并安装对应平台的版本
2. **打开** — 启动 CC Statistics，自动扫描 CLI 数据
3. **浏览** — 在仪表盘查看聚合统计数据
4. **筛选** — 在顶栏选择项目、供应商或时间范围
5. **自定义** — 打开设置，切换数据源、设置自定义定价、更改语言

### 自定义定价

设置 > 高级 > 自定义定价覆盖：

1. 启用自定义定价
2. 添加模型名（如 `claude-opus-4-6`）
3. 价格自动从 OpenRouter API 填充 — 可按需修改
4. 自定义价格优先于动态定价

预设模型列表存储在 `~/.claude/cc-statistics-models.json`，直接编辑此文件即可更新默认模型列表，无需重新编译。

### 自定义供应商

设置 > 高级 > 自定义模型供应商：

添加自定义的模型名到供应商映射。例如，添加关键词 `fireworks` 将所有 Fireworks AI 模型归类到自定义供应商名下。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript |
| 后端 | Rust |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand |
| 数据获取 | TanStack Query |
| 数据库 | rusqlite（只读） |

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```

## 许可证

[MIT](LICENSE)
