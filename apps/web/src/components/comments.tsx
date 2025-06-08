"use client";

import Giscus from "@giscus/react";
import type { GiscusProps } from "@giscus/react";
import { useThemeToggle } from "@/contexts/theme-context";
import { useState, useEffect, useRef } from "react";

function Comments({ giscusConfig }: { giscusConfig: GiscusProps }) {
  // 使用主题上下文
  const { theme, mounted } = useThemeToggle();
  const [configError, setConfigError] = useState<string | null>(null);
  // 使用 key 强制在主题切换时重新渲染组件
  const [giscusKey, setGiscusKey] = useState(0);
  // 记录上一次的主题
  const prevThemeRef = useRef<string | null>(null);
  
  // 在客户端渲染时使用theme状态，服务端渲染时默认使用dark主题
  const currentTheme = mounted ? theme : "dark";
  
  // 根据当前主题选择 Giscus 主题
  const giscusTheme = currentTheme === "dark" 
    ? "dark_tritanopia"  // 暗色主题
    : "light"           // 亮色主题
  
  // 在主题变化时重新渲染 Giscus
  useEffect(() => {
    // 如果主题改变且不是首次渲染，则更新 key 强制重新渲染
    if (prevThemeRef.current !== null && prevThemeRef.current !== currentTheme) {
      setGiscusKey(prev => prev + 1);
      
      // 尝试使用 Giscus 消息 API 更新主题
      try {
        const iframe = document.querySelector<HTMLIFrameElement>('.giscus-frame');
        if (iframe) {
          const message = {
            giscus: {
              setConfig: {
                theme: giscusTheme
              }
            }
          };
          iframe.contentWindow?.postMessage(message, 'https://giscus.app');
        }
      } catch (e) {
        console.error('尝试更新 Giscus 主题失败:', e);
      }
    }
    
    // 更新上一次主题引用
    prevThemeRef.current = currentTheme;
  }, [currentTheme, giscusTheme]);
  
  useEffect(() => {
    // 检查 Giscus 配置
    if (!giscusConfig.repoId || giscusConfig.repoId === "") {
      setConfigError("Giscus repoId 未设置，请检查环境变量 NEXT_PUBLIC_GISCUS_REPO_ID");
      console.error("Giscus repoId 未设置，请检查环境变量 NEXT_PUBLIC_GISCUS_REPO_ID");
    }
    
    if (!giscusConfig.categoryId || giscusConfig.categoryId === "") {
      setConfigError("Giscus categoryId 未设置，请检查环境变量 NEXT_PUBLIC_GISCUS_CONFIG_CATEGORY_ID");
      console.error("Giscus categoryId 未设置，请检查环境变量 NEXT_PUBLIC_GISCUS_CONFIG_CATEGORY_ID");
    }
    
    // 输出当前配置信息，便于调试
    console.log("Giscus 配置信息:", {
      repo: giscusConfig.repo,
      repoId: giscusConfig.repoId,
      category: giscusConfig.category,
      categoryId: giscusConfig.categoryId,
    });
  }, [giscusConfig]);
  
  // 如果有配置错误，显示错误信息
  if (configError) {
    return (
      <div className="p-4 rounded-md bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200">
        <p className="font-medium">评论系统配置错误</p>
        <p className="mt-1">{configError}</p>
        <p className="mt-2 text-sm">请联系网站管理员解决此问题。</p>
      </div>
    );
  }
  
  // 正常渲染 Giscus 组件，使用 key 强制在主题切换时重新渲染
  return (
    <div className="giscus-wrapper">
      <Giscus
        key={giscusKey}
        id={giscusConfig.id}
        repo={giscusConfig.repo}
        repoId={giscusConfig.repoId}
        category={giscusConfig.category}
        categoryId={giscusConfig.categoryId}
        mapping={giscusConfig.mapping}
        term={giscusConfig.term}
        reactionsEnabled={giscusConfig.reactionsEnabled}
        emitMetadata={giscusConfig.emitMetadata}
        inputPosition={giscusConfig.inputPosition}
        theme={giscusTheme}  /* 使用动态主题 */
        lang={giscusConfig.lang}
        loading="eager"  /* 改为立即加载，而不是懒加载 */
      />
    </div>
  );
}

export default Comments;
