/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/inbox",
        destination: "/inbox",
        permanent: true,
      },
      {
        source: "/dashboard/inbox/:path*",
        destination: "/inbox",
        permanent: true,
      },
      {
        source: "/dashboard/approvals",
        destination: "/approval",
        permanent: true,
      },
      {
        source: "/dashboard/approvals/:path*",
        destination: "/approval",
        permanent: true,
      },
      {
        source: "/dashboard/logs",
        destination: "/logs",
        permanent: true,
      },
      {
        source: "/dashboard/logs/:path*",
        destination: "/logs",
        permanent: true,
      },
      {
        source: "/dashboard/report",
        destination: "/report",
        permanent: true,
      },
      {
        source: "/dashboard/report/:path*",
        destination: "/report",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
