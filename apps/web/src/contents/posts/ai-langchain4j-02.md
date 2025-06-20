---
title: "Langchain4j（三）：RAG"  
category: "AI"  
publishedAt: "2025-05-29"  
summary: "Langchain4j"  
tags:  
  - AI    
banner: /images/banner/posts/aicoding/langchain4j-02.png 
alt: "图片替代文本"  
mathjax: false
---

# Langchain4j（三）：RAG

LLM 拥有很强的通用知识，但在实际应用场景中，我们很快会遇到LLM的几个固有局限：

* 受限于训练数据的截至日期，知识的时限性不足。
* 幻觉问题，当 LLM 面对其知识范围外的问题时，可能会“一本正经地胡说八道”。
* 缺乏领域专业知识，LLM 是通用模型，不了解特定企业内部的规章制度、产品手册、客户案例、内部报告等私有、非公开的知识。
* 成本，一种可能的解决方法是使用微调技术，但是微调（Fine-tuning）大型 LLM 成本高昂且耗时，难以频繁更新以适应知识变化。

于是，RAG（知识检索增强技术）应运而生，它是一种巧妙的解决方案，能够弥补 LLM 的这些不足。RAG 的核心思想是：**在 LLM 生成答案之前，先从一个外部的、专业的、通常是私有的知识库中“检索”相关的、最新的信息，然后将这些检索到的信息作为“上下文”提供给 LLM，让 LLM 基于这些“事实”生成最终的答案。**

LangChain4j 作为 LangChain 框架在 Java 生态的实现，为构建 RAG 提供了强大且易用的工具集。本文将从零开始，深入理解 LangChain4j RAG 的核心原理、关键组件，并通过实战演示其强大的功能。

## RAG的核心工作原理

RAG的核心流程分为两大阶段：

* 索引阶段（数据准备阶段）：构建你的知识库
* 检索阶段（查询/生成阶段）：利用知识库来回答问题

具体来说，索引阶段这个阶段的目标是将你的原始非结构化文档（如 PDF、Word、Markdown、HTML、文本文件等）转化为 LLM 可以理解并高效检索的格式，并存储起来。常用的API有：

* `Document` (文档): 你的原始数据单元，比如一篇完整的文章、一份报告。在 LangChain4j 中，用 `dev.langchain4j.data.document.Document` 类表示。
* `DocumentLoader` (文档加载器): 负责从各种来源加载原始文档并转换为 Document 对象。例如 `FileSystemDocumentLoader` (从文件系统加载)、`UrlDocumentLoader` (从网页加载)、`AwtImageDocumentParser` (解析图片中的文本) 等。
* `TextSplitter` (文本分割器): 原始文档往往很长，可能超出 LLM 的上下文窗口限制。文本分割器将大文档分割成更小、更有意义、且语义独立的“文本块” (`TextSegment`)。

    * 常用实现：`RecursiveCharacterTextSplitter` (递归字符分割，灵活控制块大小和重叠)、`DocumentByParagraphSplitter` (按段落分割，保持语义完整性)。
* `EmbeddingModel` (嵌入模型): 这是 RAG 的核心。它将文本（包括分割后的文本块和用户查询）转换为固定维度的数值向量（称为“嵌入”或“向量”）。这些向量能够捕捉文本的语义信息，语义相似的文本会有相似的向量。

    * LLM Provider: `OpenAiEmbeddingModel`, `OllamaEmbeddingModel`, `GoogleVertexAiEmbeddingModel` 等
* `EmbeddingStore` (向量存储): 用于存储所有文本块的向量及其对应的原始文本内容。它是一个专门用于高效存储和检索向量的数据库（或内存结构），支持“向量相似度搜索”。

    * 常见实现： `InMemoryEmbeddingStore` (内存存储，用于演示)、`ChromaEmbeddingStore`, `PineconeEmbeddingStore`, `QdrantEmbeddingStore`, `MilvusEmbeddingStore`, `WeaviateEmbeddingStore`, `PostgresEmbeddingStore` (基于 pgvector 扩展)。

流程大概如下：

