const rules = new Intl.PluralRules("ru-RU");

/** plural(5, ["слово", "слова", "слов"]) → "слов" */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const rule = rules.select(n);
  return rule === "one" ? one : rule === "few" ? few : many;
}
