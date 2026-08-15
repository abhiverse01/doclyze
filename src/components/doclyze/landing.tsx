"use client";

import * as React from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Table2,
  Sparkles,
  Brain,
  Layers,
  ShieldCheck,
  Check,
  Type,
  ChevronRight,
  Zap,
  Eye,
  Cpu,
  FileSearch,
  Lock,
  BarChart3,
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
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Logo height={22} />
          <nav className="hidden md:flex items-center gap-5 text-[13px] text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">Pipeline</a>
            <a href="#privacy" className="hover:text-foreground transition-colors">Privacy</a>
          </nav>
          {/* FIX #9: Slimmer, more refined launch button */}
          <Button
            size="sm"
            onClick={() => router.push("/analyzer")}
            className="bg-foreground text-background hover:bg-foreground/85 h-8 px-4 text-xs font-medium rounded-lg"
          >
            Launch app
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40 pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-14 md:pt-28 md:pb-20">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center text-center"
            >
              <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-[var(--brand)]" />
                Document intelligence, grounded
              </span>
              <h1 className="text-balance text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] leading-[1.08]">
                Every document,
                <br />
                <span className="text-[var(--brand)]">fully parsed.</span>
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base sm:text-lg text-muted-foreground leading-relaxed">
                Doclyze ingests PDFs, DOCX, images, spreadsheets, and plain text —
                then returns clean, spreadsheet-grade structured data plus
                narrative insight.
              </p>
              {/* FIX #8: Refined, balanced CTA buttons */}
              <div className="mt-8 flex flex-col sm:flex-row items-center gap-2.5">
                <Button
                  size="lg"
                  onClick={() => router.push("/analyzer")}
                  className="bg-foreground text-background hover:bg-foreground/85 h-11 px-6 text-sm font-medium rounded-xl shadow-lg shadow-foreground/10"
                >
                  Analyze a document
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                  className="h-11 px-6 text-sm font-medium rounded-xl"
                >
                  View dashboard
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-3.5 text-[11px] text-muted-foreground/70">
                Free · No account required · Files stay in your browser
              </p>
            </motion.div>

            {/* Preview teaser */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="relative mt-14 md:mt-20 mx-auto max-w-4xl"
            >
              <PreviewTeaser />
            </motion.div>
          </div>
        </section>

        {/* FIX #10: Capabilities section — modern grid with hover effects */}
        <section id="features" className="border-t border-border/40 py-18 md:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeader
              label="Capabilities"
              title="Five layers of intelligence, one pipeline."
              body="Doclyze doesn't just dump text. It classifies, extracts typed fields, validates them, and synthesizes observations — all deterministically, all replayable."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FeatureCard
                icon={<Layers className="h-5 w-5" />}
                title="Universal ingestion"
                body="PDF (native text + OCR), DOCX, images, CSV/TSV, XLSX, and plain text. MIME sniffed from magic bytes."
                gradient="from-blue-500/10 to-blue-500/0"
              />
              <FeatureCard
                icon={<FileSearch className="h-5 w-5" />}
                title="Layout-aware extraction"
                body="Multi-column detection, font-size heading analysis, and table reconstruction from positional data."
                gradient="from-violet-500/10 to-violet-500/0"
              />
              <FeatureCard
                icon={<Type className="h-5 w-5" />}
                title="Typed entity extraction"
                body="Entities classified as person, organization, or location using context signals and suffix patterns."
                gradient="from-emerald-500/10 to-emerald-500/0"
              />
              <FeatureCard
                icon={<Table2 className="h-5 w-5" />}
                title="Spreadsheet-grade tables"
                body="Frozen headers, column-type badges, sortable columns, and one-click CSV/XLSX export."
                gradient="from-amber-500/10 to-amber-500/0"
              />
              <FeatureCard
                icon={<BarChart3 className="h-5 w-5" />}
                title="Grounded insights"
                body="Deterministic observations — employment gaps, invoice mismatches, contract risk clauses — with severity tags."
                gradient="from-rose-500/10 to-rose-500/0"
              />
              <FeatureCard
                icon={<Brain className="h-5 w-5" />}
                title="AI deepening (beta)"
                body="Optional LLM pass that surfaces non-obvious patterns. Provider-agnostic swap in one config."
                gradient="from-cyan-500/10 to-cyan-500/0"
              />
            </div>
          </div>
        </section>

        {/* FIX #10: Six stages — dynamic pipeline visualization */}
        <section id="how-it-works" className="border-t border-border/40 py-18 md:py-24 bg-muted/20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeader
              label="Pipeline"
              title="Six deterministic stages."
              body="Same file in, same structured result out — every time. No non-determinism, no hallucinated fields."
            />
            <PipelineStages />
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="border-t border-border/40 py-18 md:py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Your files never leave the browser.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground text-pretty leading-relaxed max-w-xl mx-auto">
              All parsing runs client-side. The only network request is to the optional AI
              insight provider, carrying only structured JSON — never the raw file.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
              <PrivacyItem text="No file upload to any server" />
              <PrivacyItem text="No account or tracking" />
              <PrivacyItem text="Local-only document history" />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/40 py-18 md:py-24 bg-foreground text-background">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Try it on your toughest document.
            </h2>
            <p className="mt-3 text-sm text-background/60 text-pretty max-w-lg mx-auto">
              A scanned contract with interleaved columns. A cover letter with a
              photographed stamp. An invoice with line-item reconciliation
              mismatches.
            </p>
            <Button
              size="lg"
              onClick={() => router.push("/analyzer")}
              className="mt-7 bg-background text-foreground hover:bg-background/90 h-11 px-6 text-sm font-medium rounded-xl"
            >
              Analyze a document
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo height={16} />
            <span className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} Doclyze</span>
          </div>
          <nav className="flex items-center gap-4 text-[11px] text-muted-foreground" aria-label="Footer">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">Pipeline</a>
            <a href="#privacy" className="hover:text-foreground transition-colors">Privacy</a>
          </nav>
          <span className="text-[11px] text-muted-foreground/60">
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

