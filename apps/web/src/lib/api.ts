import { Post } from "@/interfaces/post";
import fs from "fs";
import matter from "gray-matter";
import { join } from "path";

// const postsDirectory = join(process.cwd(), "src/contents/posts");
const postsDirectory = join(process.cwd(), "_posts");

export function getPostSlugs() {
  return fs.readdirSync(postsDirectory);
}

export function getPostBySlug(slug: string) {
  const realSlug = slug.replace(/\.md$/, "");
  const fullPath = join(postsDirectory, `${realSlug}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return { ...data, slug: realSlug, content } as Post;
}

export function getAllPosts(): Post[] {
  const slugs = getPostSlugs();
  const posts = slugs
    .map((slug) => {
      try {
        return getPostBySlug(slug);
      } catch (error) {
        console.error(`Error loading post ${slug}:`, error);
        return null;
      }
    })
    .filter((post): post is Post => post !== null) // 过滤掉加载失败的文章
    // sort posts by publishedAt in descending order
    .sort((post1, post2) => {
      // 将日期转换为标准格式进行比较
      const getDate = (post: any) => {
        try {
          const dateStr = post.publishedAt || post.date;
          if (!dateStr) return new Date(0); // 如果没有日期，返回最早的日期
          return new Date(dateStr);
        } catch (error) {
          console.error(`Error parsing date for post:`, post.slug, error);
          return new Date(0); // 出错时返回最早的日期
        }
      };
      
      const date1 = getDate(post1);
      const date2 = getDate(post2);
      
      // 降序排列，最新的在前面
      return date2.getTime() - date1.getTime();
    });
  return posts;
}
// 递归获取目录下所有的 .md 文件
function getAllMarkdownFiles(dir: string): string[] {
  const allFiles: string[] = [];

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归获取子目录中的文件
      const subFiles = getAllMarkdownFiles(fullPath);
      allFiles.push(...subFiles);
    } else if (file.endsWith('.md')) {
      // 只添加 .md 文件
      allFiles.push(fullPath);
    }
  }

  return allFiles;
}

export function getBlogPosts(): Post[] {
  const blogPostsDirectory = join(process.cwd(), "src/contents/posts");

  // 获取所有 .md 文件的完整路径
  const markdownFiles = getAllMarkdownFiles(blogPostsDirectory);

  const posts = markdownFiles
      .map((fullPath) => {
        // 从完整路径中提取相对于 posts 目录的路径部分作为 slug
        const relativePath = fullPath.replace(blogPostsDirectory, '');
        // 移除开头的斜杠和 .md 后缀
        const slug = relativePath.replace(/^\//, '').replace(/\.md$/, '');

        const fileContents = fs.readFileSync(fullPath, "utf8");
        const { data, content } = matter(fileContents);

        return {
          ...data,
          slug, // 使用相对路径作为 slug
          content,
          coverImage: data.banner || data.coverImage || ""
        } as Post;
      })
      .sort((post1, post2) => {
        // 保持你原有的排序逻辑
        const getDate = (post: any) => {
          const dateStr = post.publishedAt || post.date;
          if (!dateStr) return new Date(0);
          return new Date(dateStr);
        };

        const date1 = getDate(post1);
        const date2 = getDate(post2);

        return date2.getTime() - date1.getTime();
      });

  return posts;
}
