# Voice Live Chat vs. Translator: 架构对比分析

## 概览

两个 playground 共享同一套 Azure Voice Live WebSocket 协议（`@azure/ai-voicelive` SDK），但服务于截然不同的交互范式：

| 维度 | Voice Live Chat | Voice Live Translator |
|---|---|---|
| 交互模型 | 回合制 (half-duplex) | 同声传译 (full-duplex) |
| 核心隐喻 | 与 AI 对话聊天 | 会议现场的同声传译员 |
| 用户输入 vs AI 输出 | 互斥 — 用户说话会**打断** AI 播放 | 自由重叠 — 用户持续说话，AI 同时输出翻译 |
| 客户端类 | `VoiceLiveChatClient` | `VoiceLiveInterpreter` |
| 音频播放 | `Pcm16Player` + `ChatAudioHandler` | `Pcm16Player`（直接使用） |
| VAD 策略 | 客户端 VAD (`@ricky0123/vad-web`) + 服务端 VAD | 仅服务端 (`azure_semantic_vad`) |
| 核心设计目标 | 自然的对话流、低延迟 | 持续、不间断的翻译管道 |

---

## 1. 交互模型：根本性差异

### Chat：回合制 (Half-Duplex)

```
用户说话 ──► [VAD 检测结束] ──► 服务端处理 ──► AI 说话 ──► 用户再说话
                                                  │
                                        用户说话？→ 打断 AI
```

Chat 遵循**请求-响应**循环。用户说话，系统检测到语音结束，AI 思考并以音频回应。如果用户在 AI 还在输出音频时开始说话，AI 会被**立即打断**。

关键代码在 `chatClient.ts:636-639`：

```typescript
onInputAudioBufferSpeechStarted: async () => {
  // 用户开始说话时立即停止当前音频播放
  this.pcmPlayer.stop();   // ← 清除所有已排队的 AI 音频
  this.setState({ isSpeaking: true });
},
```

这个 `pcmPlayer.stop()` 调用会 flush 掉每一个待播放的 `AudioBufferSourceNode`，让 AI 在句子中间戛然而止。

### Translator：同声传译 (Full-Duplex)

```
用户持续说话 ────────────────────────────────────────►
                          ▼ (检测到句子边界)
                AI 输出翻译 ──────────►
                          ▼ (下一个句子边界)
                AI 输出翻译 ──────────►
```

Translator **永远不会在用户说话时打断 AI 播放**。`speech-started` handler 中没有 `pcmPlayer.stop()`。用户的麦克风数据和 AI 的音频输出**同时且独立**地流动。

在 `interpreter.ts:218-222`：

```typescript
onInputAudioBufferSpeechStarted: async () => {
  this.currentSpeechStartMs = Date.now();
  this.log('info', 'Speech detected', 'vad');
  // ← 没有 pcmPlayer.stop() — AI 继续说话
},
```

---

## 2. Translator 如何实现同声传译

Translator 的"魔法"是**五个架构决策**的组合，共同创造了 full-duplex 体验：

### 2.1 `interruptResponse: false` — 服务端的关键开关

在 `defaults.ts:118`，Translator 默认设置为：

```typescript
interruptResponse: false,  // ← 不让新的语音取消正在进行的 response
```

这告诉 Azure Voice Live 服务端："即使用户又开始说话了，**也不要取消**当前正在生成的 response。" 相比之下，Chat 隐式使用服务端默认行为——新的用户语音会打断当前 response。

这个单一的 flag 是**协议层面最重要的区别**。没有它，服务端会在用户继续说话时取消正在进行的翻译——同声传译将不可能实现。

### 2.2 逐句翻译：通过 Prompt Engineering 实现

Translator 使用精心设计的 system prompt（`defaults.ts:130-142`）：

```
You are a simultaneous interpreter.
Target language: {lang}.

Rules:
1) Translate sentence by sentence (output each sentence as it completes).
2) Keep context consistent across turns (pronouns, terms, tone, references).
3) Preserve meaning faithfully; do not add explanations or extra content.
4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.
5) Output translation text only.
```

Rule #1 至关重要："**逐句翻译**"。这意味着：
- 服务端的 VAD 检测到一个句子边界（语音中的停顿）
- 为该句子触发一个 `response.created` event
- AI 只翻译这一句
- 与此同时，用户已经在说下一句了

