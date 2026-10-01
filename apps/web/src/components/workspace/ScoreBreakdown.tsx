'use client';

import { useState, useRef, useEffect } from 'react';
import type { CvDocument, CvActionItem } from '@cv-helper/shared-types';
import type { CvScoreResult } from '@/utils/cvScorer';

export type DimensionKey =
  | 'accomplishmentDensity'
  | 'completeness'
  | 'scannability'
  | 'grammarConsistency'
  | 'contactCompleteness'
  | 'verbQuality'
  | 'writingClarity'
  | 'dateConsistency'
  | 'skillDepth'
  | 'atsScore';

interface DimensionConfig {
  label: string;
  max: number;
  breakdownKey: keyof CvScoreResult['breakdown'];
  fixType: 'sparkle' | 'wand' | 'none';
  wandTargetField?: string;
  filter: (a: CvActionItem) => boolean;
}

export const DIMENSION_CONFIG: Record<DimensionKey, DimensionConfig> = {
  accomplishmentDensity: {
    label: 'Accomplishment Density',
    max: 40,
    breakdownKey: 'accomplishmentDensity',
    fixType: 'sparkle',
    filter: (a) => a.targetField === 'professionalExperience' && /metric|quantitative|business impact|concrete result/i.test(a.message),
  },
  completeness: {
    label: 'Completeness',
    max: 30,
    breakdownKey: 'completeness',
    fixType: 'wand',
    wandTargetField: 'professionalSummary',
    filter: (a) =>
      /summary/i.test(a.message) ||
      /job entries/i.test(a.message) ||
      (a.targetField === 'skills' && !/Skill Depth:/i.test(a.message) && !/ATS Compatibility:/i.test(a.message)),
  },
  scannability: {
    label: 'Scannability',
    max: 30,
    breakdownKey: 'scannability',
    fixType: 'sparkle',
    filter: (a) => /Shorten|over-length/i.test(a.message),
  },
  grammarConsistency: {
    label: 'Grammar & Consistency',
    max: 20,
    breakdownKey: 'grammarConsistency',
    fixType: 'sparkle',
    filter: (a) => /Grammar Typo|Formatting Syntax|Stylistic Consistency|Action-Oriented Phrasing/i.test(a.message),
  },
  contactCompleteness: {
    label: 'Contact Info',
    max: 10,
    breakdownKey: 'contactCompleteness',
    fixType: 'sparkle',
    filter: (a) => /Contact Info:/i.test(a.message),
  },
  verbQuality: {
    label: 'Verb Quality',
    max: 10,
    breakdownKey: 'verbQuality',
    fixType: 'sparkle',
    filter: (a) => /Weak Verb:|Verb Repetition:/i.test(a.message),
  },
  writingClarity: {
    label: 'Writing Clarity',
    max: 8,
    breakdownKey: 'writingClarity',
    fixType: 'sparkle',
    filter: (a) => /Personal Pronoun:|Filler Buzzword:/i.test(a.message),
  },
  dateConsistency: {
    label: 'Date Consistency',
    max: 8,
    breakdownKey: 'dateConsistency',
    fixType: 'wand',
    wandTargetField: 'professionalExperience',
    filter: (a) => /Date Format/i.test(a.message),
  },
  skillDepth: {
    label: 'Skill Depth',
    max: 4,
    breakdownKey: 'skillDepth',
    fixType: 'wand',
    wandTargetField: 'skills',
    filter: (a) => /Skill Depth:/i.test(a.message),
  },
  atsScore: {
    label: 'ATS Compatibility',
    max: 10,
    breakdownKey: 'atsScore',
    fixType: 'sparkle',
    filter: (a) => /ATS Compatibility:/i.test(a.message),
  },
};

const DIMENSION_ORDER: DimensionKey[] = [
  'accomplishmentDensity',
  'completeness',
  'scannability',
  'grammarConsistency',
  'contactCompleteness',
  'verbQuality',
  'writingClarity',
  'dateConsistency',
  'skillDepth',
  'atsScore',
];

function toOptimizeTargetField(field: string): 'experienceBullet' | 'professionalSummary' | 'skills' {
  if (field === 'professionalExperience') return 'experienceBullet';
  if (field === 'skills') return 'skills';
  return 'professionalSummary';
}

