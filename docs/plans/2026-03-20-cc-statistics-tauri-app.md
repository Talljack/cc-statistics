# CC Statistics Tauri Desktop App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Mac-first, cross-platform Tauri desktop app that discovers local AI tool configs and logs, recognizes Anthropic-compatible usage routed through `ANTHROPIC_BASE_URL`, and provides project-scoped day/week/month statistics for tokens, sessions, instructions, duration, and code changes.

**Architecture:** Use a Tauri 2 desktop shell with a React 19 + Vite 7 frontend and a Rust backend. The Rust side is responsible for source discovery, file watching, parsing local logs/JSON/SQLite/export files into a normalized event model, persisting them into local SQLite, and serving aggregated queries to the UI. The frontend renders a dense dashboard inspired by the reference image, plus a source management screen similar to CC Switch, with Mac as the P0 packaging and QA target.

**Tech Stack:** `pnpm`, Tauri 2, Rust stable, React 19, TypeScript 5.x, Vite 7, Tailwind CSS 4, TanStack Router, TanStack Query, Zustand, Zod, Vitest, Playwright, SQLite via `rusqlite`, `serde`, `chrono`, `notify`, `walkdir`.

---

## 1. Product Summary

这是一个本地优先的 AI 使用统计桌面应用，不依赖云端账号聚合，也不要求每个提供商开放统一 API。它的工作方式是读取本机已经存在的配置与日志，包括：

- AI 工具本身的日志、JSON、SQLite、导出文件
- 项目目录中的 `.env*` 配置
- 像 CC Switch 这类配置切换工具保存的 Provider Profile
- 未来可扩展的 OpenAI、Gemini、OpenClaw 等来源适配器

用户最关心的结果不是原始日志，而是聚合后的运营视图：

- 今天、本周、本月的 token 总量
- session 数量
- instruction 数量
- AI 与用户耗时
- 每个项目的使用占比
- code changes 的新增、删除和语言分布
- 每个模型、每个 base URL、每个 provider profile 的使用情况

最终产品形态参考用户提供的第二张图：高密度、深色、紧凑、信息优先。配置页参考第一张图，强调多来源 profile 管理与选择。

## 2. Scope

### 2.1 V1 范围

V1 必须完成以下能力：

- Tauri 桌面 App，支持 macOS、Linux、Windows 打包
- macOS 作为 P0 进行完整开发、调试、打包和验收
- 自动发现常见日志目录、配置目录、项目 `.env*` 文件
- 识别 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`
- 解析 Anthropic 兼容调用相关日志和导出数据
- 通过 base URL + 凭据指纹 + 项目路径三元组聚合 usage
- 支持按天、周、月聚合
- 支持按项目、模型、来源、profile 过滤
- 支持 code changes 统计
- 支持手动添加自定义日志目录和导入导出文件
- 适配 CC Switch 类工具的 profile 源，至少支持读取其本地配置并映射 profile name -> base URL

### 2.2 V1 非目标

以下内容不进入 V1：

- 登录远程 OpenAI / Anthropic 官方控制台拉取账单
- 云端账号同步
- 多设备实时同步
- token 估算作为默认行为
- 深度编辑器插件集成
- 服务端部署

### 2.3 V1.1 / V2 扩展位

- OpenAI 专用日志解析器
- Gemini 专用日志解析器
- OpenClaw / OpenCode / Codex 专用解析器
- token 估算器插件
- 会话回放
- 通知与超额预警
- 数据导出为 CSV / JSON / Markdown 报告

## 3. Primary User Scenarios

### 3.1 日常查看

用户打开桌面 App，默认看到 Today 视图，查看当天总 token、session、instruction、duration，以及项目维度和语言维度的 code changes。

### 3.2 切换时间范围

用户在 Today / Week / Month 之间切换，App 重新从本地 SQLite 聚合结果中查询，而不是重新全量解析日志。

### 3.3 切换项目

用户从 All Projects 下拉框切到某个项目，只看该项目在多个 base URL 或 profile 下的使用总量。

### 3.4 识别代理服务

用户本机通过 `ANTHROPIC_BASE_URL=https://api.xxx.com/anthropic` 转发请求，App 需要把这类兼容接口识别为 Anthropic-compatible source，并展示对应 profile 名称、base URL、模型分布。

### 3.5 多来源配置

用户同时使用 CC Switch、项目 `.env.local`、本地日志目录。App 应将这些来源统一收敛为同一个 source registry，支持启用、禁用、重扫和自定义目录补充。

## 4. Technical Direction

### 4.1 为什么选 Tauri

