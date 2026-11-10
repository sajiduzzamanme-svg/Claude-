import type { Metadata, Viewport } from "next";
import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource/hind-siliguri/400.css";
import "@fontsource/hind-siliguri/500.css";
import "@fontsource/hind-siliguri/600.css";
import "@fontsource/hind-siliguri/700.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Space Up ERP", template: "%s · Space Up" },
  description: "Land-share real estate ERP: flats, collections, land, construction and accounts in one place.",
};
export const viewport: Viewport = { themeColor: "#10141d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
