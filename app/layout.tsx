import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GreenHouse Orders",
  description: "Автоматизация счетов WhatsApp из Google Sheets"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