- 原生桌面分发能力，适合 macOS 优先验证
- Rust 后端适合做本地文件系统扫描、监听、SQLite 写入
- 前端仍然可用 React 快速构建高密度仪表盘
- 安装包小，跨端成本低于 Electron

### 4.2 前端栈

- React 19: 当前稳定主线，适合现代并发特性与长期维护
- Vite 7: 当前稳定主线，开发体验和构建性能适合桌面应用
- Tailwind CSS 4: 用于快速构建高密度深色仪表盘，同时保留 CSS 变量设计系统
- TanStack Router: 类型安全路由，适合 Dashboard / Sources / Settings 页面拆分
- TanStack Query: 管理 Tauri command query 状态、缓存与刷新
- Zustand: 存储 UI 过滤器、面板状态、当前选中项目与时间粒度
- Zod: 统一 Rust <-> TS contract 校验

### 4.3 后端栈

- Rust stable
- `rusqlite`: 本地 SQLite 持久化与聚合查询
- `serde` / `serde_json`: 解析 JSON 和命令序列化
- `chrono`: 时间、时区、周/月边界处理
- `notify`: 监听日志目录变化
- `walkdir`: 首次全量扫描
- `blake3`: 文件指纹和来源去重

### 4.4 技术选择说明

这里不建议一开始上多包 monorepo。当前仓库几乎为空，YAGNI 原则下保持单仓库根目录 + `src` + `src-tauri` 更稳，后续若解析器明显膨胀，再抽离 `packages/contracts` 或 `crates/parser-core`。

## 5. Information Architecture

### 5.1 页面结构

- `/` Dashboard
- `/sources` 来源管理页
- `/settings` 设置页
- `/sessions` 后续预留的明细页

### 5.2 Dashboard 结构

参考用户第二张图，但做桌面优先布局：

- 顶部栏
- 左侧为项目过滤器、来源过滤器、模型过滤器
- 中上为统计卡片：Sessions / Instructions / Duration / Tokens
- 中部左侧为 AI Ratio 或 Dev Time 圆环
- 中部右侧为 AI / User / Total duration 对比
- 下部左侧为 Code Changes 列表与语言分布
- 下部右侧为 Token Usage By Model 水平条形图
- 底部为最近刷新时间、重新扫描按钮、来源状态

### 5.3 Sources 页结构

参考用户第一张图，提供：

- 顶部 provider tab: Claude / Codex / Gemini / OpenCode / OpenClaw
- profile 列表卡片
- 每个 profile 展示名称、base URL、状态、最近同步时间
- 操作按钮：启用、编辑、复制、手动扫描、查看日志路径、删除
- 支持新增自定义 source path

## 6. Source Discovery Strategy

### 6.1 Source 类型

定义统一来源注册模型：

- `ProfileSource`: 来自 CC Switch 或其他配置工具的 profile
- `EnvSource`: 来自项目 `.env*` 文件的环境变量
- `LogSource`: 来自日志目录、JSON 文件、文本日志
- `SqliteSource`: 来自本地 SQLite
- `ImportSource`: 用户手动导入的导出文件

### 6.2 默认扫描策略

应用首次启动时：

1. 扫描用户 Home 目录下常见配置目录
2. 扫描用户最近使用项目目录中的 `.env`, `.env.local`, `.env.development`, `.env.production`
3. 扫描常见日志目录
4. 扫描常见应用配置目录中与 Claude/Anthropic/OpenAI/Gemini/OpenClaw/CC Switch 相关的文件
5. 建立 source registry 并缓存扫描结果

### 6.3 平台路径优先级

macOS:

- `~/Library/Application Support/...`
- `~/Library/Logs/...`
- `~/.config/...`
- `~/.local/share/...`
- 项目目录 `.env*`

Linux:

- `~/.config/...`
- `~/.local/share/...`
- `~/.cache/...`
- 项目目录 `.env*`

Windows:

- `%APPDATA%\\...`
- `%LOCALAPPDATA%\\...`
- `%USERPROFILE%\\.config\\...`
- 项目目录 `.env*`

### 6.4 CC Switch 兼容策略

CC Switch 是明确需求来源，因此要单独建一个 config adapter：

- 优先读取其本地 profile 存储
- 若本地存储格式不稳定，则支持导入它导出的 JSON
- 将 profile 的 `name`, `baseUrl`, `provider`, `enabled` 统一映射到 `SourceProfile`
- Dashboard 中按 profile 聚合 usage

### 6.5 环境变量识别范围

