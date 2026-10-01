'use client';

import { useState, useEffect, useRef } from 'react';

interface ExtractedData {
  skills: string[];
  experience: string[];
}

interface ChatMessageItem {
  role: 'user' | 'ai';
  text: string;
  suggestion?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onUsage?: (input: number, output: number, model: string) => void;
  onAppendToSkills?: (items: string[]) => void;
  onAppendToExperience?: (items: string[]) => void;
  cvContext?: { skills: string[]; jobTitles: string[] };
  isPolishedExternally?: boolean;
  originalValueExternal?: string;
  initialChatMessage?: string;
}

export default function SummaryForm({ value, onChange, onUsage, onAppendToSkills, onAppendToExperience, cvContext, isPolishedExternally, originalValueExternal, initialChatMessage }: Props) {
  const [local, setLocal] = useState(value);
  const [originalSummary, setOriginalSummary] = useState(value);
  const [isPolished, setIsPolished] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [addedSkills, setAddedSkills] = useState<Set<string>>(new Set());
  const [addedExp, setAddedExp] = useState<Set<string>>(new Set());

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPolished) {
      setLocal(value);
      setOriginalSummary(value);
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
    setOriginalSummary(snapshot);
    setPolishing(true);
    try {
      const res = await fetch('/api/cv/optimize-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: snapshot, targetField: 'professionalSummary' }),
      });
      const data = await res.json() as {
        optimized?: string;
        extractedData?: ExtractedData | null;
        usage?: { promptTokens: number; completionTokens: number; modelUsed: string };
      };
      if (res.ok && data.optimized) {
        setLocal(data.optimized);
        onChange(data.optimized);
        setIsPolished(true);
        setAddedSkills(new Set());
        setAddedExp(new Set());
        const hasExtracted =
          (data.extractedData?.skills?.length ?? 0) > 0 ||
          (data.extractedData?.experience?.length ?? 0) > 0;
        setExtracted(hasExtracted ? data.extractedData! : null);
        if (data.usage) {
          onUsage?.(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
        }
      }
    } finally {
      setPolishing(false);
    }
  }

  function handleReset() {
    const original = (isPolishedExternally && originalValueExternal !== undefined) ? originalValueExternal : originalSummary;
    setLocal(original);
    onChange(original);
    setIsPolished(false);
    setExtracted(null);
    setAddedSkills(new Set());
    setAddedExp(new Set());
  }

  function handleAddSkill(item: string) {
    onAppendToSkills?.([item]);
    setAddedSkills((prev) => new Set(prev).add(item));
  }

  function handleAddExperience(item: string) {
    onAppendToExperience?.([item]);
    setAddedExp((prev) => new Set(prev).add(item));
  }

  function handleAddAll() {
    if (extracted?.skills?.length) {
      const newSkills = extracted.skills.filter((s) => !addedSkills.has(s));
      if (newSkills.length) onAppendToSkills?.(newSkills);
      setAddedSkills((prev) => new Set([...prev, ...extracted.skills]));
    }
    if (extracted?.experience?.length) {
      const newExp = extracted.experience.filter((s) => !addedExp.has(s));
      if (newExp.length) onAppendToExperience?.(newExp);
      setAddedExp((prev) => new Set([...prev, ...extracted.experience]));
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMessageItem = { role: 'user', text };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatLoading(true);
    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.role === 'ai' && m.suggestion ? m.suggestion : m.text,
      }));
      const res = await fetch('/api/cv/chat-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentSummary: local, messages: apiMessages, cvContext }),
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
    setIsPolished(true);
  }

  const allAdded =
    extracted !== null &&
    (extracted.skills ?? []).every((s) => addedSkills.has(s)) &&
    (extracted.experience ?? []).every((s) => addedExp.has(s));

  const hasExtractedSkills = (extracted?.skills?.length ?? 0) > 0;
  const hasExtractedExp = (extracted?.experience?.length ?? 0) > 0;

  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Professional Summary</h2>
      <div className="flex flex-col gap-2">
        {polishing ? (
          <div className="h-20 bg-gray-100 rounded animate-pulse" />
        ) : (
          <textarea
            rows={4}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => onChange(local)}
            placeholder="A compelling 2-3 sentence summary of your professional profile…"
            className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
          />
        )}
        <div className="flex justify-end gap-1.5">
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
          <div className="mt-1 rounded-md border border-blue-200 bg-blue-50 flex flex-col gap-0">
            <div className="px-3 pt-2 pb-1 text-xs font-semibold text-blue-700">AI Writing Assistant</div>
            <div className="px-3 pb-2 flex flex-col gap-2 max-h-72 overflow-y-auto">
              {chatMessages.length === 0 && (
                <p className="text-xs text-blue-400 italic py-1">
                  Ask me to add content, rephrase, or just ask a question about your summary.
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
                      <p className="text-xs text-blue-600 font-medium">Suggested summary:</p>
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
                placeholder="e.g. add that I led a team of 8 engineers…"
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

        {(hasExtractedSkills || hasExtractedExp) && (
          <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-amber-700">Removed from summary — add to the right section:</p>
              <button
                type="button"
                onClick={handleAddAll}
                disabled={allAdded}
                title="Add all to their sections"
                className={`shrink-0 px-2 py-0.5 rounded border text-xs transition-colors ${
                  allAdded
                    ? 'border-green-300 bg-green-50 text-green-600 cursor-default'
                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                }`}
              >
                {allAdded ? '✓ All added' : '✦ Add all'}
              </button>
            </div>

            {hasExtractedSkills && (
              <div className="mb-2">
                <p className="text-amber-600 font-medium mb-1">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {extracted!.skills.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleAddSkill(item)}
                      disabled={addedSkills.has(item)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors ${
                        addedSkills.has(item)
                          ? 'border-green-300 bg-green-50 text-green-600 cursor-default'
                          : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      {addedSkills.has(item) ? '✓' : '+'} {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasExtractedExp && (
              <div>
                <p className="text-amber-600 font-medium mb-1">Experience / Accomplishments</p>
                <div className="flex flex-col gap-1">
                  {extracted!.experience.map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddExperience(item)}
                        disabled={addedExp.has(item)}
                        className={`shrink-0 px-2 py-0.5 rounded border text-xs transition-colors ${
                          addedExp.has(item)
                            ? 'border-green-300 bg-green-50 text-green-600 cursor-default'
                            : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        {addedExp.has(item) ? '✓ Added' : '+ Add'}
                      </button>
                      <span className="text-amber-800 leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
