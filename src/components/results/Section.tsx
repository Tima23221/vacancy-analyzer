import type { ReactNode } from "react";

type Props = {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
};

/** Results are one continuous sheet split by hairlines, not a grid of cards. */
export function Section({ title, aside, children }: Props) {
  return (
    <section className="border-t border-line py-7 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {aside && <div className="text-[13px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
