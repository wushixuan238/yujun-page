"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ProgressBarLink } from "@/components/progress-bar";
import type { NavigationLink } from "@/types/nav-bar";
import { BlurFade } from "@/components/magicui/blur-fade";
import ThemeToggle from "@/components/theme-toggle";

interface NavigationHeaderProps {
  navigationLinks: NavigationLink[];
}

function Header({ navigationLinks }: NavigationHeaderProps) {
  const currentPath = usePathname();

  const isActive = (path: string) => {
    if (path === "/post" && currentPath.startsWith("/post")) return true;
    else if (path === "/portfolio" && currentPath.startsWith("/portfolio"))
      return true;
    return currentPath === path;
  };

  return (
    <header className="fixed bottom-0 left-0 w-full backdrop-blur-[10px] dark:bg-[hsla(240,1%,17%,0.75)] bg-[hsla(0,0%,100%,0.9)] border dark:border-[var(--jet)] border-gray-200 shadow-xl z-[5] lg:absolute lg:bottom-auto lg:top-0 lg:left-auto lg:right-0 lg:w-max lg:shadow-none lg:px-5 rounded-t-[12px] sm:rounded-t-[20px] lg:rounded-[0_20px]">
      <BlurFade direction="up">
        <div className="flex items-center justify-between">
          <ul className="flex flex-wrap justify-center items-center px-2.5 sm:gap-5 lg:gap-[30px] lg:px-5">
            {navigationLinks.map((link, index) => {
              // 在"关于我"链接之前插入主题切换按钮
              const isAboutLink = link.path === "/";
              return (
                <React.Fragment key={link.path}>
                  {isAboutLink && (
                    <li className="pr-2">
                      <ThemeToggle />
                    </li>
                  )}
                  <li>
                    <ProgressBarLink
                      href={link.path}
                      className={`block p-5 px-[7px] dark:text-light-gray text-gray-800 transition-colors duration-250 ease-in-out md:text-[15px] sm:text-[14px] text-[11px] ${
                        isActive(link.path)
                          ? "active text-blue-600 dark:text-orange-yellow-crayola hover:text-blue-700 dark:hover:text-orange-yellow-crayola font-bold"
                          : "hover:text-gray-600 dark:hover:text-light-gray-70 font-medium"
                      }`}
                    >
                      {link.label}
                    </ProgressBarLink>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </div>
      </BlurFade>
    </header>
  );
}

export default Header;
