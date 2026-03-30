# Session Replay / Conversation Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to view the actual conversation content of past AI sessions in a chat-like UI, providing deeper insight into what was discussed and decided in each session.

**Architecture:** Add a Rust backend command `get_session_messages` that reads the JSONL session file for a given session ID, extracts human/assistant/tool messages, and returns them as structured data. The frontend adds a new `/session/:id` route with a chat-bubble UI. Users navigate to it by clicking a session row in the Sessions page. Only Claude Code and Openclaw sources store conversation content in JSONL; other sources show a "conversation content not available" message.

**Tech Stack:** Rust (serde_json, walkdir), React, React Router, i18n

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/src/session_reader.rs` (create) | Read JSONL files, extract conversation messages |
| `src-tauri/src/commands.rs` (modify) | Add `get_session_messages` command |
| `src-tauri/src/lib.rs` (modify) | Register new command |
| `src/types/statistics.ts` (modify) | Add `SessionMessage` type |
| `src/hooks/useStatistics.ts` (modify) | Add `useSessionMessages` hook |
| `src/pages/SessionDetail.tsx` (create) | Chat-like conversation viewer page |
| `src/components/session/MessageBubble.tsx` (create) | Individual message rendering |
| `src/App.tsx` (modify) | Add `/session/:id` route |
| `src/pages/Sessions.tsx` (modify) | Make session rows clickable |
| `src/locales/{en,zh,ja}.json` (modify) | Add session detail i18n keys |

---

### Task 1: Session Message Reader (Rust Backend)

**Files:**
- Create: `src-tauri/src/session_reader.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

```rust
// src-tauri/src/session_reader.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_messages_from_jsonl() {
        let jsonl = r#"{"type":"human","message":{"role":"user","content":"Hello"},"timestamp":"2026-03-29T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":"Hi there!"},"timestamp":"2026-03-29T10:00:05Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","input":{"path":"foo.ts"}}]},"timestamp":"2026-03-29T10:00:10Z"}"#;
        let messages = parse_session_messages(jsonl);
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Hello");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Hi there!");
        assert_eq!(messages[2].role, "assistant");
        assert!(messages[2].content.contains("Read"));
    }

    #[test]
    fn handles_empty_and_malformed_lines() {
        let jsonl = "not json\n\n{\"type\":\"human\",\"message\":{\"role\":\"user\",\"content\":\"test\"},\"timestamp\":\"2026-03-29T10:00:00Z\"}\n";
        let messages = parse_session_messages(jsonl);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "test");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test session_reader::tests`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```rust
// src-tauri/src/session_reader.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,        // "user" | "assistant" | "tool"
    pub content: String,     // text content or stringified tool call
    pub timestamp: String,
    pub tool_name: Option<String>,
}

pub fn parse_session_messages(jsonl: &str) -> Vec<SessionMessage> {
    let mut messages = Vec::new();

    for line in jsonl.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else { continue };

        let msg_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = value.get("timestamp")
            .or_else(|| value.get("createdAt"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Skip non-message entries
        if !matches!(msg_type, "human" | "assistant" | "tool_result") {
            continue;
        }

        let message = match value.get("message") {
            Some(m) => m,
            None => continue,
        };

        let role = match msg_type {
            "human" => "user".to_string(),
            "assistant" => "assistant".to_string(),
            "tool_result" => "tool".to_string(),
            _ => continue,
        };

        let (content, tool_name) = extract_content(message);

        if content.is_empty() { continue; }

        messages.push(SessionMessage {
            role,
            content,
            timestamp,
            tool_name,
        });
    }

    messages
}

fn extract_content(message: &serde_json::Value) -> (String, Option<String>) {
    let content_val = message.get("content");

    match content_val {
        Some(serde_json::Value::String(s)) => (s.clone(), None),
        Some(serde_json::Value::Array(arr)) => {
            // Content blocks — could be text or tool_use
            let mut parts = Vec::new();
            let mut tool_name = None;
            for block in arr {
                match block.get("type").and_then(|t| t.as_str()) {
                    Some("text") => {
                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                            parts.push(text.to_string());
                        }
                    }
                    Some("tool_use") => {
                        let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                        tool_name = Some(name.to_string());
                        let input = block.get("input")
                            .map(|i| serde_json::to_string_pretty(i).unwrap_or_default())
                            .unwrap_or_default();
                        parts.push(format!("[Tool: {}]\n{}", name, input));
                    }
                    Some("tool_result") => {
                        if let Some(content) = block.get("content").and_then(|c| c.as_str()) {
                            parts.push(format!("[Result]: {}", &content[..content.len().min(500)]));
                        }
                    }
                    _ => {}
                }
            }
            (parts.join("\n"), tool_name)
        }
        _ => (String::new(), None),
    }
}

/// Find and read the JSONL file for a session.
/// Claude Code sessions live in ~/.claude/projects/<project-hash>/<session-id>.jsonl
pub fn read_session_file(session_id: &str) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_dir = home.join(".claude").join("projects");

    if !claude_dir.exists() {
        return Err("Claude projects directory not found".into());
    }

    // Walk project directories looking for the session file
    for entry in walkdir::WalkDir::new(&claude_dir)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy();
            if name == format!("{}.jsonl", session_id) {
                return std::fs::read_to_string(entry.path())
                    .map_err(|e| format!("Failed to read session file: {}", e));
            }
        }
    }

    Err(format!("Session file not found for ID: {}", session_id))
}
```

