import { CvDocument, CvScoreAudit, CvActionItem } from '@cv-helper/shared-types';

const METRIC_PATTERN = /\d|%|\b(hundreds|thousands|millions|billions|dozens|several|multiple|numerous|significantly|substantially|dramatically|measurably|exponentially|\d+x)\b/i;

const QUALITATIVE_OUTCOME_PATTERN = /\b(enabling|resulting in|led to|leading to|allowing|ensuring|so that)\b|\b(improved|reduced|increased|accelerated|streamlined|eliminated|enhanced|optimized|simplified|enabled|delivered|established|transformed|unlocked|stabilized|modernized|consolidated|standardized|automated|strengthened|unified)\b|\b(reliability|stability|scalability|performance|efficiency|uptime|latency|throughput|quality|adoption|retention|revenue|insight|visibility|maintainability|observability)\b/i;

function bulletTier(text: string): 'metric' | 'qualitative' | 'task' {
  if (METRIC_PATTERN.test(text)) return 'metric';
  if (QUALITATIVE_OUTCOME_PATTERN.test(text)) return 'qualitative';
  return 'task';
}

export interface CvScoreResult {
  totalScore: number;
  breakdown: {
    accomplishmentDensity: number;
    completeness: number;
    scannability: number;
    grammarConsistency: number;
    contactCompleteness: number;   // max 10
    verbQuality: number;           // max 10
    writingClarity: number;        // max 8
    dateConsistency: number;       // max 8
    skillDepth: number;            // max 4
    atsScore: number;              // max 10
    tierAPercent: number;          // % of bullets with concrete metrics
    tierBPercent: number;          // % of bullets with qualitative outcomes
    tierCPercent: number;          // % of task-only bullets
  };
}

