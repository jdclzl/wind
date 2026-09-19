import './globals.css';

export const metadata = {
  title: '电吹管动态电子谱',
  description: '电吹管专用动态电子谱制作与播放工具',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
