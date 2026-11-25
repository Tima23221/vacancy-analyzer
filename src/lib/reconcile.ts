import type { Analysis, Gap, RawAnalysis, Requirement } from "./analysis-schema";

/*
  The model fills requirement statuses and the "Не хватает" list in one pass and
  sometimes contradicts itself (e.g. "от 3 лет" marked met while gaps say
  "2 года вместо 3"). These rules make the two views agree:

  1. A requirement referenced by any gap can't be "met" → it becomes "partial".
  2. A must-have that is "partial" or "missing" but absent from gaps is added
     to gaps, so the summary never hides a hole the list shows.
*/

const MAX_GAPS = 8;

const STOP_WORDS = new Set([
  "или", "для", "нет", "без", "при", "как", "что", "это", "его", "так", "все", "уже", "только",
  "and", "the", "with", "for", "not", "from",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}+#/]+/gu, " ")
    .trim();
}

/** Crude stemming that works well enough for Russian and English: word prefixes. */
function stems(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((word) => (word.length >= 3 || /\d/.test(word)) && !STOP_WORDS.has(word))
      .map((word) => word.slice(0, 4)),
  );
}

function similarity(a: string, b: string): { shared: number; ratio: number } {
  const sa = stems(a);
  const sb = stems(b);
  if (sa.size === 0 || sb.size === 0) return { shared: 0, ratio: 0 };
  let shared = 0;
  for (const s of sa) if (sb.has(s)) shared++;
  return { shared, ratio: shared / Math.min(sa.size, sb.size) };
}

function findRequirement(gap: Gap, requirements: Requirement[]): Requirement | undefined {
  // Preferred: the model echoed the requirement text.
  if (gap.requirement) {
    const target = normalize(gap.requirement);
    const exact = requirements.find((r) => normalize(r.text) === target);
    if (exact) return exact;
    const best = bestMatch(gap.requirement, requirements, 0.6, 1);
    if (best) return best;
  }
  // Fallback: the gap text itself is clearly about one requirement.
  return bestMatch(gap.text, requirements, 0.6, 2);
}

function bestMatch(
  text: string,
  requirements: Requirement[],
  minRatio: number,
  minShared: number,
): Requirement | undefined {
  let best: Requirement | undefined;
  let bestRatio = 0;
  for (const requirement of requirements) {
    const { shared, ratio } = similarity(text, requirement.text);
    if (shared >= minShared && ratio >= minRatio && ratio > bestRatio) {
      best = requirement;
      bestRatio = ratio;
    }
  }
  return best;
}

export function reconcileAnalysis(raw: RawAnalysis, hasResume: boolean): Analysis {
  const mustHave = raw.requirements.mustHave.map((r) => ({ ...r }));
  const niceToHave = raw.requirements.niceToHave.map((r) => ({ ...r }));

  if (!hasResume || !raw.match) {
    const unknown = (r: Requirement) => ({ ...r, status: hasResume ? r.status : ("unknown" as const) });
    return {
      ...raw,
      requirements: { mustHave: mustHave.map(unknown), niceToHave: niceToHave.map(unknown) },
      match: null,
    };
  }

  const all = [...mustHave, ...niceToHave];
  const covered = new Set<Requirement>();

  // Rule 1: anything listed as a gap is at best partially met.
  for (const gap of raw.match.gaps) {
    const requirement = findRequirement(gap, all);
    if (!requirement) continue;
    covered.add(requirement);
    if (requirement.status === "met" || requirement.status === "unknown") {
      requirement.status = "partial";
    }
  }

  // Rule 2: unmet must-haves must show up in gaps.
  const gaps = raw.match.gaps.map((gap) => gap.text);
  for (const requirement of mustHave) {
    if (gaps.length >= MAX_GAPS) break;
    if (covered.has(requirement)) continue;
    if (requirement.status === "partial") gaps.push(`${requirement.text}: выполнено частично`);
    if (requirement.status === "missing") gaps.push(`${requirement.text}: нет в резюме`);
  }

  return {
    ...raw,
    requirements: { mustHave, niceToHave },
    match: { ...raw.match, gaps },
  };
}
