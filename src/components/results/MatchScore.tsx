import { Check, Minus } from "lucide-react";
import type { Analysis } from "@/lib/analysis-schema";

type Match = NonNullable<Analysis["match"]>;

function verdict(score: number) {
  if (score >= 80) return "Сильное совпадение";
  if (score >= 60) return "Хорошее совпадение, есть пробелы";
  if (score >= 40) return "Частичное совпадение";
  return "Слабое совпадение";
}

export function MatchScore({ match }: { match: Match }) {
  const { score } = match;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="leading-none" aria-label={`Совпадение с резюме: ${score} процентов`}>
          <span className="text-[88px] font-semibold tracking-[-0.045em] tabular-nums text-ink sm:text-[104px]">
            {score}
          </span>
          <span className="ml-1 text-[32px] font-medium text-muted">%</span>
        </p>
        <p className="pb-4 text-[15px] font-medium text-ink-soft">{verdict(score)}</p>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="score-fill absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${score}%` }}
        />
        {[40, 60, 80].map((tick) => (
          <span
            key={tick}
            className="absolute inset-y-0 w-px bg-paper"
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted tabular-nums" aria-hidden>
        <span>0</span>
        <span>100</span>
      </div>

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">{match.summary}</p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ScoreList title="Совпадает" items={match.strengths} tone="good" />
        <ScoreList title="Не хватает" items={match.gaps} tone="gap" />
      </div>
    </div>
  );
}

function ScoreList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "gap" }) {
  if (items.length === 0) return null;
  const Icon = tone === "good" ? Check : Minus;
  return (
    <div>
      <h4 className="mb-2 text-[13px] font-semibold text-muted">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[15px] leading-snug text-ink">
            <Icon
              aria-hidden
              className={`mt-[3px] size-4 shrink-0 ${tone === "good" ? "text-accent" : "text-danger"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