Add `pub mod session_reader;` to `src-tauri/src/lib.rs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test session_reader::tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/session_reader.rs src-tauri/src/lib.rs
git commit -m "feat: add session JSONL message reader"
```

---

### Task 2: Add `get_session_messages` Tauri Command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command**

```rust
// Add to src-tauri/src/commands.rs
#[tauri::command]
pub fn get_session_messages(session_id: String, source: String) -> Result<Vec<crate::session_reader::SessionMessage>, String> {
    // Only Claude Code and Openclaw store conversation content
    if !matches!(source.as_str(), "claude_code" | "openclaw") {
        return Ok(vec![]); // No conversation data for this source
    }

    let content = crate::session_reader::read_session_file(&session_id)?;
    Ok(crate::session_reader::parse_session_messages(&content))
}
```

- [ ] **Step 2: Register in lib.rs**

Add `get_session_messages` to `generate_handler![]`.

- [ ] **Step 3: Verify build**

Run: `cd src-tauri && cargo build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add get_session_messages tauri command"
```

---

### Task 3: Add Frontend Types and Hook

**Files:**
- Modify: `src/types/statistics.ts`
- Modify: `src/hooks/useStatistics.ts`

- [ ] **Step 1: Add SessionMessage type**

```ts
// Add to src/types/statistics.ts
export interface SessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolName: string | null;
}
```

- [ ] **Step 2: Add useSessionMessages hook**

```ts
// Add to src/hooks/useStatistics.ts
export function useSessionMessages(sessionId: string | null, source: string) {
  return useQuery<SessionMessage[]>({
    queryKey: ['session-messages', sessionId, source],
    queryFn: () => invoke<SessionMessage[]>('get_session_messages', { sessionId, source }),
    enabled: !!sessionId,
    staleTime: 5 * 60 * 1000,
  });
}
```

Import `SessionMessage` from types.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/types/statistics.ts src/hooks/useStatistics.ts
git commit -m "feat: add session messages type and query hook"
```

---

### Task 4: Create MessageBubble Component

**Files:**
- Create: `src/components/session/MessageBubble.tsx`

- [ ] **Step 1: Write component**

```tsx
// src/components/session/MessageBubble.tsx
import { User, Bot, Wrench } from 'lucide-react';
import type { SessionMessage } from '../../types/statistics';

const ROLE_CONFIG = {
  user: { icon: User, color: '#3b82f6', bg: '#3b82f6', label: 'You' },
  assistant: { icon: Bot, color: '#22c55e', bg: '#1a2a1a', label: 'AI' },
  tool: { icon: Wrench, color: '#f59e0b', bg: '#1a1a10', label: 'Tool' },
} as const;

