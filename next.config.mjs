/** @type {import('next').NextConfig} */

// 安全头配置
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com https://*.amap.com blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.amap.com",
      "img-src 'self' data: blob: https: http://*.amap.com http://*.autonavi.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://api.openai.com https://geo.datav.aliyun.com https://cloudflareinsights.com https://*.amap.com https://*.autonavi.com",
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

const nextConfig = {
  // 优化: 将大型服务端依赖外部化，避免打包进每个 serverless function
  experimental: {
    serverComponentsExternalPackages: [
      'sharp',
      '@prisma/client',
      'prisma',
      'tencentcloud-sdk-nodejs',
      'nodemailer',
      'maxmind',
      'pdfmake',
      'jspdf',
    ],
    optimizePackageImports: [
      'lucide-react',
      'echarts',
      'echarts-for-react',
      'recharts',
      'three',
      '@react-three/fiber',
      'framer-motion',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/pm',
    ],
  },

  // 图片优化配置
  images: {
    // 允许的图片域名
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.nihplod.cn',
      },
      {
        protocol: 'https',
        hostname: 'nihplod.cn',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'zeeptwcbrwrllcwxeaer.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'gggmklbpdhsdwmmbkgzg.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'wp-cdn.4ce.cn',
      },
      {
        protocol: 'https',
        hostname: '*.aliyuncs.com',
      },
    ],
    // 启用的图片格式 (自托管服务器不使用 AVIF，避免实时编码开销)
    formats: ['image/webp'],
    // 响应式图片断点
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    // 固定尺寸图片断点
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // 最小化缓存时间 (秒)
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30天
    // 禁用静态导入 (使用动态导入优化)
    disableStaticImages: false,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // 静态资源缓存
      {
        source: '/uploads/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/contact',
        destination: '/?contact=true',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
