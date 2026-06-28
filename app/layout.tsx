import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Melato Agent Swarm",
  description: "Private Melato OS agent swarm dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