export function MessageBubble({ message }: { message: SessionMessage }) {
  const config = ROLE_CONFIG[message.role] || ROLE_CONFIG.assistant;
  const Icon = config.icon;
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
        style={{ backgroundColor: `${config.color}20`, color: config.color }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div
        className={`flex-1 max-w-[80%] rounded-xl px-4 py-3 ${isUser ? 'ml-auto' : ''}`}
        style={{ backgroundColor: isUser ? '#1a2a3a' : '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        {message.toolName && (
          <div className="text-xs text-[#f59e0b] mb-1 font-medium">{message.toolName}</div>
        )}
        <div className="text-sm whitespace-pre-wrap break-words text-[#d0d0d0]">
          {message.content}
        </div>
        {message.timestamp && (
          <div className="text-[10px] text-[#505050] mt-2">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/session/MessageBubble.tsx
git commit -m "feat: add MessageBubble component for session replay"
```

---

### Task 5: Create SessionDetail Page

**Files:**
- Create: `src/pages/SessionDetail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/pages/SessionDetail.tsx
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionMessages } from '../hooks/useStatistics';
import { Header } from '../components/layout/Header';
import { MessageBubble } from '../components/session/MessageBubble';
import { useTranslation } from '../lib/i18n';
import { ArrowLeft, MessageSquare } from 'lucide-react';

export function SessionDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source') || 'claude_code';
  const project = searchParams.get('project') || '';
  const model = searchParams.get('model') || '';
  const navigate = useNavigate();

  const { data: messages, isLoading, error } = useSessionMessages(id || null, source);

  const noConversation = !isLoading && (!messages || messages.length === 0);
  const unsupportedSource = !['claude_code', 'openclaw'].includes(source);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/sessions')}
              className="p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#a0a0a0]" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#3b82f6]" />
                <h2 className="text-xl font-semibold">{t('sessionDetail.title')}</h2>
              </div>
              <div className="text-xs text-[#606060] mt-0.5">
                {project && <span>{project}</span>}
                {model && <span className="ml-2">· {model}</span>}
                {source && <span className="ml-2">· {source}</span>}
              </div>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-12 text-[#a0a0a0]">{t('sessionDetail.loading')}</div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#ef4444]/30 text-center">
              <p className="text-[#ef4444] text-sm">{String(error)}</p>
            </div>
          )}

          {/* Unsupported source */}
          {!isLoading && unsupportedSource && (
            <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center">
              <MessageSquare className="w-12 h-12 text-[#606060] mx-auto mb-3" />
              <p className="text-[#a0a0a0] mb-1">{t('sessionDetail.unsupported')}</p>
              <p className="text-sm text-[#606060]">{t('sessionDetail.unsupportedDesc')}</p>
            </div>
          )}

          {/* No data */}
          {noConversation && !unsupportedSource && !error && (
            <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center">
              <MessageSquare className="w-12 h-12 text-[#606060] mx-auto mb-3" />
              <p className="text-[#a0a0a0]">{t('sessionDetail.noData')}</p>
            </div>
          )}

          {/* Messages */}
          {messages && messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

```tsx
import { SessionDetail } from './pages/SessionDetail';

// Add route:
<Route path="/session/:id" element={<SessionDetail />} />
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/pages/SessionDetail.tsx src/App.tsx
git commit -m "feat: add session detail page with conversation viewer"
```

---

### Task 6: Make Sessions Rows Clickable + i18n

**Files:**
- Modify: `src/pages/Sessions.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh.json`
- Modify: `src/locales/ja.json`

- [ ] **Step 1: Add i18n keys**

```json
// en
"sessionDetail.title": "Session Replay",
"sessionDetail.loading": "Loading conversation...",
"sessionDetail.noData": "No conversation content available",
"sessionDetail.unsupported": "Conversation replay not available",
"sessionDetail.unsupportedDesc": "Only Claude Code and Openclaw sessions include conversation content"
```

```json
// zh
"sessionDetail.title": "会话回放",
"sessionDetail.loading": "加载对话中...",
"sessionDetail.noData": "没有可用的对话内容",
"sessionDetail.unsupported": "会话回放不可用",
"sessionDetail.unsupportedDesc": "仅 Claude Code 和 Openclaw 会话包含对话内容"
```

```json
// ja
"sessionDetail.title": "セッションリプレイ",
"sessionDetail.loading": "会話を読み込み中...",
"sessionDetail.noData": "利用可能な会話コンテンツがありません",
"sessionDetail.unsupported": "会話リプレイは利用できません",
"sessionDetail.unsupportedDesc": "Claude Code と Openclaw のセッションのみ会話コンテンツが含まれます"
```

- [ ] **Step 2: Make session rows clickable in Sessions.tsx**

Add click handler to each session row `<tr>` that navigates to `/session/${session.session_id}?source=${session.source}&project=${session.project_name}&model=${session.model}`. Add `cursor-pointer` class to `<tr>`.

- [ ] **Step 3: Verify in dev mode**

Run: `pnpm tauri dev`
Navigate to Sessions, click a session, verify conversation viewer loads.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Sessions.tsx src/locales/en.json src/locales/zh.json src/locales/ja.json
git commit -m "feat: make sessions clickable with conversation replay"
```
