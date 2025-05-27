import Container from "@/app/(exp)/remark/_components/container";
import { HeroPost } from "@/app/(exp)/remark/_components/hero-post";
import { MoreStories } from "@/app/(exp)/remark/_components/more-stories";
import PageHeader from "@/components/page-header";

// 静态备份数据
const fallbackPost = {
  title: "欢迎来到Hugo的博客",
  coverImage: "/images/banner/posts/0001-two-sum.webp",
  date: "2025-01-01",
  author: { name: "1chooo", picture: "https://github.com/1chooo.png" },
  slug: "welcome",
  excerpt: "这里是Hugo的博客，分享技术和生活。"
};

export default function Index() {
  // 使用静态数据
  const heroPost = fallbackPost;
  const morePosts = [];

  return (
    <article>
      <PageHeader header="Hugo's Blog" />
      <Container>
        {heroPost ? (
          <HeroPost
            title={heroPost.title || ""}
            coverImage={heroPost.coverImage || ""}
            date={heroPost.date || ""}
            author={heroPost.author || { name: "1chooo", picture: "https://github.com/1chooo.png" }}
            slug={heroPost.slug || ""}
            excerpt={heroPost.excerpt || ""}
          />
        ) : (
          <div className="py-8 text-center">
            <h3 className="text-2xl">暂无博客文章</h3>
          </div>
        )}
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </article>
  );
}