```text
原始文档 (PDF/TXT/HTML/DOCX...)
        ↓ (DocumentLoader: 加载)
LangChain4j Document 对象
        ↓ (TextSplitter: 分割)
多个 TextSegment (文本块)
        ↓ (EmbeddingModel: 文本转向量)
向量 (Vector) + 原始文本块
        ↓ (EmbeddingStore: 存储)
构建完成的知识库 (向量数据库/存储)
```

而对于检索阶段来说：

当用户提出问题时，RAG 系统会执行以下步骤：

* 用户查询: 用户输入一个问题（例如：“公司最新的报销政策是什么？”）。
* 查询嵌入: 用户的查询也会通过与数据准备阶段相同的 `EmbeddingModel` 转换为一个向量。
* Retriever (检索器): 使用查询向量在 `EmbeddingStore` 中进行相似度搜索，找到与用户查询语义最相关的 K 个文本块（即“知识片段”）。
    * 常用实现： `EmbeddingStoreRetriever` (最常见)。
* 上下文增强 (Context Augmentation): 将检索到的相关文本块（原始文本内容）作为额外信息（上下文）添加到原始用户查询中，构建一个增强型提示词。
* `ChatLanguageModel` (LLM): LLM 接收这个“**增强后的**”提示词，结合其通用知识和提供的上下文，生成一个更准确、更专业、不易产生幻觉的答案。

流程大概如下：

```text
用户查询
        ↓ (EmbeddingModel: 查询转向量)
查询向量
        ↓ (Retriever: 向量相似度搜索，从 EmbeddingStore 获取)
最相关的 TextSegment (知识片段)
        ↓ (RAG Chain: 将知识片段作为上下文注入提示词)
增强型提示词 (用户问题 + 检索到的知识)
        ↓ (ChatLanguageModel: 基于增强提示词生成答案)
最终答案 (基于事实的、用户友好的)
```

## 实操

#### 配置 LLM 和 Embedding Model

不同于刚入门的时候，我们只配置了LLM，即 `ChatLanguageModel`，这里我们还要配置一下`EmbeddingModel`
，确保 `EmbeddingModel` 的 API Key 和模型名称正确。

```yaml
# src/main/resources/application.yml
langchain4j:
  openai:
    chat-model:
      api-key: ${OPENAI_API_KEY} # 从环境变量中获取 API Key
      model-name: gpt-3.5-turbo # 用于聊天
      temperature: 0.7
      timeout: 60s
      log-requests: true
      log-responses: true
    embedding-model: # 用于生成嵌入向量，RAG 必备
      api-key: ${OPENAI_API_KEY}
      model-name: text-embedding-ada-002 # 推荐使用 newer: embedding-3-small 或 embedding-3-large
      timeout: 60s
```

#### 文档解析器

文档可以是各种格式的文件，比如 PDF、DOC、TXT等等。为了解析这些不同格式的文件，有一个“文档解析器”(`DocumentParser`)接口，要根据不同的文档类型，选择不同的文档解析器，不然就会出现解析不成功乱码错误。langchain4j库中包含了该接口的几种实现方式:

* 来自 langchain4j 模块的文本文档解析器(`TextDocuentParser`)，也是默认的文档解析器。它能够解析纯文本格式的文件(例如 TXT、HTML、MD 等)。
* 来自 langchain4j-document-parser-apache-pdfbox 模块的 Apache PDFBox文档解析器(`ApachePDFBoxDocumentParser`)，它可以解析 PDF 文件。
* 来自 langchain4j- document-parser-apache-poi 模块的 Apache POl 文档解析器(`ApachePoiDocumentParser`)，它能够解析微软办公软件的文件格式(例如 DOC、DOCX、PPT、PPTX、等)。
* ·来自 langchain4j-document-parser-apache-tika 模块的 Apache Tika 文档解析器(`ApacheTikaDocumentParser`)，它可以自动检测并解析几乎所有现有的文件格式。

假设如果我们想解析PDF文档，那么原有的 `TextDocuentParser` 就无法工作了，我们需要引入 `langchain4j-document-parser-apache-pdfbox`。

#### 文档分割器

首先，为什么需要对文档进行切分，不能直接喂给LLM？

