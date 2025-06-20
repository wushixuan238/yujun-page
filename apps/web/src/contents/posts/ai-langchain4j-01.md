---
title: "Langchain4j（二）：AiService"  
category: "AI"  
publishedAt: "2025-05-29"  
summary: "Langchain4j"  
tags:  
  - AI    
banner: /images/banner/posts/aicoding/langchain4j-02.png 
alt: "图片替代文本"  
mathjax: false
---

# Langchain4j（二）：AiService

让我们能够以声明式的方式，定义我们AI助手的行为，能力和交互逻辑。

只需告诉 AI 应该“做什么”，而无需关心它“如何做”——所有底层复杂的编排、调用和管理都由 AiService 在幕后自动完成。

我们将实现一个简单的 AI 助手，它具备以下功能：

* 能够进行多轮对话，记住之前的聊天内容（记忆）。
* 能够调用外部工具来获取当前日期时间。
* 能够调用外部工具来计算两个数字的和。

我们将分别用两种方式实现这个助手，并对比代码的复杂度和可读性。

那么什么是更高级的功能？

这里可以想像一下我们平时在网页端使用AI 的场景：包括：对话记忆，函数调用，RAG....

链是将多个底层组件组合起来，并协调它们之间的交互的。但是缺点是不灵活。

在langchain4j中，我们使用AIservice完成复杂操作，底层组件将由AIservice封装。

## 依赖

为了使用 `AiService` ，我们需要引入langchain4j的高级功能。

```xml
<!--langchain4j的高级功能-->
 <dependency>
       <groupId>dev.langchain4j</groupId>
       <artifactId>langchain4j-spring-boot-starter</artifactId>
        <version>1.0.1-beta6</version>
</dependency>
```

如何使用？所谓的 `AiService` ，在使用中，其实就是一个注解：(不同版本可能有不同)

```java
@Service
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface AiService {
    AiServiceWiringMode wiringMode() default AiServiceWiringMode.AUTOMATIC;

    String chatModel() default "";

    String streamingChatModel() default "";

    String chatMemory() default "";

    String chatMemoryProvider() default "";

    String contentRetriever() default "";

    String retrievalAugmentor() default "";

    String moderationModel() default "";

    String[] tools() default {};
}
```

首先看下注解的元注解：

* `@Service`: 这意味着，当 langchain4j-spring-boot-starter 扫描到任何被 `@AiService` 注解的接口时，它会同时将其视为一个 Spring 服务组件，并自动为其创建和管理 Bean。这使得 AiService 能够直接被 Spring 的依赖注入机制使用（例如，通过 `@Autowired` 注入）。
* `@Target({ElementType.TYPE})`: ElementType.TYPE 意味着它可以应用于类、**接口**（这也是我们主要使用的）、枚举或注解类型。
* @Retention(RetentionPolicy.RUNTIME): 这个元注解指定了注解的生命周期。RetentionPolicy.RUNTIME 意味着该注解信息会在运行时保留，因此可以通过 Java 反射机制在运行时被读取和处理（这是 LangChain4j 动态代理生成 AiService 实现的关键）。

接下来看下成员变量：

* wiringMode()：
    * 类型为：`AiServiceWiringMode` (一个枚举类型)；默认值为：`AiServiceWiringMode.AUTOMATIC`
    * 这个参数控制 `AiService` 如何自动连接其内部组件（如 `ChatLanguageModel,` `ChatMemory`, `Tools` 等）。
    * `AUTOMATIC`: 默认模式。LangChain4j Spring Boot Starter 会尝试自动发现 Spring Context 中的合适 Bean，并将它们注入到 AiService 的构建过程中。例如，它会自动查找 `ChatLanguageModel` Bean、`ChatMemoryStore` Bean，以及所有带有 `@Tool` 方法的 `@Component` Bean。
    * `STRICT`: 严格模式。如果启用了严格模式，那么 `@AiService` 就不会尝试自动发现和注入。你必须通过 `@AiService` 注解的参数（例如 chatModel(), tools() 等）或者在 `AiServices.builder() `中明确指定所有依赖。这在某些需要精确控制依赖关系的场景下可能有用。
    * 大多数情况下保持默认 `AUTOMATIC` 即可。只有在我们遇到模糊的 Bean 注入问题，或者需要非常精细地控制每个 AiService 的依赖时，才可能考虑将其设置为 STRICT。
    * 假如我们在配置文件中配置了多个LLM，比如千问，DeepSeek,Openai，就要用严格模式；只配置了一个的话保持默认即可。
* 打

## 原理的感性认识

先来总结一下 `AiService` 的一个核心工作原理：代理对象 (Proxy Object) 负责所有输入/输出的转换和编排。

`AiServices` 即 LangChain4j 提供的一个工具类（dev.langchain4j.service.AiServices）。它就是负责创建 `@AiService` 接口代理实例的工厂。它会组装你的小助手接口和其他组件。并使用反射机制创建一个实现小助手接口的代理对象。具体来说，工作流程如下：
当调用 `AiServices.builder() `或 `AiServices.create()` 时，我们通常会传入 `Assistant.class`（即 `@AiService` 接口），并且可能会配置其他依赖组件，例如：