function SectionHeader({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">{label}</p>
      <h2 className="mt-2.5 text-2xl sm:text-3xl font-bold tracking-tight text-balance">{title}</h2>
      <p className="mt-3 text-sm text-muted-foreground text-pretty leading-relaxed">{body}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  gradient: string;
}) {
  return (
    <div className={cn(
      "group relative rounded-xl border border-border bg-background p-5 transition-all duration-200 hover:border-foreground/15 hover:shadow-lg hover:shadow-foreground/[0.03] overflow-hidden"
    )}>
      {/* Subtle gradient background on hover */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300", gradient
      )} />
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] transition-transform duration-200 group-hover:scale-105">
          {icon}
        </div>
        <h3 className="mt-3.5 text-sm font-semibold">{title}</h3>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

const STAGES = [
  { n: "01", t: "Ingest", d: "Magic-byte sniffing routes the file to the correct parser.", icon: <Zap className="h-4 w-4" /> },
  { n: "02", t: "Extract", d: "PDF text layer, DOCX, CSV, or Tesseract OCR for scans.", icon: <Eye className="h-4 w-4" /> },
  { n: "03", t: "Analyze layout", d: "Column detection, heading levels, and table reconstruction.", icon: <Layers className="h-4 w-4" /> },
  { n: "04", t: "Classify", d: "Keyword + structural heuristics pick the right extractor.", icon: <Cpu className="h-4 w-4" /> },
  { n: "05", t: "Extract structured", d: "Type-specific schemas, entity typing, confidence scoring.", icon: <FileSearch className="h-4 w-4" /> },
  { n: "06", t: "Score & insights", d: "Completeness score + grounded observations with severity.", icon: <BarChart3 className="h-4 w-4" /> },
];

function PipelineStages() {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {STAGES.map((s, i) => (
        <motion.div
          key={s.n}
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.35, delay: i * 0.06, ease: [0.4, 0, 0.2, 1] }}
          className="group relative rounded-xl border border-border bg-background p-5 transition-all duration-200 hover:border-[var(--brand)]/30 hover:shadow-md hover:shadow-foreground/[0.02]"
        >
          <div className="flex items-start justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-[var(--brand-soft)] group-hover:text-[var(--brand)] transition-colors duration-200">
              {s.icon}
            </div>
            <span className="font-mono text-[11px] text-muted-foreground/50 font-semibold group-hover:text-[var(--brand)] transition-colors">{s.n}</span>
          </div>
          <h3 className="mt-3 text-sm font-semibold">{s.t}</h3>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">{s.d}</p>
          {/* Connector line for grid flow */}
          {i < STAGES.length - 1 && (
            <div className="hidden lg:block absolute -right-1.5 top-1/2 -translate-y-1/2 z-10">
              <ChevronRight className="h-3 w-3 text-border" />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function PrivacyItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-3 transition-colors hover:border-foreground/10">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--confidence-high)]/10">
        <Check className="h-3 w-3 text-[var(--confidence-high)]" />
      </div>
      <span className="text-[13px] text-foreground">{text}</span>
    </div>
  );
}

function PreviewTeaser() {
  return (
    <div
      className="rounded-xl border border-border bg-background shadow-2xl shadow-foreground/5 overflow-hidden"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
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
      <div className="flex items-center gap-1 border-b border-border bg-background px-3 py-1.5">
        {["Structured Sheet", "Insights", "Raw Text"].map((t, i) => (
          <div
            key={t}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium",
              i === 0 ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-0 text-[11px] font-mono">
        <div className="col-span-12 grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 border-b border-border bg-muted/20">
          {["Company", "Title", "Start", "End"].map((h) => (
            <div key={h} className="px-3 py-2 font-semibold text-muted-foreground">{h}</div>
          ))}
        </div>
        {[
          ["Stripe", "Senior Eng", "2021-03", "Present"],
          ["Airbnb", "Software Eng", "2018-06", "2021-02"],
          ["Vercel", "Intern", "2017-05", "2017-08"],
        ].map((row, i) => (
          <div key={i} className="col-span-12 grid grid-cols-[2fr_1fr_1fr_1fr] gap-0 border-b border-border/40">
            {row.map((c, j) => (
              <div key={j} className="px-3 py-2 text-foreground/80">{c}</div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-muted/10 px-4 py-2.5 text-[11px]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--severity-notice)]" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">3-month gap</span> detected between Feb 2021 – May 2021
        </span>
      </div>
    </div>
  );
}