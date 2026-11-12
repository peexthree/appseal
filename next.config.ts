import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ship the PDF fonts with the api/report serverless bundle
  outputFileTracingIncludes: {
    "/api/report": ["./assets/fonts/**"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
