"use client";

import React, { useEffect, useState } from "react";
import GitHubCalendar from "react-github-calendar";
import { ThemeInput } from "react-activity-calendar";

interface GitHubCalendarWrapperProps {
  username: string;
}

export default function GitHubCalendarWrapper({ username }: GitHubCalendarWrapperProps) {
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");
  
  // 蓝色主题定义
  const blueTheme: ThemeInput = {  
    light: ["#FFFFFF", "#72C1FF"], // 使用纯白色背景和蓝色活跃方块  
    dark: ["#383838", "#72C1FF"],  // 暗色模式保持原样  
  };

  useEffect(() => {
    // 在客户端渲染时检查当前主题
    const isDark = document.documentElement.classList.contains("dark");
    setColorScheme(isDark ? "dark" : "light");
    
    // 监听主题变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          const isDarkMode = document.documentElement.classList.contains("dark");
          setColorScheme(isDarkMode ? "dark" : "light");
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    
    return () => observer.disconnect();
  }, []);

  return (
    <GitHubCalendar
      username={username}
      blockSize={12}
      blockMargin={4}
      colorScheme={colorScheme}
      blockRadius={2}
      fontSize={14}
      style={{ fontWeight: "bold" }}
      theme={blueTheme}
    />
  );
}
