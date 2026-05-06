import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MantleSignal — AI Smart Money Intelligence",
  description:
    "Autonomous AI agent tracking smart money on Mantle Network. " +
    "Generates verifiable on-chain trading signals via Claude and executes via Byreal.",
  openGraph: {
    title: "MantleSignal",
    description: "AI-powered smart money tracking on Mantle Network",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="bg-zinc-950 antialiased">{children}</body>
    </html>
  );
}
