import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
    // Allow tracing files outside web/ (we import from ../client and ../target).
    outputFileTracingRoot: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