export function calculateCvScore(cvData: CvDocument): CvScoreResult {
  // 1. Accomplishment Density (max 40)
  // Tier A (metric) + Tier B (qualitative outcome) = full credit; Tier C (task-only) = 0
  const allBullets = cvData.experience.flatMap((entry) => entry.bullets);
  const totalBullets = allBullets.length;
  const tierACount = allBullets.filter((b) => bulletTier(b) === 'metric').length;
  const tierBCount = allBullets.filter((b) => bulletTier(b) === 'qualitative').length;
  const tierCCount = totalBullets - tierACount - tierBCount;
  const accomplishmentDensity =
    totalBullets === 0 ? 0 : Math.round(((tierACount + tierBCount) / totalBullets) * 40);
  const pct = (n: number) => totalBullets === 0 ? 0 : Math.round((n / totalBullets) * 100);
  const tierAPercent = pct(tierACount);
  const tierBPercent = pct(tierBCount);
  const tierCPercent = pct(tierCCount);

  // 2. Structural Completeness (max 30)
  let completeness = 0;
  if (cvData.professionalSummary && cvData.professionalSummary.length > 50) {
    completeness += 10;
  }
  if (cvData.skills.length > 0) {
    completeness += 10;
  }
  if (cvData.experience.length >= 2) {
    completeness += 10;
  }

  // 3. Brevity & Scannability (max 30)
  let scannability = 0;
  if (totalBullets > 0) {
    scannability = 30;
    for (const bullet of allBullets) {
      const wordCount = bullet.trim().split(/\s+/).length;
      if (wordCount > 30) {
        scannability -= 2;
      }
    }
    if (scannability < 0) {
      scannability = 0;
    }
  }

  // 4. Grammar & Consistency Audit (max 20)
  let grammarDeductions = 0;

  // Check 1: Duplicate consecutive words
  const dupRegex = /\b(\w+)\s+\1\b/gi;
  const textsForDup: string[] = [...allBullets];
  if (cvData.professionalSummary) {
    textsForDup.push(cvData.professionalSummary);
  }
  for (const text of textsForDup) {
    const matches = text.match(dupRegex);
    if (matches) {
      grammarDeductions += matches.length * 3;
    }
  }

  // Check 2: Unclosed brackets/parens
  const textsForBrackets: string[] = [...allBullets, ...cvData.skills];
  for (const text of textsForBrackets) {
    const stack: string[] = [];
    for (const ch of text) {
      if (ch === '(' || ch === '[') {
        stack.push(ch);
      } else if (ch === ')') {
        if (stack.length > 0 && stack[stack.length - 1] === '(') {
          stack.pop();
        } else {
          grammarDeductions += 4;
        }
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        } else {
          grammarDeductions += 4;
        }
      }
    }
    grammarDeductions += stack.length * 4;
  }

  // Check 3: End-mark consistency
  const nonEmptyBullets = allBullets.filter((b) => b.trim().length > 0);
  if (nonEmptyBullets.length > 0) {
    const endsWithPeriod = nonEmptyBullets.filter((b) => b.trimEnd().endsWith('.')).length;
    const noEndPeriod = nonEmptyBullets.length - endsWithPeriod;
    if (endsWithPeriod > 0 && noEndPeriod > 0) {
      grammarDeductions += 2;
    }
  }

  // Check 4: Passive openers
  const passiveRegex = /^(responsible for|tasked with|helped with|assisted in)\b/i;
  for (const bullet of allBullets) {
    if (passiveRegex.test(bullet.trim())) {
      grammarDeductions += 2;
    }
  }

  const hasContent = allBullets.length > 0 || (cvData.professionalSummary?.trim().length ?? 0) > 0;
  const grammarConsistency = hasContent ? Math.max(0, 20 - grammarDeductions) : 0;

  // 5. Contact Completeness (max 10)
  let contactCompleteness = 0;
  if (cvData.contactInfo.name?.trim()) contactCompleteness += 2;
  if (cvData.contactInfo.email?.trim()) contactCompleteness += 2;
  // phone: presence tracked in actions, not scored
  if (/linkedin\.com\/in\//i.test(cvData.contactInfo.linkedIn ?? '')) contactCompleteness += 2;
  if (cvData.headline?.trim()) contactCompleteness += 2;
  if (cvData.tagline?.trim()) contactCompleteness += 1;
  const locationRawFast = cvData.contactInfo.location?.trim() ?? '';
  if (locationRawFast && !locationRawFast.includes(',')) contactCompleteness += 1;

  // 6. Verb Quality (max 10)
  let verbQuality = 0;
  if (allBullets.length > 0) {
    verbQuality = 10;
    const weakVerbRegex = /^(worked on|involved in|supported|contributed to|participated in)\b/i;
    // Count verb repetition across all bullets
    const verbCounts = new Map<string, number>();
    for (const bullet of allBullets) {
      const firstWord = bullet.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      if (firstWord) {
        verbCounts.set(firstWord, (verbCounts.get(firstWord) ?? 0) + 1);
      }
    }
    for (const count of verbCounts.values()) {
      if (count > 2) {
        verbQuality -= 2;
      }
    }
    // Weak verb deductions
    for (const bullet of allBullets) {
      if (weakVerbRegex.test(bullet.trim())) {
        verbQuality -= 2;
      }
    }
    verbQuality = Math.max(0, verbQuality);
  }

  // 7. Writing Clarity (max 8)
  let writingClarity = 0;
  const hasSummaryOrBullets = (cvData.professionalSummary?.trim().length ?? 0) > 0 || allBullets.length > 0;
  if (hasSummaryOrBullets) {
    writingClarity = 8;
    const pronounRegex = /\b(I|my|we|our|myself)\b/g;
    let pronounDeduction = 0;
    // Check bullets
    for (const bullet of allBullets) {
      if (pronounRegex.test(bullet)) {
        pronounDeduction += 2;
        if (pronounDeduction >= 4) { pronounDeduction = 4; break; }
      }
      pronounRegex.lastIndex = 0;
    }
    // Check summary if deduction not yet maxed
    if (pronounDeduction < 4 && cvData.professionalSummary) {
      pronounRegex.lastIndex = 0;
      if (pronounRegex.test(cvData.professionalSummary)) {
        pronounDeduction = Math.min(4, pronounDeduction + 2);
      }
    }
    writingClarity -= pronounDeduction;
    // Filler buzzwords in summary (max deduction 4)
    const buzzwordRegex = /\b(hardworking|team player|passionate about|results.driven|go.getter|self.starter|detail.oriented)\b/gi;
    if (cvData.professionalSummary) {
      const buzzMatches = cvData.professionalSummary.match(buzzwordRegex);
      if (buzzMatches) {
        writingClarity -= Math.min(4, buzzMatches.length);
      }
    }
    writingClarity = Math.max(0, writingClarity);
  }

  // 8. Date Consistency (max 8)
  let dateConsistency = 0;
  const allDates: string[] = [];
  for (const exp of cvData.experience) {
    if (exp.dates.start) allDates.push(exp.dates.start);
    if (exp.dates.end) allDates.push(exp.dates.end);
  }
  const nonEmptyDates = allDates.filter((d) => d.trim().length > 0);
  if (nonEmptyDates.length > 0) {
    const isPresentSentinel = (d: string) => /^(present|now|current|ongoing|today)$/i.test(d.trim());
    const classifyDate = (d: string): string => {
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/i.test(d)) return 'month-year';
      if (/^\d{4}$/.test(d)) return 'year-only';
      if (/^\d{4}[-\/]\d{2}$/.test(d)) return 'year-month';
      return 'other';
    };
    const formatTypes = new Set(nonEmptyDates.filter((d) => !isPresentSentinel(d)).map(classifyDate));
    if (formatTypes.size <= 1) dateConsistency = 8;
    else if (formatTypes.size === 2) dateConsistency = 4;
    else dateConsistency = 0;
  }

  // 9. Skill Depth (max 4)
  let skillDepth = 0;
  const meaningfulSkills = cvData.skills.filter((s) => s.length > 1);
  if (meaningfulSkills.length >= 8) skillDepth = 4;
  else if (meaningfulSkills.length >= 4) skillDepth = 2;
  else skillDepth = 0;

  // 10. ATS Compatibility (max 10)
  let atsScore = 0;
  const isCompletelyEmpty =
    allBullets.length === 0 &&
    cvData.skills.length === 0 &&
    cvData.experience.length === 0 &&
    !cvData.contactInfo.name?.trim();

  if (!isCompletelyEmpty) {
    // Check A: Strong action verb presence (up to +4)
    const strongVerbRegex = /^(built|designed|led|developed|implemented|architected|delivered|launched|drove|managed|created|optimized|reduced|increased|improved|automated|migrated|deployed|scaled|engineered|spearheaded|streamlined|established|transformed|negotiated|secured|generated|achieved|executed|coordinated|directed|mentored|recruited|trained|analyzed|researched|identified|resolved|fixed|debugged|refactored|integrated|configured|monitored|maintained)\b/i;
    if (allBullets.length > 0) {
      const strongCount = allBullets.filter((b) => strongVerbRegex.test(b.trim())).length;
      const strongPct = strongCount / allBullets.length;
      if (strongPct >= 0.7) atsScore += 4;
      else if (strongPct >= 0.4) atsScore += 2;
    }

    // Check B: Section header recognizability (up to +3)
    if (cvData.experience.length > 0 && cvData.experience.some((e) => e.role?.trim())) atsScore += 1;
    if (cvData.education.length > 0) atsScore += 1;
    if (cvData.skills.length > 0) atsScore += 1;

    // Check C: Contact info ATS-parseable (up to +3)
    const consumerDomainRegex = /@(hotmail|yahoo|aol|msn|live)\./i;
    if (cvData.contactInfo.email?.trim() && !consumerDomainRegex.test(cvData.contactInfo.email)) atsScore += 1;
    const nameWords = (cvData.contactInfo.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (nameWords.length >= 2) atsScore += 1;
    if ((cvData.contactInfo.linkedIn ?? '').startsWith('https://')) atsScore += 1;

    atsScore = Math.max(0, atsScore);
  }

  const totalScore =
    accomplishmentDensity +
    completeness +
    scannability +
    grammarConsistency +
    contactCompleteness +
    verbQuality +
    writingClarity +
    dateConsistency +
    skillDepth +
    atsScore;

  return {
    totalScore,
    breakdown: {
      accomplishmentDensity,
      completeness,
      scannability,
      grammarConsistency,
      contactCompleteness,
      verbQuality,
      writingClarity,
      dateConsistency,
      skillDepth,
      atsScore,
      tierAPercent,
      tierBPercent,
      tierCPercent,
    },
  };
}

