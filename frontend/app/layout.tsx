import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Acumen — Executable Knowledge Base",
  description:
    "Upload any document. Acumen uses ML clustering to synthesize a visual knowledge graph you can study, build from, and act on.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#7c3aed",
          colorBackground: "#020617",
          colorInputBackground: "#16161f",
          colorInputText: "#f8fafc",
          colorText: "white",
          colorTextOnPrimaryBackground: "white",
          colorTextSecondary: "#a1a1aa",
          borderRadius: "0.75rem",
          fontFamily: "var(--font-geist-sans), sans-serif",
        },
        elements: {
          card: "shadow-2xl border border-white/10 bg-[#020617]",
          formButtonPrimary: "bg-[#7c3aed] hover:bg-[#6d28d9] transition-colors text-white",
          socialButtonsBlockButton: "border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200",
          footerActionLink: "text-[#a78bfa] hover:text-[#7c3aed]",
          formFieldInput: "bg-[#16161f] border-white/10 text-slate-100 placeholder:text-slate-500",
          userButtonPopoverCard: "border border-white/10 bg-[#020617] shadow-2xl",
          userButtonPopoverActionButtonText: "text-white",
          userButtonPopoverActionItem: "hover:bg-white/5 transition-colors",
          userButtonOuterIdentifier: "text-white font-medium",
          userButtonBox: "hover:opacity-80 transition-opacity",
        },
      }}
    >
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      >
        <body className="min-h-full flex flex-col bg-[#0a0a0f] text-white">
          {children}
          <Toaster theme="dark" position="top-right" richColors closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}
