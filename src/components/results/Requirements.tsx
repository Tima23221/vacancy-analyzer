import { CircleCheck, CircleDashed, CircleX, Dot } from "lucide-react";
import type { Requirement, RequirementStatus } from "@/lib/analysis-schema";

const STATUS: Record<
  RequirementStatus,
  { icon: typeof CircleCheck; className: string; label: string }
> = {
  met: { icon: CircleCheck, className: "text-accent", label: "есть в резюме" },
  partial: { icon: CircleDashed, className: "text-warn", label: "частично" },
  missing: { icon: CircleX, className: "text-danger", label: "нет в резюме" },
  unknown: { icon: Dot, className: "text-muted", label: "" },
};

export function Requirements({
  mustHave,
  niceToHave,
  hasResume,
}: {
  mustHave: Requirement[];
  niceToHave: Requirement[];
  hasResume: boolean;
}) {
  return (
    <div className="grid gap-x-10 gap-y-7 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <RequirementList title="Обязательные" items={mustHave} hasResume={hasResume} />
      <RequirementList title="Желательные" items={niceToHave} hasResume={hasResume} />
    </div>
  );
}

function RequirementList({
  title,
  items,
  hasResume,
}: {
  title: string;
  items: Requirement[];
  hasResume: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-semibold text-muted">
        {title}
        <span className="font-normal tabular-nums">{items.length}</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-[15px] text-muted">В вакансии не указаны.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const status = hasResume ? item.status : "unknown";
            const { icon: Icon, className, label } = STATUS[status];
            return (
              <li key={item.text} className="flex gap-2.5 text-[15px] leading-snug text-ink">
                <Icon
                  aria-hidden
                  className={`mt-[2px] size-[18px] shrink-0 ${className} ${status === "unknown" ? "scale-150" : ""}`}
                />
                <span>
                  {item.text}
                  {label && <span className="sr-only"> — {label}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RequirementsLegend() {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {(["met", "partial", "missing"] as const).map((key) => {
        const { icon: Icon, className, label } = STATUS[key];
        return (
          <span key={key} className="inline-flex items-center gap-1">
            <Icon aria-hidden className={`size-3.5 ${className}`} />
            {label}
          </span>
        );
      })}
    </span>
  );
}
