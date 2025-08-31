---
title: "`claude-code`：把 Claude AI，直接请进你的Terminal"  
category: "Vibe-Coding"  
publishedAt: "2025-05-28"  
summary: "Vibe-Coding"  
tags:  
  - Vibe-Coding
banner: /images/banner/posts/sd/tip-github.png
alt: "图片替代文本"  
mathjax: false
---


# `claude-code`：把 Claude AI，直接请进你的Terminal

你是否曾迷失在前辈留下的、浩如烟海的百万行代码库里，只为寻找一个函数的定义？或者，为了完成一个繁琐的重构任务，在无数个文件之间跳转、修改，耗费了整整一个下午？

作为开发者，我们都懂这种痛。

现在，想象一下：你在终端里，用一句话描述你的需求，然后，一位“精通”你整个代码库的 AI 助手，瞬间就给出了答案。

这听起来像科幻电影，但 Anthropic 的新工具 **`claude-code`** 正在让它成为现实。

#### **`claude-code` 是什么？**

简单来说，`claude-code` 就是你代码的“新协作者”。

它不是一个需要打开的网站，也不是一个笨重的 IDE 插件。它是一个轻巧的命令行工具，让鼎鼎大名的 AI 模型 Claude，直接“住”进了你最熟悉的那个黑色窗口——你的终端里。

它就像一位与你并肩作战的编程伙伴。你用自然语言提问，它帮你理解、搜索、甚至改造你的代码库。

#### **它能为你做什么？（为什么你应该试试）**

根据官方的说法，`claude-code` 的核心魅力在于这几点：

1.  **闪电般的代码搜索**
    忘记 `grep` 和 `find` 的漫长等待吧。当你面对一个庞大而陌生的项目时，可以直接问 `claude-code`：“这个复杂的 `handlePayment` 函数到底在哪里被调用了？” 它能在百万行代码中，几乎是瞬间就为你定位到所有相关信息。

2.  **化繁为简的工作流**
    “将数小时的工作流程转变为一个命令。” 这句话最激动人心。过去需要手动查找、批量替换、验证修改的复杂任务（比如，升级一个被弃用的库），现在可能只需要向 `claude-code` 下达一条指令，例如：“帮我找出所有调用了旧版 `UserAPI` 的地方，并用新版 `ProfileService` 的方法替换它们。”

3.  **无缝融入你的习惯**
    最棒的是，你不需要改变你的工作习惯。你仍然可以使用你最爱的 Vim、Neovim、VSCode 的终端，或者任何你习惯的命令行环境。`claude-code` 尊重并融入你现有的工具链和工作流程，让 AI 的力量成为你指尖流淌的命令，而不是一个需要不断切换窗口的干扰。

#### **如何拥有这位“新同事”？**

安装过程非常简单：