AI 不会试图一次性翻译整段话——它**独立处理每个检测到的 utterance**，使得管道可以重叠。

### 2.3 Azure Semantic VAD — 智能句子边界检测

Translator 默认使用 `azure_semantic_vad`（而非基础的 `server_vad`）：

```typescript
turnDetectionType: 'azure_semantic_vad',
silenceDurationInMs: 200,    // 仅需 200ms 静音
speechDurationInMs: 80,      // 最短 80ms 语音即可触发
```

Semantic VAD 使用 AI 驱动的语义理解来检测**自然的句子边界**，而不是仅基于能量的静音检测。这至关重要，因为：

1. **短静音 = 快速分段**：200ms 的静音就足以触发一个 turn，所以翻译在每句话后迅速开始。
2. **一个逻辑 utterance 可能产生多次 speech_started/stopped 事件**：Semantic VAD 可能为一次逻辑发言触发多个分段事件。Interpreter 通过 `speechStartConsumed` flag 处理这种情况（`interpreter.ts:101-102, 228-232`）：

```typescript
onInputAudioBufferSpeechStopped: async () => {
  // 只为第一个分段捕获 speech start；semantic VAD 可能为一次逻辑发言
  // 触发多个 speech_started/stopped 对
  if (this.speechStartConsumed) {
    this.completedSpeechStartMs = this.currentSpeechStartMs;
    this.speechStartConsumed = false;
  }
},
```

### 2.4 音频播放管道：Utterance 排队与自然间隔

`Pcm16Player`（`pcmPlayer.ts`）被设计为优雅地处理重叠的 utterance：

```typescript
const UTTERANCE_GAP_SEC = 0.35;  // 连续 utterance 之间 350ms 间隔
const INITIAL_BUFFER_SEC = 0.05; // 50ms 初始缓冲

enqueuePcm16(bytes, sampleRate) {
  if (this.isNewUtterance) {
    if (this.nextStartTime > now) {
      // 上一个 utterance 还在播放 — 在它结束后追加，带间隔
      this.nextStartTime += UTTERANCE_GAP_SEC;
    } else {
      // 没有在播放 — 经过小缓冲后开始
      this.nextStartTime = now + INITIAL_BUFFER_SEC;
    }
  }
}
```

当第 2 句的翻译到达时，第 1 句还在被 AI 朗读：
1. `markNewUtterance()` 被调用（来自 `onResponseCreated`）
2. PCM player 计算出第 1 句还在播放
3. 将第 2 句安排在第 1 句结束后 350ms 开始
4. Web Audio API 的 `AudioBufferSourceNode.start(scheduledTime)` 处理精确的时序

这创造了一个**自然流畅的队列**——翻译背靠背播放，中间有短暂停顿，就像人类同声传译员一样。

### 2.5 独立的音频 I/O 路径

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────┐    PCM16 chunks     ┌──────────────────────┐  │
│  │MicCapture├────────────────────►│  Azure Voice Live    │  │
│  │ (16kHz)  │  sendAudio()        │  WebSocket Server    │  │
│  └──────────┘                     │                      │  │
│       ▲                           │  ┌────────────────┐  │  │
│       │                           │  │ ASR → LLM → TTS│  │  │
│  用户持续说话                      │  └────────────────┘  │  │
│                                   │                      │  │
│                                   │  onResponseAudioDelta│  │
│  ┌──────────┐    PCM16 chunks     │◄─────────────────────│  │
│  │Pcm16Player│◄───────────────────┤                      │  │
│  │ (24kHz)  │  enqueuePcm16()     └──────────────────────┘  │
│  └──────────┘                                               │
│       │                                                     │
│       ▼                                                     │
│  扬声器输出翻译                                              │
└─────────────────────────────────────────────────────────────┘
```

输入路径（MicCapture → sendAudio）和输出路径（onResponseAudioDelta → Pcm16Player）是**完全独立的**：

- **MicCapture**（`micCapture.ts`）：使用 16kHz 的 `ScriptProcessorNode`，触发 `onChunk` 回调，调用 `interpreter.sendMicPcmChunk()` → `session.sendAudio()`。这个流**永远不会停止或暂停**。
- **Pcm16Player**（`pcmPlayer.ts`）：通过 `enqueuePcm16()` 接收音频 chunk，在 Web Audio API timeline 上调度播放。这个流**永远不会被用户输入 flush 掉**。

两条路径之间没有协调或 mutex——它们作为独立的流运行。

---

## 3. Chat 的回合制架构详解

### 3.1 VAD 三明治：客户端 + 服务端

Chat 使用独特的**双 VAD** 方案：

```
Mic → ChatAudioHandler → sendAudio() → Server VAD (turn detection)
  └→ Client VAD (@ricky0123/vad-web) → 仅用于延迟测量
