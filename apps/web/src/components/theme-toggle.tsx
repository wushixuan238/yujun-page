"use client";

import React from "react";
import { useThemeToggle } from "@/contexts/theme-context";
import { MoonIcon, SunIcon } from "@heroicons/react/24/solid";

export default function ThemeToggle() {
  // 使用新的useThemeToggle钩子
  const { theme, toggleTheme, mounted } = useThemeToggle();

  // 如果未挂载，返回一个占位元素以避免布局偏移
  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  // 点击处理函数，在切换主题后添加一些调试信息
  const handleToggle = () => {
    toggleTheme();
    // 添加调试信息，查看是否切换成功
    console.log(`主题已切换为: ${theme === "light" ? "dark" : "light"}`);
    console.log(`HTML类名包含 dark: ${document.documentElement.classList.contains("dark")}`);
  };

  return (
    <button
      onClick={handleToggle}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${theme === "light" 
        ? "bg-white text-blue-600 shadow-md hover:bg-gray-100" 
        : "bg-gray-800 text-yellow-300 shadow-md hover:bg-gray-700"}`}
      aria-label={theme === "light" ? "切换到暗模式" : "切换到亮模式"}
    >
      {theme === "light" ? (
        <MoonIcon className="h-5 w-5" />
      ) : (
        <SunIcon className="h-5 w-5" />
      )}
      <span className="sr-only">{theme === "light" ? "切换到暗模式" : "切换到亮模式"}</span>
    </button>
  );
}
