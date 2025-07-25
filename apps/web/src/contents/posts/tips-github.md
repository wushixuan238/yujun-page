---
title: "一些Github使用技巧"  
category: "SD"  
publishedAt: "2025-05-28"  
summary: "DevTip"  
tags:  
  - DevTip
banner: /images/banner/posts/sd/tip-github.png
alt: "图片替代文本"  
mathjax: false
---

#  一些Github使用技巧



当内部排查陷入僵局，或者需要借鉴外部经验时，**检索能力**就显得尤为重要。一定不要小看搜索信息的能力。当我们遇到问题或者BUG时，我们可以去查找 **Google**  /  **Stack Overflow**，或者向其它一些优秀的社区寻求帮助。那么如果当我们遇到一个从0开始的需求，这时上述方案可能不够有效。

比如当老板要求实现一个支付接口，或者其他我们不熟悉的复杂功能时，最快的方式不是闭门造车，而是去 GitHub 搜索相关的开源项目，通常可以找到前人留下来的可以复用的代码。

那么如何在庞大的代码库中，快速检索出优质，有效的代码片段。这里来分享几个技巧。

---

### **DeepWiki**

释放AI知识库的力量，助你快速读懂所有GitHub代码库。使用方式很简单，只需将GitHub链接中的`github.com`替换为`deepwiki.com`

```shell
github.com --> deepwiki.com
```

---

### **GitHub.dev (Web-based VS Code)**

我们日常在 GitHub 上浏览代码时，常常会遇到这样的困扰： 当我们想深入了解一个项目，或者仅仅是查找某个具体文件时，不得不一级一级地点击文件夹，在 GitHub 网页界面中缓慢地穿梭。这不仅耗时，也极大地分散了注意力。

 为了更高效地浏览代码，我们往往会选择将整个仓库克隆（git clone）到本地，然后使用熟悉的 VS Code 或其他 IDE 进行查看。然而，很多时候，我们只是想看一眼、确认几行代码，之后这个庞大的本地仓库就成了“一次性”的冗余，占据了宝贵的硬盘空间，通常很快就会被删除。

这种“效率低下”与“环境设置繁琐”的矛盾，一直是困扰开发者的小痛点。

幸运的是，GitHub 带来了官方解决方案——**GitHub.dev**。它的出现，正是为了彻底解决上述问题。

当我们需要快速查看、浏览或进行轻量级代码编辑时，只需在浏览器中打开 GitHub 仓库页面，按下 **.** 键（dot），即可**秒开**一个功能强大的 VS Code 编辑器界面，无需任何本地安装、克隆或配置。这极大地降低了门槛，提供了即时可用的开发体验。



当然也可以使用**Codespaces (云开发环境)**，这是GitHub提供的完整的云端开发环境。它比GitHub.dev更强大，可以运行完整的IDE，安装依赖，运行测试，就像在本地开发一样。但是 通常需要GitHub的付费计划，本文暂不讨论。

---

### **文件快速查找** 

 在任何GitHub仓库页面，按下键盘上的 t 键。

会弹出一个模糊搜索框，你可以快速查找并跳转到当前仓库中的任何文件，在大型代码库中尤其有用。

---


### 快速切换 Git 代理设置

有时候，我们在公司内网需要取消代理才能上传到仓库，而回到家后又要设置代理访问 GitHub。手动修改 Git 配置很麻烦，这里分享几个快捷命令，一键切换 Git 代理设置。


- 查看Git当前代理设置
```bash
git config --global --get http.proxy
git config --global --get https.proxy
```

- 设置 Git 走代理
```bash
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

git config --global http.proxy socks5://127.0.0.1:10808
git config --global https.proxy socks5://127.0.0.1:10808 
```
根据代理工具调整（如 Clash、V2Ray）。

- 取消 Git 代理

```bash
git config --global --unset http.proxy
git config --global --unset https.proxy
```


###  **in 限制搜索范围**

它让你能够更精确地告诉 GitHub “我在找这个词，但只在标题里找，或者只在描述里找，或者只在评论里找”等等。这极大地提高了搜索的效率和结果的相关性。

```
react-components in:name,readme
```

可以通过 stars: 关键字来限制搜索结果中仓库的星标数量。查找星标数量大于或等于100的仓库：

```
stars:>=100
```

---

###  **"Awesome Lists"**

*Github 上最好的学习工具，技术栈的第二个官网。*

每个 Awesome List 都专注于一个明确的主题，例如 "Awesome Python"、"Awesome React Native"、"Awesome Machine Learning"等。**注意这不是一个简单的链接堆砌。**列表的维护者和社区成员会仔细筛选，只包含那些高质量、有用的、维护良好的项目、库、框架、工具、教程、文章等。

如果我们想寻找某个主题的 Awesome List，最直接的方式就是访问这个总列表，或者直接在 GitHub 上搜索 ：

```python
awesome <主题> 
# (例如 awesome javascript)
```

---

### **高亮某行/段代码**

在团队协作和开源项目中，我们经常需要给同事或社区贡献者指出代码中的某个特定位置。是截图？还是逐字描述？这些方法都显得过于笨拙且效率低下。

幸运的是，GitHub 提供了一个极其简洁而强大的功能——通过 URL 中的特定后缀，直接高亮代码的某一行或某一段。

```shell
// 示例：高亮代码的第 13 行
https://github.com/your-org/your-repo/blob/main/src/utils.js#L13

// 示例：高亮代码的第 13 行到第 55 行
https://github.com/your-org/your-repo/blob/main/src/components/MyComponent.vue#L13-L55
```



当我们在 GitHub 上分享这样的链接时，接收者点击后，页面会**自动滚动到你指定的位置**，并将那一行或那一段代码**高亮显示**，让你想强调的关键代码一目了然。这在代码审查 (Code Review)、Bug 报告、功能讨论，或是日常的代码指引中，都极大地提升了沟通效率。

尤其值得一提的是，#L 后面跟行号的这种用法，已经成为许多大型开发团队和开源社区的**“行话**。当你听到有人说：*“你看看 utils.js 的 #L13 出了什么问题*”，或者*“那个新功能在 MyComponent.java的 #L13-#L55 部分”*，这就是在考察你是否经常和别人一起干活，是否积极参与过开源项目，或者是否关注过高效的协作方式。

掌握这个小技巧，不仅能让我们在技术交流中显得更专业，更能真正让我们融入高效的开发协作流程中。

---

### **搜索某个区域的大佬**

同样也有一套公式：首先明确搜索目标是用户。其次是用户自己填写的 `location` 字段。最后 通过 `language:, topic:` 搜索相关项目，或者直接进入项目看贡献者，这往往更有效。

```
type:user location: Hefei language: java
```

code之余，也可以适当的交交朋友。



---

**参考资料**

1. [Deep Wiki](https://deepwiki.org/) 
2. [尚硅谷周阳老师](https://www.bilibili.com/video/BV18b411M7xz?spm_id_from=333.788.videopod.episodes&vd_source=e21e063e621dfddd56692c536c0b719f&p=113) 