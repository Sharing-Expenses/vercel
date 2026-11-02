import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sharing",
    short_name: "Sharing",
    description: "Split expenses with your partner, friends and travel groups.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#2f1d05",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
