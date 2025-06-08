"use client";

import Giscus from "@giscus/react";
import type { GiscusProps } from "@giscus/react";
import { useThemeToggle } from "@/contexts/theme-context";

function Comments({ giscusConfig }: { giscusConfig: GiscusProps }) {
  // 使用主题上下文
  const { theme, mounted } = useThemeToggle();
  
  // 在客户端渲染时使用theme状态，服务端渲染时默认使用dark主题
  const currentTheme = mounted ? theme : "dark";
  
  // 根据当前主题选择 Giscus 主题
  const giscusTheme = currentTheme === "dark" 
    ? "dark_tritanopia"  // 暗色主题
    : "light"           // 亮色主题
  
  return (
    <Giscus
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
      loading={giscusConfig.loading}
    />
  );
}

export default Comments;
