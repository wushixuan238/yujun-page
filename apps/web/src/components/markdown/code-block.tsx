"use client";

import React, { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck } from "react-icons/fi";
import { useThemeToggle } from "@/contexts/theme-context";

interface CodeBlockProps {
  language: string;
  children: React.ReactNode;
  showLineNumbers?: boolean;
  fileName?: string;
}

function CodeBlock({ language, children, showLineNumbers = false, fileName }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme, mounted } = useThemeToggle();
  
  // 直接使用useThemeToggle中的mounted状态
  // 在客户端渲染时使用theme状态，服务端渲染时默认使用dark主题
  const currentTheme = mounted ? theme : "dark";
  // 强制切换主题，避免黑到白的过渡
  const codeTheme = theme === "dark" ? oneDark : oneLight;
  
  // 自定义样式，完全透明无边框
  const customStyle = {
    margin: '0',
    padding: fileName ? '2rem 0 0' : '0',
    position: 'relative' as const,
    boxShadow: 'none !important',
    border: 'none !important',
    borderWidth: '0 !important',
    borderRadius: '0 !important',
    // 不使用backgroundColor，避免与background属性冲突
  };

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (copied) {
      timeout = setTimeout(() => setCopied(false), 2000);
    }
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    const text = String(children).trimEnd();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  return (
    <div className="code-block-wrapper">
      {fileName && (
        <div className={`mb-1 text-xs font-mono flex justify-between items-center
          ${currentTheme === "dark" ? 'text-gray-400' : 'text-gray-500'}`}>
          <span>{fileName}</span>
          <span className="opacity-70">{language}</span>
        </div>
      )}
      
      <div className="relative overflow-x-auto no-border-code-block">
        <style jsx>{`
          .no-border-code-block :global(pre) {
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
          }
        `}</style>
        <SyntaxHighlighter 
          style={codeTheme} 
          language={language || "text"}
          showLineNumbers={false} // 强制禁用行号
          customStyle={customStyle}
          PreTag="div"
          wrapLines={true}
          wrapLongLines={true}
        >
          {String(children).trimEnd()}
        </SyntaxHighlighter>
        
        <button
          onClick={handleCopy}
          className={`absolute top-0 right-0 p-2 text-sm transition-all 
            ${currentTheme === "dark" 
              ? 'text-gray-400 hover:text-gray-300' 
              : 'text-gray-500 hover:text-gray-700'}`}
          aria-label="复制代码"
        >
          {copied ? <FiCheck className="h-4 w-4 text-green-500" /> : <FiCopy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default CodeBlock;
