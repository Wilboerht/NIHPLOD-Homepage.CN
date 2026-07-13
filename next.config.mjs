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
      // TODO: 'unsafe-inline' 暂时保留。Next.js 与高德地图均依赖内联脚本，
      // 完全移除需配合 middleware 实现 per-request nonce，当前未改造，故保留并加说明。
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com https://*.amap.com https://www.googletagmanager.com https://hm.baidu.com blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.amap.com",
      // 收紧 img-src：禁止任意 https: 通配，只允许已知域名，并统一使用 https
      "img-src 'self' data: blob: https://*.nihplod.cn https://*.aliyuncs.com https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://www.googletagmanager.com https://hm.baidu.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://api.openai.com https://geo.datav.aliyun.com https://cloudflareinsights.com https://*.amap.com https://*.autonavi.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://hm.baidu.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
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

  // Next.js 16 默认使用 Turbopack，但由于 Tailwind 3.x 生成的 CSS 在
  // Turbopack CSS 解析器下会产生 ::after::before 无效选择器，暂时回退到 webpack。
  // build 脚本已默认传递 --webpack 标志（见 package.json）。
  // 追踪：待 Tailwind 升级到 v4 后可移除 webpack 配置并改用 Turbopack。

  // 优化: 将大型服务端依赖外部化，避免打包进每个 serverless function
  serverExternalPackages: [
    'sharp',
    '@prisma/client',
    'prisma',
    'tencentcloud-sdk-nodejs',
  ],

  // 优化: 减小包体积
  experimental: {
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
      {
        source: '/checkout',
        destination: '/cart?openCheckout=1',
        permanent: true,
      },
      {
        source: '/admin/coupons/create',
        destination: '/admin/coupons',
        permanent: true,
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
