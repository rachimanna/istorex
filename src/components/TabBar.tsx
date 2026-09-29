"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  games: (
    <path d="M7 8h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 16H9l-2 2.2A2.5 2.5 0 0 1 2.7 17l-.6-3A5 5 0 0 1 7 8Zm0 3v1.5M5.5 12H8.5M15.5 11.5h.01M17.5 13h.01" />
  ),
  apps: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  search: <path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm5.2 12.2L21 21" />,
  profile: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />,
};

const tabs = [
  { href: "/", label: "Главная", icon: I.home, match: (p: string) => p === "/" },
  { href: "/games", label: "Игры", icon: I.games, match: (p: string) => p.startsWith("/games") },
  { href: "/apps", label: "Приложения", icon: I.apps, match: (p: string) => p.startsWith("/apps") || p.startsWith("/category") },
  { href: "/search", label: "Поиск", icon: I.search, match: (p: string) => p.startsWith("/search") },
  { href: "/profile", label: "Профиль", icon: I.profile, match: (p: string) => p.startsWith("/profile") || p.startsWith("/login") || p.startsWith("/register") || p.startsWith("/admin") },
];

export function TabBar() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {t.icon}
            </svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
