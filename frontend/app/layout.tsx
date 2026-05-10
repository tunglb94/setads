import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/lib/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Super Admin Digital — Meta Ads Manager",
  description: "AI-powered Meta Ads management and automation platform",
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/leads", label: "Lead Intelligence", icon: "💬" },
  { href: "/leads/deep-funnel", label: "Deep Funnel AI", icon: "🧠" },
  { href: "/logs", label: "Automation Logs", icon: "📋" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={cn("font-sans", inter.variable)}>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside className="w-56 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 z-30 hidden md:flex">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-[#1877F2] rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">S</span>
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm leading-none">Super Admin</div>
                    <div className="text-xs text-gray-400 mt-0.5">Digital</div>
                  </div>
                </div>
              </div>

              <nav className="flex-1 p-3 space-y-1">
                {NAV_ITEMS.map(({ href, label, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <span>{icon}</span>
                    {label}
                  </Link>
                ))}
              </nav>

              <div className="p-3 border-t border-gray-100 text-xs text-gray-400 text-center">
                v1.0.0 · Phase 2
              </div>
            </aside>

            {/* Main content */}
            <div className="flex-1 md:pl-56">
              <main className="max-w-screen-xl mx-auto px-4 py-6">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
