'use client';
import { useState } from 'react';
import type { CvDocument } from '@cv-helper/shared-types';
import { calculateCvScore } from '@/utils/cvScorer';

interface Props {
  cv: CvDocument;
}

function getColorClasses(score: number): { text: string; border: string; bg: string; fill: string } {
  if (score < 50) {
    return { text: 'text-red-500', border: 'border-red-200', bg: 'bg-red-50', fill: 'bg-red-400' };
  }
  if (score < 80) {
    return { text: 'text-orange-500', border: 'border-orange-200', bg: 'bg-orange-50', fill: 'bg-orange-400' };
  }
  return { text: 'text-green-600', border: 'border-green-200', bg: 'bg-green-50', fill: 'bg-green-500' };
}

interface SubScoreRowProps {
  label: string;
  value: number;
  max: number;
  fillClass: string;
}

function SubScoreRow({ label, value, max, fillClass }: SubScoreRowProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-medium tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${fillClass} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CvScoreCard({ cv }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { totalScore, breakdown } = calculateCvScore(cv);
  const colors = getColorClasses(totalScore);

  return (
    <div className={`rounded-xl shadow-sm border border-gray-100 p-4 bg-white`}>
      <div className="flex items-center gap-4">
        {/* Circular score badge */}
        <div
          className={`flex-shrink-0 w-16 h-16 rounded-full border-4 ${colors.border} ${colors.bg} flex flex-col items-center justify-center`}
        >
          <span className={`text-xl font-bold leading-none ${colors.text}`}>{totalScore}</span>
          <span className="text-[10px] text-gray-400 leading-none mt-0.5">/ 100</span>
        </div>

        {/* Label + toggle */}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <span>{expanded ? '▾' : '▸'}</span>
            <span>Score Breakdown</span>
          </button>
          <p className="text-xs text-gray-400 mt-0.5">CV quality score</p>
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="mt-4 space-y-3">
          <SubScoreRow
            label="Accomplishment Density"
            value={breakdown.accomplishmentDensity}
            max={40}
            fillClass={colors.fill}
          />
          <SubScoreRow
            label="Completeness"
            value={breakdown.completeness}
            max={30}
            fillClass={colors.fill}
          />
          <SubScoreRow
            label="Scannability"
            value={breakdown.scannability}
            max={30}
            fillClass={colors.fill}
          />
        </div>
      )}
    </div>
  );
}
