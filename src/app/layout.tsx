import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sportstats — Multi-source sports statistics",
  description:
    "Aggregated, consensus-weighted sports statistics across many providers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
