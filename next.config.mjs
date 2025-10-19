import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = config.resolve.alias || {};
    if (!config.resolve.alias["@"]) {
      config.resolve.alias["@"] = path.resolve(__dirname);
    }
    return config;
  },
};

export default nextConfig;
