import type { Analysis } from "@/lib/analysis-schema";
import { plural } from "@/lib/plural";
import { CoverLetter } from "./CoverLetter";
import { Keywords } from "./Keywords";
import { MatchScore } from "./MatchScore";
import { RedFlags } from "./RedFlags";
import { Requirements, RequirementsLegend } from "./Requirements";
import { Section } from "./Section";

export function ResultsView({ analysis, hasResume }: { analysis: Analysis; hasResume: boolean }) {
  const { requirements, redFlags, atsKeywords, match, coverLetter } = analysis;
  const serious = redFlags.filter((flag) => flag.severity === "high").length;

  return (
    <article aria-labelledby="result-title">
      <h2
        id="result-title"
        tabIndex={-1}
        className="mb-8 max-w-[32ch] text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink focus:outline-none sm:text-[28px]"
      >
        {analysis.vacancyTitle}
      </h2>

      {match && (
        <Section title="Совпадение с резюме">
          <MatchScore match={match} />
        </Section>
      )}

      <Section
        title="Красные флаги"
        aside={
          redFlags.length > 0
            ? `${redFlags.length} ${plural(redFlags.length, ["флаг", "флага", "флагов"])}${serious ? `, серьёзных: ${serious}` : ""}`
            : undefined
        }
      >
        <RedFlags flags={redFlags} />
      </Section>

      <Section title="Требования" aside={hasResume ? <RequirementsLegend /> : undefined}>
        <Requirements
          mustHave={requirements.mustHave}
          niceToHave={requirements.niceToHave}
          hasResume={hasResume}
        />
      </Section>

      <Section title="Ключевые слова для ATS" aside="Используйте их в резюме дословно">
        <Keywords keywords={atsKeywords} />
      </Section>

      <Section title="Сопроводительное письмо" aside={hasResume ? "Черновик" : "Черновик, без резюме — с пометками"}>
        <CoverLetter text={coverLetter} />
      </Section>
    </article>
  );
}