默认识别：

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`

二级扩展识别：

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

注意：

- 不默认扫描用户 shell 启动脚本，如 `.zshrc`、`.bashrc`
- 避免越权读取与 AI 无关的敏感配置
- 如果用户需要扫描 shell 配置，放到设置页做显式开关

## 7. Normalized Domain Model

所有原始数据最终归一到统一事件模型。

### 7.1 Core Entities

```rust
pub struct SourceProfile {
    pub id: String,
    pub provider_kind: ProviderKind,
    pub display_name: String,
    pub base_url: Option<String>,
    pub auth_fingerprint: Option<String>,
    pub origin_kind: OriginKind,
    pub origin_path: String,
    pub enabled: bool,
}

pub struct ProjectRef {
    pub id: String,
    pub display_name: String,
    pub root_path: String,
}

pub struct UsageEvent {
    pub id: String,
    pub timestamp: DateTime<FixedOffset>,
    pub project_id: Option<String>,
    pub source_profile_id: Option<String>,
    pub session_key: String,
    pub model: Option<String>,
    pub event_kind: UsageEventKind,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cache_creation_tokens: Option<i64>,
    pub cache_read_tokens: Option<i64>,
    pub instruction_count: Option<i64>,
    pub duration_ms: Option<i64>,
    pub file_path: Option<String>,
    pub language: Option<String>,
    pub lines_added: Option<i64>,
    pub lines_deleted: Option<i64>,
    pub raw_ref: String,
}
```

### 7.2 Provider 分类

```rust
pub enum ProviderKind {
    AnthropicCompatible,
    OpenAICompatible,
    Gemini,
    OpenClaw,
    Unknown,
}
```

### 7.3 事件类型

```rust
pub enum UsageEventKind {
    RequestCompleted,
    SessionStarted,
    SessionEnded,
    InstructionCaptured,
    FilePatched,
    FileWritten,
    DiffSnapshot,
}
```

## 8. Metric Definitions

必须先定义口径，否则同一日志会被不同 parser 算出不同结果。

### 8.1 Tokens

- `tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens`
- UI 主数字显示总 token
- 明细中同时保留 input / output / cache 细分
- 如果原始日志缺 token 字段，则默认记为 `null`，不自动估算
- 后续可在 V2 增加可选估算器

### 8.2 Sessions

session 口径按优先级：

1. 原始日志显式 `session_id`
2. 同一 `project + source_profile + model` 且 30 分钟内连续事件视为同一 session
3. 导入文件如果自带会话边界，则使用导入值

### 8.3 Instructions

- 统计用户发起的 prompt / command / instruction 数量
- 一个明确的用户输入事件计为 1
- 工具自动重试不增加 instruction 数
- 如果日志只有 message 数组，则仅统计 `role=user` 或同义字段

### 8.4 Duration

- 优先使用原始日志提供的 request duration
- session duration = 会话内请求 duration 求和
- active duration 超过 15 分钟间隔则断开，避免把全天挂起算成有效时长
- Dashboard 同时展示 `Total / AI / User`

### 8.5 Code Changes

V1 口径：

- 优先解析日志中的 patch/write/diff 事件
- 若有文件路径与行级 diff，则统计 `lines_added`, `lines_deleted`
- 使用文件扩展名映射语言
- 按语言聚合展示新增/删除

V1 fallback：

- 如果某来源只有文件写入事件没有 diff 内容，则只累计 `files_touched`
- 该类来源在 UI 上显示为低可信度

## 9. Aggregation Rules

### 9.1 时间维度

- Day: 本地时区自然日
- Week: ISO week，周一为一周起点
- Month: 本地时区自然月

### 9.2 聚合主键

核心聚合维度：

- time_bucket
- project_id
- source_profile_id
- provider_kind
- model

### 9.3 预计算表

SQLite 中维护三张聚合表：

- `usage_daily`
- `usage_weekly`
- `usage_monthly`

每次增量解析后只重算受影响 bucket，不做全表重建。

### 9.4 刷新策略

- App 启动做一次全量扫描
- 文件监听到变更后做增量更新
- 用户手动点击 Refresh 时触发重扫
- Dashboard 查询只读聚合表

## 10. Storage Design

### 10.1 SQLite 表

```sql
CREATE TABLE source_profiles (
  id TEXT PRIMARY KEY,
  provider_kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  base_url TEXT,
  auth_fingerprint TEXT,
  origin_kind TEXT NOT NULL,
  origin_path TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE
);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  project_id TEXT,
  source_profile_id TEXT,
  session_key TEXT NOT NULL,
  model TEXT,
  event_kind TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_creation_tokens INTEGER,
  cache_read_tokens INTEGER,
  instruction_count INTEGER,
  duration_ms INTEGER,
  file_path TEXT,
  language TEXT,
  lines_added INTEGER,
  lines_deleted INTEGER,
  raw_ref TEXT NOT NULL
);
```

### 10.2 文件指纹表

需要一个 ingestion state 表避免重复解析：

```sql
CREATE TABLE ingested_files (
  path TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  last_modified_ms INTEGER NOT NULL,
  parser_kind TEXT NOT NULL,
  last_ingested_at TEXT NOT NULL
);
```

## 11. Parser Plugin Architecture

后端用 trait 形式实现来源适配器，保证后续扩展 OpenAI / Gemini / OpenClaw 时只新增模块，不重写聚合逻辑。

```rust
pub trait SourceAdapter {
    fn key(&self) -> &'static str;
    fn discover(&self, ctx: &DiscoveryContext) -> anyhow::Result<Vec<DiscoveredSource>>;
    fn parse(&self, input: ParseInput) -> anyhow::Result<Vec<UsageEvent>>;
}
```

V1 适配器清单：

- `cc_switch_adapter`
- `env_file_adapter`
- `anthropic_json_adapter`
- `anthropic_log_adapter`
- `sqlite_usage_adapter`
- `manual_import_adapter`

V1.1 适配器预留：

- `openai_adapter`
- `gemini_adapter`
- `openclaw_adapter`

## 12. Security And Privacy

- 所有数据仅保存在本地 SQLite
- API key 不入库明文，只存 hash/fingerprint
- `ANTHROPIC_AUTH_TOKEN` 只用于身份识别，不在 UI 展示原值
- 扫描目录必须可配置、可禁用
- 导出和日志查看功能默认脱敏
- 设置页展示 "本应用不会上传你的日志内容"

## 13. UI Design Direction

### 13.1 视觉方向

- 深色主题，但避免纯黑
- 主色偏蓝青，强调数据密度和可读性
- 卡片圆角中等，阴影轻，边框可见
- 字体风格要偏 dashboard，而不是 marketing page
- 桌面端优先，移动端只做基础兼容，不做一开始的主场景

### 13.2 Dashboard 交互

- 时间切换使用 segmented control: Today / Week / Month / All
- 项目选择在左上方
- 右下角保留 `Refresh` 按钮与状态提示
- 每个卡片支持 hover 展示次级指标
- Code Changes 支持语言分布 + 新增/删除双色数值

### 13.3 Sources 交互

- 类似 CC Switch 的 profile 卡片列表
- 一键启用/禁用某个 profile 的统计
- 显示 base URL、provider、最近读取状态
- 可复制 profile 配置摘要
- 可打开其配置路径

## 14. Proposed Repository Layout

```text
.
├── README.md
├── docs/
│   └── plans/
│       └── 2026-03-20-cc-statistics-tauri-app.md
├── package.json
├── pnpm-lock.yaml
├── index.html
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── AppShell.tsx
│   │   ├── router.tsx
│   │   └── providers.tsx
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   ├── sources.tsx
│   │   └── settings.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   ├── sources/
│   │   ├── charts/
│   │   └── shared/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── contracts.ts
│   │   ├── format.ts
│   │   ├── project.ts
│   │   └── time.ts
│   ├── store/
│   │   └── filters.ts
│   └── styles/
│       └── app.css
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── app_state.rs
│       ├── commands/
│       ├── discovery/
│       ├── parsers/
│       ├── aggregation/
│       ├── storage/
│       └── domain/
├── tests/
│   ├── ui/
│   └── fixtures/
└── src-tauri/tests/
```

## 15. Test Strategy

### 15.1 测试层级

- Rust 单元测试: parser、聚合、路径识别、时间 bucket
- Rust 集成测试: 从 fixture 目录导入一组日志，验证 SQLite 聚合结果
- 前端组件测试: Dashboard 卡片、过滤器、Sources 列表
- 前端集成测试: mock Tauri commands，验证 Today / Week / Month 切换
- macOS 手工烟测: 真机打包 app 后验证路径权限、重扫、性能

### 15.2 macOS 重点验收

P0 必测：

- 首次启动权限与目录读取流程
- `~/Library/Application Support` 和 `~/Library/Logs` 扫描
- 选择项目过滤是否正确
- Today / Week / Month 聚合结果切换正确
- Refresh 后增量数据是否更新
- 打包后的 `.app` 与 `.dmg` 可正常启动

### 15.3 Fixture 设计

测试夹具至少覆盖：

- 含 `ANTHROPIC_BASE_URL` 的 `.env.local`
- 含多个 profile 的 CC Switch 导出 JSON
- 含 token 和 duration 的 Anthropic JSON usage log
- 含 patch/write 事件的日志
- 缺失 token 的不完整日志
- 跨天、跨周、跨月边界数据

## 16. Risks And Mitigations

### 16.1 风险：不同工具日志格式差异极大

缓解：

- 统一 adapter trait
- fixture 驱动开发
- 对每个来源单独标记 `parser_version`

### 16.2 风险：本地日志不包含 tokens

缓解：

- V1 明确以真实 usage 字段为准
- 缺失时展示 `N/A`
- 后续做可选估算器

### 16.3 风险：code changes 口径不一致

缓解：

- V1 优先使用 patch/diff 事件
- UI 中区分 high confidence 和 fallback

### 16.4 风险：扫描目录过大导致卡顿

缓解：

- 首次扫描限于白名单路径
- 后台线程解析
- 文件指纹防止重复导入

## 17. Detailed Task Plan

### Task 1: Bootstrap Tauri 2 + React 19 Desktop Shell

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/providers.tsx`
- Create: `src/app/router.tsx`
- Create: `src/routes/__root.tsx`
- Create: `src/routes/index.tsx`
- Create: `src/routes/sources.tsx`
- Create: `src/routes/settings.tsx`
- Create: `src/styles/app.css`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Test: `tests/ui/app-shell.test.tsx`

