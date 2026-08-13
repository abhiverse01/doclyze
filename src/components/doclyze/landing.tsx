"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Table2,
  Sparkles,
  Brain,
  Layers,
  ShieldCheck,
  Check,
} from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function Landing() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo height={24} />
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#privacy" className="hover:text-foreground transition-colors">
              Privacy
            </a>
          </nav>
          <Button
            size="sm"
            onClick={() => router.push("/analyzer")}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            Launch app
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-50 pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-16 md:pt-32 md:pb-24">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center text-center"
            >
              <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-[var(--brand)]" />
                Document intelligence, grounded
              </span>
              <h1 className="text-balance text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] leading-[1.05]">
                Every document,
                <br />
                <span className="text-[var(--brand)]">fully parsed.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg md:text-xl text-muted-foreground leading-relaxed">
                Doclyze ingests PDFs, DOCX, images, spreadsheets, and plain text —
                then returns clean, spreadsheet-grade structured data plus
                narrative insight. No black boxes, no lorem ipsum, no mocks.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => router.push("/analyzer")}
                  className="bg-foreground text-background hover:bg-foreground/90 h-12 px-6 text-base"
                >
                  Analyze a document
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                  className="h-12 px-6 text-base"
                >
                  View dashboard
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Free · No account required · Files stay in your browser
              </p>
            </motion.div>

            {/* Preview — stylized, non-functional marketing decoration */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="relative mt-16 md:mt-24 mx-auto max-w-4xl"
            >
              <PreviewTeaser />
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-14 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
                Capabilities
              </p>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-balance">
                Five layers of intelligence, one pipeline.
              </h2>
              <p className="mt-4 text-muted-foreground text-pretty">
                Doclyze doesn't just dump text. It classifies, extracts typed
                fields, validates them, and synthesizes observations — all
                deterministically, all replayable.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FeatureCard
                icon={<Layers className="h-5 w-5" />}
                title="Universal ingestion"
                body="PDF (text + OCR), DOCX, TXT, Markdown, CSV/TSV, and images. MIME sniffed from magic bytes — never trusted by extension alone."
              />
              <FeatureCard
                icon={<FileText className="h-5 w-5" />}
                title="Deep structured extraction"
                body="Resume, invoice, contract, research paper, spreadsheet, and general extractors — each with type-aware field schemas and computed metrics."
              />
              <FeatureCard
                icon={<Table2 className="h-5 w-5" />}
                title="Spreadsheet-grade presentation"
                body="Frozen headers, column-type badges, resizable columns, sortable cells. Export any sheet to CSV or XLSX with one click."
              />
              <FeatureCard
                icon={<Sparkles className="h-5 w-5" />}
                title="Grounded insights"
                body="Deterministic observations — employment gaps, invoice reconciliation mismatches, contract risk clauses — with severity tags and provenance."
              />
              <FeatureCard
                icon={<Brain className="h-5 w-5" />}
                title="AI deepening (beta)"
                body="Optional LLM pass that reads the structured payload and surfaces non-obvious patterns. Provider-agnostic — swap Groq, Gemini, or HF in one file."
              />
              <FeatureCard
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Private by design"
                body="Files never leave your browser. Only the structured extraction — never raw bytes — is sent to the optional AI provider."
              />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-border/60 py-20 md:py-28 bg-muted/20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-14 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
                Pipeline
              </p>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-balance">
                Six deterministic stages.
              </h2>
              <p className="mt-4 text-muted-foreground text-pretty">
                Same file in, same structured result out — every time. No
                non-determinism, no hallucinated fields.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { n: "01", t: "Ingest", d: "Magic-byte sniffing routes the file to the correct parser." },
                { n: "02", t: "Extract", d: "PDF text layer, DOCX, CSV, or Tesseract OCR for scans." },
                { n: "03", t: "Normalize", d: "De-hyphenate, reconstruct paragraphs, preserve tables." },
                { n: "04", t: "Classify", d: "Keyword + structure heuristics pick the right extractor." },
                { n: "05", t: "Extract structured", d: "Type-specific field schemas, computed metrics, tables." },
                { n: "06", t: "Score & insights", d: "Completeness score + grounded observations with severity." },
              ].map((s) => (
                <div
                  key={s.n}
                  className="rounded-xl border border-border bg-background p-5"
                >
                  <span className="font-mono text-xs text-[var(--brand)] font-semibold">{s.n}</span>
                  <h3 className="mt-2 text-base font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="border-t border-border/60 py-20 md:py-28">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-[var(--brand)]" />
            <h2 className="mt-6 text-3xl md:text-4xl font-bold tracking-tight text-balance">
              Your files never leave the browser.
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty leading-relaxed">
              All parsing — PDF, DOCX, OCR, CSV — runs client-side in your browser.
              The only network request Doclyze makes is to the optional AI
              insight provider, and it carries the already-structured extraction
              JSON — never the raw file. Disable AI insights in Settings and
              Doclyze is fully offline.
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <PrivacyItem text="No file upload to any server" />
              <PrivacyItem text="No account or tracking" />
              <PrivacyItem text="Local-only document history" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/60 py-20 md:py-28 bg-foreground text-background">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
              Try it on your toughest document.
            </h2>
            <p className="mt-4 text-background/70 text-pretty">
              A scanned contract. A 20-page resume. An image-only invoice. Doclyze
              will surface structure you didn't know was there.
            </p>
            <Button
              size="lg"
              onClick={() => router.push("/analyzer")}
              className="mt-8 bg-background text-foreground hover:bg-background/90 h-12 px-6 text-base"
            >
              Analyze a document
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo height={18} />
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} Doclyze</span>
          </div>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground" aria-label="Footer">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">Pipeline</a>
            <a href="#privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <button onClick={() => router.push("/analyzer")} className="hover:text-foreground transition-colors">Launch</button>
          </nav>
          <span className="text-xs text-muted-foreground/70">
            Built by{" "}
            <a
              href="https://github.com/abhiverse01"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Abhishek Shah
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="group rounded-xl border border-border bg-background p-5 transition-colors hover:border-foreground/20">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function PrivacyItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <Check className="h-4 w-4 text-[var(--confidence-high)] shrink-0 mt-0.5" />
      <span className="text-sm text-foreground">{text}</span>
    </div>
  );
}

