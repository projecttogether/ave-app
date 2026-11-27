import type { Metadata } from "next";
import { Fraunces, Rubik } from "next/font/google";
import { ToastProvider } from "@/components/ui/use-toast";
import "./globals.css";

// A nonce must be generated for every document, including public pages.
export const dynamic = 'force-dynamic';

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

const rubik = Rubik({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s | AVE Dashboard",
    default: "AVE Dashboard",
  },
  description: "Dashboard for AVE Gastro to monitor sustainability indicators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${rubik.variable} antialiased`}
      >
        <ToastProvider>
            {children}
        </ToastProvider>
      </body>
    </html>
  );
}
