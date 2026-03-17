# Azure Voice Live 深度解析：Chat vs. 同声传译

> **适用范围**：本文基于 `AzureVoicePlayground` 项目中的两个 Voice Live 演示场景，分析其实现原理、核心区别，以及同声传译的关键技术细节，帮助开发者解锁更多实际落地场景。

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [Voice Live Chat 详解](#2-voice-live-chat-详解)
3. [Voice Live 同声传译详解](#3-voice-live-同声传译详解)
4. [核心区别对比](#4-核心区别对比)
5. [同声传译的实现原理深挖](#5-同声传译的实现原理深挖)
6. [高级配置参数详解](#6-高级配置参数详解)
7. [定价与 Token 计算](#7-定价与-token-计算)
8. [场景扩展与落地建议](#8-场景扩展与落地建议)

---

## 1. 整体架构概览

两个 Playground 都基于 **`@azure/ai-voicelive`** SDK，通过 WebSocket 长连接与 Azure Voice Live 服务通信。核心流程：

```
麦克风 → PCM16 音频流 → Azure Voice Live（ASR + LLM + TTS）→ PCM16 音频流 → 扬声器
```

两者共用同一个底层 `VoiceLiveClient`，但在**会话配置**、**VAD 策略**、**打断行为**、**Prompt 设计**上存在本质差异。

```
src/lib/voiceLive/
├── chatClient.ts          # Chat 专用客户端（功能更丰富）
├── interpreter.ts         # 同声传译客户端（精简高效）
├── chatDefaults.ts        # Chat 默认配置
├── defaults.ts            # 同声传译默认配置 + Prompt 构建
├── metrics.ts             # Token/延迟/成本统计
└── audio/
    ├── chatAudioHandler.ts  # Chat 音频处理（24kHz，AudioWorklet）
    ├── micCapture.ts        # 传译音频捕获（16kHz，ScriptProcessorNode）
    ├── pcmPlayer.ts         # 共用 PCM 播放器
    └── pcm16.ts             # PCM 编解码工具
```

---

## 2. Voice Live Chat 详解

### 2.1 架构组件

| 组件 | 文件 | 说明 |
|------|------|------|
| UI 层 | `VoiceLiveChatPlayground.tsx` | React 组件，对话气泡界面 |
| 客户端逻辑 | `chatClient.ts` (`VoiceLiveChatClient`) | 连接/消息/函数调用/Avatar |
| 音频采集 | `chatAudioHandler.ts` (`ChatAudioHandler`) | AudioWorklet，24kHz |
| 音频播放 | `pcmPlayer.ts` (`Pcm16Player`) | 流式队列播放 |
| 端点检测 VAD | 动态加载 `@ricky0123/vad-web@0.0.30` | 客户端 VAD，精确延迟测量 |

### 2.2 连接流程

```
createSession(model)          // 创建 session 对象，不立即连接
   ↓
session.subscribe(handlers)   // 先注册事件处理器，不错过任何事件
   ↓
session.connect()             // 建立 WebSocket 连接
   ↓
session.updateSession(config) // 推送会话配置
   ↓
自动开始录音 + 初始化客户端 VAD
```

> **注意**：Chat 模式使用 `client.createSession()` 而非 `client.startSession()`，这样可以在连接前先注册事件监听，避免丢失早期事件。

### 2.3 会话配置特点

```typescript
{
  modalities: ['text', 'audio'],  // 支持文本+音频双模态（开启 Avatar 时加 'avatar'）
  inputAudioFormat: 'pcm16',
  outputAudioFormat: 'pcm16',
  inputAudioTranscription: {
    model: 'azure-speech',        // 或 whisper-1
    language: 'auto',             // 支持自动语言检测
  },
  turnDetection: {
    type: 'server_vad',           // 或 azure_semantic_vad
    createResponse: !config.asrOnly,
    removeFillerWords: false,
    // 注意：Chat 模式支持 endOfUtteranceDetection（语义端点检测）
  },
  inputAudioNoiseReduction: { type: 'azure_deep_noise_suppression' },
  inputAudioEchoCancellation: { type: 'server_echo_cancellation' },
  temperature: 0.9,
  tools: [...],                   // 函数调用工具定义
  avatar: { ... },                // Avatar 配置（可选）
}
```

### 2.4 双路 VAD 设计

Chat 模式使用**双路 VAD**：

- **服务端 VAD**（`server_vad` / `azure_semantic_vad`）：控制何时触发 AI 响应
- **客户端 VAD**（`@ricky0123/vad-web`）：仅用于精确测量端到端延迟

```typescript
// 客户端 VAD 参数配置
{
  model: 'v5',
  positiveSpeechThreshold: 0.8,     // 语音概率 > 80% 视为有效语音
  negativeSpeechThreshold: 0.5,     // 语音概率 < 50% 视为静音
  redemptionMs: 500,                // 500ms 静音才触发 onSpeechEnd（默认 1400ms）
  preSpeechPadMs: 100,              // 语音开始前追加 100ms 音频
  minSpeechMs: 250,                 // 最短有效语音 250ms
}
```

**延迟测量公式**：
```
总延迟 = Voice Live 响应延迟 + VAD 静音等待时间
```

### 2.5 打断行为

```typescript
onInputAudioBufferSpeechStarted: async () => {
  // 用户开始说话 → 立即停止当前 AI 音频播放
  this.pcmPlayer.stop();
  this.setState({ isSpeaking: true });
}
```

**Chat 模式支持打断**：用户说话时立即中断 AI 回复，提供更自然的对话体验。

### 2.6 Avatar 集成（WebRTC）

当启用 Avatar 时，连接流程扩展为：

```
WebSocket 连接建立
   ↓
onSessionUpdated → 收到服务端 ICE Servers
   ↓
创建 RTCPeerConnection（sendrecv 方向）
   ↓
createOffer → setLocalDescription → 等待 ICE gathering
   ↓
发送 session.avatar.connect 事件（base64 编码的 SDP）
   ↓
onSessionAvatarConnecting → 接收服务端 SDP answer
   ↓
setRemoteDescription → WebRTC 连接建立
   ↓
ontrack → 接收视频流 → 渲染到 <video> 元素
```

支持两种 Avatar 类型：
- **video-avatar**：预制 3D 数字人（lisa, harry, jeff 等角色）
- **photo-avatar**：VASA-1 模型驱动的照片说话头（支持自定义角色）

### 2.7 函数调用（Tool Use）

Chat 模式支持 Function Calling，以天气查询为例：

```
用户："今天天气怎么样？"
   ↓
AI 输出：onResponseFunctionCallArgumentsDone（函数名 + 参数）
   ↓
本地执行函数（模拟 10 秒 API 调用）
   ↓
isResponseInProgress 为 true → 等待 onResponseDone
   ↓
sendPendingFunctionResult → addConversationItem + response.create
   ↓
AI 基于函数结果生成语音回复
```

---

## 3. Voice Live 同声传译详解

### 3.1 架构组件

| 组件 | 文件 | 说明 |
|------|------|------|
| UI 层 | `VoiceLiveTranslatorPlayground.tsx` | React 组件，日志流式界面 |
| 客户端逻辑 | `interpreter.ts` (`VoiceLiveInterpreter`) | 精简传译客户端 |
| 音频采集 | `micCapture.ts` (`MicCapture`) | ScriptProcessorNode，16kHz |
| 音频播放 | `pcmPlayer.ts` (`Pcm16Player`) | 与 Chat 共用同一播放器 |

### 3.2 连接流程

```
new VoiceLiveClient(endpoint, credential, { apiVersion: '2025-10-01' })
   ↓
client.startSession(sessionConfig, { connectionTimeoutInMs: 30000 })
   ↓
pcmPlayer.resume()      // 预激活 AudioContext（规避浏览器自动播放策略）
   ↓
session.subscribe(handlers)
   ↓
session.updateSession(sessionConfig)
   ↓
UI 调用 startMic() → 开始连续发送 PCM 音频块
```

> **注意**：传译模式使用 `client.startSession()`，直接建立连接并配置会话。API 版本为 `2025-10-01`（比 Chat 的 `2025-05-01-preview` 更新）。

### 3.3 麦克风采集（16kHz，ScriptProcessorNode）

```typescript
// MicCapture 配置
{ sampleRate: 16000, bufferSize: 4096 }

// ScriptProcessorNode 回调
processor.onaudioprocess = (e) => {
  const input = e.inputBuffer.getChannelData(0);   // Float32Array
  const pcm16 = floatTo16BitPCM(input);            // Int16Array
  const bytes = int16ToUint8LE(pcm16);             // Uint8Array（小端）
  callbacks.onChunk(bytes, durationSeconds);        // 立即发送给服务端
};
```

每个音频块持续时间 = 4096 / 16000 ≈ **256ms**，持续不断地流式发送。

### 3.4 同声传译 Prompt（核心设计）

```
You are a simultaneous interpreter.
Target language: zh.

Rules:
1) Translate sentence by sentence (output each sentence as it completes).
2) Keep context consistent across turns (pronouns, terms, tone, references).
3) Preserve meaning faithfully; do not add explanations or extra content.
4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.
5) Output translation text only.
```

**关键约束**：
- **逐句翻译**：不等全段话说完，每句话完成即输出
- **上下文一致**：保持跨轮次的代词、术语、语气一致
- **纯翻译输出**：不添加解释或额外内容

---

## 4. 核心区别对比

| 维度 | Voice Live Chat | Voice Live 同声传译 |
|------|-----------------|---------------------|
| **核心定位** | AI 对话助手 | 实时翻译管道 |
| **用户角色** | 与 AI 双向对话 | 持续说话，AI 同步翻译 |
| **打断行为** | ✅ 支持（用户说话立即打断 AI）| ❌ **不支持**（`interruptResponse: false`）|
| **VAD 类型** | 双路：服务端 + 客户端（延迟测量）| 单路：仅服务端 VAD |
| **采样率** | 24kHz（AudioWorklet）| 16kHz（ScriptProcessorNode）|
| **API 版本** | `2025-05-01-preview` | `2025-10-01` |
| **会话启动** | `createSession()` + `connect()` | `startSession()` 一步到位 |
| **Turn Detection** | `server_vad` 或 `azure_semantic_vad` | 强制 `azure_semantic_vad`（使用 azure-speech ASR 时）|
| **沉默时长** | 默认 server_vad 标准值 | `silenceDurationInMs: 200`（极短，快速触发） |
| **语音最短时长** | 无特殊设置 | `speechDurationInMs: 80`（80ms 即可触发） |
| **Avatar** | ✅ 支持（WebRTC 视频/照片）| ❌ 不支持 |
| **函数调用** | ✅ 支持（Tool Use）| ❌ 不支持 |
| **文本输入** | ✅ 支持（文字消息）| ❌ 纯语音 |
| **回音消除** | ✅ 可配置 | ❌ 无 |
| **降噪** | ✅ 可配置 | ❌ 无 |
| **EOU（语义端点）** | ✅ 支持（`endOfUtteranceDetection`）| ❌ 不支持（会报错）|
| **填充词过滤** | 可选 | 可选（`removeFillerWords`）|
| **UI 形式** | 聊天气泡（多轮对话历史）| 事件日志流（实时监控）|
| **指标面板** | 延迟（ms）| 延迟 + Token 用量 + 成本（$）|

---

## 5. 同声传译的实现原理深挖

### 5.1 为什么能"一边听一边译"？

同声传译的关键在于**四个机制的协同**：

#### 机制一：持续音频流（Continuous Audio Streaming）

```typescript
// MicCapture 不间断地将麦克风 PCM 数据发送给服务端
onChunk: (bytes) => {
  void interpreter.sendMicPcmChunk(bytes);  // 每 256ms 一包
}
```

服务端接收到的是一条**连续的音频流**，没有"开始录音/停止录音"的概念。

#### 机制二：Azure Semantic VAD（语义端点检测）

```typescript
turnDetection: {
  type: 'azure_semantic_vad',
  threshold: 0.5,
  prefixPaddingInMs: 300,
  silenceDurationInMs: 200,  // 仅需 200ms 静音即视为句子结束
  speechDurationInMs: 80,    // 最短 80ms 即可启动 VAD 检测
  createResponse: true,       // VAD 检测到句末 → 自动触发翻译
  interruptResponse: false,   // 🔑 关键：新的语音不打断正在播放的翻译
}
```

`azure_semantic_vad` 不仅靠静音检测，还结合语义模型判断句子边界，比 `server_vad`（纯能量检测）更准确，更适合连续语音中的句末检测。

#### 机制三：`interruptResponse: false`（禁止打断）

这是同声传译的**最核心差异**。

- **Chat 模式**：用户开始说话 → `pcmPlayer.stop()` → AI 立即停止播放
- **传译模式**：`interruptResponse: false` → 当用户继续说话时，**服务端不会取消正在生成/播放的翻译音频**

这意味着：
- 上一句的翻译音频还在播放 → 用户已经开始说下一句
- 服务端接收新的语音 → 在 VAD 检测到新的句末后，继续生成下一句翻译
- **多个翻译响应可以在队列中等待播放**

#### 机制四：流式 PCM 播放队列

```typescript
// Pcm16Player 使用 AudioContext 的调度队列实现无缝连续播放
enqueuePcm16(bytes: Uint8Array, sampleRate = 24000) {
  const buffer = this.audioContext.createBuffer(1, floatData.length, sampleRate);
  // ...
  src.start(this.nextStartTime);          // 精确调度播放时间
  this.nextStartTime += buffer.duration;  // 下一块紧接在上一块后面
}
```

每个 `onResponseAudioDelta` 事件的音频块立即入队，多个翻译响应的音频块形成一个连续播放队列：

```
翻译响应1: [chunk1][chunk2][chunk3]
翻译响应2:                          [chunk1][chunk2][chunk3]
                                    ↑ 无缝衔接
```

### 5.2 完整的同声传译时序图

```
时间轴 ─────────────────────────────────────────────────────────→

用户说话:  [说"今天天气很好"] [说"我们去公园吧"] [说"带上雨伞"]
                                                              
音频流:    ████████████████ ████████████████ ████████████████
                                                              
服务端VAD:          ↑句末检测        ↑句末检测       ↑句末检测
                    createResponse   createResponse  createResponse
                                                              
AI生成:             [翻译"今天天气很好"]   [翻译"我们去公园吧"]
                                                              
音频Delta:          ▪▪▪▪▪▪▪▪▪▪▪▪     ▪▪▪▪▪▪▪▪▪▪▪▪▪
                                                              
播放队列:            [===播放翻译1===][===播放翻译2===]
```

用户在说第二句时，第一句的翻译正在播放；服务端同时处理第二句的翻译请求。

### 5.3 延迟测量

传译模式精确测量两种延迟：

| 延迟类型 | 定义 | 计算方式 |
|----------|------|----------|
| **Start Latency** | 从用户开始说话 → 第一个翻译音频块到达 | `firstAudioDeltaAtMs - speechStartedAtMs` |
| **End Latency** | 从用户停止说话 → 第一个翻译音频块到达 | `firstAudioDeltaAtMs - speechStoppedAtMs` |

`End Latency` 更能反映用户感知的响应速度（说完到听到翻译的时间差）。

---

## 6. 高级配置参数详解

### 6.1 ASR 模型选择

| 模型 | 适用场景 | 特点 |
|------|----------|------|
| `azure-speech` | 通用语音识别，支持多语言 | 延迟低，语言检测准确，**强制使用 azure_semantic_vad** |
| `gpt-4o-mini-transcribe` | 需要 Whisper 特性 | 支持 server_vad 和 azure_semantic_vad |
| `gpt-4o-transcribe` | 高精度场景 | 支持 server_vad 和 azure_semantic_vad |
| `whisper-1` | 历史 Chat 模式兼容 | 精度高但延迟略高 |

> **重要**：使用 `azure-speech` 时，`turnDetectionType` 会被自动强制为 `azure_semantic_vad`，无论用户配置为何值。

### 6.2 Turn Detection 参数调优

```typescript
// 同声传译优化配置
{
  type: 'azure_semantic_vad',
  threshold: 0.5,              // VAD 触发阈值（0-1）
  prefixPaddingInMs: 300,      // 句子开始前追加音频（防止丢失开头）
  silenceDurationInMs: 200,    // 静音触发阈值（越小越快触发，但可能误触发）
  speechDurationInMs: 80,      // 最短语音片段（防止噪音误触发）
  removeFillerWords: true,      // 过滤"嗯、啊、那个"等填充词
  createResponse: true,         // VAD 触发后自动创建响应
  interruptResponse: false,     // 传译核心：禁止打断
}
```

**调优建议**：
- `silenceDurationInMs: 200` 适合演讲场景（句间停顿短）
- `silenceDurationInMs: 500+` 适合对话场景（允许更长的思考停顿）
- `removeFillerWords: true` 对中文场景（"嗯、啊、那个"）效果显著

### 6.3 EOU（End-of-Utterance）语义端点检测

仅 Chat 模式支持（传译模式开启会报错）：

```typescript
// 仅在 Chat 模式的 chatClient.ts 中使用
turnDetection: {
  type: 'azure_semantic_vad',
  // 注意：interpreter.ts 的注释明确说明此参数在传译场景不支持
  // endOfUtteranceDetection 只支持 cascaded pipeline（Chat 模式）
}
```

### 6.4 语音合成配置

```typescript
// Azure Standard Voice（推荐用于传译，延迟低）
voice: {
  type: 'azure-standard',
  name: 'en-US-AvaMultilingualNeural',  // 多语言声音，适合翻译场景
}

// OpenAI Native Voice（更自然，但成本高）
voice: {
  type: 'openai',
  name: 'alloy',
}
```

**多语言传译推荐声音**：`en-US-AvaMultilingualNeural`、`en-US-AndrewMultilingualNeural`，这类声音可以流畅切换多语言，适合翻译输出。

### 6.5 模型选择与成本权衡

| 模型层级 | 代表模型 | 适用场景 | 相对成本 |
|----------|----------|----------|----------|
| **Pro** | `gpt-4o`、`gpt-4.1`、`gpt-5` | 高精度翻译/复杂对话 | 高 |
| **Basic** | `gpt-4o-mini`、`gpt-4.1-mini`、`gpt-5-mini` | 通用翻译/日常对话 | 中 |
| **Lite** | `phi4-mini`、`gpt-5-nano`、`phi4-mm-realtime` | 高频低成本场景 | 低 |

同声传译对翻译质量要求高，建议使用 **Basic 级别**（如 `gpt-4.1-mini`）作为起点，在成本和质量间取得平衡。

---

## 7. 定价与 Token 计算

### 7.1 Token 计算规则

```
输入音频：每 10 tokens ≈ 1 秒语音
输出音频：每 20 tokens ≈ 1 秒语音
```

传译场景示例（1 小时演讲，英译中）：
- 输入：3600秒 × 10 tokens = 36,000 tokens = 36K tokens
- 输出：约 3600秒 × 10 tokens = 36K tokens（传译输出与输入等长）

### 7.2 价格表（每百万 tokens，美元）

| 层级 | 声音类型 | 输入音频 | 输出音频 | 输入文本 | 输出文本 |
|------|----------|----------|----------|----------|----------|
| Pro | Azure Standard | $17 | $38 | $5.50 | $22 |
| Basic | Azure Standard | $15 | $33 | $0.66 | $2.64 |
| Lite | Azure Standard | $15 | $33 | $0.11 | $0.44 |
| Pro | OpenAI Native | $44 | $88 | $5.50 | $22 |
| Basic | OpenAI Native | $11 | $22 | $0.66 | $2.64 |

> **注意**：OpenAI Native Audio（原生音频）在 Basic/Lite 层级实际上更便宜（$11/$22 vs $15/$33），因为端到端音频不需要 TTS 处理。

---

## 8. 场景扩展与落地建议

### 8.1 Chat 模式可解锁的场景

#### 场景一：智能客服 + 数字人
```typescript
// 配置要点
{
  model: 'gpt-4.1',
  avatar: { enabled: true, type: 'video', character: 'lisa', style: 'casual-sitting' },
  turnDetectionType: 'azure_semantic_vad',
  useNoiseSuppression: true,
  useEchoCancellation: true,
  tools: [...],  // 接入 CRM/订单查询 API
}
```

#### 场景二：多语言语音 + 文字双模式交互
```typescript
{
  recognitionLanguage: 'auto',  // 自动检测语言
  voice: 'en-US-AvaMultilingualNeural',  // 多语言回复
  modalities: ['text', 'audio'],
}
```

#### 场景三：ASR-Only 模式（仅语音转文字）
```typescript
{
  asrOnly: true,  // createResponse: false
  // Voice Live 仅做语音识别，不触发 AI 生成
  // 适合将 Voice Live 作为高精度实时 STT 服务
}
```

### 8.2 同声传译可解锁的场景

#### 场景一：多语言会议直播字幕
```typescript
// 最小延迟配置
{
  model: 'gpt-4.1-mini',
  targetLanguage: 'zh',
  asrModel: 'azure-speech',
  silenceDurationInMs: 150,    // 极短触发，适合演讲节奏
  removeFillerWords: true,
  voiceName: 'zh-CN-XiaochenMultilingual...',
}
```

#### 场景二：多目标语言并行传译
核心思路：建立多个独立的 `VoiceLiveInterpreter` 实例，分别配置不同目标语言，共享同一个 `MicCapture` 的 PCM 块：

```typescript
const interpreters = ['en', 'zh', 'ja'].map(lang => {
  const i = new VoiceLiveInterpreter({ onState: ... });
  i.connect({ ...config, targetLanguage: lang });
  return i;
});

// 麦克风采集 → 分发给所有传译器
onChunk: (bytes) => {
  interpreters.forEach(i => i.sendMicPcmChunk(bytes));
}
```

#### 场景三：实时字幕生成（纯 STT）
使用传译 Prompt 变体，输出格式化字幕文本（而非语音）：

```
You are a real-time transcriber.
Format each sentence as: [HH:MM:SS] <transcription>
Output text only.
```

结合 `modalities: ['text']`（去掉 `audio`）可以仅生成字幕文本，节省 TTS 成本。

#### 场景四：专业领域传译（医疗、法律、技术）
在 Prompt 中注入术语表：

```
You are a simultaneous medical interpreter.
Target language: zh.
Medical terminology reference:
- myocardial infarction → 心肌梗死
- hypertension → 高血压
...

Rules: [同声传译标准规则]
```

### 8.3 性能优化建议

| 优化目标 | 建议 |
|----------|------|
| **降低首字延迟** | 使用 Lite/Basic 模型；`silenceDurationInMs` 设为 200ms 以下 |
| **提高翻译质量** | 使用 Pro 模型；在 Prompt 中提供上下文和术语表 |
| **降低成本** | 使用 `gpt-4.1-mini` + `azure-standard` 声音；开启 `cachedAudio`（缓存 Prompt Token）|
| **减少误触发** | 提高 `threshold`（0.6-0.8）；增大 `speechDurationInMs`（100-200ms）|
| **改善音质** | Chat 模式开启 `azure_deep_noise_suppression` + `server_echo_cancellation` |

### 8.4 监控与调试

传译模式提供丰富的实时指标，可用于生产监控：

```
指标名称          含义
─────────────────────────────────────────────
Turns             累计翻译轮次
Start Latency     说话开始 → 翻译音频首包（P50/P90）
End Latency       说话结束 → 翻译音频首包（感知延迟）
Input Audio       输入音频总时长（秒）
Output Audio      输出音频总时长（秒）
Cost              累计费用（USD）
Cost/sec          每秒费用（成本效率指标）
```

---

## 附录：关键代码路径速查

| 功能 | 文件 | 关键函数/类 |
|------|------|-------------|
| Chat 连接 | `chatClient.ts` | `VoiceLiveChatClient.connect()` |
| 传译连接 | `interpreter.ts` | `VoiceLiveInterpreter.connect()` |
| 音频采集（Chat）| `chatAudioHandler.ts` | `ChatAudioHandler.startRecording()` |
| 音频采集（传译）| `micCapture.ts` | `MicCapture.start()` |
| 音频播放 | `pcmPlayer.ts` | `Pcm16Player.enqueuePcm16()` |
| Turn Detection 配置 | `defaults.ts` | `toRequestSession()` |
| 传译 Prompt 构建 | `defaults.ts` | `buildInterpreterPrompt()` |
| Chat 会话配置 | `chatClient.ts` | `VoiceLiveChatClient.buildSessionConfig()` |
| Avatar WebRTC | `chatClient.ts` | `initPeerConnectionWithIceServers()` |
| 成本计算 | `metrics.ts` | `calculateCost()` |
| PCM 编解码 | `audio/pcm16.ts` | `floatTo16BitPCM()`, `pcm16BytesToFloat32LE()` |
