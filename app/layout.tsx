import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workbench — AI workspace",
  description: "Your models, files, and finished work. One workspace.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