```

客户端 VAD（`vad-web`）与服务端 VAD **并行运行**，但仅用于延迟测量——它在本地检测用户何时停止说话，以便衡量到 AI 第一个音频到达的延迟。

与播放的关键交互（`VoiceLiveChatPlayground.tsx:151-156`）：

```typescript
onResponseStart: () => {
  // AI 播放期间暂停 VAD，防止拾取 AI 音频
  vadRef.current?.pause();
},
// ...
chatClient.setPlaybackCompleteCallback(() => {
  // AI 停止说话后恢复 VAD
  vadRef.current?.start();
});
```

客户端 VAD 在 **AI 说话时暂停**，防止回声反馈。这在 Translator 中不需要，因为：
1. Translator 不使用客户端 VAD
2. Translator 依赖服务端 echo cancellation（如果需要的话）

### 3.2 ChatAudioHandler：双重用途

`ChatAudioHandler` 在单个 24kHz `AudioContext` 中同时处理录音和播放：

```typescript
class ChatAudioHandler {
  private readonly sampleRate = 24000;  // 输入输出都是 24kHz
  
  startRecording(onChunk) { ... }    // 捕获麦克风音频
  playChunk(chunk) { ... }           // 播放 AI 音频
  stopStreamingPlayback() {          // 用户打断时调用
    this.playbackQueue.forEach(source => source.stop());
  }
}
```

Translator 则将这些关注点分离：
- `MicCapture` 负责输入（16kHz，可配置）
- `Pcm16Player` 负责输出（默认 24kHz，可配置）

### 3.3 以消息为中心的状态模型

Chat 维护一个对话历史（`ChatMessage[]`），支持 streaming 更新：

```typescript
onResponseTextDelta → 原地更新消息（流式效果）
onResponseAudioDelta → 播放音频（或发送到 avatar）
onResponseDone → 最终确认消息
```

Translator 使用**基于日志的**模型（`SessionLogItem[]`），带有分类和 debug 过滤——为监控持续的翻译流而优化，而不是展示聊天对话。

---

## 4. 关键架构差异汇总

### 4.1 Response 打断行为

| | Chat | Translator |
|---|---|---|
| `onInputAudioBufferSpeechStarted` | `pcmPlayer.stop()` — 清除所有 AI 音频 | 仅记录时间戳 — AI 继续说话 |
| `interruptResponse` 配置 | 未显式设置（服务端默认 = true） | 显式设为 `false` |
| 效果 | 用户始终拥有话语权 | 双方始终拥有话语权 |

### 4.2 音频架构

| | Chat | Translator |
|---|---|---|
| 麦克风捕获 | `ChatAudioHandler`（AudioWorklet, 24kHz） | `MicCapture`（ScriptProcessor, 16kHz） |
| 音频播放 | `Pcm16Player` + `ChatAudioHandler` | 仅 `Pcm16Player` |
| Utterance 排队 | 一次只有一个 response | 多个 response 排队，间隔 350ms |
| 回声处理 | 客户端 VAD pause/resume | 服务端 echo cancellation 选项 |

### 4.3 状态管理

| | Chat | Translator |
|---|---|---|
| 状态模型 | `ChatState`（messages, speaking flags） | `InterpreterState`（logs, turns, totals） |
| Turn 追踪 | 单个 `currentResponseId` | `Map<responseId, TurnState>` — 支持多个并发 |
| 指标 | 基础延迟（per-response） | 完整的 per-turn metrics（E2E, start, end latency, token usage, cost） |
| UI 模型 | 聊天气泡消息 | 带时间戳的日志条目 + debug 分类 |

### 4.4 Session 配置

| | Chat | Translator |
|---|---|---|
| 默认 model | 用户选择 | `gpt-4.1-mini` |
| 默认 VAD | `server_vad` 或 `azure_semantic_vad` | `azure_semantic_vad` |
| Silence duration | 服务端默认 | 200ms（激进） |
| System prompt | 用户自定义 instructions | 自动生成的 interpreter prompt |
| Modalities | `text`, `audio`，可选 `avatar` | `text`, `audio` |
| 特性 | Function calling, avatar, personal voice | 丰富的 voice 选项, noise reduction, echo cancellation |

---

## 5. 翻译管道：端到端流程

以下是一个句子被翻译的完整生命周期：

```
时间 ──────────────────────────────────────────────────────────────►

