import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AG Connect · ASL Les Tilleuls",
  description: "Centre de pilotage pour assemblées générales, votes et procurations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full bg-[#f7f4ef]">{children}</body>
    </html>
  );
}
