import PageHeader from "@/components/page-header";
import CodeHeader from "@/components/section/about/code-header";
import LifeStyles from "@/components/about/life-styles";
import CodingStats from "@/components/about/coding-stats";
import AnimatedSection from "@/components/animated-section";
import markdownToHtml from "@/lib/markdownToHtml";
import { cn } from "@workspace/ui/lib/utils";
import { getBlogPosts } from "@/lib/api";
import { LatestArticles } from "@/components/about/latest-articles";

import config from "@/config";

import markdownStyles from "@/styles/markdown-styles.module.css";

const { about } = config;
const {
  firstName,
  lastName,
  preferredName,
  introduction,
  lifestyles,
  techStacks,
  githubUsername,
} = about;

async function About() {
  const allPosts = getBlogPosts();

  let header = preferredName
    ? `About ${preferredName} 👨🏻‍💻`
    : `About ${firstName} ${lastName} 👨🏻‍💻`;

  const content = await markdownToHtml(introduction || "");

  return (
    <article>
      <AnimatedSection id="about">
        <PageHeader header={header} />
      </AnimatedSection>
      <AnimatedSection>
        <CodeHeader id="introduction" text="$ ls -al Yujun 👨🏻‍💻 (He/Him)" />
        <div
          className={cn(markdownStyles["markdown"])}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </AnimatedSection>
      {allPosts.length > 0 && <LatestArticles posts={allPosts} />}
      <CodingStats techStacks={techStacks} githubUsername={githubUsername} />
      <LifeStyles lifestyles={lifestyles} />
    </article>
  );
}

export default About;
