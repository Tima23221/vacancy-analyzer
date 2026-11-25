import { Analyzer } from "@/components/Analyzer";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-5 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-line py-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Разбор вакансии</h1>
        <p className="max-w-[60ch] text-[15px] text-muted">
          Что на самом деле требуют, на что смотрит ATS и о чём стоит спросить до отклика.
        </p>
      </header>

      <main className="flex-1 py-10 lg:py-12">
        <Analyzer />
      </main>

      <footer className="border-t border-line py-6 text-[13px] text-muted">
        Тексты уходят в Google Gemini только для разбора, само приложение их не хранит. На бесплатном тарифе
        Google может использовать запросы для улучшения моделей, поэтому телефон и почту из резюме лучше убрать.
      </footer>
    </div>
  );
}
