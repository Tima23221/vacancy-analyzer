export function Keywords({ keywords }: { keywords: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Ключевые слова для ATS">
      {keywords.map((keyword) => (
        <li
          key={keyword}
          className="rounded-md border border-accent/25 bg-accent-wash px-2.5 py-1 text-[14px] font-medium text-accent-strong"
        >
          {keyword}
        </li>
      ))}
    </ul>
  );
}
