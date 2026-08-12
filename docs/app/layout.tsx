import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {
  OG_IMAGE,
  OG_IMAGE_ALT,
  REPO,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_IMAGE_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, alt: OG_IMAGE_ALT }],
  },
  other: {
    "theme-color": "#18181b",
  },
};

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: "MiraWision",
  url: "https://github.com/MiraWision",
};

const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: SITE_DESCRIPTION,
  publisher: { "@id": `${SITE_URL}/#org` },
  sameAs: [REPO, "https://www.npmjs.com/package/sluglist"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <JsonLd data={ORG_JSONLD} />
        <JsonLd data={WEBSITE_JSONLD} />
        <SiteHeader />
        <main className="min-h-dvh">{children}</main>
        <SiteFooter />
        {/*
          Analytics: Umami, EU data region. Cookieless and aggregate-only — no
          cookies, no IP storage, no cross-site identifiers — so no consent
          banner is required and none is shown. `data-domains` restricts
          collection to the live domain, keeping localhost and preview builds
          out of the numbers. Disclosed in the footer.
        */}
        <Script
          data-domains="sluglist.dev"
          data-website-id="79f9a945-777b-407d-9886-4b1f332e9002"
          src="https://cloud.umami.is/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