* `chatLanguageModel()`: 告诉 AiService 使用哪个 LLM。
* `chatMemory()` 或 `chatMemoryStore()`: 告诉 AiService 如何管理对话记忆。
* `tools()`: 告诉 AiService 有哪些外部工具可以调用。
* `retriever()`: 告诉 AiService 如何进行 RAG 检索。

之后，`AiServices` 在运行时不会去寻找一个 `Assistant `接口的实现类。（**也就是说我们不需要创建小助手的实现类。**）相反，它会利用 Java 的动态代理（通常是 java.lang.reflect.Proxy 或底层库如 CGLIB），在内存中动态生成一个类，这个类实现了你的 Assistant 接口。当获得 Assistant 接口的实例并调用其方法时，实际上是在与这个动态生成的“代理对象”交互。

## 实现聊天记忆

使用`@AiService` 实现聊天记忆很简单，我们就可以从这里开始，让我们的小助手变得有记忆起来。

```java
@AiService(
        chatMemory = "chatMemory"
)
public interface MemoryAssistant {
    String chat(String msg);

}

// 配置类
@Bean
    public ChatMemory chatMemory() {
         return MessageWindowChatMemory.withMaxMessages(10);
    }
```

## 持久化聊天记忆

对于任何生产级别的 AI 应用，聊天记忆的持久化是必不可少的。它能确保用户对话体验的连续性，支持应用的横向扩展，并有效管理内存资源。

实现方案上涉及以下几点：

聊天历史的持久化与管理
形成有效的聊天记忆上下文
聊天历史大小，避免超过model context上下文大小限制。包括 MessageWindowChatMemory 等，包括一些优化 Chat Summary，有效降低聊天历史成本的一种手段。

## `@AiService` 的底层原理

`@AiService` 这个注解其背后是很明显是有 动态代理（Dynamic Proxy）机制的体现，但是同时也体现了**智能编排**（Orchestration）机制。让我们深入理解它如何将 Java 接口调用转化为与 LLM 的复杂交互。

### 1. 动态代理：拦截与转发

* **核心：** 当我们在 Spring Context 中 `@Autowired` 一个 `@AiService` 接口时，Spring 并不会找到一个硬编码的实现类。相反，LangChain4j 会利用 Java 的动态代理技术（如 `java.lang.reflect.Proxy` 或 CGLIB）在运行时为接口生成一个**代理对象**。
* **拦截机制：** 当我们调用这个代理对象上的任何方法时（例如 `myAssistant.chat("hello");`），实际的调用并不会直接执行任何业务逻辑，而是被这个代理**拦截**下来。代理对象会检查你调用的方法名、参数以及方法上定义的 LangChain4j 相关注解。



### 2. 提示词自动化构建 (Prompt Construction)

代理拦截方法调用后，其首要任务就是根据收集到的信息，自动构建一个结构化的消息列表 (`List<ChatMessage>`)，这个列表将作为完整的提示词发送给 LLM。

* **`@SystemMessage` 处理：**
    * 代理会查找接口级别或方法级别定义的 `@SystemMessage` 注解。
    * 它会将 `systemMessage` 的文本内容（可以是多行）作为 `SystemMessage` 对象添加到消息列表的开头，为 LLM 设定角色和全局指令。
    * **`{{tools}}` 的魔法：** 如果 `SystemMessage` 文本中包含 `{{tools}}` 占位符，代理会扫描所有已绑定到此 `AiService` 的工具（通过 `tools()` 参数或 Spring 自动扫描发现的 `@Component` 工具类）。它会提取这些工具的元数据（名称、描述、每个参数的名称和类型，以及 `@P` 注解提供的额外描述），并将其转换为 LLM 能够理解的 **JSON Schema 格式**。然后，将这个 JSON Schema 插入到 `SystemMessage` 中 `{{tools}}` 所在的位置。这就像在告诉 LLM：“这是你所有可用的工具列表和它们的使用说明书！”
* **`@UserMessage` 处理：**
    * 代理会识别被 `@UserMessage` 注解的方法参数。
    * 该参数的值将被封装成一个 `UserMessage` 对象，代表用户当前的输入或请求，并添加到消息列表中。

### 3. 记忆管理与上下文维护 (Memory Management)

为了实现多轮对话的上下文感知，`@AiService` 结合 `ChatMemory` 和 `ChatMemoryStore` 自动管理记忆：