export function evaluateAndAuditCv(cvData: CvDocument): CvScoreAudit {
  let idCounter = 0;
  const actions: CvActionItem[] = [];

  // 1. Accomplishment Density (max 40)
  const allBullets = cvData.experience.flatMap((exp, ji) =>
    exp.bullets.map((b, bi) => ({ text: b, jobIndex: ji, bulletIndex: bi })),
  );
  const totalBullets = allBullets.length;
  let accomplishmentDensity = 0;

  if (totalBullets > 0) {
    const tierA = allBullets.filter((b) => bulletTier(b.text) === 'metric');
    const tierB = allBullets.filter((b) => bulletTier(b.text) === 'qualitative');
    const tierC = allBullets.filter((b) => bulletTier(b.text) === 'task');

    // Score: Tier A + Tier B = full credit (both express an accomplishment); Tier C = 0
    accomplishmentDensity = Math.round(((tierA.length + tierB.length) / totalBullets) * 40);

    // Always flag Tier C — pure task descriptions with no stated outcome
    for (const bullet of tierC) {
      actions.push({
        id: `action-${idCounter++}`,
        message: 'Add a concrete result or business impact to this bullet — what improved, what was delivered, or what outcome did this enable?',
        impactPoints: 5,
        priority: 'high',
        targetField: 'professionalExperience',
        meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
      });
    }

    // Flag ALL Tier B bullets — adding a metric upgrades them to full credit
    for (const bullet of tierB) {
      actions.push({
        id: `action-${idCounter++}`,
        message: 'Consider adding a specific metric to quantify this impact (e.g. "40% faster", "3 hours/week saved", "serving 10k users").',
        impactPoints: 3,
        priority: 'medium',
        targetField: 'professionalExperience',
        meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
      });
    }
  }

  // 2. Structural Completeness (max 30)
  let completeness = 0;

  if (!cvData.professionalSummary || cvData.professionalSummary.length <= 50) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Draft an executive professional summary to hook recruiter attention.',
      impactPoints: 10,
      priority: 'high',
      targetField: 'professionalSummary',
      meta: undefined,
    });
  } else {
    completeness += 10;
  }

  if (cvData.skills.length === 0) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Add your core technical skills and tool stack to pass ATS filters.',
      impactPoints: 10,
      priority: 'medium',
      targetField: 'skills',
      meta: undefined,
    });
  } else {
    completeness += 10;
  }

  if (cvData.experience.length < 2) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Add at least two job entries to demonstrate career progression.',
      impactPoints: 10,
      priority: 'medium',
      targetField: 'professionalExperience',
      meta: undefined,
    });
  } else {
    completeness += 10;
  }

  // 3. Brevity & Scannability (max 30)
  let scannability = 0;

  if (totalBullets > 0) {
    scannability = 30;
    for (const bullet of allBullets) {
      const wordCount = bullet.text.trim().split(/\s+/).length;
      if (wordCount > 30) {
        scannability -= 3;
        actions.push({
          id: `action-${idCounter++}`,
          message:
            'Shorten this over-length bullet point to keep it concise, punchy, and scannable (under 25 words).',
          impactPoints: 2,
          priority: 'medium',
          targetField: 'professionalExperience',
          meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
        });
      }
    }
    scannability = Math.max(0, scannability);
  }

  // 4. Spelling, Grammar, and Consistency Audit (max 20)
  let grammarDeductions = 0;

  // Check 1: Duplicate consecutive words (deduct 3 per match)
  const dupRegex = /\b(\w+)\s+\1\b/gi;

  for (const bullet of allBullets) {
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    dupRegex.lastIndex = 0;
    while ((m = dupRegex.exec(bullet.text)) !== null) {
      matches.push(m);
    }
    for (const match of matches) {
      grammarDeductions += 3;
      actions.push({
        id: `action-${idCounter++}`,
        message: `Grammar Typo: Found duplicate consecutive word '${match[1]}'. Clean this duplicate string to keep your phrasing crisp.`,
        impactPoints: 3,
        priority: 'high',
        targetField: 'professionalExperience',
        meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
      });
    }
  }

  if (cvData.professionalSummary) {
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    dupRegex.lastIndex = 0;
    while ((m = dupRegex.exec(cvData.professionalSummary)) !== null) {
      matches.push(m);
    }
    for (const match of matches) {
      grammarDeductions += 3;
      actions.push({
        id: `action-${idCounter++}`,
        message: `Grammar Typo: Found duplicate consecutive word '${match[1]}'. Clean this duplicate string to keep your phrasing crisp.`,
        impactPoints: 3,
        priority: 'high',
        targetField: 'professionalSummary',
        meta: undefined,
      });
    }
  }

  // Check 2: Unclosed brackets/parens (deduct 4 per mismatch)
  const checkBrackets = (text: string): number => {
    const stack: string[] = [];
    let mismatches = 0;
    for (const ch of text) {
      if (ch === '(' || ch === '[') {
        stack.push(ch);
      } else if (ch === ')') {
        if (stack.length > 0 && stack[stack.length - 1] === '(') {
          stack.pop();
        } else {
          mismatches++;
        }
      } else if (ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === '[') {
          stack.pop();
        } else {
          mismatches++;
        }
      }
    }
    return mismatches + stack.length;
  };

  for (const bullet of allBullets) {
    const mismatches = checkBrackets(bullet.text);
    for (let i = 0; i < mismatches; i++) {
      grammarDeductions += 4;
      actions.push({
        id: `action-${idCounter++}`,
        message:
          'Formatting Syntax: Detected an unclosed parenthesis or bracket. Fix your brackets layout to ensure clean parseability.',
        impactPoints: 4,
        priority: 'high',
        targetField: 'professionalExperience',
        meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
      });
    }
  }

  for (const skill of cvData.skills) {
    const mismatches = checkBrackets(skill);
    for (let i = 0; i < mismatches; i++) {
      grammarDeductions += 4;
      actions.push({
        id: `action-${idCounter++}`,
        message:
          'Formatting Syntax: Detected an unclosed parenthesis or bracket. Fix your brackets layout to ensure clean parseability.',
        impactPoints: 4,
        priority: 'high',
        targetField: 'skills',
        meta: undefined,
      });
    }
  }

  // Check 3: End-mark consistency (deduct 2 once if mixed)
  const nonEmptyBullets = allBullets.filter((b) => b.text.trim().length > 0);
  if (nonEmptyBullets.length > 0) {
    const endsWithPeriod = nonEmptyBullets.filter((b) => b.text.trimEnd().endsWith('.')).length;
    const noEndPeriod = nonEmptyBullets.length - endsWithPeriod;
    if (endsWithPeriod > 0 && noEndPeriod > 0) {
      grammarDeductions += 2;
      actions.push({
        id: `action-${idCounter++}`,
        message:
          'Stylistic Consistency: Your bullet points have inconsistent ending punctuation. Ensure all bullets either end with a period or remain uniformly open.',
        impactPoints: 2,
        priority: 'low',
        targetField: 'professionalExperience',
        meta: undefined,
      });
    }
  }

  // Check 4: Passive openers (deduct 2 per match)
  const passiveRegex = /^(responsible for|tasked with|helped with|assisted in)\b/i;
  for (const bullet of allBullets) {
    if (passiveRegex.test(bullet.text.trim())) {
      grammarDeductions += 2;
      actions.push({
        id: `action-${idCounter++}`,
        message:
          "Action-Oriented Phrasing: Replace passive phrases like 'Responsible for' with a strong, definitive action verb (e.g., 'Spearheaded', 'Optimized', 'Architected') to emphasize personal ownership.",
        impactPoints: 2,
        priority: 'medium',
        targetField: 'professionalExperience',
        meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
      });
    }
  }

  const hasGrammarContent = allBullets.length > 0 || (cvData.professionalSummary?.trim().length ?? 0) > 0;
  const grammarConsistency = hasGrammarContent ? Math.max(0, 20 - grammarDeductions) : 0;

  // 5. Contact Completeness (max 10)
  let contactCompleteness = 0;
  if (!cvData.contactInfo.name?.trim()) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add your full name to the top of your CV — it is the first thing recruiters and ATS systems look for.',
      impactPoints: 2,
      priority: 'high',
      targetField: 'professionalSummary',
      meta: undefined,
    });
  } else {
    contactCompleteness += 2;
  }
  if (!cvData.contactInfo.email?.trim()) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add a professional email address — required by all ATS systems to create a candidate profile.',
      impactPoints: 2,
      priority: 'high',
      targetField: 'professionalSummary',
      meta: undefined,
    });
  } else {
    contactCompleteness += 2;
  }
  if (!cvData.contactInfo.phone?.trim()) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add a phone number — many recruiters call before emailing.',
      impactPoints: 0,
      priority: 'medium',
      targetField: 'professionalSummary',
      meta: undefined,
    });
  }
  if (!/linkedin\.com\/in\//i.test(cvData.contactInfo.linkedIn ?? '')) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add your LinkedIn profile URL — missing LinkedIn is flagged as a red flag by Greenhouse and Lever ATS parsers.',
      impactPoints: 2,
      priority: 'medium',
      targetField: 'professionalSummary',
      meta: undefined,
    });
  } else {
    contactCompleteness += 2;
  }
  const locationVal = cvData.contactInfo.location?.trim() ?? '';
  if (!locationVal) {
    // no action for missing location — optional field
  } else if (locationVal.includes(',')) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Your location includes a city ("' + locationVal + '") — country only is preferred (e.g. "Israel"). Use the AI fix to clean it up.',
      impactPoints: 1,
      priority: 'low',
      targetField: 'location',
      meta: { topLevelField: 'location' as const },
    });
  } else {
    contactCompleteness += 1;
  }
  if (!cvData.headline?.trim()) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add a professional headline (e.g. "Senior Software Engineer") below your name — it immediately signals your seniority level to recruiters.',
      impactPoints: 2,
      priority: 'medium',
      targetField: 'headline',
      meta: { topLevelField: 'headline' as const },
    });
  } else {
    contactCompleteness += 2;
  }
  if (!cvData.tagline?.trim()) {
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Contact Info: Add a tagline listing your core expertise areas (e.g. "Distributed Systems | Cloud Platforms | AI") — it gives recruiters an instant skills overview.',
      impactPoints: 1,
      priority: 'low',
      targetField: 'tagline',
      meta: { topLevelField: 'tagline' as const },
    });
  } else {
    contactCompleteness += 1;
  }

  // 6. Verb Quality (max 10)
  let verbQuality = 0;
  if (allBullets.length > 0) {
    verbQuality = 10;
    const weakVerbRegex = /^(worked on|involved in|supported|contributed to|participated in)\b/i;
    // Verb repetition: deduct 2 for each unique verb appearing >2× across all bullets
    const verbCounts = new Map<string, number>();
    for (const bullet of allBullets) {
      const firstWord = bullet.text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      if (firstWord) {
        verbCounts.set(firstWord, (verbCounts.get(firstWord) ?? 0) + 1);
      }
    }
    for (const [verb, count] of verbCounts) {
      if (count > 2) {
        verbQuality -= 2;
        const verbBullets = allBullets.filter(
          (b) => b.text.trim().split(/\s+/)[0]?.toLowerCase() === verb,
        );
        for (const vb of verbBullets) {
          actions.push({
            id: `action-${idCounter++}`,
            message: `Verb Repetition: The action verb "${verb}" is used ${count} times across your bullets. Diversify with a stronger alternative to show a broader range of contributions.`,
            impactPoints: 2,
            priority: 'low',
            targetField: 'professionalExperience',
            meta: { jobIndex: vb.jobIndex, bulletIndex: vb.bulletIndex },
          });
        }
      }
    }
    // Weak verb deductions
    for (const bullet of allBullets) {
      if (weakVerbRegex.test(bullet.text.trim())) {
        verbQuality -= 2;
        actions.push({
          id: `action-${idCounter++}`,
          message: 'Weak Verb: Replace vague openers like "Worked on" or "Contributed to" with a strong action verb (e.g., "Engineered", "Delivered", "Scaled") to show ownership.',
          impactPoints: 2,
          priority: 'medium',
          targetField: 'professionalExperience',
          meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
        });
      }
    }
    verbQuality = Math.max(0, verbQuality);
  }

  // 7. Writing Clarity (max 8)
  let writingClarity = 0;
  const hasSummaryOrBullets = (cvData.professionalSummary?.trim().length ?? 0) > 0 || allBullets.length > 0;
  if (hasSummaryOrBullets) {
    writingClarity = 8;
    const pronounRegex = /\b(I|my|we|our|myself)\b/g;
    let pronounDeduction = 0;
    // Check bullets
    for (const bullet of allBullets) {
      pronounRegex.lastIndex = 0;
      if (pronounRegex.test(bullet.text)) {
        pronounDeduction += 2;
        actions.push({
          id: `action-${idCounter++}`,
          message: 'Personal Pronoun: Remove "I", "my", "we", or "our" — CV bullets must use implied first person (start directly with the verb).',
          impactPoints: 2,
          priority: 'high',
          targetField: 'professionalExperience',
          meta: { jobIndex: bullet.jobIndex, bulletIndex: bullet.bulletIndex },
        });
        if (pronounDeduction >= 4) break;
      }
    }
    // Check summary if deduction not yet maxed
    if (pronounDeduction < 4 && cvData.professionalSummary) {
      pronounRegex.lastIndex = 0;
      if (pronounRegex.test(cvData.professionalSummary)) {
        pronounDeduction = Math.min(4, pronounDeduction + 2);
        actions.push({
          id: `action-${idCounter++}`,
          message: 'Personal Pronoun: Remove "I", "my", "we", or "our" — CV bullets must use implied first person (start directly with the verb).',
          impactPoints: 2,
          priority: 'high',
          targetField: 'professionalSummary',
          meta: undefined,
        });
      }
    }
    writingClarity -= pronounDeduction;
    // Filler buzzwords in summary (max deduction 4)
    const buzzwordRegex = /\b(hardworking|team player|passionate about|results.driven|go.getter|self.starter|detail.oriented)\b/gi;
    if (cvData.professionalSummary) {
      const buzzMatches = cvData.professionalSummary.match(buzzwordRegex);
      if (buzzMatches) {
        const buzzDeduction = Math.min(4, buzzMatches.length);
        writingClarity -= buzzDeduction;
        for (let i = 0; i < buzzDeduction; i++) {
          actions.push({
            id: `action-${idCounter++}`,
            message: 'Filler Buzzword: Replace vague terms like "hardworking" or "passionate about" with a concrete, evidence-backed statement that demonstrates that quality.',
            impactPoints: 1,
            priority: 'medium',
            targetField: 'professionalSummary',
            meta: undefined,
          });
        }
      }
    }
    writingClarity = Math.max(0, writingClarity);
  }

  // 8. Date Consistency (max 8)
  let dateConsistency = 0;
  const allDates: string[] = [];
  for (const exp of cvData.experience) {
    if (exp.dates.start) allDates.push(exp.dates.start);
    if (exp.dates.end) allDates.push(exp.dates.end);
  }
  const nonEmptyDates = allDates.filter((d) => d.trim().length > 0);
  if (nonEmptyDates.length > 0) {
    const isPresentSentinel = (d: string) => /^(present|now|current|ongoing|today)$/i.test(d.trim());
    const classifyDate = (d: string): string => {
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}$/i.test(d)) return 'month-year';
      if (/^\d{4}$/.test(d)) return 'year-only';
      if (/^\d{4}[-\/]\d{2}$/.test(d)) return 'year-month';
      return 'other';
    };
    const formatTypes = new Set(nonEmptyDates.filter((d) => !isPresentSentinel(d)).map(classifyDate));
    if (formatTypes.size <= 1) {
      dateConsistency = 8;
    } else if (formatTypes.size === 2) {
      dateConsistency = 4;
      actions.push({
        id: `action-${idCounter++}`,
        message: 'Date Format Inconsistency: Your experience dates use mixed formats (e.g., "Jan 2020" and "2020-01"). Standardise all dates to one format — inconsistent dates confuse ATS field parsers.',
        impactPoints: 4,
        priority: 'medium',
        targetField: 'professionalExperience',
        meta: undefined,
      });
    } else {
      dateConsistency = 0;
      actions.push({
        id: `action-${idCounter++}`,
        message: 'Date Format Inconsistency: Your experience dates use mixed formats (e.g., "Jan 2020" and "2020-01"). Standardise all dates to one format — inconsistent dates confuse ATS field parsers.',
        impactPoints: 4,
        priority: 'medium',
        targetField: 'professionalExperience',
        meta: undefined,
      });
    }
  }

  // 9. Skill Depth (max 4)
  let skillDepth = 0;
  const meaningfulSkills = cvData.skills.filter((s) => s.length > 1);
  if (meaningfulSkills.length >= 8) {
    skillDepth = 4;
  } else if (meaningfulSkills.length >= 4) {
    skillDepth = 2;
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Skill Depth: Expand your skills section to 8+ terms — tools, frameworks, languages, and platforms all count and improve ATS keyword matching.',
      impactPoints: 2,
      priority: 'medium',
      targetField: 'skills',
      meta: undefined,
    });
  } else if (cvData.skills.length > 0) {
    skillDepth = 0;
    actions.push({
      id: `action-${idCounter++}`,
      message: 'Skill Depth: Add more specific technical skills — ATS systems rank candidates higher when the skills section contains 8+ distinct, relevant terms.',
      impactPoints: 4,
      priority: 'high',
      targetField: 'skills',
      meta: undefined,
    });
  }

  // 10. ATS Compatibility (max 10)
  let atsScore = 0;
  const isCompletelyEmpty =
    allBullets.length === 0 &&
    cvData.skills.length === 0 &&
    cvData.experience.length === 0 &&
    !cvData.contactInfo.name?.trim();

  if (!isCompletelyEmpty) {
    const strongVerbRegex = /^(built|designed|led|developed|implemented|architected|delivered|launched|drove|managed|created|optimized|reduced|increased|improved|automated|migrated|deployed|scaled|engineered|spearheaded|streamlined|established|transformed|negotiated|secured|generated|achieved|executed|coordinated|directed|mentored|recruited|trained|analyzed|researched|identified|resolved|fixed|debugged|refactored|integrated|configured|monitored|maintained)\b/i;

    // Check A: Strong action verb presence (up to +4)
    let strongPct = 0;
    if (allBullets.length > 0) {
      const strongCount = allBullets.filter((b) => strongVerbRegex.test(b.text.trim())).length;
      strongPct = strongCount / allBullets.length;
      if (strongPct >= 0.7) atsScore += 4;
      else if (strongPct >= 0.4) atsScore += 2;
    }

    // Check B: Section header recognizability (up to +3)
    if (cvData.experience.length > 0 && cvData.experience.some((e) => e.role?.trim())) atsScore += 1;
    if (cvData.education.length > 0) atsScore += 1;
    if (cvData.skills.length > 0) atsScore += 1;

    // Check C: Contact info ATS-parseable (up to +3)
    const consumerDomainRegex = /@(hotmail|yahoo|aol|msn|live)\./i;
    const emailIsConsumer = !!(cvData.contactInfo.email?.trim() && consumerDomainRegex.test(cvData.contactInfo.email));
    if (cvData.contactInfo.email?.trim() && !emailIsConsumer) atsScore += 1;
    const nameWords = (cvData.contactInfo.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (nameWords.length >= 2) atsScore += 1;
    if ((cvData.contactInfo.linkedIn ?? '').startsWith('https://')) atsScore += 1;

    atsScore = Math.max(0, atsScore);

    // Action items
    if (allBullets.length > 0 && strongPct < 0.7) {
      const weakAtsBullets = allBullets.filter((b) => !strongVerbRegex.test(b.text.trim()));
      for (const wb of weakAtsBullets) {
        actions.push({
          id: `action-${idCounter++}`,
          message:
            'ATS Compatibility: This bullet does not start with a strong action verb. Rewrite it to begin with a clear, active verb like "Built", "Delivered", or "Optimized" to improve ATS scoring.',
          impactPoints: 2,
          priority: 'high',
          targetField: 'professionalExperience',
          meta: { jobIndex: wb.jobIndex, bulletIndex: wb.bulletIndex },
        });
      }
    }

    if (cvData.education.length === 0) {
      actions.push({
        id: `action-${idCounter++}`,
        message: 'ATS Compatibility: Add an Education section — ATS systems expect standard sections and will score your profile lower without it.',
        impactPoints: 1,
        priority: 'low',
        targetField: 'professionalSummary',
        meta: undefined,
      });
    }

    if (emailIsConsumer) {
      actions.push({
        id: `action-${idCounter++}`,
        message: 'ATS Compatibility: Replace your consumer email (Hotmail, Yahoo, AOL) with a professional address (Gmail or custom domain) — consumer domains are flagged as unprofessional by ATS filters.',
        impactPoints: 1,
        priority: 'medium',
        targetField: 'professionalSummary',
        meta: undefined,
      });
    }

    if (nameWords.length < 2) {
      actions.push({
        id: `action-${idCounter++}`,
        message: 'ATS Compatibility: Use your full name (first and last) — ATS systems expect a two-part name to create a complete candidate profile.',
        impactPoints: 1,
        priority: 'medium',
        targetField: 'professionalSummary',
        meta: undefined,
      });
    }
  }

  return {
    totalScore: accomplishmentDensity + completeness + scannability + grammarConsistency + contactCompleteness + verbQuality + writingClarity + dateConsistency + skillDepth + atsScore,
    breakdown: { accomplishmentDensity, completeness, scannability, grammarConsistency, contactCompleteness, verbQuality, writingClarity, dateConsistency, skillDepth, atsScore },
    actions,
  };
}
