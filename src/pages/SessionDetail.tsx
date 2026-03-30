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
  const project = searchParams.get('project') || '';
  const model = searchParams.get('model') || '';

  const { data: messages, isLoading, error } = useSessionMessages(id || null, source);

  const unsupportedSource = !['claude_code', 'openclaw'].includes(source);
  const noConversation = !isLoading && !error && !unsupportedSource && (!messages || messages.length === 0);

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <Header onRefresh={() => {}} isRefreshing={false} />

      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
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

          {isLoading && (
            <div className="text-center py-12 text-[#a0a0a0]">{t('sessionDetail.loading')}</div>
          )}

          {error && (
            <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#ef4444]/30 text-center">
              <p className="text-[#ef4444] text-sm">{String(error)}</p>
            </div>
          )}

          {!isLoading && unsupportedSource && (
            <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center">
              <MessageSquare className="w-12 h-12 text-[#606060] mx-auto mb-3" />
              <p className="text-[#a0a0a0] mb-1">{t('sessionDetail.unsupported')}</p>
              <p className="text-sm text-[#606060]">{t('sessionDetail.unsupportedDesc')}</p>
            </div>
          )}

          {noConversation && (
            <div className="bg-[#1a1a1a] rounded-xl p-8 border border-[#2a2a2a] text-center">
              <MessageSquare className="w-12 h-12 text-[#606060] mx-auto mb-3" />
              <p className="text-[#a0a0a0]">{t('sessionDetail.noData')}</p>
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
