import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { ExportButton } from './ExportButton';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: { language: string }) => unknown) =>
    selector({ language: 'en' }),
}));

const mockSessions = [
  {
    instance_id: 'built-in:claude_code',
    instance_label: 'Default',
    instance_root_path: '~/.claude',
    session_id: 's1',
    project_name: 'proj',
    timestamp: '2024-01-01T00:00:00Z',
    duration_ms: 1000,
    duration_formatted: '1s',
    total_tokens: 100,
    instructions: 1,
    model: 'claude-3',
    git_branch: 'main',
    cost_usd: 0.01,
    source: 'claude_code',
    input: 50,
    output: 50,
    cache_read: 0,
    cache_creation: 0,
    tokens_by_model: {},
  },
];

afterEach(() => {
  cleanup();
});

describe('ExportButton', () => {
  it('renders export button', () => {
    render(<ExportButton sessions={mockSessions} />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('shows format dropdown on click with CSV, JSON, Markdown options', () => {
    render(<ExportButton sessions={mockSessions} />);
    const btn = screen.getByRole('button', { name: /export/i });
    fireEvent.click(btn);
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
  });
});
