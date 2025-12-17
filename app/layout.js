import "./globals.css";
import TopNav from "./components/TopNav";
import HideTopNavOnLogin from "./components/HideTopNavOnLogin";
import Tour from "./dashboard/Tour";
import { Toaster } from "sonner";

export const viewport = {
  themeColor: "#0b6cf2",
};

export const metadata = {
  title: "Sternblitz Sales",
  description: "Vertriebsplattform",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <HideTopNavOnLogin>
          <TopNav />
        </HideTopNavOnLogin>
        <Tour />
        <Toaster position="top-center" richColors />
        {children}
      </body>
    </html>
  );
}
