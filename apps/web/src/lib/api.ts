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

// 从 src/contents/posts 目录读取博客文章
export function getBlogPosts(): Post[] {
  const blogPostsDirectory = join(process.cwd(), "src/contents/posts");
  
  // 只返回 .md 文件，忽略目录
  const slugs = fs.readdirSync(blogPostsDirectory)
    .filter(file => file.endsWith('.md'));
    
  const posts = slugs
    .map((slug) => {
      const realSlug = slug.replace(/\.md$/, "");
      const fullPath = join(blogPostsDirectory, `${realSlug}.md`);
      const fileContents = fs.readFileSync(fullPath, "utf8");
      const { data, content } = matter(fileContents);
      
      // 将 banner 字段映射到 coverImage 字段
      return { 
        ...data, 
        slug: realSlug, 
        content,
        coverImage: data.banner || data.coverImage || ""
      } as Post;
    })
    // sort posts by publishedAt in descending order
    .sort((post1, post2) => {
      // 将日期转换为标准格式进行比较
      const getDate = (post: any) => {
        const dateStr = post.publishedAt || post.date;
        if (!dateStr) return new Date(0); // 如果没有日期，返回最早的日期
        return new Date(dateStr);
      };
      
      const date1 = getDate(post1);
      const date2 = getDate(post2);
      
      // 降序排列，最新的在前面
      return date2.getTime() - date1.getTime();
    });
    
  return posts;
}
