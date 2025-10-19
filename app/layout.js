import "./globals.css";
import TopNav from "./components/TopNav";
import HideTopNavOnLogin from "./components/HideTopNavOnLogin";

export const metadata = {
  title: "Sternblitz Sales",
  description: "Vertriebsplattform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        <HideTopNavOnLogin>
          <TopNav />
        </HideTopNavOnLogin>
        {children}
      </body>
    </html>
  );
}