/**
 * Preview teaser — a stylized, non-functional visual that suggests the
 * Document Presentor. Marked as decoration; not claiming to be live data.
 */
function PreviewTeaser() {
  return (
    <div
      className="rounded-xl border border-border bg-background shadow-2xl shadow-foreground/5 overflow-hidden"
      aria-hidden="true"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <div className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <div className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="ml-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
          resume_jane_doe.pdf — analyzed
        </div>
      </div>
      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border bg-background px-3 py-1.5">
        {["Structured Sheet", "Insights", "Raw Text"].map((t, i) => (
          <div
            key={t}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium",
              i === 0
                ? "bg-muted text-foreground"
                : "text-muted-foreground"
            )}
          >
            {t}
          </div>
        ))}
      </div>
      {/* Mock sheet */}
      <div className="grid grid-cols-12 gap-0 text-[11px] font-mono">
        <div className="col-span-12 grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 border-b border-border bg-muted/30">
          {["Company", "Title", "Start", "End"].map((h) => (
            <div key={h} className="px-3 py-2 font-semibold text-muted-foreground">{h}</div>
          ))}
        </div>
        {[
          ["Stripe", "Senior Eng", "2021-03", "Present"],
          ["Airbnb", "Software Eng", "2018-06", "2021-02"],
          ["Vercel", "Intern", "2017-05", "2017-08"],
        ].map((row, i) => (
          <div key={i} className="col-span-12 grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 border-b border-border/60">
            {row.map((c, j) => (
              <div key={j} className="px-3 py-2 text-foreground/80">{c}</div>
            ))}
          </div>
        ))}
      </div>
      {/* Mock insight footer */}
      <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-[11px]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--severity-notice)]" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">3-month gap</span> detected between Feb 2021 – May 2021
        </span>
      </div>
    </div>
  );
}
