import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Разбор вакансии",
  description:
    "Вставьте вакансию и резюме — получите требования, ключевые слова для ATS, красные флаги, процент совпадения и черновик сопроводительного письма.",
};

export const viewport: Viewport = {
  themeColor: "#f7f6f2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
