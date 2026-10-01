'use client';

import { useState, useEffect } from 'react';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  onUsage?: (input: number, output: number, model: string) => void;
  isPolishedExternally?: boolean;
  originalValueExternal?: string;
}

export default function SkillsForm({ value, onChange, onUsage, isPolishedExternally, originalValueExternal }: Props) {
  const [local, setLocal] = useState(value.join(', '));
  const [originalSkills, setOriginalSkills] = useState(value.join(', '));
  const [isPolished, setIsPolished] = useState(false);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    if (!isPolished) {
      setLocal(value.join(', '));
      setOriginalSkills(value.join(', '));
    }
  }, [value, isPolished]);

  useEffect(() => {
    if (isPolishedExternally === false) {
      setIsPolished(false);
    }
  }, [isPolishedExternally]);

  function commit() {
    const parsed = local
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onChange(parsed);
  }

  async function handlePolish() {
    if (!local.trim()) return;
    const snapshot = local;
    setOriginalSkills(snapshot);
    setPolishing(true);
    try {
      const res = await fetch('/api/cv/optimize-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: snapshot, targetField: 'skills' }),
      });
      const data = await res.json() as { optimized?: string; usage?: { promptTokens: number; completionTokens: number; modelUsed: string } };
      if (res.ok && data.optimized) {
        setLocal(data.optimized);
        onChange(data.optimized.split(',').map((s) => s.trim()).filter(Boolean));
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
    const original = (isPolishedExternally && originalValueExternal !== undefined) ? originalValueExternal : originalSkills;
    setLocal(original);
    onChange(original.split(',').map((s) => s.trim()).filter(Boolean));
    setIsPolished(false);
  }

  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">Skills</h2>
      <p className="text-xs text-gray-400 mb-2">Comma-separated list of skills</p>
      <div className="flex items-center gap-2">
        {polishing ? (
          <div className="flex-1 h-8 bg-gray-100 rounded animate-pulse" />
        ) : (
          <input
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            placeholder="TypeScript, React, Node.js, SQL…"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        )}
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
            title="ATS Optimize"
          >
            ✦ ATS Optimize
          </button>
        )}
      </div>
    </section>
  );
}
