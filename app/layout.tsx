import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "improbapp — probability, playfully",
  description:
    "An interactive probability visualization app. Define random variables on a hex grid and sample their distributions.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/dice.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "improbapp — probability, playfully",
    description:
      "An interactive probability visualization app. Define random variables on a hex grid and sample their distributions.",
    images: [
      {
        url: "/og-dice.png",
        width: 1200,
        height: 630,
        alt: "improbapp dice logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "improbapp — probability, playfully",
    description:
      "An interactive probability visualization app. Define random variables on a hex grid and sample their distributions.",
    images: ["/og-dice.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
