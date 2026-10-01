import { z } from 'zod';

export const ContactInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().email(),
  location: z.string().nullable().optional(),
  linkedIn: z.string().url().nullable().optional(),
});

export const DatesSchema = z.object({
  start: z.string().min(1),
  end: z.string().nullable().optional(),
});

export const ExperienceSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  location: z.string().nullable().optional(),
  dates: DatesSchema,
  bullets: z.array(z.string().min(1)).min(1),
});

export const EducationSchema = z.object({
  school: z.string().min(1),
  degree: z.string().min(1),
  major: z.string().nullable().optional(),
  graduationYear: z.number().int().nullable().optional(),
});

export const DroppedContentAuditEntrySchema = z.object({
  sectionTitle: z.string().min(1),
  rawContentText: z.string().min(1),
  analysis: z.object({
    status: z.enum(['integrated', 'missing']),
    matchedLocation: z.string().optional(),
    suggestedTargetField: z.enum(['professionalSummary', 'skills', 'professionalExperience']).optional(),
    justification: z.string(),
  }),
});

export const CvActionItemSchema = z.object({
  id: z.string(),
  message: z.string(),
  impactPoints: z.number(),
  priority: z.enum(['high', 'medium', 'low']),
  targetField: z.enum(['professionalSummary', 'skills', 'professionalExperience', 'headline', 'tagline', 'location']),
  meta: z.object({
    jobIndex: z.number().optional(),
    bulletIndex: z.number().optional(),
    topLevelField: z.enum(['headline', 'tagline', 'location']).optional(),
  }).optional(),
});

export const CvScoreAuditSchema = z.object({
  totalScore: z.number().default(0),
  breakdown: z.object({
    accomplishmentDensity: z.number().default(0),
    completeness: z.number().default(0),
    scannability: z.number().default(0),
    grammarConsistency: z.number().default(0),
    contactCompleteness: z.number().default(0),
    verbQuality: z.number().default(0),
    writingClarity: z.number().default(0),
    dateConsistency: z.number().default(0),
    skillDepth: z.number().default(0),
    atsScore: z.number().default(0),
  }).default({}),
  actions: z.array(CvActionItemSchema).default([]),
});

export const CvDocumentSchema = z.object({
  contactInfo: ContactInfoSchema,
  headline: z.string().nullable().optional().default(''),
  tagline: z.string().nullable().optional().default(''),
  professionalSummary: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  droppedContentAudit: z.array(DroppedContentAuditEntrySchema).default([]),
  scoreAudit: CvScoreAuditSchema.optional(),
});

export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type Dates = z.infer<typeof DatesSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type DroppedContentAuditEntry = z.infer<typeof DroppedContentAuditEntrySchema>;
export type CvDocument = z.infer<typeof CvDocumentSchema>;
export type CvActionItem = z.infer<typeof CvActionItemSchema>;
export type CvScoreAudit = z.infer<typeof CvScoreAuditSchema>;
