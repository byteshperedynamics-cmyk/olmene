import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Analytics } from "@/components/analytics";
import { CookieConsent } from "@/components/cookie-consent";
import { SkipLink } from "@/components/skip-link";
import { I18nProvider } from "@/i18n/provider";
import { APP_NAME, APP_DESCRIPTION, APP_URL } from "@/lib/config";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const serifDisplay = Newsreader({
  variable: "--font-serif-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const serifDisplayItalic = Newsreader({
  variable: "--font-serif-display-italic",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["italic"],
});

const monoCode = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  // Mono is used for small report/figure labels below the fold — preloading
  // it (63KB woff2) competes with the LCP-critical Inter/Newsreader fonts.
  preload: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tint the mobile browser chrome (Chrome Android toolbar, Safari 15+ tab bar)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#292927" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Know exactly what to fix to get more customers`,
    template: `%s — ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: ["marketing analysis", "marketing strategy", "SaaS marketing", "startup marketing", "competitor research", "SEO audit"],
  metadataBase: new URL(APP_URL),
  alternates: { canonical: "./" },
  openGraph: {
    title: `${APP_NAME} — Know exactly what to fix to get more customers`,
    description: APP_DESCRIPTION,
    url: APP_URL,
    siteName: APP_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Know exactly what to fix to get more customers`,
    description: APP_DESCRIPTION,
  },
};

// Structured data — we added it because our own free diagnosis flagged it missing.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: APP_NAME,
      url: APP_URL,
      logo: `${APP_URL}/img/logo-full-480.webp`,
      description: APP_DESCRIPTION,
    },
    {
      "@type": "WebApplication",
      name: APP_NAME,
      url: APP_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: APP_DESCRIPTION,
      offers: { "@type": "AggregateOffer", lowPrice: "19", highPrice: "29", priceCurrency: "USD", offerCount: "2" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${serifDisplay.variable} ${serifDisplayItalic.variable} ${monoCode.variable} font-sans antialiased bg-background text-foreground`}
      >
        {/* Analytics: consent boot script runs before anything else in the body;
            the gtag.js library itself only loads after the visitor accepts. */}
        <Analytics />
        {/*
          esbuild keepNames (OpenNext worker build) injects __name(fn, "fn") into
          next-themes' inline theme script, which is serialized into the HTML via
          Function.prototype.toString. In the browser __name is undefined, killing
          the first-paint theme script (dark-mode flash + a pageerror on every
          route). This no-op polyfill runs before it and makes the call harmless.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: "window.__name||(window.__name=function(n){return n});",
          }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {/*
          Language restore, pre-hydration: a returning Arabic/Urdu visitor gets
          dir="rtl" on <html> before first paint (no LTR flash), and everyone
          gets <html lang> corrected immediately. Plain string literal — esbuild
          keepNames never rewrites it (same pattern as the __name guard below).
          The dictionary itself is fetched after hydration by <I18nProvider>.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var mwl=localStorage.getItem("mw-lang");if(mwl&&mwl!=="en"){document.documentElement.lang=mwl;if(mwl==="ar"||mwl==="ur")document.documentElement.dir="rtl"}}catch(e){}',
          }}
        />
        <I18nProvider>
          <SkipLink />
          <Providers>{children}</Providers>
          <CookieConsent />
        </I18nProvider>
      </body>
    </html>
  );
}
