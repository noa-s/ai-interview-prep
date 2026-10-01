'use client';

import { useState, useEffect, useRef } from 'react';
import type { Experience } from '@cv-helper/shared-types';

interface Props {
  value: Experience[];
  onChange: (value: Experience[]) => void;
  onUsage?: (input: number, output: number, model: string) => void;
  masterPolished?: boolean;
  bulletOriginals?: Map<string, string>;
  openChatForBullet?: { jobIndex: number; bulletIndex: number; message: string } | null;
}

const EMPTY_EXP: Experience = {
  company: '',
  role: '',
  location: '',
  dates: { start: '', end: '' },
  bullets: [''],
};

interface BulletChatMessageItem {
  role: 'user' | 'ai';
  text: string;
  suggestion?: string;
}

function BulletInput({
  value,
  onBlur,
  onChange,
  onUsage,
  dataField,
  isPolishedExternally,
  originalValueExternal,
  jobTitle,
  company,
  initialChatMessage,
}: {
  value: string;
  onBlur: (v: string) => void;
  onChange: (v: string) => void;
  onUsage?: (input: number, output: number, model: string) => void;
  dataField?: string;
  isPolishedExternally?: boolean;
  originalValueExternal?: string;
  jobTitle?: string;
  company?: string;
  initialChatMessage?: string;
}) {
  const [local, setLocal] = useState(value);
  const [polishing, setPolishing] = useState(false);
  const [isPolished, setIsPolished] = useState(false);
  const [originalValue, setOriginalValue] = useState(value);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<BulletChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPolished) {
      setLocal(value);
      setOriginalValue(value);
    }
  }, [value, isPolished]);

  useEffect(() => {
    if (isPolishedExternally === false) {
      setIsPolished(false);
    }
  }, [isPolishedExternally]);

  useEffect(() => {
    if (chatOpen) chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    if (initialChatMessage) {
      setChatOpen(true);
      setChatInput(initialChatMessage);
    }
  }, [initialChatMessage]);

  async function handlePolish() {
    if (!local.trim()) return;
    const snapshot = local;
    setOriginalValue(snapshot);
    setPolishing(true);
    try {
      const res = await fetch('/api/cv/optimize-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: snapshot }),
      });
      const data = await res.json() as { optimized?: string; usage?: { promptTokens: number; completionTokens: number; modelUsed: string } };
      if (res.ok && data.optimized) {
        setLocal(data.optimized);
        onBlur(data.optimized);
        setIsPolished(true);
        if (data.usage) {
          onUsage?.(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
        }
      }
    } finally {
      setPolishing(false);
    }
  }

  function handleReset() {
    const original = (isPolishedExternally && originalValueExternal !== undefined) ? originalValueExternal : originalValue;
    setLocal(original);
    onChange(original);
    onBlur(original);
    setIsPolished(false);
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    const userMsg: BulletChatMessageItem = { role: 'user', text };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatLoading(true);
    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.role === 'ai' && m.suggestion ? m.suggestion : m.text,
      }));
      const res = await fetch('/api/cv/chat-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentBullet: local,
          messages: apiMessages,
          context: { jobTitle, company },
        }),
      });
      const data = await res.json() as {
        suggestion?: string;
        explanation?: string;
        usage?: { promptTokens: number; completionTokens: number; modelUsed: string };
      };
      if (res.ok && data.suggestion) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'ai', text: data.explanation ?? '', suggestion: data.suggestion },
        ]);
        if (data.usage) {
          onUsage?.(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
        }
      }
    } finally {
      setChatLoading(false);
    }
  }

  function handleApplySuggestion(suggestion: string) {
    setLocal(suggestion);
    onChange(suggestion);
    onBlur(suggestion);
    setIsPolished(true);
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {polishing ? (
          <div className="flex-1 h-8 bg-gray-100 rounded animate-pulse" />
        ) : (
          <input
            type="text"
            value={local}
            onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
            onBlur={() => onBlur(local)}
            placeholder="[Action Verb] + [Context] + [Result]"
            data-field={dataField}
            className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        )}
        <button
          type="button"
          onClick={() => setChatOpen((o) => !o)}
          title="Chat with AI assistant"
          className={`shrink-0 px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
            chatOpen
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-300 text-gray-500 hover:bg-gray-50'
          }`}
        >
          💬
        </button>
        {(isPolished || isPolishedExternally) ? (
          <button
            type="button"
            onClick={handleReset}
            className="shrink-0 px-2 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Reset to original"
          >
            ↩ Reset
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePolish}
            disabled={polishing}
            className="shrink-0 px-2 py-1.5 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            title="Polish with AI"
          >
            ✦ Polish
          </button>
        )}
      </div>

      {chatOpen && (
        <div className="rounded-md border border-blue-200 bg-blue-50 flex flex-col gap-0">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-blue-700">AI Writing Assistant</div>
          <div className="px-3 pb-2 flex flex-col gap-2 max-h-48 overflow-y-auto">
            {chatMessages.length === 0 && (
              <p className="text-xs text-blue-400 italic py-1">
                Ask me to strengthen the result, rephrase the action, or adjust the wording.
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-blue-200 text-gray-700'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.role === 'ai' && msg.suggestion && (
                  <div className="max-w-[90%] bg-white border border-blue-300 rounded-lg px-3 py-2 flex flex-col gap-2">
                    <p className="text-xs text-blue-600 font-medium">Suggested bullet:</p>
                    <p className="text-xs text-gray-700 leading-relaxed italic">{msg.suggestion}</p>
                    <button
                      type="button"
                      onClick={() => handleApplySuggestion(msg.suggestion!)}
                      className="self-end px-2 py-1 text-xs font-medium rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      ✓ Apply
                    </button>
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-start">
                <div className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-400 animate-pulse">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="border-t border-blue-200 px-3 py-2 flex gap-2">
            <textarea
              rows={2}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleChatSend(); }
              }}
              placeholder="e.g. make the result stronger, change the action verb…"
              disabled={chatLoading}
              className="flex-1 text-xs border border-blue-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleChatSend()}
              disabled={chatLoading || !chatInput.trim()}
              className="shrink-0 self-end px-3 py-1.5 text-xs font-medium rounded border border-blue-300 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDate(s: string | undefined | null): number {
  if (!s) return 0;
  const lower = s.toLowerCase().trim();
  if (/present|current|now/.test(lower)) return 999999;
  const yearMatch = lower.match(/\d{4}/);
  if (!yearMatch) return 0;
  const year = parseInt(yearMatch[0], 10);
  const monthKey = Object.keys(MONTH_MAP).find((m) => lower.includes(m));
  const month = monthKey ? MONTH_MAP[monthKey] : 0;
  return year * 100 + month;
}

