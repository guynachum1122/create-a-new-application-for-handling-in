import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Generated App",
  description: "Built by prompt-to-app",
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
