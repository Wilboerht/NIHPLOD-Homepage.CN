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
      // 收紧 img-src：禁止任意 https: 通配，只允许已知域名
      "img-src 'self' data: blob: https://*.nihplod.cn https://*.supabase.co https://*.aliyuncs.com http://*.amap.com http://*.autonavi.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://api.openai.com https://geo.datav.aliyun.com https://cloudflareinsights.com https://*.amap.com https://*.autonavi.com",
      "worker-src 'self' blob:",
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  // 抑制 file-type 包的已知构建警告（动态依赖表达式，不影响运行时）
  webpack: (config) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /file-type/ },
    ];
    return config;
  },

  // 优化: 将大型服务端依赖外部化，避免打包进每个 serverless function
  experimental: {
    serverComponentsExternalPackages: [
      'sharp',
      '@prisma/client',
      'prisma',
      'tencentcloud-sdk-nodejs',
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
      // 品牌名常见拼写错误重定向（帮助搜索引擎和用户找到正确页面）
      {
        source: '/niphlod',
        destination: '/',
        permanent: true,
      },
      {
        source: '/niphold',
        destination: '/',
        permanent: true,
      },
      {
        source: '/nihplad',
        destination: '/',
        permanent: true,
      },
      {
        source: '/nihplood',
        destination: '/',
        permanent: true,
      },
      {
        source: '/nibai',
        destination: '/',
        permanent: true,
      },
      {
        source: '/nibo',
        destination: '/',
        permanent: true,
      },
      // 产品昵称重定向（帮助用户通过昵称找到产品页）
      {
        source: '/童颜精华',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/白魔法面霜',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/绿魔法护理油',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/守护面膜',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/聚宝瓶身体乳',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/蛋定防晒',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/黑曜磨砂膏',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/云朵洁面',
        destination: '/products',
        permanent: false,
      },
      {
        source: '/随身笔护手霜',
        destination: '/products',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