1.  **前提**：确保你的电脑上安装了 [Node.js](https://nodejs.org/)，并且版本号不低于 18。
2.  **安装**：打开你的终端，运行下面这行命令：

    ```bash
    npm install -g @anthropic-ai/claude-code
    ```

就是这么简单。安装完成后，你就可以开始探索如何让这位 AI 协作者帮你提升工作效率了。

#### **结语**

`claude-code` 的出现，预示着一种新的编程范式：我们与代码的交互，将变得越来越像人与人之间的对话。代码的进化速度，正在以前所未有的方式追赶我们思维的速度。




### **Claude-Code 入门教程：手把手教你把 AI 编程助手请进终端**

想象一下，你可以在命令行里，用大白话让 AI 帮你阅读、理解、甚至修改整个代码项目。这不是未来，这就是 `claude-code`，一个能将 Claude 的强大能力直接集成到你终端的工具。

本教程将带你从零开始，一步步安装和使用 `claude-code`，让你亲身体验编码效率的飞跃。

#### **第一步：准备工作与安装 (Prerequisites & Installation)**

在开始之前，你需要准备两样东西：

1.  **Node.js 环境**: 确保你的电脑上安装了 Node.js，并且版本号不低于 18。
2.  **Anthropic API 密钥**: 你需要一个 Anthropic 的 API Key 才能使用这个工具。

准备好后，打开你的终端，输入以下命令来安装 `claude-code`：

```bash
npm install -g @anthropic-ai/claude-code
```

安装完成后，你需要让工具知道你的 API 密钥。你有两种方式可以进行设置：

*   **方式一（推荐）：登录命令**
    运行以下命令，它会引导你通过浏览器登录并自动保存密钥。
    ```bash
    cc login
    ```

*   **方式二：设置环境变量**
    你也可以将密钥设置为一个名为 `ANTHROPIC_API_KEY` 的环境变量。

#### **第二步：让 Claude “学习”你的项目 (Indexing)**

安装好了，现在我们要让 Claude “阅读”并理解你的代码库。这个过程被称为**“索引”（Indexing）**。

进入你的项目文件夹，然后运行：

```bash
cd /path/to/your/project
cc index
```

这个命令会做几件事：
*   它会扫描你项目中的所有文件。
*   默认情况下，它会很智能地忽略 `.gitignore` 文件里列出的内容，避免索引不必要的文件（如 `node_modules`）。
*   它会在你的项目根目录下创建一个名为 `.claude-code` 的隐藏文件夹，用来存放索引数据。

现在，Claude 已经把你的代码库“记在心里”了，随时准备回答你的问题。

#### **第三步：开始提问！查询你的代码 (Query)**

这是最激动人心的部分。你可以用 `cc query` (或者简写 `cc q`) 加上你的问题（用引号包起来）来向 Claude 提问。

**一些实用的例子：**

*   **理解代码功能：**
    ```bash
    # 问：这个文件是干嘛的？
    cc q "简要说明一下 a/b/c.js 这个文件的作用"
    ```

*   **寻找特定逻辑：**
    ```bash
    # 问：用户身份验证的逻辑在哪里实现的？
    cc q "where is the logic for user authentication?"
    ```

*   **理解错误信息：**
    ```bash
    # 问：这个报错是什么意思？
    cc q "what does this error message mean: 'TypeError: cannot read property 'x' of undefined'?"
    ```

#### **第四步：动手修改！编辑你的代码 (Edit)**

`claude-code` 不仅能看懂代码，还能帮你修改代码！`cc edit` (或简写 `cc e`) 命令可以根据你的指令，对整个代码库进行修改。

**一些强大的编辑示例：**

*   **添加代码注释：**
    ```bash
    # 指令：给所有 Python 函数添加文档字符串 (docstrings)
    cc e "add docstrings to all python functions"
    ```

*   **代码重构或升级：**
    ```bash
    # 指令：把所有 'async_function' 的用法替换成新的 'awaitable_task'
    cc e "replace all usages of 'async_function' with the new 'awaitable_task'"
    ```

*   **修复 Bug：**
    ```bash
    # 指令：修复 a/b/c.js 文件里那个 'x of undefined' 的 bug
    cc e "fix the 'x of undefined' bug in a/b/c.js"
    ```

运行 `edit` 命令后，Claude 会分析你的需求，然后生成一个修改计划。它会以交互式的方式，将每一处修改展示给你看，并询问你是否“接受 (accept)”、”拒绝 (reject)“ 或 ”全部接受 (accept all)“。这确保了所有修改都在你的掌控之中。

#### **进阶技巧：限定 Claude 的“视野” (Scope)**

有时候，你可能只想让 Claude 关注项目的某一部分，而不是整个代码库。这时，你可以使用 `--scope` 或 `-s` 参数来限定它的“视野”。

*   **只查询特定文件：**
    ```bash
    cc q "这个组件的状态是如何管理的？" -s src/components/UserProfile.jsx
    ```

*   **只编辑特定目录：**
    ```bash
    cc e "把这个目录下的所有 http 链接都换成 https" -s src/api/
    ```

这不仅能让结果更精确，还能加快处理速度。


#### Claude Code 使用 Kimi K2 模型

首先，安装node，安装clasud code

安装完成之后，运行：把claude命令安装在本地
```bash
claude migrate-installer
```

之后申请K2的API KEY 。https://platform.moonshot.ai/docs/introduction#getting-an-api-key


配置 API KEY；

在终端中输入以下命令来查看正在使用的 Shell：
```bash
echo $SHELL
```
- 如果输出结果包含 zsh (例如 /bin/zsh)，那么使用的是 Zsh。 需要编辑的文件是：~/.zshrc
- 如果输出结果包含 bash (例如 /bin/bash)，那么使用的是 Bash。需要编辑的文件是：~/.bashrc



```bash
# 将 YOUR_KIMI_API_KEY 替换为你自己的 Kimi API Key

#
export ANTHROPIC_BASE_URL="https://api.moonshot.cn/anthropic/"
export ANTHROPIC_API_KEY="YOUR_KIMI_API_KEY"
export PATH="$HOME/.claude/local:$PATH"
alias kimi='ANTHROPIC_AUTH_TOKEN=ANTHROPIC_API_KEY ANTHROPIC_BASE_URL=ANTHROPIC_BASE_URL claude --dangerously-skip-permissions'

alias claude="claude --dangerously-skip-permissions"
```

两个别名方便在不同的模型之间切换。


项目需求：
- Ant Design Pro 管理后台
- 修改用户信息和水印
- 新增页面，并且填充数据

技术要点：
- React + TypeScript
- 使用Ant Design Pro
- Mock数据合理

#### **总结**

恭喜你！你已经掌握了 `claude-code` 的基本用法。

1.  **安装和登录**：`npm install` 和 `cc login`。
2.  **索引项目**：`cc index`。
3.  **查询代码**：`cc q "你的问题"`。
4.  **编辑代码**：`cc e "你的指令"`。

现在，去你自己的项目里试试吧！无论是理解一个庞大的旧项目，还是在新项目里进行快速重构，`claude-code` 都有可能成为你最得力的命令行伙伴。