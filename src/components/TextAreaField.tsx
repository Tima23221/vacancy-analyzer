"use client";

import { useId, type ReactNode } from "react";

type Props = {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  rows: number;
  action?: ReactNode;
  required?: boolean;
};

const formatter = new Intl.NumberFormat("ru-RU");

export function TextAreaField({
  label,
  hint,
  value,
  onChange,
  maxLength,
  placeholder,
  rows,
  action,
  required,
}: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const counterId = `${id}-counter`;
  const ratio = value.length / maxLength;
  const counterTone =
    ratio >= 1 ? "text-danger" : ratio > 0.9 ? "text-warn" : "text-muted";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-semibold text-ink">
          {label}
          {!required && <span className="ml-1.5 font-normal text-muted">необязательно</span>}
        </label>
        {action}
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        required={required}
        aria-describedby={`${hintId} ${counterId}`}
        className="block w-full resize-y rounded-[10px] border border-line-strong bg-field px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-muted/80 transition-colors hover:border-ink/40 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30"
      />
      <div className="mt-1.5 flex justify-between gap-3 text-[13px]">
        <span id={hintId} className="text-muted">
          {hint}
        </span>
        <span id={counterId} className={`shrink-0 tabular-nums ${counterTone}`} aria-live="polite">
          {formatter.format(value.length)} / {formatter.format(maxLength)}
        </span>
      </div>
    </div>
  );
}
