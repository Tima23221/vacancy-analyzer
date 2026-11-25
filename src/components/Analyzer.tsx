"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis } from "@/lib/analysis-schema";
import { SAMPLE_RESUME, SAMPLE_VACANCY } from "@/lib/samples";
import { InputPanel } from "./InputPanel";
import { EmptyState, ErrorState, ResultsSkeleton } from "./results/ResultStates";
import { ResultsView } from "./results/ResultsView";

type State =
  | { status: "idle" }
  | { status: "loading"; withResume: boolean }
  | { status: "error"; message: string }
  | { status: "done"; analysis: Analysis; hasResume: boolean };

// Slightly longer than the API route's maxDuration (60 s).
const CLIENT_TIMEOUT_MS = 65_000;

export function Analyzer() {
  const [vacancy, setVacancy] = useState("");
  const [resume, setResume] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // How the user last interacted: decides whether the result title shows a focus ring.
  const usedKeyboardRef = useRef(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) usedKeyboardRef.current = true;
    };
    const onPointer = () => {
      usedKeyboardRef.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);

  // Move focus to the result so keyboard and screen-reader users land on it.
  // The submit button is disabled while loading, so focus falls to <body> and
  // browsers would treat the programmatic focus as :focus-visible even after a
  // mouse click; we show the ring only after keyboard interaction.
  useEffect(() => {
    if (state.status === "done") {
      const title = resultRef.current?.querySelector<HTMLElement>("#result-title");
      if (title) {
        const keyboard = usedKeyboardRef.current;
        title.dataset.focusRing = keyboard ? "on" : "off";
        title.focus({ preventScroll: true, focusVisible: keyboard } as FocusOptions);
      }
      if (window.matchMedia("(max-width: 1023px)").matches) {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [state.status]);

  async function analyze() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), CLIENT_TIMEOUT_MS);
    const hasResume = resume.trim().length > 0;

    setState({ status: "loading", withResume: hasResume });
    if (window.matchMedia("(max-width: 1023px)").matches) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancy, resume }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as
        | { analysis?: Analysis; error?: string }
        | null;

      if (!response.ok || !data?.analysis) {
        setState({
          status: "error",
          message: data?.error ?? "Сервер вернул неожиданный ответ. Попробуйте ещё раз.",
        });
        return;
      }
      setState({ status: "done", analysis: data.analysis, hasResume });
    } catch {
      if (controller.signal.aborted && controller.signal.reason !== "timeout") return;
      setState({
        status: "error",
        message: controller.signal.aborted
          ? "Модель отвечает слишком долго. Попробуйте ещё раз."
          : "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function insertSample() {
    setVacancy(SAMPLE_VACANCY);
  }

  return (
    <div className="grid gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-14 xl:gap-x-20">
      <div className="lg:sticky lg:top-8 lg:self-start">
        <InputPanel
          vacancy={vacancy}
          resume={resume}
          onVacancyChange={setVacancy}
          onResumeChange={setResume}
          onSubmit={analyze}
          onInsertSample={insertSample}
          onInsertSampleResume={() => setResume(SAMPLE_RESUME)}
          loading={state.status === "loading"}
        />
      </div>

      <div
        ref={resultRef}
        className="scroll-mt-6 border-t border-line pt-10 lg:min-h-[640px] lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0 xl:pl-20"
      >
        {state.status === "idle" && <EmptyState onInsertSample={insertSample} />}
        {state.status === "loading" && <ResultsSkeleton withScore={state.withResume} />}
        {state.status === "error" && <ErrorState message={state.message} onRetry={analyze} />}
        {state.status === "done" && (
          <ResultsView analysis={state.analysis} hasResume={state.hasResume} />
        )}
      </div>
    </div>
  );
}
