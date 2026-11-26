import { FileText, RotateCcw, TriangleAlert } from "lucide-react";

const WHAT_YOU_GET = [
  "Обязательные и желательные требования — отдельно",
  "10–20 ключевых слов, которые ищет ATS",
  "Красные флаги: локация, формат, грейд, зарплата, переработки",
  "Процент совпадения с вашим резюме",
  "Черновик сопроводительного письма до 120 слов",
];

export function EmptyState({ onInsertSample }: { onInsertSample: () => void }) {
  return (
    <div className="lg:pt-2">
      <h2 className="max-w-[22ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        Здесь появится разбор вакансии
      </h2>
      <ul className="mt-6 space-y-2.5 text-[15px] text-ink-soft">
        {WHAT_YOU_GET.map((item) => (
          <li key={item} className="flex gap-3">
            <span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-line-strong" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onInsertSample}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-ink/80 px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <FileText aria-hidden className="size-4" />
          Вставить пример вакансии
        </button>
        <span className="text-[13px] text-muted">Product Manager, удалёнка</span>
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-wash/60 p-5">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-danger">
        <TriangleAlert aria-hidden className="size-[18px]" />
        Разбор не получился
      </p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/70 px-4 text-[14px] font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        <RotateCcw aria-hidden className="size-4" />
        Повторить
      </button>
    </div>
  );
}

function Bar({ className, width }: { className: string; width?: number }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-line/80 ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

export function ResultsSkeleton({ withScore }: { withScore: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Разбираем вакансию, обычно это занимает до 30 секунд.</span>
      <Bar className="h-7 w-2/3" />
      {withScore && (
        <div className="mt-8">
          <Bar className="h-20 w-40" />
          <Bar className="mt-4 h-2.5 w-full rounded-full" />
        </div>
      )}
      <div className="mt-10 space-y-3">
        <Bar className="h-5 w-32" />
        <Bar className="h-[76px] w-full rounded-lg" />
        <Bar className="h-[76px] w-full rounded-lg" />
      </div>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2.5">
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-4/6" />
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-2">
        {[64, 96, 80, 112, 72, 88, 60, 104].map((w) => (
          <Bar key={w} className="h-7" width={w} />
        ))}
      </div>
    </div>
  );
}
