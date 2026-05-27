/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

try {
  const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    disable: process.env.NODE_ENV === 'development',
    workboxOptions: { disableDevLogs: true },
  });
  module.exports = withPWA(nextConfig);
} catch {
  module.exports = nextConfig;
}