* **`@MemoryId` 识别：** 代理会识别带有 `@MemoryId` 注解的方法参数。这个参数的值（例如 `userId`）将作为当前对话会话的唯一标识符。
* **`ChatMemoryStore` 协作：** 代理会将这个 `memoryId` 传递给在 Spring Context 中配置的 `ChatMemoryStore` Bean（例如 `InMemoryChatMemoryStore`、`RedisChatMemoryStore`）。
* **获取/创建 `ChatMemory`：**
    * `ChatMemoryStore` 会根据 `memoryId` 查找对应的 `ChatMemory` 实例。如果存在，则返回已有的实例（包含历史消息）。
    * 如果不存在，`ChatMemoryStore` 会创建一个新的 `ChatMemory` 实例（通常是 `MessageWindowChatMemory`，其行为可在 `ChatMemoryConfig` 中配置，如 `maxMessages`），并将其与 `memoryId` 关联。
* **记忆更新：** 代理会将当前的用户消息（`UserMessage`）添加到这个特定会话的 `ChatMemory` 中。随后 LLM 返回的 AI 响应（`AiMessage`）以及可能发生的工具调用/输出消息，也会被自动添加到该 `ChatMemory` 中。
* **上下文传递：** 最终，所有存储在该 `ChatMemory` 实例中的历史消息都会被包含在发送给 LLM 的 `List<ChatMessage>` 中，确保 LLM 始终拥有完整的对话上下文。

### 4. 智能工具调用编排 (Tool Calling Orchestration)

这是 `@AiService` 最具魔力且最复杂的环节，它让 AI 真正具备了“行动力”：

1. **发送带工具信息的请求：** 代理将完整的 `List<ChatMessage>`（包含 `SystemMessage` 中注入的工具 JSON Schema）发送给底层的 `ChatLanguageModel` (LLM)。
2. **LLM 的决策：** LLM 接收到请求后，会进行推理。它会结合用户意图和可用的工具描述，判断是否需要调用某个工具来完成任务。
    * 如果 LLM 判断不需要工具（可以直接回答），它会直接返回一个文本响应。
    * 如果 LLM 判断需要调用工具（例如，用户问“现在几点了？”，LLM 知道有一个 `getCurrentDateTime` 工具），它不会直接返回文本，而是返回一个特殊的 `tool_calls` 对象（通常是 JSON 格式），其中包含要调用的工具名称和提取出的参数。
3. **代理解析并执行工具：** 代理拦截 LLM 返回的 `tool_calls` 指令。
    * 代理解析 JSON，根据工具名称找到对应的 Java `@Tool` 方法（在通过 `tools()` 参数或 Spring 自动扫描注册的工具类中）。
    * 代理将 LLM 提供的参数（JSON）自动映射并转换为 Java 方法的参数类型（如果参数有 `@P` 注解，其描述也有助于这个过程）。
    * 代理通过 Java **反射机制**调用这个找到的 Java 方法，执行实际的业务逻辑。
4. **结果反馈与多轮交互：** 工具方法执行完毕后，其返回值会被代理封装成一个 `ToolOutputMessage`。这个 `ToolOutputMessage` 会被添加到当前会话的 `ChatMemory` 中，并再次发送回 LLM。LLM 接收到工具的真实输出后，会基于这个输出进行二次推理，生成一个连贯、准确且用户友好的最终文本回复。这个“LLM 决策 -> 代理执行 -> 结果反馈给 LLM -> LLM 再次推理”的循环可以执行多次，直到 LLM 认为任务完成。

### 5. 输出解析 (Output Parsing)

LLM 的原始响应是文本。代理会根据 `@AiService` 接口方法定义的返回类型，尝试将 LLM 的文本响应解析为 Java 对象。

* 如果返回类型是 `String`，则直接返回文本。
* 如果返回类型是自定义的 Java 对象（POJO），并且 LLM 的输出是 JSON 格式，LangChain4j 会尝试使用 Jackson 等库进行 JSON 反序列化。
* 如果需要更复杂的解析，可以结合 `dev.langchain4j.model.output.OutputParser`。

## `@AiService` 接口内部方法的常用注解

这些注解是 `AiService` 声明式编程的基础，用于定义在接口的各个方法上：

* **`@SystemMessage`:** 定义 AI 的角色、行为规则和全局指令。可以包含 `{{tools}}` 占位符。
* **`@UserMessage`:** 标记方法参数作为用户输入发送给 LLM。
* **`@MemoryId`:** 标记方法参数作为对话会话的唯一标识符，实现记忆隔离。
* **`@Tool` (在单独的工具类中)：** 标记一个 Java 方法为可供 AI 调用的工具，并提供其描述。
* **`@P` (在 `@Tool` 方法的参数中)：** 为工具方法的参数提供额外的自然语言描述，帮助 LLM 准确提取参数。

## 结语：驾驭 LLM 的未来

`@AiService` 是 LangChain4j 卓越设计的一个缩影。它不仅仅是一个简单的封装，更是一种对复杂 AI Agent 构建的深度抽象和智能编排。它将 LLM 的文本理解和决策能力，与 Java 应用的业务逻辑和外部操作能力完美结合，让 Java 开发者能够以最熟悉、最优雅的方式，构建出功能强大、智能且高度可维护的 AI 应用程序。
