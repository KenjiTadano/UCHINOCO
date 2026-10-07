import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: [
        "/account/",
        "/album/",
        "/api/",
        "/dev/",
        "/family/",
        "/home",
        "/memories",
        "/pets/",
        "/photos/",
        "/plus",
        "/search",
      ],
    },
  };
}