大型语言模型（LLM）虽然强大，但它们有一个显著的限制：上下文窗口 (Context Window) 大小。这意味着每次调用 LLM API 时，我们能够发送的总 Token 数量是有限的（例如，GPT-3.5-turbo 可能是 4K 或 16K Token，GPT-4 可能更大，但仍然有限）。

如果原始文档（如长篇报告、书籍、产品手册）往往远远超出这个上下文窗口的限制。如果直接将整个文档发送给 LLM，将会导致超出 Token 限制： 导致 API 调用失败；成本飙升： 即使勉强塞进去，Tokens 越多，成本越高；性能下降： 处理长上下文会增加 LLM 的推理时间；信息丢失： LLM 难以在超长文本中找到最相关的细枝末节，重要的信息可能被“淹没”。

因此文档分割器应运而生，它的目标是将一个大型的 `Document` 对象，智能地切分成多个更小、更具语义连贯性的文本块 (`TextSegment`)。这些文本块就是 LLM 能够处理的“知识单元”。

Langchain4j 中同样也给我们提供了一个文档分割器的接口：`DocumentSplitter`。并提供了开箱即用的几种实现方式，我们也可以根据此接口进行二次开发。

* `DocumentByParagraphSplitter`：按段落进行分割， 顾名思义，它会尝试按照段落（通常由双换行 `\n\n` 或其他段落分隔符定义）来分割文档。

这是**默认**情况下的文档分割器，它的优点是：保证每个文本块都是一个完整的段落，语义连贯性好；对于结构清晰的文本（如文章、博客），效果很好。 但是缺点是，无法控制块大小： 如果某个段落非常长，可能会超出 chunkSize 限制；**不适用于无段落结构或段落非常短的文本。**

```java
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.splitter.DocumentByParagraphSplitter;

DocumentSplitter splitter = new DocumentByParagraphSplitter();
List<TextSegment> segments = splitter.split(document);
```

* `DocumentBySentenceSplitter` ：按句子进行分割。尝试将文档分割成独立的句子。

优点是 保持句子级别的语义完整性。但缺点是句子通常很短，导致生成大量的小文本块，增加检索和存储开销。

还有其他的文档分割器，这里不再赘述，按需使用即可：

* `DocumentByLineSplitter`：按行分割。
* `DocumentByWordSplitter`：按单词分割。
* `HtmlTextSplitter`：专门用于解析 HTML 文本，保留其结构。
* `MarkdownTextSplitter`：专门用于解析 Markdown 文本。
* `DocumentByRegexSplitter`：按正则表达式分割。
* `DocumentSplitters.byCharacter(chunkSize, overlap)`：最简单的按字符分割，不考虑语义。

文档分割器是RAG pipeline中关键的一环：它的输出直接影响后续的嵌入和检索的效果：

```text
1. Document (原始文档)
        ↓
2. Document Splitter (文档分割器)  <-- here
        ↓
3. List<TextSegment> (文本块列表)
        ↓
4. Embedding Model (嵌入模型)
        ↓
5. Embedding Store (向量存储)
        ↓
6. Retriever (检索器)
        ↓
7. LLM (语言模型)
```

一些建议：

* 对于大多数通用文本，DocumentSplitters.recursive(chunkSize, overlap) 是一个很好的起点。
* 对于结构化的文本（如法律文档、技术手册），可以尝试更智能的分割器（例如，基于标题层级进行分割，但这可能需要自定义实现）。
* **overlap 参数非常重要**：不要将其设为0，否则可能会在分割边界处丢失关键上下文。

### 总结

基础 RAG（如上文所述）通常能满足大部分需求，但在处理更复杂的用户查询、管理多个异构知识源或追求极致检索效果时，我们可能需要更高级的 RAG 技术。LangChain4j 为此提供了强大的进阶组件，允许我们构建高度定制化和智能化的检索增强系统。高级 RAG 可以通过 LangChain4j 的以下核心组件来实现：

* `QueryTransformer`(查询转换器)
* `QueryRouter`(查询路由器)
* `ContentRetriever`(内容检索器)
* `ContentAggregator`(内容聚合器)
* `ContentInjector`(内容注入器)

之后，我们会详细介绍一下这些组件。
