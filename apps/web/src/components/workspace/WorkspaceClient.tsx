'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import type { CvDocument } from '@cv-helper/shared-types';
import { CvDocumentSchema } from '@cv-helper/shared-types';
import { useSessionUsage } from '@/context/SessionUsageProvider';
import ContactForm from './ContactForm';
import SummaryForm from './SummaryForm';
import SkillsForm from './SkillsForm';
import ExperienceForm from './ExperienceForm';
import EducationForm from './EducationForm';
import PrintPreview from './PrintPreview';
import { calculateCvScore, evaluateAndAuditCv } from '@/utils/cvScorer';
import CVPreviewRenderer from '../CVPreviewRenderer';
import DroppedContentAudit from './DroppedContentAudit';
import ScoreBreakdown, { type DimensionKey, DimensionChat, DIMENSION_CONFIG } from './ScoreBreakdown';

const EMPTY_CV: CvDocument = {
  contactInfo: { name: '', email: '' },
  headline: '',
  tagline: '',
  professionalSummary: '',
  skills: [],
  experience: [],
  education: [],
  droppedContentAudit: [],
};

const PRIORITY_CONFIG = {
  high:   { label: 'High Impact',   dot: 'bg-red-400',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-100'   },
  medium: { label: 'Medium Impact', dot: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100' },
  low:    { label: 'Low Impact',    dot: 'bg-blue-400',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100'  },
} as const;

function CvActionPlan({
  actions,
  onFocusField,
}: {
  actions: import('@cv-helper/shared-types').CvActionItem[];
  onFocusField: (targetField: string, jobIndex?: number, bulletIndex?: number) => void;
}) {
  if (actions.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center space-y-1">
        <p className="text-2xl">🎉</p>
        <p className="text-sm font-semibold text-green-800">Your CV looks great!</p>
        <p className="text-xs text-green-600">All action items are resolved.</p>
      </div>
    );
  }

  const grouped = ((['high', 'medium', 'low'] as const)).map((priority) => ({
    priority,
    items: actions.filter((a) => a.priority === priority),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Action Plan</h3>
        <span className="text-xs text-gray-400">{actions.length} item{actions.length !== 1 ? 's' : ''}</span>
      </div>
      {grouped.map(({ priority, items }) => {
        const cfg = PRIORITY_CONFIG[priority];
        return (
          <div key={priority} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onFocusField(item.targetField, item.meta?.jobIndex, item.meta?.bulletIndex)}
                className={`w-full text-left rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2.5 text-xs text-gray-700 hover:brightness-95 transition-all flex items-start gap-2`}
              >
                <span className="mt-0.5 flex-shrink-0 text-gray-400">→</span>
                <span className="flex-1">{item.message}</span>
                <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400">+{item.impactPoints}pts</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

type ActiveTab = 'cv-helper' | 'interview-playbook';

type BatchQuestion = {
  id: string;
  category: 'Behavioral' | 'Technical' | 'Systemic' | 'Coding';
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  question: string;
  intentHint: string;
  answerStrategy: {
    interviewerExpectation: string;
    coachingBlueprint: string;
    samplePhrasingStart: string;
  };
};

type SavedCv = {
  id: string;
  name: string;
  cv: CvDocument;
  savedAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  Behavioral: '#4f46e5',
  Technical: '#0891b2',
  Systemic: '#059669',
  Coding: '#b45309',
};

function DifficultyBadge({ difficulty }: { difficulty: 'Easy' | 'Medium' | 'Hard' }) {
  const cfg = {
    Easy:   { bg: 'bg-green-100',  text: 'text-green-800' },
    Medium: { bg: 'bg-amber-100',  text: 'text-amber-800' },
    Hard:   { bg: 'bg-red-100',    text: 'text-red-800'   },
  }[difficulty];
  return (
    <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {difficulty}
    </span>
  );
}

function QuestionCard({ q, num }: { q: BatchQuestion; num: number }) {
  const color = CATEGORY_COLORS[q.category] ?? '#6b7280';
  const isCoding = q.category === 'Coding';
  return (
    <div className={`rounded-xl border p-5 shadow-sm bg-white ${isCoding ? 'border-amber-300' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold text-gray-400 min-w-[24px]">{String(num).padStart(2, '0')}</span>
        <span className="text-[0.68rem] font-bold uppercase tracking-wide text-white px-2.5 py-0.5 rounded-full" style={{ background: color }}>{q.category}</span>
        {isCoding && q.difficulty && <DifficultyBadge difficulty={q.difficulty} />}
      </div>
      <p className="text-base font-bold text-gray-900 mb-1.5 leading-snug">{q.question}</p>
      <p className="text-xs text-gray-500 italic mb-4">🎯 Interviewer's Hidden Intent: {q.intentHint}</p>
      <div className={`rounded-lg border p-4 flex flex-col gap-3 ${isCoding ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
        <div>
          <p className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${isCoding ? 'text-amber-700' : 'text-blue-600'}`}>What They Are Evaluating</p>
          <p className="text-sm text-gray-700 leading-relaxed">{q.answerStrategy.interviewerExpectation}</p>
        </div>
        <div>
          <p className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${isCoding ? 'text-amber-700' : 'text-blue-600'}`}>Your Formulation Blueprint</p>
          <p className="text-sm text-gray-700 leading-relaxed">{q.answerStrategy.coachingBlueprint}</p>
        </div>
        <div>
          <p className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${isCoding ? 'text-amber-700' : 'text-blue-600'}`}>Strong Opening Phrase</p>
          <p className="text-sm text-gray-700 italic leading-relaxed border-l-2 border-blue-300 pl-3 bg-white rounded-r py-1">{q.answerStrategy.samplePhrasingStart}</p>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceClient() {
  const [cv, setCv] = useState<CvDocument>(EMPTY_CV);
  const hasRestoredRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('cv-helper');

  // Restore from localStorage after mount to avoid SSR/client hydration mismatch
  useEffect(() => {
    let cvRestored = false;
    try {
      const stored = localStorage.getItem('cv-workspace');
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        // Try strict parse first; if it fails (e.g. empty email, work-in-progress CV),
        // fall back to a shape-only check so partial data is never silently dropped.
        const strict = CvDocumentSchema.safeParse(parsed);
        if (strict.success) {
          // Only treat as restored if the CV has meaningful content
          const d = strict.data;
          const hasContent = d.contactInfo.name.trim() !== '' || d.experience.length > 0 || d.skills.length > 0;
          if (hasContent) {
            setCv(d);
            cvRestored = true;
          }
        } else if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const p = parsed as Record<string, unknown>;
          // Check for meaningful content before restoring
          const name = (p.contactInfo as Record<string, unknown> | undefined)?.name;
          const exp = p.experience;
          const skills = p.skills;
          const hasContent =
            (typeof name === 'string' && name.trim() !== '') ||
            (Array.isArray(exp) && exp.length > 0) ||
            (Array.isArray(skills) && skills.length > 0);
          if (hasContent) {
            // Restore directly — we trust our own localStorage; strict validation
            // is only needed when receiving data from the AI parsing service.
            setCv((prev) => ({ ...prev, ...(parsed as Partial<CvDocument>) }));
            cvRestored = true;
          }
        }
      }
    } catch {
      // corrupt storage — ignore
    }
    try {
      const storedName = localStorage.getItem('cv-workspace-filename');
      if (storedName) {
        if (cvRestored) {
          setUploadedFileName(storedName);
        } else {
          // No CV data was restored — remove the stale filename key to keep both
          // keys in sync and prevent the filename chip from showing on an empty CV.
          localStorage.removeItem('cv-workspace-filename');
        }
      }
    } catch {
      // ignore
    }
    try {
      const storedSaves = localStorage.getItem('cv-workspace-saves');
      if (storedSaves) {
        const parsed = JSON.parse(storedSaves) as unknown;
        if (Array.isArray(parsed)) {
          setSavedCvs(parsed as SavedCv[]);
        }
      }
    } catch {
      // corrupt storage — ignore
    }
    hasRestoredRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formPaneRef = useRef<HTMLDivElement>(null);
  const [masterPolished, setMasterPolished] = useState(false);
  const [polishingAll, setPolishingAll] = useState(false);
  const [cvSnapshot, setCvSnapshot] = useState<CvDocument | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreVersion, setScoreVersion] = useState(0);
  const [interviewModalOpen, setInterviewModalOpen] = useState(false);
  const [interviewGenerating, setInterviewGenerating] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState<BatchQuestion[]>([]);
  const [interviewProgressMsg, setInterviewProgressMsg] = useState('');
  const [interviewDone, setInterviewDone] = useState(false);
  const [savedCvs, setSavedCvs] = useState<SavedCv[]>([]);
  const [saveCvModalOpen, setSaveCvModalOpen] = useState(false);
  const [saveCvName, setSaveCvName] = useState('');
  const [saveCvNameError, setSaveCvNameError] = useState('');
  const [selectedCvForInterview, setSelectedCvForInterview] = useState<SavedCv | null>(null);
  const [targetCompany, setTargetCompany] = useState('');
  const [targetTitle, setTargetTitle] = useState('');
  const [targetJobDesc, setTargetJobDesc] = useState('');
  const [expandedDimension, setExpandedDimension] = useState<DimensionKey | null>(null);
  const [activeChatDimension, setActiveChatDimension] = useState<DimensionKey | null>(null);
  const activeChatItemsRef = useRef<import('@cv-helper/shared-types').CvActionItem[]>([]);
  const [openChatFor, setOpenChatFor] = useState<{
    targetField: string;
    meta?: { jobIndex?: number; bulletIndex?: number };
    message: string;
  } | null>(null);
  const { accumulateUsage, resetSessionUsage, sessionCost, inputTokens, outputTokens } = useSessionUsage();
  const score = calculateCvScore(cv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveAudit = useMemo(() => evaluateAndAuditCv(cv), [cv, scoreVersion]);

  const bulletOriginals = useMemo(() => {
    if (!cvSnapshot) return undefined;
    const map = new Map<string, string>();
    cvSnapshot.experience.forEach((exp, ei) => {
      exp.bullets.forEach((b, bi) => map.set(`${ei}-${bi}`, b));
    });
    return map;
  }, [cvSnapshot]);

  useEffect(() => {
    if (!hasRestoredRef.current) return;
    try {
      localStorage.setItem('cv-workspace', JSON.stringify(cv));
    } catch {
      // quota exceeded or private browsing — ignore
    }
  }, [cv]);

  useEffect(() => {
    try {
      if (uploadedFileName) {
        localStorage.setItem('cv-workspace-filename', uploadedFileName);
      } else {
        localStorage.removeItem('cv-workspace-filename');
      }
    } catch {
      // ignore
    }
  }, [uploadedFileName]);

  useEffect(() => {
    try {
      localStorage.setItem('cv-workspace-saves', JSON.stringify(savedCvs));
    } catch {
      // quota exceeded — ignore
    }
  }, [savedCvs]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  function handleSaveCv() {
    const trimmedName = saveCvName.trim();
    if (!trimmedName) {
      setSaveCvNameError('Please enter a name for this CV.');
      return;
    }
    const hasContent =
      cv.contactInfo.name.trim() !== '' ||
      cv.experience.length > 0 ||
      cv.skills.length > 0;
    if (!hasContent) {
      setSaveCvModalOpen(false);
      setSaveCvName('');
      setSaveCvNameError('');
      showToast('error', 'Add some CV content before saving.');
      return;
    }
    const newSave: SavedCv = {
      id: Date.now().toString(),
      name: trimmedName,
      cv,
      savedAt: new Date().toISOString(),
    };
    setSavedCvs((prev) => [newSave, ...prev]);
    setSaveCvModalOpen(false);
    setSaveCvName('');
    setSaveCvNameError('');
    showToast('success', `CV saved as "${trimmedName}"`);
  }

  function handleDeleteSavedCv(id: string) {
    setSavedCvs((prev) => prev.filter((s) => s.id !== id));
    setSelectedCvForInterview((prev) => (prev?.id === id ? null : prev));
  }

  function getSavedCvMeta(saved: SavedCv) {
    const name = saved.cv.contactInfo.name.trim() || '(No name)';
    const skillsCount = saved.cv.skills.length;
    const experienceCount = saved.cv.experience.length;
    const totalYears = saved.cv.experience.reduce((acc, exp) => {
      const startMatch = exp.dates.start?.match(/\b(20\d{2}|19\d{2})\b/);
      const endStr = exp.dates.end ?? '';
      const isPresent = /present|current|now/i.test(endStr);
      const endYear = isPresent ? new Date().getFullYear() : endStr.match(/\b(20\d{2}|19\d{2})\b/)?.[1];
      if (startMatch && endYear) {
        const diff = parseInt(String(endYear), 10) - parseInt(startMatch[1], 10);
        return acc + Math.max(0, diff);
      }
      return acc;
    }, 0);
    return { name, skillsCount, experienceCount, totalYears };
  }

  async function handlePolishAll() {
    setPolishingAll(true);
    setCvSnapshot(cv);

    type Task = { id: string; kind: 'summary' | 'skills' | 'bullet'; expIndex?: number; bulletIndex?: number; text: string; targetField: 'professionalSummary' | 'skills' | 'experienceBullet' };
    const tasks: Task[] = [];

    if (cv.professionalSummary.trim()) {
      tasks.push({ id: 'summary', kind: 'summary', text: cv.professionalSummary, targetField: 'professionalSummary' });
    }
    if (cv.skills.length > 0) {
      tasks.push({ id: 'skills', kind: 'skills', text: cv.skills.join(', '), targetField: 'skills' });
    }
    cv.experience.forEach((exp, ei) => {
      exp.bullets.forEach((bullet, bi) => {
        if (bullet.trim()) {
          tasks.push({ id: `bullet-${ei}-${bi}`, kind: 'bullet', expIndex: ei, bulletIndex: bi, text: bullet, targetField: 'experienceBullet' });
        }
      });
    });

    if (tasks.length === 0) {
      setPolishingAll(false);
      return;
    }

    try {
      const res = await fetch('/api/cv/optimize-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: tasks.map((t) => ({ id: t.id, text: t.text, targetField: t.targetField })) }),
      });

      if (!res.ok) {
        showToast('error', 'Polish failed — please try again');
        setPolishingAll(false);
        setCvSnapshot(null);
        return;
      }

      const data = await res.json() as { results: Array<{ id: string; optimized: string; success: boolean }>; usage: { promptTokens: number; completionTokens: number; modelUsed: string } };
      const resultMap = new Map(data.results.map((r) => [r.id, r]));

      if (data.usage) {
        accumulateUsage(data.usage.promptTokens, data.usage.completionTokens, data.usage.modelUsed);
      }

      setCv((prev) => {
        let next = { ...prev };
        for (const task of tasks) {
          const result = resultMap.get(task.id);
          if (!result?.success) continue;
          if (task.kind === 'summary') {
            next = { ...next, professionalSummary: result.optimized };
          } else if (task.kind === 'skills') {
            const parsed = result.optimized.split(',').map((s) => s.trim()).filter(Boolean);
            next = { ...next, skills: parsed };
          } else if (task.kind === 'bullet' && task.expIndex !== undefined && task.bulletIndex !== undefined) {
            const experience = next.experience.map((exp, ei) => {
              if (ei !== task.expIndex) return exp;
              const bullets = exp.bullets.map((b, bi) => (bi === task.bulletIndex ? result.optimized : b));
              return { ...exp, bullets };
            });
            next = { ...next, experience };
          }
        }
        return next;
      });

      setMasterPolished(true);
      setScoreVersion((prev) => prev + 1);
    } catch {
      showToast('error', 'Network error — Polish Profile failed');
      setCvSnapshot(null);
    } finally {
      setPolishingAll(false);
    }
  }

  function handleResetAll() {
    if (cvSnapshot) {
      setCv(cvSnapshot);
      setCvSnapshot(null);
    }
    setMasterPolished(false);
    resetSessionUsage();
  }

  function handleFocusField(targetField: string, jobIndex?: number, bulletIndex?: number) {
    setScoreOpen(false);
    const selector = bulletIndex !== undefined && jobIndex !== undefined
      ? `[data-field="experience-${jobIndex}-bullet-${bulletIndex}"]`
      : jobIndex !== undefined
      ? `[data-field="experience-${jobIndex}"]`
      : `[data-field="${targetField}"]`;
    // Small delay so the dropdown closes before scroll/focus
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      // Scroll within the overflow container (formPaneRef), not the document viewport
      const pane = formPaneRef.current;
      if (pane) {
        const paneTop = pane.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const offset = elTop - paneTop + pane.scrollTop;
        const center = offset - pane.clientHeight / 2 + el.offsetHeight / 2;
        pane.scrollTo({ top: center, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Focus the element itself if it's an input/textarea, otherwise focus the first input/textarea inside it
      const focusTarget = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
        ? el
        : el.querySelector<HTMLElement>('input, textarea');
      if (focusTarget) {
        focusTarget.focus();
        // Flash a highlight ring so the user sees which field is active
        focusTarget.style.outline = '2px solid #6366f1';
        focusTarget.style.outlineOffset = '2px';
        setTimeout(() => {
          focusTarget.style.outline = '';
          focusTarget.style.outlineOffset = '';
        }, 1500);
      }
    }, 50);
  }

  function handleOpenChatForAction(
    targetField: string,
    meta: { jobIndex?: number; bulletIndex?: number } | undefined,
    message: string,
  ) {
    setOpenChatFor(null); // reset first so useEffect fires even if same message
    handleFocusField(targetField, meta?.jobIndex, meta?.bulletIndex);
    setTimeout(() => {
      setOpenChatFor({ targetField, meta, message });
    }, 300);
  }

  async function handleGenerateInterview() {
    setInterviewModalOpen(false);
    setActiveTab('interview-playbook');
    setInterviewQuestions([]);
    setInterviewDone(false);
    setInterviewProgressMsg('🤖 Preparing Interview Simulation Engine...');
    setInterviewGenerating(true);

    try {
      for (let b = 1; b <= 3; b++) {
        setInterviewProgressMsg(`🔄 Generating Batch ${b} of 3...`);

        const res = await fetch('/api/interview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cvData: selectedCvForInterview?.cv ?? cv,
            targetJob: {
              company: targetCompany.trim() || undefined,
              title: targetTitle.trim() || undefined,
              jobDescription: targetJobDesc.trim() || undefined,
            },
            batchNumber: b,
            questionsPerBatch: 3,
          }),
        });

        if (!res.ok) {
          let errMsg = 'Interview generation failed';
          try {
            const errData = await res.json() as { message?: string; error?: string };
            errMsg = errData.message ?? errData.error ?? errMsg;
          } catch { /* ignore */ }
          setInterviewProgressMsg(`⚠️ Batch ${b} failed: ${errMsg}. Use "Generate More Questions" to retry.`);
          break;
        }

        const data = await res.json() as { questions: BatchQuestion[] };
        setInterviewQuestions((prev) => [...prev, ...data.questions]);
      }

      setInterviewProgressMsg('');
      setInterviewDone(true);
    } catch {
      setInterviewProgressMsg('⚠️ Generation error — use "Generate More Questions" to retry.');
      showToast('error', 'Network error — interview generation failed');
    } finally {
      setInterviewGenerating(false);
    }
  }

  async function handleGenerateMore() {
    if (interviewGenerating) return;
    setInterviewGenerating(true);
    setInterviewProgressMsg('🔄 Generating more questions...');

    const existingQuestions = interviewQuestions.map((q) => q.question);
    const nextBatch = Math.floor(interviewQuestions.length / 3) + 1;

    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cvData: selectedCvForInterview?.cv ?? cv,
          targetJob: {
            company: targetCompany.trim() || undefined,
            title: targetTitle.trim() || undefined,
            jobDescription: targetJobDesc.trim() || undefined,
          },
          batchNumber: nextBatch,
          questionsPerBatch: 3,
          existingQuestions,
        }),
      });

      if (!res.ok) {
        let errMsg = 'Failed to generate more questions';
        try {
          const errData = await res.json() as { message?: string; error?: string };
          errMsg = errData.message ?? errData.error ?? errMsg;
        } catch { /* ignore */ }
        setInterviewProgressMsg(`⚠️ ${errMsg}. Please try again.`);
        return;
      }

      const data = await res.json() as { questions: BatchQuestion[] };
      setInterviewQuestions((prev) => [...prev, ...data.questions]);
      setInterviewProgressMsg('');
    } catch {
      setInterviewProgressMsg('⚠️ Network error — could not generate more questions.');
    } finally {
      setInterviewGenerating(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('cv', file);
      const res = await fetch('/api/cv/upload', { method: 'POST', body: formData });
      const data = await res.json() as CvDocument | { error: string; message: string };
      if (!res.ok) {
        const err = data as { error: string; message: string };
        showToast('error', err.message ?? 'Upload failed');
      } else {
        setCv(data as CvDocument);
        setUploadedFileName(file.name);
        resetSessionUsage();
        setScoreVersion((prev) => prev + 1);
        showToast('success', 'CV imported successfully');
      }
    } catch {
      showToast('error', 'Network error — could not reach the server');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Interview Playbook Modal */}
      {interviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Generate Interview Playbook</h2>
              <button
                type="button"
                onClick={() => setInterviewModalOpen(false)}
                disabled={interviewGenerating}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {selectedCvForInterview
                ? <><span className="font-medium text-indigo-700">Using saved CV: {selectedCvForInterview.name}.</span> Optionally specify the role you're targeting.</>
                : "Optionally specify the role you're targeting. Leave fields blank to generate a general playbook from your CV."
              }
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Company</label>
                <input
                  type="text"
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  disabled={interviewGenerating}
                  placeholder="e.g. Google, Stripe, Airbnb"
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={targetTitle}
                  onChange={(e) => setTargetTitle(e.target.value)}
                  disabled={interviewGenerating}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Job Description</label>
                <textarea
                  rows={4}
                  value={targetJobDesc}
                  onChange={(e) => setTargetJobDesc(e.target.value)}
                  disabled={interviewGenerating}
                  placeholder="Paste the job description here for more targeted questions…"
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setInterviewModalOpen(false)}
                disabled={interviewGenerating}
                className="px-4 py-2 text-sm font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateInterview}
                disabled={interviewGenerating}
                className="px-4 py-2 text-sm font-medium rounded border border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {interviewGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : 'Launch AI Simulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saveCvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Save CV</h2>
              <button type="button" onClick={() => setSaveCvModalOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CV Name</label>
              <input
                type="text"
                value={saveCvName}
                autoFocus
                onChange={(e) => { setSaveCvName(e.target.value); setSaveCvNameError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCv();
                  if (e.key === 'Escape') setSaveCvModalOpen(false);
                }}
                placeholder="e.g. Software Engineer — Google"
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              {saveCvNameError && <p className="text-xs text-red-600 mt-1">{saveCvNameError}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setSaveCvModalOpen(false)} className="px-4 py-2 text-sm font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="button" onClick={handleSaveCv} className="px-4 py-2 text-sm font-medium rounded border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar — app name + tab navigation only */}
      <header className="no-print sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight text-gray-900">CV Helper</h1>
        {/* Tab navigation */}
        <nav className="flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={() => setActiveTab('cv-helper')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'cv-helper'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            CV Helper
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('interview-playbook')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'interview-playbook'
                ? 'bg-indigo-600 text-white'
                : 'text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            ✨ Interview Playbook
          </button>
        </nav>
        <div className="flex-1" />
        <span className="text-xs font-mono text-gray-400 tabular-nums">
          📊 {inputTokens.toLocaleString()}↑ {outputTokens.toLocaleString()}↓ ${sessionCost.toFixed(4)}
        </span>
      </header>

      {/* Body — tab-switched */}
      {activeTab === 'cv-helper' ? (
        /* CV Helper: inner toolbar + split-screen */
        <div className="flex flex-col h-[calc(100vh-53px)]">
          {/* CV Helper toolbar */}
          <div className="no-print shrink-0 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3">
            {uploadedFileName && (
              <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-2 py-0.5 font-mono truncate max-w-xs" title={uploadedFileName}>
                📄 {uploadedFileName}
              </span>
            )}
            <div className="flex-1" />
            <div className="relative">              <button
                type="button"
                onClick={() => setScoreOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  Math.round((score.totalScore / 170) * 100) >= 80
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : Math.round((score.totalScore / 170) * 100) >= 50
                    ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
                    : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                }`}
              >
                <span className="opacity-70 font-medium">CV Strength</span>
                <span className="text-sm font-bold tabular-nums">{Math.round((score.totalScore / 170) * 100)}</span>
                <span className="opacity-60">/ 100</span>
                <span className="ml-0.5">{scoreOpen ? '▾' : '▸'}</span>
              </button>
              {scoreOpen && (
                <div className="absolute right-0 top-full mt-2 z-50">
                  <ScoreBreakdown
                    breakdown={score.breakdown}
                    actions={liveAudit.actions}
                    expandedDimension={expandedDimension}
                    activeChatDimension={activeChatDimension}
                    onToggleExpand={(dim) => setExpandedDimension((prev) => (prev === dim ? null : dim))}
                    onStartChat={(dim) => {
                      activeChatItemsRef.current = liveAudit.actions.filter(DIMENSION_CONFIG[dim].filter);
                      setActiveChatDimension(dim);
                    }}
                    onCloseChat={() => setActiveChatDimension(null)}
                    onFocusField={handleFocusField}
                    onOpenChat={handleOpenChatForAction}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setSaveCvName(''); setSaveCvNameError(''); setSaveCvModalOpen(true); }}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              💾 Save CV
            </button>
            {masterPolished ? (
              <button
                type="button"
                onClick={handleResetAll}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ↩ Reset All to Draft
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePolishAll}
                disabled={polishingAll}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
              >
                {polishingAll ? 'Polishing…' : '✦ Polish Profile with AI'}
              </button>
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors">
              {uploading ? 'Importing…' : 'Import CV'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
            <CVPreviewRenderer cv={cv} mode="download" />
          </div>
          {/* Split-screen panes */}
          <div className="flex flex-1 min-h-0">
        {/* Left: scrollable forms */}
        <div ref={formPaneRef} className="no-print w-1/2 overflow-y-auto p-6 space-y-4 border-r border-gray-200 bg-white">
          <CvActionPlan
            actions={
              score.breakdown.accomplishmentDensity >= 40
                ? liveAudit.actions.filter((a) => !/Consider adding a specific metric/i.test(a.message))
                : liveAudit.actions
            }
            onFocusField={handleFocusField}
          />
          <DroppedContentAudit
            entries={cv.droppedContentAudit ?? []}
            currentSkills={cv.skills}
            currentSummary={cv.professionalSummary}
            onAppendToSkills={(text) => setCv((prev) => ({ ...prev, skills: [...prev.skills, text] }))}
            onAppendToSummary={(text) => setCv((prev) => ({ ...prev, professionalSummary: prev.professionalSummary ? prev.professionalSummary + '\n\n' + text : text }))}
            onRemoveFromSkills={(text) => setCv((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== text) }))}
            onRemoveFromSummary={(text) => setCv((prev) => ({ ...prev, professionalSummary: prev.professionalSummary.replace('\n\n' + text, '').replace(text, '').trimEnd() }))}
            onAppendToExperience={(text) => console.log('[WorkspaceClient] onAppendToExperience called — manual review needed:', text.slice(0, 80))}
            onRemoveFromExperience={(text) => console.log('[WorkspaceClient] onRemoveFromExperience called:', text.slice(0, 80))}
          />
          <ContactForm
            value={cv.contactInfo}
            onChange={(contactInfo) => setCv((prev) => ({ ...prev, contactInfo }))}
            headline={cv.headline ?? ''}
            tagline={cv.tagline ?? ''}
            onHeadlineChange={(headline) => setCv((prev) => ({ ...prev, headline }))}
            onTaglineChange={(tagline) => setCv((prev) => ({ ...prev, tagline }))}
          />
          <div data-field="professionalSummary">
            <SummaryForm
              value={cv.professionalSummary}
              onChange={(professionalSummary) => setCv((prev) => ({ ...prev, professionalSummary }))}
              onUsage={(i, o, m) => accumulateUsage(i, o, m)}
              onAppendToSkills={(items) =>
                setCv((prev) => ({
                  ...prev,
                  skills: [...prev.skills, ...items.filter((s) => !prev.skills.includes(s))],
                }))
              }
              onAppendToExperience={(items) =>
                setCv((prev) => {
                  if (prev.experience.length === 0) return prev;
                  return {
                    ...prev,
                    experience: prev.experience.map((exp, i) =>
                      i !== 0 ? exp : { ...exp, bullets: [...items, ...exp.bullets] },
                    ),
                  };
                })
              }
              cvContext={{
                skills: cv.skills,
                jobTitles: cv.experience.map((e) => e.role),
              }}
              isPolishedExternally={masterPolished}
              originalValueExternal={cvSnapshot?.professionalSummary}
              initialChatMessage={
                openChatFor?.targetField === 'professionalSummary' && openChatFor.meta?.jobIndex === undefined
                  ? openChatFor.message
                  : undefined
              }
            />
          </div>
          <div data-field="skills">
            <SkillsForm
              value={cv.skills}
              onChange={(skills) => setCv((prev) => ({ ...prev, skills }))}
              onUsage={(i, o, m) => accumulateUsage(i, o, m)}
              isPolishedExternally={masterPolished}
              originalValueExternal={cvSnapshot?.skills.join(', ')}
            />
          </div>
          <div data-field="professionalExperience">
            <ExperienceForm
              value={cv.experience}
              onChange={(experience) => setCv((prev) => ({ ...prev, experience }))}
              onUsage={(i, o, m) => accumulateUsage(i, o, m)}
              masterPolished={masterPolished}
              bulletOriginals={bulletOriginals}
              openChatForBullet={
                openChatFor?.targetField === 'professionalExperience' &&
                openChatFor.meta?.jobIndex !== undefined &&
                openChatFor.meta?.bulletIndex !== undefined
                  ? {
                      jobIndex: openChatFor.meta.jobIndex,
                      bulletIndex: openChatFor.meta.bulletIndex,
                      message: openChatFor.message,
                    }
                  : null
              }
            />
          </div>
          <EducationForm
            value={cv.education}
            onChange={(education) => setCv((prev) => ({ ...prev, education }))}
          />
        </div>

        {/* Right: live preview or AI chat */}
        <div className="no-print w-1/2 overflow-y-auto bg-gray-100 flex justify-center py-8">
          {activeChatDimension && DIMENSION_CONFIG[activeChatDimension]?.fixType === 'sparkle' ? (
            <div className="w-full max-w-lg px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">
                  AI Coach — {DIMENSION_CONFIG[activeChatDimension].label}
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveChatDimension(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕ Close
                </button>
              </div>
              <DimensionChat
                dimension={activeChatDimension}
                fixType="sparkle"
                items={activeChatItemsRef.current}
                cv={cv}
                onApplyFix={(updater) => { setCv(updater); }}
                onUsage={accumulateUsage}
                onDone={() => {
                  setScoreVersion((prev) => prev + 1);
                }}
                onClose={() => setActiveChatDimension(null)}
              />
            </div>
          ) : (
            <PrintPreview cv={cv} />
          )}
        </div>
        </div>
      </div>
      ) : (
        /* Interview Playbook page */
        <div className="h-[calc(100vh-53px)] overflow-y-auto bg-gray-50">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Header row */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Interview Playbook</h2>
                {(targetTitle || targetCompany) && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[targetTitle, targetCompany].filter(Boolean).join(' at ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {interviewDone && (
                  <button
                    type="button"
                    onClick={handleGenerateMore}
                    disabled={interviewGenerating}
                    className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                  >
                    {interviewGenerating ? '⏳ Generating…' : '✦ Generate More Questions'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInterviewModalOpen(true)}
                  disabled={interviewGenerating || Math.round((liveAudit.totalScore / 170) * 100) < 30}
                  title={Math.round((liveAudit.totalScore / 170) * 100) < 30 ? 'Achieve a profile score of 30% or higher to unlock interview preparation tools.' : 'Generate a new playbook'}
                  className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded border border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {interviewQuestions.length === 0 ? '🚀 Launch AI Simulation' : '🔄 New Playbook'}
                </button>
              </div>
            </div>

            {/* Saved CVs Panel */}
            {savedCvs.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Your Saved CVs</h3>
                  <span className="text-xs text-gray-400">{savedCvs.length} saved</span>
                </div>
                <div className="space-y-2">
                  {savedCvs.map((saved) => {
                    const meta = getSavedCvMeta(saved);
                    const isSelected = selectedCvForInterview?.id === saved.id;
                    return (
                      <div
                        key={saved.id}
                        className={`rounded-xl border px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
                            : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                        }`}
                        onClick={() => setSelectedCvForInterview(isSelected ? null : saved)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {isSelected ? '✓' : '📄'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{saved.name}</p>
                            <p className="text-xs text-gray-500">
                              {meta.name}
                              {meta.experienceCount > 0 && ` · ${meta.experienceCount} role${meta.experienceCount !== 1 ? 's' : ''}`}
                              {meta.totalYears > 0 && ` · ~${meta.totalYears} yr${meta.totalYears !== 1 ? 's' : ''}`}
                              {meta.skillsCount > 0 && ` · ${meta.skillsCount} skill${meta.skillsCount !== 1 ? 's' : ''}`}
                            </p>
                            <p className="text-[0.65rem] text-gray-400 mt-0.5">Saved {new Date(saved.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSavedCv(saved.id); }}
                          className="ml-3 flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors text-sm"
                          title="Remove saved CV"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
                {selectedCvForInterview && (
                  <p className="mt-2 text-xs text-indigo-600 font-medium">
                    Using <span className="font-bold">{selectedCvForInterview.name}</span> for interview generation. Click the card to deselect and use the editor CV.
                  </p>
                )}
              </div>
            )}

            {/* Progress / error message */}
            {interviewProgressMsg && (
              <p className="text-sm text-gray-500 italic mb-4">{interviewProgressMsg}</p>
            )}

            {/* Empty state */}
            {!interviewGenerating && interviewQuestions.length === 0 && !interviewProgressMsg && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
                <p className="text-3xl mb-3">🎯</p>
                <p className="text-base font-semibold text-gray-800 mb-1">Ready to practice?</p>
                <p className="text-sm text-gray-500 mb-5">Click "Launch AI Simulation" to generate a personalised interview playbook based on your CV.</p>
                <button
                  type="button"
                  onClick={() => setInterviewModalOpen(true)}
                  disabled={Math.round((liveAudit.totalScore / 170) * 100) < 30}
                  title={Math.round((liveAudit.totalScore / 170) * 100) < 30 ? 'Achieve a profile score of 30% or higher to unlock interview preparation tools.' : undefined}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg border border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  🚀 Launch AI Simulation
                </button>
              </div>
            )}

            {/* Questions */}
            <div className="space-y-4">
              {interviewQuestions.map((q, i) => (
                <QuestionCard key={q.id} q={q} num={i + 1} />
              ))}
            </div>

            {/* Generate more (bottom) */}
            {interviewDone && interviewQuestions.length > 0 && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={handleGenerateMore}
                  disabled={interviewGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                >
                  {interviewGenerating ? '⏳ Generating…' : '✦ Generate More Questions'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
