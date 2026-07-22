import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteOrigin = new URL(siteUrl).origin;
const socialImage = new URL(`${basePath}/og.png`, siteOrigin).toString();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "TTML Hub · 开放歌词索引",
  description: "为公开 TTML 歌词仓库提供自动索引、搜索与增量更新检测。",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
  openGraph: {
    title: "TTML Hub · 开放歌词索引",
    description: "搜索、更新、开放协作。为软件而生的 TTML 歌词仓库。",
    type: "website",
    images: [{ url: socialImage, width: 1730, height: 909, alt: "TTML Hub 开放歌词索引" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TTML Hub · 开放歌词索引",
    description: "搜索、更新、开放协作。为软件而生的 TTML 歌词仓库。",
    images: [socialImage],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
