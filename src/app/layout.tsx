import type { Metadata, Viewport } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/doclyze/theme-provider";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://doclyze-web.vercel.app"),
  title: {
    default: "Doclyze — Document Intelligence",
    template: "%s · Doclyze",
  },
  description:
    "Doclyze ingests any document — PDF, DOCX, images, spreadsheets — and extracts every piece of structured signal as clean, spreadsheet-grade data plus narrative insight.",
  keywords: [
    "Doclyze",
    "document intelligence",
    "PDF parser",
    "resume parser",
    "invoice extractor",
    "contract analysis",
    "OCR",
    "structured extraction",
  ],
  authors: [{ name: "Doclyze" }],
  applicationName: "Doclyze",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Doclyze — Document Intelligence",
    description:
      "Ingest any document. Get back clean structured data and grounded insights — no black boxes.",
    url: "https://doclyze-web.vercel.app",
    siteName: "Doclyze",
    type: "website",
    locale: "en_US",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Doclyze — Document Intelligence" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Doclyze — Document Intelligence",
    description:
      "Ingest any document. Get back clean structured data and grounded insights — no black boxes.",
  },
  alternates: {
    canonical: 'https://doclyze-web.vercel.app',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#16140f" },
  ],
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Doclyze",
  url: "https://doclyze-web.vercel.app",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Doclyze ingests any document and extracts every piece of structured signal as clean, spreadsheet-grade data plus narrative insight.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Universal ingestion (PDF, DOCX, images, CSV, TXT, MD)",
    "Deep structured extraction",
    "Spreadsheet-grade presentation",
    "Deterministic, grounded insights",
    "AI-assisted deeper analysis (beta)",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${poppins.variable} ${mono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <Sonner />
        </ThemeProvider>
      </body>
    </html>
  );
}
