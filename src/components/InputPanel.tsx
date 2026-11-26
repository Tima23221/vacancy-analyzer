"use client";

import { FileText, LoaderCircle, Sparkle } from "lucide-react";
import type { FormEvent } from "react";
import { plural } from "@/lib/plural";
import { RESUME_MAX_CHARS, VACANCY_MAX_CHARS, VACANCY_MIN_CHARS } from "@/lib/limits";
import { TextAreaField } from "./TextAreaField";

type Props = {
  vacancy: string;
  resume: string;
  onVacancyChange: (value: string) => void;
  onResumeChange: (value: string) => void;
  onSubmit: () => void;
  onInsertSample: () => void;
  onInsertSampleResume: () => void;
  loading: boolean;
};

export function InputPanel({
  vacancy,
  resume,
  onVacancyChange,
  onResumeChange,
  onSubmit,
  onInsertSample,
  onInsertSampleResume,
  loading,
}: Props) {
  const missing = VACANCY_MIN_CHARS - vacancy.trim().length;
  const tooShort = missing > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!tooShort && !loading) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" aria-label="Данные для разбора">
      <TextAreaField
        label="Вакансия"
        required
        value={vacancy}
        onChange={onVacancyChange}
        maxLength={VACANCY_MAX_CHARS}
        rows={12}
        placeholder="Скопируйте сюда описание вакансии целиком: обязанности, требования, условия."
        hint={`Минимум ${VACANCY_MIN_CHARS} символов.`}
        action={
          <button type="button" onClick={onInsertSample} className="link-button">
            <FileText aria-hidden className="size-3.5" />
            Вставить пример
          </button>
        }
      />

      <TextAreaField
        label="Резюме"
        value={resume}
        onChange={onResumeChange}
        maxLength={RESUME_MAX_CHARS}
        rows={8}
        placeholder="Опыт, навыки, результаты. Без резюме не будет процента совпадения."
        hint="Нужно для процента совпадения и письма с конкретикой."
        action={
          <button type="button" onClick={onInsertSampleResume} className="link-button">
            <FileText aria-hidden className="size-3.5" />
            Пример резюме
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={tooShort || loading}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-ink-soft"
        >
          {loading ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Sparkle aria-hidden className="size-4" />
          )}
          {loading ? "Разбираем…" : "Разобрать"}
        </button>
        <span className="text-[13px] text-muted">
          {tooShort && vacancy.length > 0
            ? `Ещё ${missing} ${plural(missing, ["символ", "символа", "символов"])} до минимума.`
            : "Обычно до 30 секунд, при нагрузке на Gemini — дольше."}
        </span>
      </div>
    </form>
  );
}
