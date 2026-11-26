import { useState } from 'react';
import { ExternalLink, Globe, Send } from 'lucide-react';
import type { AdvisorMessage, AirQualityData, HouseholdProfile } from '../types/air';

interface SmogAdvisorChatProps {
  airData: AirQualityData | null;
  profile: HouseholdProfile;
}

export function SmogAdvisorChat({ airData, profile }: SmogAdvisorChatProps) {
  const [messages, setMessages] = useState<AdvisorMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Ask me about outdoor safety timing for kids, DIY MERV-13 filter sizing, gas stove NO2 mitigation, or local winter burn bans and transit advisories.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);

  const cityLabel = airData?.location.name || 'your city';

  const suggestedPrompts = [
    `Is it safe for kids' outdoor sports in ${cityLabel} today, and when is the lowest-smog window?`,
    `How do I build and size a quiet DIY Corsi-Rosenthal box for our living room?`,
    `What local winter wood-burning advisories or transit incentives apply in ${cityLabel}?`,
  ];

  const sendMessage = async (textToSend: string, isRetry = false) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    const nextHistory = isRetry
      ? messages
      : [
          ...messages,
          {
            id: `user-${Date.now()}`,
            role: 'user' as const,
            content: trimmed,
            timestamp: new Date().toISOString(),
          },
        ];

    if (!isRetry) {
      setMessages(nextHistory);
      setInput('');
    }
    setIsSending(true);
    setError(null);
    setLastFailedText(null);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: nextHistory.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
          airData,
          profile,
          useSearchGrounding,
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        sources?: Array<{ title: string; uri: string }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Advisor request failed.');
      }

      const assistantMsg: AdvisorMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply || '',
        timestamp: new Date().toISOString(),
        sources: data.sources || [],
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach advisor.');
      setLastFailedText(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section id="advisor" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Family & Community Smog Advisor</h2>
          <p className="text-xs text-slate-500">
            Grounded in live {cityLabel} telemetry and your household setup
          </p>
        </div>

        <button
          type="button"
          onClick={() => setUseSearchGrounding((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            useSearchGrounding
              ? 'border-teal-700 bg-teal-50 text-teal-800'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{useSearchGrounding ? 'Live Web Grounding On' : 'Live Web Grounding Off'}</span>
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/60 px-6 py-3">
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={isSending}
            onClick={() => sendMessage(prompt)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-teal-700 hover:text-teal-900 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Message Thread */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 px-6 py-2">
        {messages.map((msg) => (
          <div key={msg.id} className="py-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`font-semibold ${msg.role === 'user' ? 'text-slate-900' : 'text-teal-800'}`}>
                {msg.role === 'user' ? 'Your Household' : 'ClearAir Advisor'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 max-w-4xl">
              {msg.content}
            </div>

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Sources:</span>
                {msg.sources.slice(0, 4).map((src, idx) => (
                  <a
                    key={`${src.uri}-${idx}`}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-teal-800 hover:underline"
                  >
                    <span className="max-w-[220px] truncate">{src.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="py-4 text-xs text-slate-500">Analyzing local air quality and household impact...</div>
        )}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rose-200 bg-rose-50 px-6 py-3 text-xs text-rose-800">
          <span>{error}</span>
          {lastFailedText && (
            <button
              type="button"
              onClick={() => sendMessage(lastFailedText, true)}
              disabled={isSending}
              className="rounded-md bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Retry Question
            </button>
          )}
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex items-center gap-3 border-t border-slate-200 px-6 py-4"
      >
        <label htmlFor="advisor-input" className="sr-only">
          Ask the air quality advisor
        </label>
        <input
          id="advisor-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${cityLabel} smog, indoor air hacks, or low-emission swaps...`}
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ask Advisor</span>
        </button>
      </form>
    </section>
  );
}