function sortEntries(arr: Experience[]): Experience[] {
  return [...arr].sort((a, b) => {
    const endDiff = parseDate(b.dates.end) - parseDate(a.dates.end);
    if (endDiff !== 0) return endDiff;
    return parseDate(b.dates.start) - parseDate(a.dates.start);
  });
}

export default function ExperienceForm({ value, onChange, onUsage, masterPolished, bulletOriginals, openChatForBullet }: Props) {
  const [entries, setEntries] = useState<Experience[]>(sortEntries(value));
  const [removedEntry, setRemovedEntry] = useState<{ entry: Experience; index: number } | null>(null);

  useEffect(() => { setEntries(sortEntries(value)); }, [value]);

  useEffect(() => {
    if (!removedEntry) return;
    const timer = setTimeout(() => setRemovedEntry(null), 8000);
    return () => clearTimeout(timer);
  }, [removedEntry]);

  function update(index: number, patch: Partial<Experience>) {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    setEntries(next);
    onChange(next);
  }

  function updateBullet(expIndex: number, bulletIndex: number, text: string) {
    const next = entries.map((e, i) => {
      if (i !== expIndex) return e;
      const bullets = e.bullets.map((b, bi) => (bi === bulletIndex ? text : b));
      return { ...e, bullets };
    });
    setEntries(next);
    onChange(next);
  }

  function addBullet(expIndex: number) {
    update(expIndex, { bullets: [...entries[expIndex].bullets, ''] });
  }

  function removeBullet(expIndex: number, bulletIndex: number) {
    update(expIndex, { bullets: entries[expIndex].bullets.filter((_, bi) => bi !== bulletIndex) });
  }

  function addEntry() {
    const next = [...entries, { ...EMPTY_EXP, bullets: [''] }];
    setEntries(next);
    onChange(next);
  }

  function removeEntry(index: number) {
    setRemovedEntry({ entry: entries[index], index });
    const next = entries.filter((_, i) => i !== index);
    setEntries(next);
    onChange(next);
  }

  function restoreEntry() {
    if (!removedEntry) return;
    const next = [...entries];
    next.splice(removedEntry.index, 0, removedEntry.entry);
    const sorted = sortEntries(next);
    setEntries(sorted);
    onChange(sorted);
    setRemovedEntry(null);
  }

  return (
    <section className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Work Experience</h2>
        <button
          type="button"
          onClick={addEntry}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-2 py-1"
        >
          + Add
        </button>
      </div>
      {removedEntry && (
        <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-800">
          <span className="flex-1">Entry removed. <strong>{removedEntry.entry.role || removedEntry.entry.company || 'Untitled'}</strong></span>
          <button type="button" onClick={restoreEntry} className="font-semibold underline hover:text-amber-900">Restore</button>
          <button type="button" onClick={() => setRemovedEntry(null)} className="text-amber-400 hover:text-amber-700 ml-1">×</button>
        </div>
      )}
      {entries.map((exp, i) => (
        <div key={i} className="border border-gray-100 rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {([
              ['company', 'Company'],
              ['role', 'Job Title'],
              ['location', 'Location'],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  type="text"
                  value={exp[field] ?? ''}
                  onChange={(e) => update(i, { [field]: e.target.value })}
                  onBlur={() => onChange(entries)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="text"
                value={exp.dates.start}
                onChange={(e) => update(i, { dates: { ...exp.dates, start: e.target.value } })}
                onBlur={() => onChange(entries)}
                placeholder="Jan 2022"
                className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="text"
                value={exp.dates.end ?? ''}
                onChange={(e) => update(i, { dates: { ...exp.dates, end: e.target.value } })}
                onBlur={() => onChange(entries)}
                placeholder="Present"
                className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-600">Accomplishment Bullets</p>
            {exp.bullets.map((bullet, bi) => (
              <div key={bi} className="flex w-full items-start gap-1">
                <BulletInput
                  value={bullet}
                  onChange={(v) => updateBullet(i, bi, v)}
                  onBlur={(v) => updateBullet(i, bi, v)}
                  onUsage={onUsage}
                  dataField={`experience-${i}-bullet-${bi}`}
                  isPolishedExternally={masterPolished}
                  originalValueExternal={bulletOriginals?.get(`${i}-${bi}`)}
                  jobTitle={exp.role}
                  company={exp.company}
                  initialChatMessage={
                    openChatForBullet?.jobIndex === i && openChatForBullet.bulletIndex === bi
                      ? openChatForBullet.message
                      : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => removeBullet(i, bi)}
                  className="shrink-0 px-1.5 py-1.5 text-xs text-gray-400 hover:text-red-500"
                  title="Remove bullet"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addBullet(i)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              + bullet
            </button>
          </div>
          <button
            type="button"
            onClick={() => removeEntry(i)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Remove entry
          </button>
        </div>
      ))}
    </section>
  );
}
