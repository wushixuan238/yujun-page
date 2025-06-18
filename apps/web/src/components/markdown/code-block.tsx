"use client";

import React, { useState, useEffect } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck } from "react-icons/fi";
import { useThemeToggle } from "@/contexts/theme-context";

// 导入常用语言支持
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";

// 注册语言
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', typescript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('sql', sql);

interface CodeBlockProps {
  language: string;
  children: React.ReactNode;
  showLineNumbers?: boolean;
  fileName?: string;
}

function CodeBlock({ language, children, showLineNumbers = false, fileName }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme, mounted } = useThemeToggle();
  
  // 在客户端渲染时使用theme状态，服务端渲染时默认使用dark主题
  const currentTheme = mounted ? theme : "dark";
  
  // 根据主题选择代码高亮主题
  const codeTheme = currentTheme === "dark" ? oneDark : oneLight;
  
  // 自定义样式
  const customStyle = {
    margin: '0',
    padding: fileName ? '1.5rem 0 0' : '0.5rem',
    position: 'relative' as const,
    boxShadow: 'none',
    border: 'none',
    borderRadius: '0',
    backgroundColor: currentTheme === "dark" ? '#1e1e1e' : '#f8f8f8',
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

  // 解析语言标识符，处理特殊情况
  let codeLanguage = language?.toLowerCase() || 'text';
  
  // 处理常见的语言别名
  if (codeLanguage === 'js') codeLanguage = 'javascript';
  if (codeLanguage === 'ts') codeLanguage = 'typescript';
  if (codeLanguage === 'py') codeLanguage = 'python';
  
  return (
    <div className={`code-block-wrapper rounded-md overflow-hidden my-4 ${currentTheme === "dark" ? 'dark-code-block' : 'light-code-block'}`}>
      {fileName && (
        <div className={`px-4 py-1 text-xs font-mono flex justify-between items-center
          ${currentTheme === "dark" ? 'text-gray-300 bg-gray-800' : 'text-gray-600 bg-gray-100'}`}>
          <span>{fileName}</span>
          <span className="opacity-70">{codeLanguage}</span>
        </div>
      )}
      
      <div className="relative overflow-hidden">
        <SyntaxHighlighter 
          style={codeTheme} 
          language={codeLanguage}
          showLineNumbers={false}
          customStyle={customStyle}
          codeTagProps={{
            style: {
              fontSize: '0.9rem',
              fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }
          }}
        >
          {String(children).trimEnd()}
        </SyntaxHighlighter>
        
        <button
          onClick={handleCopy}
          className={`absolute top-2 right-2 p-2 rounded-md transition-all 
            ${currentTheme === "dark" 
              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}
          aria-label="复制代码"
        >
          {copied ? <FiCheck className="h-4 w-4 text-green-500" /> : <FiCopy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default CodeBlock;
