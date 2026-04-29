import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { MessageBubble } from '../components/session/MessageBubble';
import { useSessionMessages } from '../hooks/useStatistics';
import { useTranslation } from '../lib/i18n';

export function SessionDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const source = searchParams.get('source') || 'claude_code';
  const instanceId = searchParams.get('instanceId') || '';
  const instanceRootPath = searchParams.get('instanceRootPath') || '';
  const project = searchParams.get('project') || '';
  const model = searchParams.get('model') || '';

  const { data: messages, isLoading, error } = useSessionMessages(
    id || null,
    source,
    instanceId || null,
    instanceRootPath || null,
  );

  const unsupportedSource = !['claude_code', 'openclaw', 'gemini', 'opencode', 'hermes'].includes(source);
  const noConversation = !isLoading && !error && !unsupportedSource && (!messages || messages.length === 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/sessions')}
              className="p-2 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--color-text-secondary)]" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[var(--color-accent-blue)]" />
                <h2 className="text-xl font-semibold">{t('sessionDetail.title')}</h2>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {project && <span>{project}</span>}
                {model && <span className="ml-2">· {model}</span>}
                {source && <span className="ml-2">· {source}</span>}
                {instanceId && <span className="ml-2">· {instanceId}</span>}
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-12 text-[var(--color-text-secondary)]">{t('sessionDetail.loading')}</div>
          )}

          {error && (
            <div className="bg-[var(--color-bg-surface)] rounded-xl p-6 border text-center" style={{ borderColor: 'color-mix(in srgb, var(--color-accent-red) 30%, transparent)' }}>
              <p className="text-[var(--color-accent-red)] text-sm">{String(error)}</p>
            </div>
          )}

          {!isLoading && unsupportedSource && (
            <div className="bg-[var(--color-bg-surface)] rounded-xl p-8 border border-[var(--color-border-base)] text-center">
              <MessageSquare className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)] mb-1">{t('sessionDetail.unsupported')}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{t('sessionDetail.unsupportedDesc')}</p>
            </div>
          )}

          {noConversation && (
            <div className="bg-[var(--color-bg-surface)] rounded-xl p-8 border border-[var(--color-border-base)] text-center">
              <MessageSquare className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
              <p className="text-[var(--color-text-secondary)]">{t('sessionDetail.noData')}</p>
            </div>
          )}

          {messages && messages.length > 0 && (
            <div className="space-y-4">
              {messages.map((msg, index) => (
                <MessageBubble key={`${msg.timestamp}-${index}`} message={msg} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