function getBulletText(cv: CvDocument, meta?: { jobIndex?: number; bulletIndex?: number }): string {
  if (meta?.jobIndex !== undefined && meta.bulletIndex !== undefined) {
    return cv.experience[meta.jobIndex]?.bullets[meta.bulletIndex] ?? '';
  }
  return cv.professionalSummary ?? '';
}

function isValidOptimizedText(text: string, originalText: string, targetField?: string): boolean {
  const t = text.trim();
  if (!t || t.length < 5) return false;
  // Reject chatbot meta-responses
  if (/I'?m ready to help|please provide|I can help you|what would you like|how can I/i.test(t)) return false;
  // Reject if the output is longer than 3x the original (likely a model explanation, not a bullet)
  // Skip this check for professionalSummary — the executive rewrite is intentionally longer
  if (targetField !== 'professionalSummary' && originalText.trim() && t.length > originalText.trim().length * 3) return false;
  return true;
}

interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
}

interface OptimizeResponse {
  optimizedText: string;
  usage: { promptTokens: number; completionTokens: number; modelUsed: string };
}

export interface DimensionChatProps {
  dimension: DimensionKey;
  fixType: 'sparkle';
  items: CvActionItem[];
  cv: CvDocument;
  onApplyFix: (updater: (prev: CvDocument) => CvDocument) => void;
  onUsage: (input: number, output: number, model: string) => void;
  onDone: () => void;
  onClose: () => void;
}

