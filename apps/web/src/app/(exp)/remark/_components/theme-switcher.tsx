"use client";

import styles from "./switch.module.css";
import "./light-theme.css";
import { memo, useEffect, useState } from "react";

declare global {
  var updateDOM: () => void;
}

type ColorSchemePreference = "system" | "dark" | "light";

const STORAGE_KEY = "nextjs-blog-starter-theme";
const modes: ColorSchemePreference[] = ["light", "system", "dark"];

/** to reuse updateDOM function defined inside injected script */

/** function to be injected in script tag for avoiding FOUC (Flash of Unstyled Content) */
export const NoFOUCScript = (storageKey: string) => {
  /* can not use outside constants or function as this script will be injected in a different context */
  const [SYSTEM, DARK, LIGHT] = ["system", "dark", "light"];

  /** Modify transition globally to avoid patched transitions */
  const modifyTransition = () => {
    const css = document.createElement("style");
    css.textContent = "*,*:after,*:before{transition:none !important;}";
    document.head.appendChild(css);

    return () => {
      /* Force restyle */
      getComputedStyle(document.body);
      /* Wait for next tick before removing */
      setTimeout(() => document.head.removeChild(css), 1);
    };
  };

  const media = matchMedia(`(prefers-color-scheme: ${DARK})`);

  /** function to add remove dark class */
  window.updateDOM = () => {
    const restoreTransitions = modifyTransition();
    // 如果没有存储的设置，默认使用明亮模式
    const mode = localStorage.getItem(storageKey) ?? LIGHT;
    const systemMode = media.matches ? DARK : LIGHT;
    const resolvedMode = mode === SYSTEM ? systemMode : mode;
    const classList = document.documentElement.classList;
    
    // 移除所有可能的主题类
    classList.remove(DARK);
    classList.remove(LIGHT);
    
    // 添加当前主题类
    classList.add(resolvedMode);
    
    // 设置data-mode属性，这将触发CSS中的明亮模式样式
    document.documentElement.setAttribute("data-mode", resolvedMode);
    
    // 强制应用一些关键样式以确保主题切换生效
    if (resolvedMode === LIGHT) {
      document.body.style.background = '#f5f5f5';
      document.body.style.color = '#333333';
    } else {
      document.body.style.background = '';
      document.body.style.color = '';
    }
    
    restoreTransitions();
    
    console.log('Theme updated to:', mode, 'resolved as:', resolvedMode);
  };
  window.updateDOM();
  media.addEventListener("change", window.updateDOM);
};

let updateDOM: () => void;

/**
 * Switch button to quickly toggle user preference.
 */
const Switch = () => {
  // 使用useState的惰性初始化函数，确保只在客户端执行localStorage操作
  const [mode, setMode] = useState<ColorSchemePreference>(
    () => {
      // 检查是否在客户端环境
      if (typeof window === "undefined") {
        // 服务器端渲染时，始终返回light模式，保持与客户端初始状态一致
        return "light";
      }
      
      // 检查localStorage中是否有存储的主题设置
      let storedMode = localStorage.getItem(STORAGE_KEY);
      
      // 如果没有存储的设置或者不是有效值，强制设置为明亮模式
      if (!storedMode || !modes.includes(storedMode as ColorSchemePreference)) {
        storedMode = "light";
        localStorage.setItem(STORAGE_KEY, storedMode);
      }
      
      return storedMode as ColorSchemePreference;
    }
  );

  useEffect(() => {
    // 确保window.updateDOM存在
    if (typeof window !== 'undefined' && window.updateDOM) {
      // store global functions to local variables to avoid any interference
      updateDOM = window.updateDOM;
      
      // 初始应用主题
      localStorage.setItem(STORAGE_KEY, mode);
      updateDOM();
      
      /** Sync the tabs */
      addEventListener("storage", (e: StorageEvent): void => {
        e.key === STORAGE_KEY && setMode(e.newValue as ColorSchemePreference);
      });
    }
  }, [mode]);

  useEffect(() => {
    if (typeof updateDOM === 'function') {
      localStorage.setItem(STORAGE_KEY, mode);
      updateDOM();
      console.log('Theme mode changed to:', mode);
    }
  }, [mode]);

  /** toggle mode */
  const handleModeSwitch = () => {
    const index = modes.indexOf(mode);
    const newMode = modes[(index + 1) % modes.length];
    console.log('Switching theme from', mode, 'to', newMode);
    setMode(newMode);
  };
  return (
    <button
      suppressHydrationWarning
      className={styles.switch}
      onClick={handleModeSwitch}
      title={`当前主题: ${mode}, 点击切换`}
      aria-label="切换主题模式"
    />
  );
};

const Script = memo(() => (
  <script
    dangerouslySetInnerHTML={{
      __html: `(${NoFOUCScript.toString()})('${STORAGE_KEY}')`,
    }}
  />
));

/**
 * This component wich applies classes and transitions.
 */
export const ThemeSwitcher = () => {
  return (
    <>
      {/* 添加suppressHydrationWarning属性，防止水合警告 */}
      <div suppressHydrationWarning>
        <Script />
        <Switch />
      </div>
    </>
  );
};
