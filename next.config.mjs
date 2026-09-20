/** @type {import('next').NextConfig} */
import { AlphaTabWebPackPlugin } from '@coderline/alphatab-webpack';

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // alphaTab 需要 WebPack 5 插件处理 Web Workers / AudioWorklets / 字体 / SoundFont
    config.plugins.push(new AlphaTabWebPackPlugin());
    return config;
  },
};

export default nextConfig;
