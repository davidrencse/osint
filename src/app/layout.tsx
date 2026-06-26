import type { Metadata } from "next";
import { Anton, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: Anton — heavy condensed grotesque, recon/tactical wordmark impact.
// Data/body: JetBrains Mono — forensic, tabular, legible at small + large sizes.
const anton = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GEOLOCATOR — where was this photo taken?",
  description:
    "Estimate where a photo was taken from EXIF GPS, AI visual analysis of pixel content, reverse image search, and geocoded place names — plotted on a map.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
