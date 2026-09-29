import type { Metadata, Viewport } from "next";
import { TabBar } from "@/components/TabBar";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "iStoreX", template: "%s · iStoreX" },
  description: "Каталог приложений и игр для iPhone с честной информацией о способе установки и подписи.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "iStoreX", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Applies the saved theme before first paint (no flash). Values: "light" | "dark" | absent (= system).
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <TabBar />
        <PwaRegister />
      </body>
    </html>
  );
}
