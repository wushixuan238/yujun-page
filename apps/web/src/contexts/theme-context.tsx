"use client";

import React, { useState, useEffect, createContext, useContext } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

// 创建主题上下文
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 提供主题状态和切换函数的Provider组件
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 默认使用暗色模式
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // 确保主题状态更新后立即应用到DOM
  const applyTheme = (newTheme: Theme) => {
    if (typeof document !== 'undefined') {
      // 先移除所有主题类，然后添加新主题
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(newTheme);
      
      // 保存到本地存储
      localStorage.setItem("theme", newTheme);
    }
  };

  // 初始加载时设置主题
  useEffect(() => {
    // 确保只在客户端执行
    if (typeof window !== 'undefined') {
      // 初始加载时，检查本地存储中的主题设置
      const storedTheme = localStorage.getItem("theme") as Theme;
      
      // 设置初始主题
      let initialTheme: Theme;
      if (storedTheme && (storedTheme === "light" || storedTheme === "dark")) {
        initialTheme = storedTheme;
      } else {
        initialTheme = "dark"; // 默认使用暗色模式
      }

      // 更新状态并应用主题
      setTheme(initialTheme);
      applyTheme(initialTheme);
    }
    
    // 标记组件已挂载
    setMounted(true);
  }, []);

  // 切换主题的函数
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  // 只有在客户端挂载后才渲染子组件，以避免服务器端渲染和客户端渲染不匹配
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// 使用主题上下文的Hook
export function useThemeToggle() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeToggle must be used within a ThemeProvider');
  }
  
  // 增加挂载状态，用于客户端渲染
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  return { 
    theme: context.theme, 
    toggleTheme: context.toggleTheme, 
    mounted 
  };
}
