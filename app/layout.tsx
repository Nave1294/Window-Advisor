import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Window Advisor",
  description: "Know exactly when to open your windows",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
