import { ThemeProvider } from "@/contexts/theme-context";
import { roboto } from "@/app/fonts";

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${roboto.className} dark`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // 默认使用暗色主题
                document.documentElement.classList.add('dark');
                // 检查本地存储是否有存储的主题设置
                const storedTheme = localStorage.getItem('theme');
                // 仅当明确设置为light时才移除dark类
                if (storedTheme === 'light') {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.classList.add('light');
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
