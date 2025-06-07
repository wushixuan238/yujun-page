import { ThemeProvider } from "@/contexts/theme-context";
import { roboto } from "@/app/fonts";

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    // 使用suppressHydrationWarning属性抑制水合错误警告
    <html lang="zh-CN" className={roboto.className} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // 立即应用主题，避免闪烁
                  var storedTheme = localStorage.getItem('theme');
                  var theme = storedTheme === 'light' ? 'light' : 'dark';
                  
                  // 先移除所有主题类，再添加新主题
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(theme);
                } catch (e) {
                  // 出错时使用默认的暗色主题
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
