<div align="center">

# CC Statistics

**マルチ CLI AI コーディング統計ダッシュボード**

Claude Code、Codex、Gemini、Opencode、Openclaw などのトークン使用量、コスト、生産性を一元管理。

[![Release](https://img.shields.io/github/v/release/Talljack/cc-statistics?style=flat-square&color=blue)](https://github.com/Talljack/cc-statistics/releases)
[![Downloads](https://img.shields.io/github/downloads/Talljack/cc-statistics/total?style=flat-square&color=green)](https://github.com/Talljack/cc-statistics/releases)
[![License](https://img.shields.io/github/license/Talljack/cc-statistics?style=flat-square)](LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [日本語](./README.ja.md)

</div>

---

## 機能

- **マルチソース統計** — Claude Code、Codex CLI、Gemini CLI、Opencode、Openclaw のデータを集約
- **トークン使用量追跡** — 入力・出力・キャッシュ読み取り/書き込みトークン数をモデル別に集計
- **コスト見積もり** — OpenRouter API 動的価格（300+ モデル）、カスタム価格オーバーライド対応
- **コード変更** — ファイル拡張子別の追加・削除行数とファイル数を追跡
- **プロバイダーフィルター** — モデルプロバイダー別にフィルタリング（Anthropic、OpenAI、Google Gemini、xAI、Z.AI など）
- **カスタム時間範囲** — 組み込み（今日/週/月/全期間）+ カスタム相対・絶対範囲
- **プロジェクトフィルター** — 特定プロジェクトまたは全プロジェクトの統計を表示
- **セッション詳細** — モデル、トークン、コスト、処理時間、Git ブランチごとにセッションを閲覧
- **使用レポート** — 日次アクティビティチャート、プロジェクトランキング、概要統計
- **システムトレイ** — 今日のコスト、セッション数、トークン数をクイック表示
- **自動更新** — 新バージョン通知付きの組み込みアップデーター
- **多言語対応** — English、简体中文、日本語
- **プライバシー優先** — すべてのデータはローカル処理、サーバーへのアップロードなし

## ダウンロード

[GitHub Releases](https://github.com/Talljack/cc-statistics/releases) から最新バージョンをダウンロード：

| プラットフォーム | ファイル |
|-------------|---------|
| macOS (Apple Silicon) | `CC.Statistics_x.x.x_aarch64.dmg` |
| macOS (Intel) | `CC.Statistics_x.x.x_x64.dmg` |
| Windows | `CC.Statistics_x.x.x_x64-setup.exe` または `.msi` |
| Linux (Debian/Ubuntu) | `CC.Statistics_x.x.x_amd64.deb` |
| Linux (Fedora/RHEL) | `CC.Statistics-x.x.x-1.x86_64.rpm` |
| Linux (AppImage) | `CC.Statistics_x.x.x_amd64.AppImage` |

## 対応 CLI ツール

| CLI ツール | データディレクトリ | 形式 | ステータス |
|----------|---------------|------|---------|
| [Claude Code](https://claude.ai/claude-code) | `~/.claude/projects/` | JSONL | ✅ フルサポート |
| [Codex CLI](https://github.com/openai/codex) | `~/.codex/` | JSONL + SQLite | ✅ フルサポート |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `~/.gemini/` | JSON | ✅ 基本サポート |
| [Opencode](https://github.com/opencode-ai/opencode) | `~/.local/share/opencode/` | SQLite | ✅ フルサポート |
| [Openclaw](https://github.com/openclaw/openclaw) | `~/.openclaw/` | JSONL | ✅ フルサポート |

## 使い方

1. **インストール** — プラットフォームに合ったバージョンをダウンロードしてインストール
2. **起動** — CC Statistics を起動すると、CLI データが自動的にスキャンされます
3. **閲覧** — ダッシュボードで集約された統計データを確認
4. **フィルター** — ヘッダーからプロジェクト、プロバイダー、時間範囲を選択
5. **カスタマイズ** — 設定でデータソースの切り替え、カスタム価格設定、言語変更が可能

### カスタム価格設定

設定 > 詳細 > カスタム価格オーバーライド：

1. カスタム価格を有効にする
2. モデル名を追加（例：`claude-opus-4-6`）
3. OpenRouter API から自動的に価格が入力されます — 必要に応じて変更
4. カスタム価格は動的価格より優先されます

プリセットモデルは `~/.claude/cc-statistics-models.json` に保存されます。このファイルを編集するだけでデフォルトモデルリストを更新でき、再ビルド不要です。

### カスタムプロバイダー

設定 > 詳細 > カスタムプロバイダー：

モデル名からプロバイダーへのカスタムマッピングを追加。例えば、キーワード `fireworks` を追加すると、すべての Fireworks AI モデルがカスタムプロバイダー名の下にグループ化されます。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| デスクトップフレームワーク | Tauri 2 |
| フロントエンド | React 19 + TypeScript |
| バックエンド | Rust |
| スタイリング | Tailwind CSS 4 |
| 状態管理 | Zustand |
| データフェッチ | TanStack Query |
| データベース | rusqlite（読み取り専用） |

## 開発

```bash
# 依存関係のインストール
pnpm install

# 開発モードで実行
pnpm tauri dev

# プロダクションビルド
pnpm tauri build
```

## ライセンス

[MIT](LICENSE)
