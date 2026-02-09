import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Shalom's Realm Village",
  description: "A generative agent village where AI agents live, work, and socialize",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
