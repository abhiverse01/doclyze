// Doclyze favicon — D monogram with scan-line motif
// Mirrors the SVG logo's reduced mark used in the collapsed sidebar
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#16140f",
          color: "#f5a524",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "sans-serif",
          letterSpacing: "-0.08em",
        }}
      >
        D<span style={{ color: "#f5a524" }}>.</span>
      </div>
    ),
    { ...size }
  );
}
