import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/contact", "/legal", "/privacy", "/terms"],
      disallow: [
        "/account/",
        "/albums/",
        "/album/",
        "/api/",
        "/auth/",
        "/dev/",
        "/family/",
        "/forgot-password",
        "/home",
        "/login",
        "/memories",
        "/pets/",
        "/photos/",
        "/plus",
        "/reset-password",
        "/search",
        "/signup",
      ],
    },
  };
}
