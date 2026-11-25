import {
  Building2,
  Clock,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { FlagCategory, FlagSeverity, RedFlag } from "@/lib/analysis-schema";

const CATEGORY: Record<FlagCategory, { icon: typeof MapPin; label: string }> = {
  location: { icon: MapPin, label: "Локация" },
  work_format: { icon: Building2, label: "Формат работы" },
  grade: { icon: TrendingUp, label: "Грейд" },
  salary: { icon: Wallet, label: "Зарплата" },
  overtime: { icon: Clock, label: "Нагрузка" },
  other: { icon: TriangleAlert, label: "Другое" },
};

const SEVERITY: Record<FlagSeverity, { bar: string; text: string; wash: string; label: string }> = {
  high: { bar: "bg-danger", text: "text-danger", wash: "bg-danger-wash", label: "Серьёзно" },
  medium: { bar: "bg-warn", text: "text-warn", wash: "bg-warn-wash", label: "Уточнить" },
  low: { bar: "bg-line-strong", text: "text-muted", wash: "bg-line/60", label: "Мелочь" },
};

const ORDER: FlagSeverity[] = ["high", "medium", "low"];

export function RedFlags({ flags }: { flags: RedFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[15px] text-ink-soft">
        <ShieldCheck aria-hidden className="size-5 text-accent" />
        Явных красных флагов не нашлось.
      </p>
    );
  }

  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

  return (
    <ul className="divide-y divide-line border-y border-line">
      {sorted.map((flag, index) => {
        const category = CATEGORY[flag.category];
        const severity = SEVERITY[flag.severity];
        const Icon = category.icon;
        return (
          <li
            key={`${flag.title}-${index}`}
            className="relative py-4 pl-5"
          >
            <span aria-hidden className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-full ${severity.bar}`} />
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${severity.wash} ${severity.text}`}>
                {severity.label}
              </span>
              <span className="inline-flex items-center gap-1 text-muted">
                <Icon aria-hidden className="size-3.5" />
                {category.label}
              </span>
            </div>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{flag.title}</p>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{flag.reason}</p>
          </li>
        );
      })}
    </ul>
  );
}
