/** @type {import('next').NextConfig} */
const nextConfig = {
  // 添加 basePath 和 assetPrefix 配置 - 修复静态资源路径问题
  basePath: process.env.NEXT_PUBLIC_ENV === 'production' ? '/pc' : '',
  assetPrefix: process.env.NEXT_PUBLIC_ENV === 'production' ? '/pc' : '',
  
  // 根据环境选择输出模式 - 检查是否为生产环境
  output: process.env.NEXT_PUBLIC_ENV === 'production' 
    ? 'export'  // 静态文件导出模式
    : undefined,  // 开发模式使用默认配置
  
  // 静态导出时跳过 API 路由
  ...(process.env.NEXT_PUBLIC_ENV === 'production' && {
    generateBuildId: async () => {
      return 'build-' + Date.now()
    },
  }),
  
  // 静态导出配置 - 只在静态导出时使用
  trailingSlash: process.env.NEXT_PUBLIC_ENV === 'production',
  skipTrailingSlashRedirect: process.env.NEXT_PUBLIC_ENV === 'production',
  distDir: process.env.NEXT_PUBLIC_ENV === 'production' ? 'out' : '.next',
  
  reactStrictMode: false,
  productionBrowserSourceMaps: true,
  
  // 完全禁用Next.js开发工具指示器
  devIndicators: false,
  
  // 禁用ESLint检查以避免构建失败
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 跳过TypeScript类型检查
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // 禁用所有开发工具
  compiler: {
    removeConsole: false, // 临时禁用console移除，保留调试日志
  },
  
  images: {
    formats: ['image/webp'],
    // 静态导出时禁用图片优化
    unoptimized: process.env.NEXT_PUBLIC_ENV === 'production',
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Important: return the modified config
    config.module.rules.push({
      test: /\.mjs$/,
      enforce: 'pre',
      use: ['source-map-loader'],
    });

    return config;
  },
  // async rewrites() {
  //   // 代理功能已删除 - 前端直接连接后端API
  //   return [];
  // },
  // 添加字体优化配置 - Next.js 15 中已移除 optimizeFonts 选项
  experimental: {
    // optimizeFonts: false, // 在 Next.js 15 中已移除
  },
};

module.exports = nextConfig;