export function DimensionChat({
  dimension,
  items,
  cv,
  onApplyFix,
  onUsage,
  onDone,
  onClose,
}: DimensionChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingAnswer, setPendingAnswer] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'per-bullet' | 'bulk'>('per-bullet');
  const [bulkInput, setBulkInput] = useState('');

  // Silent fix flow: runs automatically on mount for non-conversational dimensions
  useEffect(() => {
    if (dimension === 'accomplishmentDensity') return; // handled by conversational path

    const controller = new AbortController();
    abortRef.current = controller;

    async function runSilentFixes() {
      setLoading(true);
      setMessages([
        {
          role: 'ai',
          text: `Fixing ${items.length} item${items.length !== 1 ? 's' : ''} automatically...`,
        },
      ]);

      let successCount = 0;

      // Mutable shadow of bullets — updated after each fix so subsequent iterations
      // see the already-fixed text rather than the stale snapshot from mount time.
      // Shape: shadowBullets[jobIndex][bulletIndex] = current text
      const shadowBullets: string[][] = cv.experience.map((exp) => [...exp.bullets]);

      // Pre-populate usedVerbs with every verb currently leading any bullet in the CV.
      const usedVerbs = new Set<string>(
        cv.experience.flatMap((exp) =>
          exp.bullets.map((b) => b.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean),
        ),
      );

      // IDs of items handled in the verb-group pre-pass — skip them in the main loop.
      const handledItemIds = new Set<string>();

      // ── Verb Repetition Pre-pass ────────────────────────────────────────────
      // Group verb-repetition items by the repeated verb. Send each group as a
      // SINGLE AI call listing all bullets and requiring a unique verb for each.
      // This prevents the AI from independently choosing the same synonym N times.
      const verbRepGroups = new Map<string, typeof items>();
      for (const item of items) {
        const m = /Verb Repetition:.*action verb "([^"]+)"/i.exec(item.message);
        if (m && item.meta?.jobIndex !== undefined && item.meta.bulletIndex !== undefined) {
          const verb = m[1].toLowerCase();
          if (!verbRepGroups.has(verb)) verbRepGroups.set(verb, []);
          verbRepGroups.get(verb)!.push(item);
        }
      }

      for (const [repeatedVerb, groupItems] of verbRepGroups) {
        if (controller.signal.aborted) break;

        // Collect current bullet texts from shadow
        const bulletTexts = groupItems.map((item) => {
          const ji = item.meta!.jobIndex!;
          const bi = item.meta!.bulletIndex!;
          return shadowBullets[ji]?.[bi] ?? getBulletText(cv, item.meta);
        });

        // Build a single prompt that lists all bullets and demands unique verbs
        const avoidList = [...new Set([repeatedVerb, ...usedVerbs])].join('", "');
        const numberedBullets = bulletTexts.map((t, i) => `${i + 1}. ${t}`).join('\n');
        const groupPrompt = `You are rewriting ${groupItems.length} CV bullet points that all start with the verb "${repeatedVerb}". Each bullet MUST start with a DIFFERENT strong action verb. No two bullets in this list may share the same opening verb. Do NOT use any of these verbs: "${avoidList}". Return ONLY the rewritten bullets, one per line, numbered 1. 2. 3. etc. No explanations.\n\n${numberedBullets}`;

        try {
          const res = await fetch('/api/cv/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: groupPrompt, targetField: 'experienceBullet' }),
            signal: controller.signal,
          });
          if (!res.ok) continue;

          const data = (await res.json()) as OptimizeResponse;
          onUsage(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);

          // Parse numbered lines from response: "1. Designed xyz\n2. Architected abc\n..."
          const lines = data.optimizedText
            .split('\n')
            .map((l) => l.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean);

          for (let i = 0; i < groupItems.length; i++) {
            const item = groupItems[i];
            const newText = lines[i];
            if (!newText || !isValidOptimizedText(newText, bulletTexts[i])) continue;

            const jobIndex = item.meta!.jobIndex!;
            const bulletIndex = item.meta!.bulletIndex!;
            shadowBullets[jobIndex][bulletIndex] = newText;
            onApplyFix((prev) => ({
              ...prev,
              experience: prev.experience.map((exp, ei) =>
                ei !== jobIndex ? exp : {
                  ...exp,
                  bullets: exp.bullets.map((b, bi) => bi !== bulletIndex ? b : newText),
                },
              ),
            }));
            const newVerb = newText.trim().split(/\s+/)[0]?.toLowerCase();
            if (newVerb) usedVerbs.add(newVerb);
            handledItemIds.add(item.id);
            successCount++;
          }
        } catch {
          // aborted or network error — fall through to main loop
        }
      }
      // ── End Verb Repetition Pre-pass ────────────────────────────────────────

      for (const item of items) {
        if (controller.signal.aborted) break;

        // Skip items already handled in the verb-repetition pre-pass
        if (handledItemIds.has(item.id)) continue;

        // Stylistic Consistency — document-level punctuation fix, no AI needed
        if (/Stylistic Consistency/i.test(item.message) && item.targetField === 'professionalExperience' && !item.meta) {
          onApplyFix((prev) => {
            const allBullets = prev.experience.flatMap((e) => e.bullets.filter(Boolean));
            const withPeriod = allBullets.filter((b) => b.trimEnd().endsWith('.')).length;
            const usePeriod = withPeriod >= allBullets.length - withPeriod;
            return {
              ...prev,
              experience: prev.experience.map((exp) => ({
                ...exp,
                bullets: exp.bullets.map((b) => {
                  if (!b.trim()) return b;
                  return usePeriod
                    ? b.trimEnd().endsWith('.') ? b : b.trimEnd() + '.'
                    : b.trimEnd().endsWith('.') ? b.trimEnd().slice(0, -1) : b;
                }),
              })),
            };
          });
          successCount++;
          continue;
        }

        // Read current bullet text from shadow (reflects prior fixes in this session)
        const rawText = (() => {
          if (item.targetField === 'professionalSummary') return cv.professionalSummary;
          const ji = item.meta?.jobIndex;
          const bi = item.meta?.bulletIndex;
          if (ji !== undefined && bi !== undefined) return shadowBullets[ji]?.[bi] ?? '';
          return getBulletText(cv, item.meta);
        })();

        // For headline/tagline, the field is intentionally empty — skip the empty guard
        if (!rawText?.trim() && !item.meta?.topLevelField) {
          successCount++;
          continue;
        }
        try {
          // For verb repetition items, tell the optimizer which verbs to avoid.
          // usedVerbs now contains ALL verbs currently leading any bullet (pre-populated above)
          // plus any verbs used by earlier fixes in this loop run.
          const verbRepMatch = /Verb Repetition:.*action verb "([^"]+)"/i.exec(item.message);
          let optimizeText = rawText ?? '';
          if (verbRepMatch) {
            const avoidVerbs = [...new Set([verbRepMatch[1].toLowerCase(), ...usedVerbs])].join('", "');
            optimizeText = `Rewrite this bullet using a DIFFERENT strong action verb — do NOT start with any of these verbs: "${avoidVerbs}". Use a unique verb not in that list: ${rawText}`;
          }

          // For headline/tagline, build from CV context instead of existing field text
          if (item.meta?.topLevelField === 'headline') {
            const role = cv.experience[0]?.role ?? '';
            const summary = cv.professionalSummary ?? '';
            optimizeText = `Generate a professional CV headline (3-6 words, job title format, e.g. "Senior Software Engineer") for this candidate. Most recent role: "${role}". Summary excerpt: "${summary.slice(0, 200)}". Output ONLY the headline text, nothing else.`;
          } else if (item.meta?.topLevelField === 'tagline') {
            const skills = cv.skills.slice(0, 15).join(', ');
            const summary = cv.professionalSummary ?? '';
            optimizeText = `Generate a professional CV tagline with exactly 3-4 broad domain categories separated by " | ". Rules: each category must be 2-3 words MAX, use high-level domain labels (e.g. "Distributed Systems", "Cloud Platforms", "AI Systems", "Data Infrastructure"), do NOT use verbose phrases, do NOT name specific technologies or products, pick the candidate's strongest and most senior domains. Skills context: "${skills}". Summary: "${summary.slice(0, 200)}". Output ONLY the tagline in "Domain | Domain | Domain" format, nothing else.`;
          } else if (item.meta?.topLevelField === 'location') {
            const loc = cv.contactInfo.location ?? '';
            optimizeText = `This CV location field contains a city and country: "${loc}". Extract and return ONLY the country name (e.g. if the input is "Tel Aviv, Israel" return "Israel", if "New York, USA" return "USA"). Output ONLY the country name, nothing else.`;
          }

          const res = await fetch('/api/cv/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: optimizeText,
              targetField: toOptimizeTargetField(item.targetField),
            }),
            signal: controller.signal,
          });
          if (!res.ok) continue;
          const data = (await res.json()) as OptimizeResponse;
          onUsage(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);

          if (!isValidOptimizedText(data.optimizedText, item.meta?.topLevelField ? '' : rawText ?? '', item.targetField)) continue;

          if (item.meta?.topLevelField) {
              const field = item.meta.topLevelField;
              if (field === 'location') {
                onApplyFix((prev) => ({
                  ...prev,
                  contactInfo: { ...prev.contactInfo, location: data.optimizedText },
                }));
              } else {
                onApplyFix((prev) => ({ ...prev, [field]: data.optimizedText }));
              }
            } else if (item.meta?.jobIndex !== undefined && item.meta.bulletIndex !== undefined) {
              const jobIndex = item.meta.jobIndex;
              const bulletIndex = item.meta.bulletIndex;
              // Update shadow so subsequent iterations in this loop see the new text
              if (shadowBullets[jobIndex]) shadowBullets[jobIndex][bulletIndex] = data.optimizedText;
              onApplyFix((prev) => ({
                ...prev,
                experience: prev.experience.map((exp, ei) =>
                  ei !== jobIndex
                    ? exp
                    : {
                        ...exp,
                        bullets: exp.bullets.map((b, bi) => (bi !== bulletIndex ? b : data.optimizedText)),
                      },
                ),
              }));
            } else {
              onApplyFix((prev) => ({ ...prev, professionalSummary: data.optimizedText }));
            }
          successCount++;
          // Add every word that now starts a bullet in the shadow to usedVerbs,
          // so the next iteration avoids all currently-leading verbs, not just this one output.
          const newFirstWord = data.optimizedText.trim().split(/\s+/)[0]?.toLowerCase();
          if (newFirstWord) usedVerbs.add(newFirstWord);
        } catch {
          // aborted or network error — skip
        }
      }

      if (!controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'ai' as const,
            text: `✅ Fixed ${successCount} of ${items.length} items. Your score has been updated — close this panel to see the new breakdown.`,
          },
        ]);
        setLoading(false);
        onDone();
      }
    }

    void runSilentFixes();
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conversational flow seed — for accomplishmentDensity
  useEffect(() => {
    if (dimension !== 'accomplishmentDensity') return;
    if (items.length === 0) {
      onDone();
      return;
    }
    const bulletText = getBulletText(cv, items[0].meta);
    setMessages([
      {
        role: 'ai',
        text: `For your bullet "${bulletText.slice(0, 80)}${bulletText.length > 80 ? '...' : ''}", what was the measurable result? (e.g. "reduced latency by 40%", "saved 3 hours/week")`,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleSend() {
    if (!pendingAnswer.trim() || loading) return;
    const item = items[currentIndex];
    if (!item) return;
    const rawText = getBulletText(cv, item.meta);
    const userAnswer = pendingAnswer;
    setMessages((prev) => [...prev, { role: 'user', text: userAnswer }]);
    setPendingAnswer('');
    setLoading(true);

    try {
      const res = await fetch('/api/cv/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${rawText}. Measurable result context: ${userAnswer}`,
          targetField: 'experienceBullet',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as OptimizeResponse;
        onUsage(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
        if (item.meta?.jobIndex !== undefined && item.meta.bulletIndex !== undefined) {
          const jobIndex = item.meta.jobIndex;
          const bulletIndex = item.meta.bulletIndex;
          onApplyFix((prev) => ({
            ...prev,
            experience: prev.experience.map((exp, ei) =>
              ei !== jobIndex
                ? exp
                : {
                    ...exp,
                    bullets: exp.bullets.map((b, bi) => (bi !== bulletIndex ? b : data.optimizedText)),
                  },
            ),
          }));
        }
        const nextIndex = currentIndex + 1;
        if (nextIndex < items.length) {
          const nextBullet = getBulletText(cv, items[nextIndex].meta);
          setMessages((prev) => [
            ...prev,
            {
              role: 'ai',
              text: `Updated! For your bullet "${nextBullet.slice(0, 80)}${nextBullet.length > 80 ? '...' : ''}", what was the measurable result?`,
            },
          ]);
          setCurrentIndex(nextIndex);
        } else {
          setMessages((prev) => [...prev, { role: 'ai', text: `✅ All ${items.length} bullets updated! Close this panel to see your updated score.` }]);
          onDone();
        }
      } else {
        setMessages((prev) => [...prev, { role: 'ai', text: 'Something went wrong. Try again.' }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Network error. Try again.' }]);
    }
    setLoading(false);
  }

  async function handleBulkSubmit() {
    if (!bulkInput.trim() || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    // Parse accomplishments — one per line, ignore blanks
    const accomplishments = bulkInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // Only process as many bullets as there are accomplishments — never modify a bullet without a paired input
    const pairCount = Math.min(items.length, accomplishments.length);

    setMessages((prev) => [
      ...prev,
      {
        role: 'ai' as const,
        text: `Matching ${pairCount} accomplishment(s) to ${pairCount} bullet(s)...${accomplishments.length > items.length ? ` (${accomplishments.length - items.length} extra accomplishment(s) ignored — more than available bullets)` : ''}`,
      },
    ]);

    const summaryLines: string[] = [];
    let successCount = 0;

    // Build a set of all current bullet texts for duplicate detection
    const allCurrentBullets = cv.experience.flatMap((e) => e.bullets.map((b) => b.toLowerCase().trim()));

    // Track which accomplishments have already been embedded this session
    const usedAccomplishments = new Set<string>();

    for (let i = 0; i < pairCount; i++) {
      if (controller.signal.aborted) break;
      const item = items[i];
      if (item.meta?.jobIndex === undefined || item.meta?.bulletIndex === undefined) {
        summaryLines.push(`Bullet ${i + 1}: skipped (no location)`);
        continue;
      }
      const rawText = getBulletText(cv, item.meta);
      if (!rawText.trim()) {
        summaryLines.push(`Bullet ${i + 1}: skipped (empty)`);
        continue;
      }

      const assigned = accomplishments[i];

      // Guard: skip if this accomplishment is already present anywhere in the CV
      const assignedLower = assigned.toLowerCase();
      if (usedAccomplishments.has(assignedLower) || allCurrentBullets.some((b) => b.includes(assignedLower))) {
        summaryLines.push(`Bullet ${i + 1}: skipped — accomplishment already exists in the CV`);
        continue;
      }

      const promptText = `${rawText}. Incorporate this specific accomplishment into the bullet: ${assigned}`;

      try {
        const res = await fetch('/api/cv/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: promptText, targetField: 'experienceBullet' }),
          signal: controller.signal,
        });
        if (!res.ok) {
          summaryLines.push(`Bullet ${i + 1}: failed to update`);
          continue;
        }
        const data = (await res.json()) as OptimizeResponse;
        onUsage(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
        if (!isValidOptimizedText(data.optimizedText, rawText)) {
          summaryLines.push(`Bullet ${i + 1}: skipped (optimizer returned invalid output)`);
          continue;
        }
        const { jobIndex, bulletIndex } = item.meta;
        onApplyFix((prev) => ({
          ...prev,
          experience: prev.experience.map((exp, ei) =>
            ei !== jobIndex
              ? exp
              : {
                  ...exp,
                  bullets: exp.bullets.map((b, bi) => (bi !== bulletIndex ? b : data.optimizedText)),
                },
          ),
        }));
        // Mark this accomplishment as used so it can't be applied to another bullet this session
        usedAccomplishments.add(assignedLower);
        successCount++;
        summaryLines.push(`Bullet ${i + 1}: updated — ${data.optimizedText.slice(0, 60)}${data.optimizedText.length > 60 ? '...' : ''}`);
      } catch {
        if (controller.signal.aborted) break;
        summaryLines.push(`Bullet ${i + 1}: error`);
      }
    }

    if (!controller.signal.aborted) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai' as const,
          text: `✅ Updated ${successCount} of ${pairCount} bullets. Close this panel to see your new score.\n\n${summaryLines.join('\n')}`,
        },
      ]);
      setLoading(false);
      onDone();
    }
  }

  return (
    <div className="relative mt-2 border border-indigo-200 rounded-lg bg-indigo-50/60 p-3 space-y-2">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-1.5 right-2 text-gray-400 hover:text-gray-600 text-sm leading-none"
      >
        ×
      </button>

      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-4">
        {messages.map((m, i) => (
          <p
            key={i}
            className={`text-xs leading-relaxed ${
              m.role === 'ai' ? 'text-indigo-700' : 'text-gray-700 font-medium'
            }`}
          >
            {m.role === 'ai' ? '🤖 ' : '👤 '}
            {m.text}
          </p>
        ))}
        {loading && <p className="text-xs text-gray-400 italic">AI is thinking...</p>}
      </div>

      {dimension === 'accomplishmentDensity' && (
        <>
          <div className="flex gap-1 border-b border-indigo-100 pb-2">
            <button
              type="button"
              onClick={() => {
                setMode('per-bullet');
                setMessages([
                  {
                    role: 'ai',
                    text: items[currentIndex]
                      ? `For your bullet "${getBulletText(cv, items[currentIndex].meta).slice(0, 80)}${getBulletText(cv, items[currentIndex].meta).length > 80 ? '...' : ''}", what was the measurable result? (e.g. "reduced latency by 40%", "saved 3 hours/week")`
                      : 'No more bullets to improve.',
                  },
                ]);
                setPendingAnswer('');
              }}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                mode === 'per-bullet'
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              Per Bullet
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('bulk');
                setMessages([
                  {
                    role: 'ai',
                    text: `Paste your accomplishments below — one per line. Each accomplishment is applied to exactly one bullet (line 1 → bullet 1, line 2 → bullet 2…). Each metric will appear in the CV only once.`,
                  },
                ]);
              }}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                mode === 'bulk'
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              Bulk
            </button>
          </div>

          {mode === 'per-bullet' ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={pendingAnswer}
                onChange={(e) => setPendingAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSend();
                }}
                disabled={loading}
                placeholder="e.g. reduced latency by 40%"
                className="flex-1 text-xs border border-indigo-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 bg-white"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || !pendingAnswer.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                disabled={loading}
                rows={4}
                placeholder={`e.g.\nreduced latency by 40%\nsaved 3 hours/week\ngrew revenue by $2M`}
                className="w-full text-xs border border-indigo-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 bg-white resize-none"
              />
              <button
                type="button"
                onClick={() => void handleBulkSubmit()}
                disabled={loading || !bulkInput.trim()}
                className="w-full px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Apply to All
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface ScoreBreakdownProps {
  breakdown: CvScoreResult['breakdown'];
  actions: CvActionItem[];
  expandedDimension: DimensionKey | null;
  activeChatDimension: DimensionKey | null;
  onToggleExpand: (dim: DimensionKey) => void;
  onStartChat: (dim: DimensionKey) => void;
  onCloseChat: () => void;
  onFocusField: (targetField: string, jobIndex?: number, bulletIndex?: number) => void;
  onOpenChat?: (targetField: string, meta: { jobIndex?: number; bulletIndex?: number } | undefined, message: string) => void;
}

export default function ScoreBreakdown({
  breakdown,
  actions,
  expandedDimension,
  activeChatDimension,
  onToggleExpand,
  onStartChat,
  onCloseChat,
  onFocusField,
  onOpenChat,
}: ScoreBreakdownProps) {

  return (
    <div className="w-96 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-lg border border-gray-100 p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Score Breakdown</p>

      {DIMENSION_ORDER.map((dimKey) => {
        const config = DIMENSION_CONFIG[dimKey];
        const value = breakdown[config.breakdownKey];
        const max = config.max;
        const pct = max > 0 ? value / max : 0;
        const barWidth = max > 0 && value === 0 ? 8 : pct * 100;
        const barColor = pct >= 0.7 ? 'bg-green-500' : pct >= 0.4 ? 'bg-orange-400' : 'bg-red-400';
        const isExpanded = expandedDimension === dimKey;
        const dimActions = actions.filter(config.filter);
        const isAtMax = value >= max;

        return (
          <div key={dimKey} className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleExpand(dimKey)}
                className="text-gray-400 hover:text-gray-600 text-xs w-4 flex-shrink-0"
              >
                {isExpanded ? '▾' : '▸'}
              </button>

              <div className="flex justify-between text-xs text-gray-600 flex-1 min-w-0">
                <span className="truncate">{config.label}</span>
                <span className="font-medium tabular-nums ml-2 flex-shrink-0">
                  {value} / {max}
                </span>
              </div>

              {!isAtMax && config.fixType === 'sparkle' && (
                <button
                  type="button"
                  onClick={() => onStartChat(dimKey)}
                  title="AI can fix this"
                  className="flex-shrink-0 text-sm hover:scale-110 transition-transform ml-1"
                >
                  ✨
                </button>
              )}
              {!isAtMax && config.fixType === 'wand' && (
                <button
                  type="button"
                  onClick={() => {
                    const firstAction = dimActions[0];
                    onFocusField(
                      config.wandTargetField ?? firstAction?.targetField ?? 'professionalSummary',
                      firstAction?.meta?.jobIndex,
                      firstAction?.meta?.bulletIndex,
                    );
                  }}
                  title="Go to the relevant field to fix this"
                  className="flex-shrink-0 text-sm hover:scale-110 transition-transform ml-1"
                >
                  🪄
                </button>
              )}
            </div>

            <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden ml-5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>

            {dimKey === 'accomplishmentDensity' && (
              <div className="ml-5 flex gap-3 mt-1">
                <span className="text-[10px] text-green-600 font-medium">✦ {breakdown.tierAPercent}% metric</span>
                <span className="text-[10px] text-blue-500 font-medium">◇ {breakdown.tierBPercent}% qualitative</span>
                {breakdown.tierCPercent > 0 && (
                  <span className="text-[10px] text-red-400 font-medium">✗ {breakdown.tierCPercent}% task-only</span>
                )}
              </div>
            )}

            {isExpanded && (
              <div className="ml-5 mt-1.5 space-y-1.5">
                {(() => {
                  // At max score, hide Tier B "consider adding a metric" suggestions — they're optional improvements
                  const visibleActions = (isAtMax && dimKey === 'accomplishmentDensity')
                    ? dimActions.filter((a) => !/Consider adding a specific metric/i.test(a.message))
                    : dimActions;
                  return visibleActions.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No action items for this dimension.</p>
                  ) : (
                    visibleActions.map((item) => (
                      <div
                        key={item.id}
                        className="w-full text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded px-2.5 py-1.5 flex items-start gap-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => onFocusField(item.targetField, item.meta?.jobIndex, item.meta?.bulletIndex)}
                          className="flex items-start gap-1.5 flex-1 text-left hover:text-gray-900 transition-colors"
                        >
                          <span className="text-gray-400 mt-0.5 flex-shrink-0">→</span>
                          <span className="flex-1">{item.message}</span>
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                          <span className="text-[10px] font-semibold text-gray-400">+{item.impactPoints}pts</span>
                          {onOpenChat && (
                            <button
                              type="button"
                              title="Chat with AI assistant"
                              onClick={() => onOpenChat(item.targetField, item.meta, item.message)}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors whitespace-nowrap"
                            >
                              💬 Chat
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
