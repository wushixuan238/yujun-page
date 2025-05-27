import Link from "next/link";
import { useState, useEffect } from "react";
import type { SocialLink } from "@/types/config";

interface SocialListProps {
  socialLinks: SocialLink[];
}

function SocialList({ socialLinks }: SocialListProps) {
  // 使用状态来确保客户端水合正确
  const [mounted, setMounted] = useState(false);
  
  // 只在客户端渲染后设置 mounted 为 true
  useEffect(() => {
    setMounted(true);
  }, []);

  // 如果还没挂载，返回一个占位结构以匹配服务端渲染
  if (!mounted) {
    return (
      <ul className="flex justify-start items-center gap-[15px] pb-1 pl-[7px] xl:justify-center md:justify-center">
        {socialLinks.map(({ name }) => (
          <li key={name} className="text-light-gray-70 text-lg hover:scale-110 hover:text-orange-yellow-crayola"></li>
        ))}
      </ul>
    );
  }
  
  // 客户端渲染完成后显示真实内容
  return (
    <ul className="flex justify-start items-center gap-[15px] pb-1 pl-[7px] xl:justify-center md:justify-center">
      {socialLinks.map(({ url, icon: Icon, name }) => (
        <li
          key={name}
          className="text-light-gray-70 text-lg hover:scale-110 hover:text-orange-yellow-crayola"
        >
          <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={name}
          >
            <Icon />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default SocialList;
