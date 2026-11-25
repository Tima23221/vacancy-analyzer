"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { plural } from "@/lib/plural";

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function CoverLetter({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const words = countWords(text);

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="rounded-xl border border-line-strong bg-field">
      <p className="whitespace-pre-line px-4 pb-4 pt-5 text-[16px] sm:px-5 leading-[1.7] text-ink">{text}</p>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <span className="text-[13px] text-muted tabular-nums">{words} {plural(words, ["слово", "слова", "слов"])}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-paper px-4 text-[14px] font-medium text-ink transition-colors hover:border-accent hover:text-accent"
        >
          {state === "copied" ? (
            <Check aria-hidden className="size-4 text-accent" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {state === "copied" ? "Скопировано" : state === "failed" ? "Не удалось скопировать" : "Скопировать"}
        </button>
        <span className="sr-only" aria-live="polite">
          {state === "copied" ? "Письмо скопировано в буфер обмена" : ""}
        </span>
      </div>
    </div>
  );
}
