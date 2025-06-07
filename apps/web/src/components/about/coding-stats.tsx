import React from "react";
import CodeHeader from "@/components/section/about/code-header";
import Globe from "@/components/about/globe";
import GitHubCalendarWrapper from "./github-calendar";
import { Marquee } from "./marquee";
import { LuMapPin, LuZap } from "react-icons/lu";
import type { VCardIconType } from "@/types/config";
import { BlurFade } from "@/components/magicui/blur-fade";

import "@/styles/about/coding-stats.css";

interface TechStack {
  name: string;
  icon: VCardIconType;
}

interface TechStacks {
  programmingLanguages: TechStack[];
  frameworks: TechStack[];
}

interface CodingStatsProps {
  techStacks: TechStacks;
  githubUsername: string;
}

function CodingStats({ techStacks, githubUsername }: CodingStatsProps) {

  return (
    <section id="coding-stats">
      <BlurFade inView delay={0.4} direction="down">
        <CodeHeader id="coding-stats" text="$ ls -al Coding Stats" />
      </BlurFade>

      <BlurFade inView delay={0.4} direction="left">
        <ul className="mt-[30px] grid grid-cols-1 gap-[20px] md:grid-cols-2 lg:grid-cols-2 lg:gap-y-[20px] lg:gap-x-[25px]">
          <li className="relative rounded-2xl coding-item dark:bg-gradient-onyx dark:shadow-shadow-2 before:absolute before:content-[''] before:rounded-2xl">
            <div className="dark:shadow-feature-card-dark dark:shadow-feature-card flex flex-col gap-2 overflow-hidden rounded-xl p-2">
              <div className="flex items-center gap-2 dark:text-white-2 text-gray-800">
                <LuZap size={18} />
                <h2 className="text-sm font-light">Stacks</h2>
              </div>
              <Marquee gap="20px" className="py-2" fade pauseOnHover>
                {techStacks.programmingLanguages.map((stack) => (
                  <stack.icon
                    key={stack.name}
                    className="size-10 dark:text-white-2 text-gray-800 hover:scale-110 hover:text-blue-600 dark:hover:text-orange-yellow-crayola"
                  />
                ))}
              </Marquee>
              <Marquee gap="20px" className="py-2" reverse fade pauseOnHover>
                {techStacks.frameworks.map((stack) => (
                  <stack.icon
                    key={stack.name}
                    className="size-10 dark:text-white-2 text-gray-800 hover:scale-110 hover:text-blue-600 dark:hover:text-orange-yellow-crayola"
                  />
                ))}
              </Marquee>
            </div>
          </li>

          <li className="relative rounded-2xl coding-item dark:bg-gradient-onyx dark:shadow-shadow-2 before:absolute before:content-[''] before:rounded-2xl h-[200px] md:h-auto">
            <div className="absolute inset-x-0 bottom-[-190px] mx-auto aspect-square h-[388px] [@media(max-width:420px)]:bottom-[-140px] [@media(max-width:420px)]:h-[320px] [@media(min-width:768px)_and_(max-width:858px)]:h-[380px]">
              <div className="flex items-center gap-2 dark:text-white-2 text-gray-800 mt-4 ml-4">
                <LuMapPin size={18} />
                <h2 className="text-sm font-light">
                  Beijing, China (UTC +08:00)
                </h2>
              </div>
              <Globe />
            </div>
          </li>
        </ul>
      </BlurFade>

      <BlurFade inView delay={0.4} direction="up">
        <section id="github-calendar" className="dark:text-light-gray text-gray-800 mt-5">
          <GitHubCalendarWrapper username={githubUsername} />
        </section>
      </BlurFade>
    </section>
  );
}

export default CodingStats;