**Step 1: Write the failing UI shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/app/AppShell";

it("renders dashboard navigation", () => {
  render(<AppShell />);
  expect(screen.getByText("Dashboard")).toBeInTheDocument();
  expect(screen.getByText("Sources")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/ui/app-shell.test.tsx`
Expected: FAIL with module not found for `AppShell`

**Step 3: Write minimal implementation**

```tsx
export function AppShell() {
  return (
    <div>
      <nav>
        <span>Dashboard</span>
        <span>Sources</span>
        <span>Settings</span>
      </nav>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/ui/app-shell.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html src src-tauri tests/ui/app-shell.test.tsx
git commit -m "feat: bootstrap tauri react desktop shell"
```

### Task 2: Define Contracts, Filters, And Fixture-Driven Domain Models

**Files:**
- Create: `src/lib/contracts.ts`
- Create: `src/store/filters.ts`
- Create: `tests/fixtures/usage/minimal-usage.json`
- Create: `tests/ui/contracts.test.ts`
- Create: `src-tauri/src/domain/mod.rs`
- Create: `src-tauri/src/domain/contracts.rs`
- Test: `src-tauri/tests/domain_contracts.rs`

**Step 1: Write the failing contract tests**

```ts
import { UsageSummarySchema } from "@/lib/contracts";

it("parses dashboard summary payload", () => {
  const result = UsageSummarySchema.parse({
    sessions: 21,
    instructions: 993,
    durationMs: 48360000,
    totalTokens: 129600000,
  });
  expect(result.sessions).toBe(21);
});
```

```rust
#[test]
fn serializes_usage_event() {
    let event = UsageEvent::example();
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("session_key"));
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest tests/ui/contracts.test.ts`
Expected: FAIL with missing schema

Run: `cargo test --test domain_contracts`
Expected: FAIL with unresolved domain module

**Step 3: Write minimal implementation**

```ts
export const UsageSummarySchema = z.object({
  sessions: z.number(),
  instructions: z.number(),
  durationMs: z.number(),
  totalTokens: z.number(),
});
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEvent {
    pub session_key: String,
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest tests/ui/contracts.test.ts`
Expected: PASS

Run: `cargo test --test domain_contracts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/contracts.ts src/store/filters.ts tests/fixtures src-tauri/src/domain src-tauri/tests/domain_contracts.rs tests/ui/contracts.test.ts
git commit -m "feat: define shared contracts and filters"
```

### Task 3: Implement Source Discovery With CC Switch And Env File Support

**Files:**
- Create: `src-tauri/src/discovery/mod.rs`
- Create: `src-tauri/src/discovery/path_registry.rs`
- Create: `src-tauri/src/discovery/cc_switch.rs`
- Create: `src-tauri/src/discovery/env_files.rs`
- Create: `src-tauri/src/commands/discovery.rs`
- Create: `src-tauri/tests/discovery_cc_switch.rs`
- Create: `src-tauri/tests/discovery_env_files.rs`
- Test: `tests/fixtures/discovery/cc-switch-export.json`
- Test: `tests/fixtures/discovery/project-a/.env.local`

**Step 1: Write the failing discovery tests**

```rust
#[test]
fn loads_cc_switch_profiles_from_export() {
    let profiles = load_cc_switch_profiles("tests/fixtures/discovery/cc-switch-export.json").unwrap();
    assert_eq!(profiles.len(), 2);
    assert_eq!(profiles[0].base_url.as_deref(), Some("https://api.example.com/anthropic"));
}
```

```rust
#[test]
fn detects_anthropic_env_keys_from_env_file() {
    let sources = scan_env_file("tests/fixtures/discovery/project-a/.env.local").unwrap();
    assert!(sources.iter().any(|s| s.key == "ANTHROPIC_BASE_URL"));
}
```

**Step 2: Run tests to verify they fail**

Run: `cargo test discovery_cc_switch discovery_env_files`
Expected: FAIL with missing loaders

**Step 3: Write minimal implementation**

```rust
pub fn scan_env_file(path: &str) -> anyhow::Result<Vec<DetectedEnvValue>> {
    let content = std::fs::read_to_string(path)?;
    Ok(content
        .lines()
        .filter_map(|line| line.split_once('='))
        .filter(|(key, _)| matches!(*key, "ANTHROPIC_BASE_URL" | "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN"))
        .map(|(key, value)| DetectedEnvValue::new(key, value))
        .collect())
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test discovery_cc_switch discovery_env_files`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/discovery src-tauri/src/commands/discovery.rs src-tauri/tests/discovery_cc_switch.rs src-tauri/tests/discovery_env_files.rs tests/fixtures/discovery
git commit -m "feat: add source discovery for cc switch and env files"
```

### Task 4: Parse Anthropic-Compatible Logs Into Normalized Usage Events

**Files:**
- Create: `src-tauri/src/parsers/mod.rs`
- Create: `src-tauri/src/parsers/anthropic_json.rs`
- Create: `src-tauri/src/parsers/anthropic_log.rs`
- Create: `src-tauri/src/parsers/manual_import.rs`
- Create: `src-tauri/tests/parser_anthropic_json.rs`
- Create: `src-tauri/tests/parser_anthropic_log.rs`
- Test: `tests/fixtures/parsers/anthropic-usage.json`
- Test: `tests/fixtures/parsers/anthropic-log.jsonl`

**Step 1: Write the failing parser tests**

```rust
#[test]
fn parses_usage_tokens_and_duration() {
    let events = parse_anthropic_json_file("tests/fixtures/parsers/anthropic-usage.json").unwrap();
    assert_eq!(events[0].input_tokens, Some(1200));
    assert_eq!(events[0].output_tokens, Some(800));
    assert_eq!(events[0].duration_ms, Some(4200));
}
```

```rust
#[test]
fn parses_patch_events_for_code_changes() {
    let events = parse_anthropic_log_file("tests/fixtures/parsers/anthropic-log.jsonl").unwrap();
    assert!(events.iter().any(|event| event.lines_added == Some(12)));
}
```

**Step 2: Run tests to verify they fail**

Run: `cargo test parser_anthropic_json parser_anthropic_log`
Expected: FAIL with missing parser functions

**Step 3: Write minimal implementation**

```rust
pub fn parse_anthropic_json_file(path: &str) -> anyhow::Result<Vec<UsageEvent>> {
    let content = std::fs::read_to_string(path)?;
    let payload: serde_json::Value = serde_json::from_str(&content)?;
    Ok(vec![UsageEvent::from_anthropic_payload(payload)?])
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test parser_anthropic_json parser_anthropic_log`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/parsers src-tauri/tests/parser_anthropic_json.rs src-tauri/tests/parser_anthropic_log.rs tests/fixtures/parsers
git commit -m "feat: parse anthropic compatible usage logs"
```

### Task 5: Persist Events And Build Day/Week/Month Aggregates In SQLite

**Files:**
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/schema.rs`
- Create: `src-tauri/src/storage/repository.rs`
- Create: `src-tauri/src/aggregation/mod.rs`
- Create: `src-tauri/src/aggregation/time_buckets.rs`
- Create: `src-tauri/src/aggregation/materialize.rs`
- Create: `src-tauri/tests/aggregation_usage.rs`

**Step 1: Write the failing aggregation test**

```rust
#[test]
fn materializes_daily_weekly_monthly_usage() {
    let db = TestDb::new();
    seed_usage_events(&db);
    materialize_usage(&db).unwrap();

    assert_eq!(daily_total(&db, "2026-03-20"), 129600000);
    assert_eq!(weekly_sessions(&db, "2026-W12"), 21);
    assert_eq!(monthly_instructions(&db, "2026-03"), 993);
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test aggregation_usage`
Expected: FAIL with missing schema/materializer

**Step 3: Write minimal implementation**

```rust
pub fn bucket_day(dt: DateTime<FixedOffset>) -> String {
    dt.format("%Y-%m-%d").to_string()
}

pub fn bucket_week(dt: DateTime<FixedOffset>) -> String {
    let iso = dt.iso_week();
    format!("{}-W{:02}", iso.year(), iso.week())
}

pub fn bucket_month(dt: DateTime<FixedOffset>) -> String {
    dt.format("%Y-%m").to_string()
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test aggregation_usage`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/storage src-tauri/src/aggregation src-tauri/tests/aggregation_usage.rs
git commit -m "feat: add sqlite persistence and aggregate materialization"
```

### Task 6: Expose Tauri Commands For Dashboard Queries And Source Management

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/dashboard.rs`
- Create: `src-tauri/src/commands/sources.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `tests/ui/api-hooks.test.ts`
- Create: `src/lib/api.ts`

**Step 1: Write the failing frontend API test**

```ts
import { getDashboardSummary } from "@/lib/api";

it("requests dashboard summary for a time grain", async () => {
  const data = await getDashboardSummary({ grain: "day" });
  expect(data.totalTokens).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/ui/api-hooks.test.ts`
Expected: FAIL with missing api module

**Step 3: Write minimal implementation**

```ts
import { invoke } from "@tauri-apps/api/core";

export function getDashboardSummary(input: { grain: "day" | "week" | "month" }) {
  return invoke("get_dashboard_summary", { input });
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest tests/ui/api-hooks.test.ts`
Expected: PASS with mocked invoke

Run: `cargo test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/api.ts src-tauri/src/commands src-tauri/src/lib.rs tests/ui/api-hooks.test.ts
git commit -m "feat: expose tauri commands for dashboard and sources"
```

### Task 7: Build Dashboard UI Matching The Reference Density

**Files:**
- Create: `src/app/AppShell.tsx`
- Create: `src/components/dashboard/StatsCards.tsx`
- Create: `src/components/dashboard/TimeGrainTabs.tsx`
- Create: `src/components/dashboard/ProjectFilter.tsx`
- Create: `src/components/dashboard/DevTimeCard.tsx`
- Create: `src/components/dashboard/CodeChangesCard.tsx`
- Create: `src/components/dashboard/TokenUsageCard.tsx`
- Create: `src/routes/index.tsx`
- Modify: `src/styles/app.css`
- Test: `tests/ui/dashboard-screen.test.tsx`

**Step 1: Write the failing dashboard screen test**

```tsx
it("renders time grain tabs and key statistic cards", () => {
  render(<DashboardScreen />);
  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Week")).toBeInTheDocument();
  expect(screen.getByText("Month")).toBeInTheDocument();
  expect(screen.getByText("Sessions")).toBeInTheDocument();
  expect(screen.getByText("Instructions")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/ui/dashboard-screen.test.tsx`
Expected: FAIL with missing dashboard components

**Step 3: Write minimal implementation**

```tsx
export function DashboardScreen() {
  return (
    <main>
      <TimeGrainTabs />
      <StatsCards />
      <DevTimeCard />
      <CodeChangesCard />
      <TokenUsageCard />
    </main>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/ui/dashboard-screen.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/AppShell.tsx src/components/dashboard src/routes/index.tsx src/styles/app.css tests/ui/dashboard-screen.test.tsx
git commit -m "feat: build dashboard ui"
```

### Task 8: Build Sources Page For Profile Discovery, Enablement, And Manual Paths

**Files:**
- Create: `src/components/sources/ProfileTabs.tsx`
- Create: `src/components/sources/ProfileList.tsx`
- Create: `src/components/sources/ProfileCard.tsx`
- Create: `src/components/sources/AddSourceDialog.tsx`
- Create: `src/routes/sources.tsx`
- Test: `tests/ui/sources-screen.test.tsx`

**Step 1: Write the failing sources screen test**

```tsx
it("renders provider tabs and source profile cards", () => {
  render(<SourcesScreen />);
  expect(screen.getByText("Claude")).toBeInTheDocument();
  expect(screen.getByText("Gemini")).toBeInTheDocument();
  expect(screen.getByText("OpenClaw")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest tests/ui/sources-screen.test.tsx`
Expected: FAIL with missing sources screen

**Step 3: Write minimal implementation**

```tsx
export function SourcesScreen() {
  return (
    <section>
      <ProfileTabs />
      <ProfileList />
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest tests/ui/sources-screen.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/sources src/routes/sources.tsx tests/ui/sources-screen.test.tsx
git commit -m "feat: add source management screen"
```

### Task 9: Add File Watching, Incremental Refresh, And Status Feedback

**Files:**
- Create: `src-tauri/src/discovery/watch.rs`
- Modify: `src-tauri/src/app_state.rs`
- Modify: `src-tauri/src/commands/dashboard.rs`
- Modify: `src/lib/api.ts`
- Create: `src/components/shared/RefreshButton.tsx`
- Create: `tests/ui/refresh-button.test.tsx`
- Create: `src-tauri/tests/watch_refresh.rs`

**Step 1: Write the failing refresh tests**

```tsx
it("shows refreshing state during manual rescan", async () => {
  render(<RefreshButton />);
  await user.click(screen.getByRole("button", { name: /refresh/i }));
  expect(screen.getByText("Refreshing")).toBeInTheDocument();
});
```

```rust
#[test]
fn updates_ingested_hash_after_file_change() {
    let ctx = TestWatchContext::new();
    ctx.touch("tests/fixtures/parsers/anthropic-usage.json");
    let changed = run_incremental_refresh(&ctx).unwrap();
    assert_eq!(changed.files_processed, 1);
}
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest tests/ui/refresh-button.test.tsx`
Expected: FAIL with missing button

Run: `cargo test watch_refresh`
Expected: FAIL with missing incremental refresh

**Step 3: Write minimal implementation**

```rust
pub fn run_incremental_refresh(ctx: &WatchContext) -> anyhow::Result<RefreshResult> {
    Ok(RefreshResult { files_processed: ctx.changed_files()?.len() as u64 })
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest tests/ui/refresh-button.test.tsx`
Expected: PASS

Run: `cargo test watch_refresh`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/discovery/watch.rs src-tauri/src/app_state.rs src-tauri/src/commands/dashboard.rs src/lib/api.ts src/components/shared/RefreshButton.tsx tests/ui/refresh-button.test.tsx src-tauri/tests/watch_refresh.rs
git commit -m "feat: add incremental refresh and watch support"
```

### Task 10: Mac-First Packaging, Smoke Tests, And Release Readiness

**Files:**
- Create: `tests/e2e/dashboard-smoke.spec.ts`
- Create: `docs/testing/mac-smoke-checklist.md`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`

**Step 1: Write the failing smoke test**

```ts
import { test, expect } from "@playwright/test";

test("dashboard shows primary cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Sessions")).toBeVisible();
  await expect(page.getByText("Tokens")).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm playwright test tests/e2e/dashboard-smoke.spec.ts`
Expected: FAIL until app shell and routes are wired

**Step 3: Write minimal implementation**

```json
{
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "appimage", "msi"]
  }
}
```

**Step 4: Run verification**

Run: `pnpm vitest`
Expected: PASS

Run: `cargo test`
Expected: PASS

Run: `pnpm tauri build`
Expected: macOS build succeeds and emits `.app` plus `.dmg`

**Step 5: Commit**

```bash
git add tests/e2e/dashboard-smoke.spec.ts docs/testing/mac-smoke-checklist.md src-tauri/tauri.conf.json README.md
git commit -m "chore: prepare mac-first packaging and smoke tests"
```

## 18. Execution Notes

- 开发顺序不要打乱，先把 contracts、fixtures、parser、聚合打牢，再做 UI
- 所有 parser 都先基于 fixture 做测试，不允许先写猜测实现
- Dashboard 只消费聚合查询，不直接读原始日志
- `ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 只能存指纹
- macOS 每完成 2 到 3 个任务就做一次真机 smoke test

## 19. Acceptance Criteria

满足以下条件才算 V1 可用：

- 用户安装 macOS App 后，可以自动发现至少一类本地 Anthropic-compatible source
- 能识别出 `ANTHROPIC_BASE_URL`
- 能看到按天、周、月的 token / sessions / instructions / duration
- 能按项目过滤
- 能看到 code changes 语言分布
- 能在 Sources 页面启用/禁用来源
- 手动 Refresh 后能看到增量更新
- 打包后的 macOS App 可以稳定启动和运行

## 20. Open Questions To Resolve During Implementation

- CC Switch 实际本地配置文件路径与格式
- Claude Code / 兼容客户端日志字段是否稳定包含 token 与 patch 明细
- code changes 是否需要支持 git diff fallback
- 是否需要在 V1 就加入 session 明细页
- 是否需要在设置页允许用户自定义周起始日

这些问题不阻塞写代码，但会影响 adapter 实现细节，因此要在 Task 3 和 Task 4 时尽快通过真实 fixture 收敛。
