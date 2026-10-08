import type { Metadata } from "next";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName: "UCHINOCO",
      title: `${title} | UCHINOCO`,
      description,
      url: path,
    },
    twitter: {
      card: "summary",
      title: `${title} | UCHINOCO`,
      description,
    },
  };
}