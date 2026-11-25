import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { RESUME_MAX_CHARS, VACANCY_MAX_CHARS, VACANCY_MIN_CHARS } from "./limits";

/* ---------- Request ---------- */

export const analyzeRequestSchema = z.object({
  vacancy: z
    .string()
    .trim()
    .min(VACANCY_MIN_CHARS, `Текст вакансии слишком короткий — нужно хотя бы ${VACANCY_MIN_CHARS} символов.`)
    .max(VACANCY_MAX_CHARS, `Текст вакансии длиннее ${VACANCY_MAX_CHARS} символов — сократите его.`),
  resume: z
    .string()
    .trim()
    .max(RESUME_MAX_CHARS, `Текст резюме длиннее ${RESUME_MAX_CHARS} символов — сократите его.`)
    .optional()
    .default(""),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

/* ---------- Model response (validated on the server) ---------- */

export const FLAG_CATEGORIES = [
  "location",
  "work_format",
  "grade",
  "salary",
  "overtime",
  "other",
] as const;

export const FLAG_SEVERITIES = ["high", "medium", "low"] as const;
export const REQUIREMENT_STATUSES = ["met", "partial", "missing", "unknown"] as const;

const requirementSchema = z.object({
  text: z.string().trim().min(1),
  status: z.enum(REQUIREMENT_STATUSES).catch("unknown"),
});

const redFlagSchema = z.object({
  category: z.enum(FLAG_CATEGORIES).catch("other"),
  severity: z.enum(FLAG_SEVERITIES).catch("medium"),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

const matchSchema = z.object({
  score: z.coerce.number().min(0).max(100).transform(Math.round),
  summary: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).max(8),
  // Each gap points at the requirement it concerns, so the server can keep
  // requirement statuses and the gap list consistent (see reconcile.ts).
  gaps: z
    .array(
      z.union([
        z.string().trim().min(1).transform((text) => ({ text, requirement: "" })),
        z.object({
          text: z.string().trim().min(1),
          requirement: z.string().trim().optional().default(""),
        }),
      ]),
    )
    .max(8),
});

/** Model output as validated by zod, before reconcileAnalysis(). */
export const rawAnalysisSchema = z.object({
  vacancyTitle: z.string().trim().min(1),
  language: z.string().trim().min(2),
  requirements: z.object({
    mustHave: z.array(requirementSchema).max(20),
    niceToHave: z.array(requirementSchema).max(20),
  }),
  atsKeywords: z
    .array(z.string().trim().min(1))
    .min(5)
    // The model sometimes returns a couple extra — trim rather than fail.
    .transform((list) => Array.from(new Set(list)).slice(0, 20)),
  redFlags: z.array(redFlagSchema).max(12),
  match: matchSchema.nullable().optional(),
  coverLetter: z.string().trim().min(1),
});

export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;
export type Gap = NonNullable<RawAnalysis["match"]>["gaps"][number];

/** What the API returns to the UI. */
export type Match = Omit<NonNullable<RawAnalysis["match"]>, "gaps"> & { gaps: string[] };
export type Analysis = Omit<RawAnalysis, "match"> & { match: Match | null };
export type Requirement = z.infer<typeof requirementSchema>;
export type RedFlag = z.infer<typeof redFlagSchema>;
export type FlagCategory = (typeof FLAG_CATEGORIES)[number];
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/* ---------- Same contract for Gemini structured output ---------- */

const stringList = (description: string): Schema => ({
  type: Type.ARRAY,
  description,
  items: { type: Type.STRING },
});

const requirementList = (description: string): Schema => ({
  type: Type.ARRAY,
  description,
  items: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "Требование одной короткой фразой" },
      status: {
        type: Type.STRING,
        enum: [...REQUIREMENT_STATUSES],
        description:
          "Соответствие резюме: met / partial / missing. Если резюме не передано — unknown.",
      },
    },
    required: ["text", "status"],
    propertyOrdering: ["text", "status"],
  },
});

export const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    vacancyTitle: { type: Type.STRING, description: "Название позиции и компания, если указана" },
    language: { type: Type.STRING, description: "ISO-код языка вакансии: ru, en, …" },
    requirements: {
      type: Type.OBJECT,
      properties: {
        mustHave: requirementList("Обязательные требования"),
        niceToHave: requirementList("Желательные требования (плюсом будет, nice to have)"),
      },
      required: ["mustHave", "niceToHave"],
      propertyOrdering: ["mustHave", "niceToHave"],
    },
    atsKeywords: stringList("10–20 ключевых слов и фраз для ATS"),
    redFlags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: [...FLAG_CATEGORIES] },
          severity: { type: Type.STRING, enum: [...FLAG_SEVERITIES] },
          title: { type: Type.STRING, description: "Суть флага, до 8 слов" },
          reason: { type: Type.STRING, description: "Почему это важно кандидату, 1 предложение" },
        },
        required: ["category", "severity", "title", "reason"],
        propertyOrdering: ["category", "severity", "title", "reason"],
      },
    },
    match: {
      type: Type.OBJECT,
      nullable: true,
      description: "Только если передано резюме, иначе null",
      properties: {
        score: { type: Type.INTEGER, description: "0–100" },
        summary: { type: Type.STRING, description: "1–2 предложения" },
        strengths: stringList("Что совпадает, до 5 пунктов"),
        gaps: {
          type: Type.ARRAY,
          description: "Чего не хватает, до 5 пунктов",
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING, description: "Чего не хватает" },
              requirement: {
                type: Type.STRING,
                description: "Дословный текст связанного требования или пустая строка",
              },
            },
            required: ["text", "requirement"],
            propertyOrdering: ["text", "requirement"],
          },
        },
      },
      required: ["score", "summary", "strengths", "gaps"],
      propertyOrdering: ["score", "summary", "strengths", "gaps"],
    },
    coverLetter: { type: Type.STRING, description: "Сопроводительное письмо до 120 слов на языке вакансии" },
  },
  required: ["vacancyTitle", "language", "requirements", "atsKeywords", "redFlags", "match", "coverLetter"],
  propertyOrdering: [
    "vacancyTitle",
    "language",
    "requirements",
    "atsKeywords",
    "redFlags",
    "match",
    "coverLetter",
  ],
};