T0: 用户开始说一句话                                  ┐
    → MicCapture 持续发送 PCM chunks 到服务端         │ 输入
    → onInputAudioBufferSpeechStarted 触发           │ 阶段
T1: 用户停顿（200ms 静音）                            │
    → onInputAudioBufferSpeechStopped 触发           ┘
    → 服务端 ASR 生成 transcript
    → onConversationItemInputAudioTranscriptionCompleted

T2: 服务端创建 response                              ┐
    → onResponseCreated 触发                         │
    → Interpreter 创建 TurnState 条目                 │ 处理
    → pcmPlayer.markNewUtterance()                   │ 阶段

T3: 第一个 text delta 到达                            │
    → onResponseTextDelta 触发                       │
    → 记录 firstTokenLatencyMs                       │

T4: 第一个 audio delta 到达                           │
    → onResponseAudioDelta 触发                      │ 输出
    → E2E latency = T4 - T1（语音停止到音频到达）     │ 阶段
    → pcmPlayer.enqueuePcm16(chunk)                  │
    → 音频被安排到 Web Audio API timeline 上          │

T5-Tn: 更多 audio delta 到达                          │
    → pcmPlayer 继续排队                              │

Tn+1: Response 完成                                   │
    → onResponseDone 触发                             │
    → Token usage、cost 计算完毕                       │
    → TurnMetrics 最终确认                            ┘

与此同时：用户在 T1+ 时已经在说下一句话了
    → 循环并发重复
```

关键洞察：**第 N+1 句的 T1 可以与第 N 句的 T2-Tn 重叠**。用户永远不需要等待——他们持续说话，翻译同时在生成和播放。

---

## 6. 为什么 Chat 不能简单地加上 `interruptResponse: false`

很容易会想，Chat 只要设置 `interruptResponse: false` 就能变成 Translator，但还有几个架构差异使得这不可行：

1. **单 response 追踪**：Chat 一次只追踪一个 `currentResponseId`。Translator 使用 `Map<string, TurnState>` 来处理多个并发 response。

2. **消息模型**：Chat 的 `ChatMessage[]` 配合 streaming 更新，不支持展示并行的输入/输出流。Translator 基于日志的模型天然支持交错事件。

3. **AudioHandler 耦合**：Chat 的 `ChatAudioHandler` 将录音和播放合并在一个 24kHz 的 `AudioContext` 中。Translator 使用不同采样率和独立生命周期将它们分离。

4. **VAD 的舞蹈**：Chat 的客户端 VAD pause/resume 逻辑假设 AI 和用户轮流说话。如果不配合服务端 echo cancellation 就移除它，会导致回声反馈。

5. **缺少 metrics 基础设施**：Chat 只有基础的延迟追踪。Translator 有完整的 per-turn metrics、token tracking 和 cost 计算——对于监控持续翻译会话至关重要。

---

## 7. 结论

Voice Live Translator 通过精心编排的六个要素组合，实现了真正的同声传译：

1. **`interruptResponse: false`** — 告诉服务端在用户说话时不取消 response
2. **Semantic VAD + 短 silence threshold** — 在句子边界快速分段
3. **独立的音频 I/O 路径** — 麦克风输入和扬声器输出永远不互相阻塞
4. **Utterance 排队的 PCM player** — 平滑调度连续翻译，带自然间隔
5. **Interpreter 优化的 prompt** — 指示模型逐句翻译
6. **多 response turn 追踪** — 处理多个并发翻译 response

Chat playground 则围绕自然的对话往复而设计——在那个场景下，打断是 feature，不是 bug。这是两种根本不同的 UX 范式，即使底层共享同一套 Voice Live 协议，也需要不同的架构来实现。
