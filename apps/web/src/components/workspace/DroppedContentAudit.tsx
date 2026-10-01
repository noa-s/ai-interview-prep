'use client';

import { useState } from 'react';
import type { DroppedContentAuditEntry } from '@cv-helper/shared-types';

interface Props {
  entries: DroppedContentAuditEntry[];
  currentSkills: string[];
  currentSummary: string;
  onAppendToSkills: (text: string) => void;
  onAppendToSummary: (text: string) => void;
  onAppendToExperience: (text: string) => void;
  onRemoveFromSkills: (text: string) => void;
  onRemoveFromSummary: (text: string) => void;
  onRemoveFromExperience: (text: string) => void;
}

export default function DroppedContentAudit({
  entries,
  onAppendToSkills,
  onAppendToSummary,
  onAppendToExperience,
  onRemoveFromSkills,
  onRemoveFromSummary,
  onRemoveFromExperience,
}: Props) {
  console.log('[DroppedContentAudit] entries received:', JSON.stringify(entries), 'count:', entries?.length);
  const [expanded, setExpanded] = useState<boolean[]>(() => entries.map(() => false));
  const [mergedSet, setMergedSet] = useState<Set<number>>(() => new Set());
  const [polishing, setPolishing] = useState<Set<number>>(() => new Set());

  if (!entries || entries.length === 0) return null;

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  async function handlePolishAndMerge(index: number, entry: DroppedContentAuditEntry) {
    setPolishing((prev) => new Set(prev).add(index));

    try {
      const res = await fetch('/api/cv/optimize-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBullet: entry.rawContentText }),
      });
      const data = await res.json() as { optimized?: string };
      const optimized = (res.ok && data.optimized) ? data.optimized : entry.rawContentText;

      switch (entry.analysis.suggestedTargetField) {
        case 'skills':
          onAppendToSkills(optimized);
          break;
        case 'professionalSummary':
          onAppendToSummary(optimized);
          break;
        case 'professionalExperience':
          onAppendToExperience(optimized);
          break;
        default:
          onAppendToSummary(optimized);
      }
    } finally {
      setPolishing((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setMergedSet((prev) => new Set(prev).add(index));
    }
  }

  function handleUndo(index: number, entry: DroppedContentAuditEntry) {
    switch (entry.analysis.suggestedTargetField) {
      case 'skills':
        onRemoveFromSkills(entry.rawContentText);
        break;
      case 'professionalSummary':
        onRemoveFromSummary(entry.rawContentText);
        break;
      case 'professionalExperience':
        onRemoveFromExperience(entry.rawContentText);
        break;
      default:
        onRemoveFromSummary(entry.rawContentText);
    }
    setMergedSet((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {/* Warning alert */}
      <div className="border border-amber-200 bg-amber-50 text-amber-800 rounded px-4 py-3 text-sm">
        We found {entries.length} section{entries.length > 1 ? 's' : ''} not included in the standard
        template: {entries.map((e) => e.sectionTitle).join(', ')}
      </div>

      {/* Expandable entries */}
      {entries.map((entry, index) => {
        const isIntegrated = entry.analysis.status === 'integrated';
        const isMerged = mergedSet.has(index);
        const isPolishing = polishing.has(index);

        return (
          <div key={index} className="border border-gray-200 rounded">
            {/* Header row */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 text-left"
              onClick={() => toggle(index)}
            >
              <span>{entry.sectionTitle}</span>
              <span className="text-gray-500 text-xs">{expanded[index] ? '▲' : '▼'}</span>
            </button>

            {/* Expanded content */}
            {expanded[index] && (
              <div className="px-4 pb-4 space-y-3">
                <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 bg-gray-50 border border-gray-100 rounded p-3">
                  {entry.rawContentText}
                </pre>

                {isIntegrated ? (
                  <div className="space-y-1">
                    <span className="text-xs font-medium bg-gray-100 text-gray-500 rounded px-2 py-0.5">Already Covered</span>
                    <p className="text-xs text-gray-500 mt-1">
                      {`This content's context was automatically matched and integrated into ${entry.analysis.matchedLocation ?? 'the CV'}. No action required to prevent duplication.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs font-medium bg-orange-100 text-orange-700 rounded px-2 py-0.5">Needs Review</span>
                    <p className="text-xs text-gray-600">{entry.analysis.justification}</p>
                    {isMerged ? (
                      <button
                        type="button"
                        className="text-xs font-medium rounded border border-green-500 text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1"
                        onClick={() => handleUndo(index, entry)}
                      >
                        ✓ Merged — Undo
                      </button>
                    ) : isPolishing ? (
                      <button
                        type="button"
                        className="text-xs font-medium rounded border border-blue-400 text-blue-700 bg-blue-50 px-3 py-1 disabled:opacity-50"
                        disabled
                      >
                        Polishing…
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-medium rounded border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 disabled:opacity-50"
                        onClick={() => void handlePolishAndMerge(index, entry)}
                      >
                        {`Polish & Merge into ${entry.analysis.suggestedTargetField ?? 'CV'}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
