/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendOrigin = process.env.BACKEND_INTERNAL_ORIGIN ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendOrigin}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
