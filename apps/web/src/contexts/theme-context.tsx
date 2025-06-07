"use client";

import React, { useState, useEffect } from "react";

type Theme = "light" | "dark";

// 简化实现，不使用React上下文
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// 简单的主题切换函数
export function useThemeToggle() {
  // 默认使用暗色模式
  const [theme, setTheme] = useState<Theme>("dark"); 
  const [mounted, setMounted] = useState(false);

  // 确保主题状态更新后立即应用到DOM
  const applyTheme = (newTheme: Theme) => {
    // 先移除所有主题类，然后添加新主题
    document.documentElement.classList.remove("dark", "light"); 
    document.documentElement.classList.add(newTheme);
    
    // 保存到本地存储
    localStorage.setItem("theme", newTheme);
    console.log(`主题已设置为: ${newTheme}，HTML类名: ${document.documentElement.className}`);
  };

  // 初始加载时设置主题
  useEffect(() => {
    // 初始加载时，检查本地存储中的主题设置或系统偏好
    const storedTheme = localStorage.getItem("theme") as Theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    // 设置初始主题
    let initialTheme: Theme;
    if (storedTheme && (storedTheme === "light" || storedTheme === "dark")) {
      initialTheme = storedTheme;
    } else {
      initialTheme = "dark"; // 默认使用暗色模式，不考虑系统偏好
    }

    // 更新状态并应用主题
    setTheme(initialTheme);
    applyTheme(initialTheme);
    
    // 标记组件已挂载
    setMounted(true);
  }, []);

  // 切换主题的函数
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    applyTheme(newTheme);
    
    // 添加调试信息
    console.log(`主题已设置为: ${newTheme}`);
    console.log(`HTML类列表: ${document.documentElement.classList}`);
  };

  return { theme, toggleTheme, mounted };
}
