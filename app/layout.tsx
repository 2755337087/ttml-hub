import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteOrigin = new URL(siteUrl).origin;
const socialImage = new URL(`${basePath}/og.png`, siteOrigin).toString();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "LunaBeat TTML 歌词站",
  description: "LunaBeat 的开放 TTML 歌词目录，支持搜索、下载与增量更新。",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
  openGraph: {
    title: "LunaBeat TTML 歌词站",
    description: "搜索、下载并接入开放 TTML 歌词。",
    type: "website",
    images: [{ url: socialImage, width: 1730, height: 909, alt: "LunaBeat TTML 歌词站" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LunaBeat TTML 歌词站",
    description: "搜索、下载并接入开放 TTML 歌词。",
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
