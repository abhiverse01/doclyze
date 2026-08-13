import * as React from "react";

/**
 * Doclyze logotype — built entirely from type, no imported icon asset.
 *
 * Design language:
 * - Tightened tracking, weight contrast (800 wordmark with a 400-weight "yze")
 * - The "y" descender extends below the baseline and turns into a horizontal
 *   scan-line / cursor motif — the same visual language that powers the
 *   collapsed monogram and the favicon.
 * - Renders with `currentColor` so it adapts to light/dark themes automatically.
 * - A small amber dot sits at the end of the scan line — the brand accent.
 */

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  /** size in px — sets the height; width scales with the wordmark */
  height?: number;
}

export function Logo({ className, showTagline = false, height = 28 }: LogoProps) {
  // The wordmark uses one continuous SVG so the scan-line can cross letterforms cleanly.
  // viewBox is sized to the natural ascender/descender + scan-line pad.
  const w = (height * 260) / 40;
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
      aria-label="Doclyze"
    >
      <svg
        width={w}
        height={height}
        viewBox="0 0 260 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
      >
        {/* The wordmark — Doclyze */}
        <text
          x="0"
          y="28"
          fontFamily="var(--font-poppins), Poppins, sans-serif"
          fontSize="28"
          fontWeight="800"
          letterSpacing="-0.04em"
          fill="currentColor"
        >
          Doc
        </text>
        <text
          x="63"
          y="28"
          fontFamily="var(--font-poppins), Poppins, sans-serif"
          fontSize="28"
          fontWeight="400"
          letterSpacing="-0.02em"
          fill="currentColor"
        >
          lyze
        </text>
        {/* The scan-line: extends right from the "y" descender, doubled as a baseline cursor */}
        <line
          x1="118"
          y1="34"
          x2="220"
          y2="34"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="226" cy="34" r="3.2" fill="var(--brand)" />
      </svg>
      {showTagline && (
        <span
          className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
          aria-hidden="true"
        >
          Document Intelligence
        </span>
      )}
    </span>
  );
}

/**
 * Monogram — the *same* visual language reduced: a heavy D with the scan-line
 * cutting across the descender space, plus the amber dot.
 * Used in the collapsed sidebar state and as the favicon basis.
 */
export function Monogram({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Doclyze"
    >
      {/* The D */}
      <path
        d="M6 6 H18 a14 14 0 0 1 0 28 H6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Scan line */}
      <line
        x1="6"
        y1="34"
        x2="32"
        y2="34"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Brand dot — same as full logo */}
      <circle cx="36" cy="34" r="2.6" fill="var(--brand)" />
    </svg>
  );
}
