# Azure Voice Live 实现原理深度解析

> 本文基于 AzureVoicePlayground 仓库中的两个 Voice Live 示例进行分析：  
> **Voice Live Chat**（智能对话）与 **Voice Live Translator**（同声传译）。  
> 重点揭示两者的架构差异，以及同声传译"边接收输入、边输出翻译"的核心实现机制。

---

## 目录

1. [Azure Voice Live 是什么](#1-azure-voice-live-是什么)
2. [整体架构对比](#2-整体架构对比)
3. [Voice Live Chat：智能对话](#3-voice-live-chat智能对话)
4. [Voice Live Translator：同声传译](#4-voice-live-translator同声传译)
5. [核心差异：两者的关键不同点](#5-核心差异两者的关键不同点)
6. [同声传译的实现机制](#6-同声传译的实现机制)
7. [音频管线详解](#7-音频管线详解)
8. [延迟度量与成本计算](#8-延迟度量与成本计算)
9. [高级功能与扩展场景](#9-高级功能与扩展场景)
10. [落地建议与最佳实践](#10-落地建议与最佳实践)

---

## 1. Azure Voice Live 是什么

Azure Voice Live（`@azure/ai-voicelive`）是 Azure AI 提供的实时多模态语音交互 SDK，以 **WebSocket 长连接**为核心，支持：

- 全双工音频流传输（麦克风输入 + 语音输出同时进行）
- 服务端自动语音识别（ASR）、大语言模型推理（LLM）、文字转语音（TTS）的流水线
- 服务端语音活动检测（VAD）自动判断说话时机
- 流式 Token 输出（文本 delta + 音频 delta 并行推送）

### SDK 核心类

```
VoiceLiveClient        → 客户端入口，负责建立连接
VoiceLiveSession       → 单次会话，负责发送/接收消息
VoiceLiveSubscription  → 事件订阅句柄
VoiceLiveSessionHandlers → 事件回调接口
```

### 服务端事件流

```
服务端 → 客户端的事件类型：
  onConnected / onDisconnected
  onSessionCreated / onSessionUpdated
  onInputAudioBufferSpeechStarted      ← 检测到用户开始说话
  onInputAudioBufferSpeechStopped      ← 检测到用户停止说话
  onConversationItemInputAudioTranscriptionDelta   ← 实时转写增量
  onConversationItemInputAudioTranscriptionCompleted ← 转写完成
  onResponseCreated                    ← 开始生成回复
  onResponseTextDelta                  ← 文本 token 增量
  onResponseTextDone                   ← 文本生成完成
  onResponseAudioDelta                 ← 音频 PCM 数据增量
  onResponseDone                       ← 整个回复完成
  onServerError / onError
```

---

## 2. 整体架构对比

| 维度 | Voice Live Chat | Voice Live Translator |
|------|-----------------|----------------------|
| 核心类 | `VoiceLiveChatClient` | `VoiceLiveInterpreter` |
| 主要用途 | 多轮 AI 对话 | 实时同声传译 |
| 麦克风采样率 | **24 kHz** | **16 kHz** |
| 音频处理方式 | AudioWorklet（audio-processor.js）| ScriptProcessorNode |
| 打断响应 | **允许**（说话即打断）| **禁止**（`interruptResponse: false`）|
| 客户端 VAD | ✅ `@ricky0123/vad-web`（延迟测量）| ❌ 仅服务端 VAD |
| Avatar 支持 | ✅ 视频/照片 Avatar（WebRTC）| ❌ |
| Function Calling | ✅ 工具调用（天气、时间等）| ❌ |
| Turn Detection 默认 | `server_vad` | `azure_semantic_vad` |
| 语言配置 | 识别语言（输入侧）| 目标语言（输出侧）|
| Session 创建方式 | `createSession()` + `connect()` | `startSession()` |
| 模型支持 | Chat 优化模型 | 全层级模型（Pro/Basic/Lite）|
| UI 形态 | 聊天气泡 | 实时日志流 |
| 关键 Prompt | 自由配置 | 专用同传 Prompt |

---

## 3. Voice Live Chat：智能对话

### 3.1 连接流程

```
用户点击"Start"
  ↓
chatClient.connect(config)
  ↓
VoiceLiveClient 实例化（API Key 鉴权）
  ↓
session = client.createSession(model)   ← 不立即连接
  ↓
session.subscribe(handlers)             ← 先注册事件回调（防止漏事件）
  ↓
session.connect()                       ← WebSocket 建立连接
  ↓
session.updateSession(sessionConfig)    ← 发送会话配置（语音、模型、VAD 等）
  ↓
自动启动麦克风录制
  ↓
（可选）初始化客户端 VAD 用于延迟测量
```

> **关键设计**：先 `subscribe` 再 `connect`，确保不会漏掉连接初始化阶段的服务端事件。

### 3.2 音频录制（ChatAudioHandler）

```typescript
// 使用 AudioWorklet（推荐方式，不阻塞主线程）
await context.audioWorklet.addModule('audio-processor.js');
workletNode = new AudioWorkletNode(context, 'audio-recorder-processor');

// 接收 PCM 数据并发送到 Voice Live 服务
workletNode.port.onmessage = (event) => {
  const uint8Data = new Uint8Array(int16Data.buffer);
  chatClient.sendAudio(uint8Data);  // 持续向服务端推流
};
```

- 采样率：24 kHz（与输出一致，减少重采样损耗）
- 格式：PCM 16-bit 小端（`pcm16`）
- 实时推流：不需要等说话结束，每帧都推送

### 3.3 打断机制

```typescript
onInputAudioBufferSpeechStarted: async () => {
  this.pcmPlayer.stop();   // 立即停止 AI 语音播放
  this.setState({ isSpeaking: true });
},
```

用户一开口，正在播放的 AI 回复立即中断，体现自然对话的打断感。

### 3.4 客户端 VAD（延迟测量）

Chat 模式引入了 `@ricky0123/vad-web` 作为**客户端本地 VAD**，主要用于精确测量端到端延迟：

```typescript
const vad = await window.vad.MicVAD.new({
  onSpeechEnd: () => {
    chatClient.markSpeechEndByClientVAD();  // 记录说话结束时间
  },
  positiveSpeechThreshold: 0.8,
  negativeSpeechThreshold: 0.5,
  redemptionMs: 500,   // 静音 500ms 后判定说话结束
  minSpeechMs: 250,    // 最短有效语音 250ms
});
```

延迟计算公式：
```
端到端延迟 = 音频实际开始播放时间 - 本地 VAD 检测到说话结束时间
总感知延迟 = Voice Live 响应延迟 + VAD 静音等待时间（~500ms）
```

VAD 在 AI 说话时自动暂停（`vad.pause()`），播放结束后恢复（`vad.start()`），避免 AI 声音触发误检。

### 3.5 Avatar（数字人）支持

Chat 模式支持接入 Azure Avatar 服务，通过 **WebRTC** 传输视频流：

```
session.updateSession({ avatar: { type: 'video-avatar', character: 'lisa', style: 'casual-sitting' } })
  ↓
服务端返回 ICE Servers（onSessionUpdated 事件）
  ↓
客户端创建 RTCPeerConnection
  ↓
创建 SDP Offer → 发送 session.avatar.connect 事件
  ↓
服务端返回 SDP Answer（onSessionAvatarConnecting 事件）
  ↓
WebRTC 建立完毕，视频流通过 ontrack 回调接收并显示
```

支持类型：
- **video-avatar**：预设角色（Lisa、Harry、Jeff 等）+ 风格
- **photo-avatar**：照片驱动的 2D Avatar（使用 VASA-1 模型）
- **customized**：自定义 Avatar（需提前上传素材）

### 3.6 Function Calling

```typescript
// 工具定义（在会话配置中注册）
tools: [{
  type: 'function',
  name: 'getWeatherForecast',
  description: '获取7天天气预报...',
  parameters: { type: 'object', properties: {}, required: [] },
}]

// AI 决定调用工具时触发
onResponseFunctionCallArgumentsDone: async (event) => {
  const result = await executeFunction(event.name, event.arguments);
  // 将结果注入对话并触发下一轮回复
  await session.addConversationItem({ type: 'function_call_output', callId, output: result });
  await session.sendEvent({ type: 'response.create', response: { modalities: ['text', 'audio'] } });
}
```

---

## 4. Voice Live Translator：同声传译

### 4.1 连接流程

```
用户点击"Start"
  ↓
interpreter.connect(config)
  ↓
VoiceLiveClient 实例化
  ↓
session = client.startSession(sessionConfig)  ← 一步完成连接+配置
  ↓
session.subscribe(handlers)
  ↓
session.updateSession(sessionConfig)
  ↓
自动启动麦克风录制
```

### 4.2 同传 Prompt

```typescript
export function buildInterpreterPrompt(targetLanguage: string): string {
  return [
    'You are a simultaneous interpreter.',
    `Target language: ${targetLanguage}.`,
    '',
    'Rules:',
    '1) Translate sentence by sentence (output each sentence as it completes).',
    '2) Keep context consistent across turns (pronouns, terms, tone, references).',
    '3) Preserve meaning faithfully; do not add explanations or extra content.',
    '4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.',
    '5) Output translation text only.',
  ].join('\n');
}
```

这段 Prompt 的工程精髓：
- **逐句翻译**：不等整段说完，每句话完成就输出，实现流式翻译
- **上下文一致性**：多轮对话中保持代词、术语的一致，避免语义漂移
- **纯翻译输出**：明确禁止模型添加解释或额外内容

### 4.3 麦克风采集（MicCapture）

```typescript
// 使用 ScriptProcessorNode（兼容性好）
this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
this.processor.onaudioprocess = (e) => {
  const input = e.inputBuffer.getChannelData(0);
  const pcm16 = floatTo16BitPCM(input);         // Float32 → Int16
  const bytes = int16ToUint8LE(pcm16);           // Int16 → Uint8 小端
  this.callbacks.onChunk(bytes, durationSeconds);
};
```

- 采样率：16 kHz（ASR 最佳输入，降低带宽）
- 缓冲大小：4096 帧（≈256ms）

---

## 5. 核心差异：两者的关键不同点

### 5.1 Turn Detection 配置差异

**Chat 模式**：
```typescript
turnDetection: {
  type: 'server_vad',          // 简单能量检测，响应更快
  removeFillerWords: false,
  createResponse: true,         // 检测到说话结束自动生成回复
  // 未设置 interruptResponse，默认允许打断
}
```

**Translator 模式**：
```typescript
turnDetection: {
  type: 'azure_semantic_vad',   // 语义级 VAD，更智能判断说话结束
  threshold: 0.5,
  prefixPaddingInMs: 300,       // 说话开始前300ms预留
  silenceDurationInMs: 200,     // 200ms静音即判断说话结束
  speechDurationInMs: 80,       // 最短有效语音80ms
  removeFillerWords: false,
  createResponse: true,
  interruptResponse: false,     // ⭐ 关键：禁止打断正在进行的回复
  // endOfUtteranceDetection 不配置（同传模式不支持，否则报错）
}
```

> ⚠️ **重要注意**：`endOfUtteranceDetection`（语义句末检测）仅在 Chat 的级联管线中支持，在 Translator 模式下使用会导致服务端报错，代码中有明确注释说明此差异。

### 5.2 打断行为对比

| 行为 | Chat 模式 | Translator 模式 |
|------|-----------|----------------|
| 用户说话时是否打断AI输出 | ✅ 立即停止播放 | ❌ 继续播放翻译 |
| `interruptResponse` | 未设置（默认允许）| `false`（明确禁止）|
| 用户说话时播放处理 | `pcmPlayer.stop()` | 继续入队播放 |

### 5.3 Session 创建方式差异

| | Chat | Translator |
|-|------|------------|
| 方法 | `createSession()` → `connect()` | `startSession()` |
| 设计原因 | 需在连接前注册事件防漏 | 无 Avatar 连接时序问题，一步建立即可 |

### 5.4 ASR 模型差异

| | Chat | Translator |
|-|------|------------|
| 默认 ASR | `whisper-1`（realtime 模型）/ `azure-speech`（其他）| `azure-speech`（强制）|
| 原因 | Chat 优先 OpenAI 生态兼容 | azure-speech 支持 100+ 语言，适合多语言同传 |

---

## 6. 同声传译的实现机制

同声传译的核心在于：**在用户尚未停止说话（或刚停止说话）时，系统已开始翻译并播放**，即"边输入边输出"。

### 6.1 数据流示意

```
用户麦克风（中文/英文/任意语言）
  ↓ 16kHz PCM16 流式推送
Voice Live 服务端
  ├─ ASR（azure-speech）：实时转写，检测到句末
  │     ↓ onConversationItemInputAudioTranscriptionDelta（实时显示转写）
  ├─ 服务端 VAD（azure_semantic_vad）：判断说话是否完整一句
  │     ↓ onInputAudioBufferSpeechStopped（通知说话结束）
  ├─ LLM（翻译模型）：接收转写文本，逐 Token 输出翻译
  │     ↓ onResponseTextDelta（翻译文本增量）
  └─ TTS（Azure Neural Voice）：实时将翻译文本转为语音
        ↓ onResponseAudioDelta（PCM 音频块，流式推送）

客户端 Pcm16Player：
  enqueuePcm16(chunk) → 连续拼接入播放队列
  → 用户听到翻译语音（与原始讲话几乎同步）
```

### 6.2 关键代码：音频接收与播放

```typescript
// interpreter.ts
onResponseAudioDelta: async (event: ServerEventResponseAudioDelta) => {
  const chunk = event.delta;
  if (chunk instanceof Uint8Array) {
    // ⭐ 每收到一个音频块立即入队播放，不等全部完成
    this.pcmPlayer.enqueuePcm16(chunk, this.outputSampleRateHz);
  }
}
```

```typescript
// pcmPlayer.ts - 流式无缝播放
enqueuePcm16(bytes: Uint8Array, sampleRate = 16000) {
  const floatData = pcm16BytesToFloat32LE(bytes);
  const buffer = this.audioContext.createBuffer(1, floatData.length, sampleRate);
  buffer.getChannelData(0).set(floatData);

  const src = this.audioContext.createBufferSource();
  src.buffer = buffer;
  src.connect(this.analyser);

  // ⭐ 精确计算每块音频的起播时间，保证无缝连接
  if (!this.hasStartedPlayback) {
    this.nextStartTime = now + 0.05;  // 50ms 初始缓冲
  } else if (this.nextStartTime < now) {
    this.nextStartTime = now;         // 追赶当前时间（应对网络抖动）
  }

  src.start(this.nextStartTime);
  this.nextStartTime += buffer.duration;  // 下一块从此块结束时开始
}
```

### 6.3 为什么能"边输入边输出"：关键设计要素

#### ① `interruptResponse: false`

```typescript
// 这是同声传译与普通对话最本质的区别
interruptResponse: false
```

设置此参数后，即使服务端 VAD 检测到用户**继续说话**（或新的一句话开始），正在进行的翻译响应**不会被中断**。系统会：
- 继续播放当前句子的翻译
- 把新检测到的语音加入队列，待当前翻译完成后处理

如果设置为 `true`（Chat 默认），用户一开口 AI 回复就停止——这是对话模式需要的，但在翻译场景下会导致翻译频繁被截断。

#### ② `createResponse: true`

```typescript
// VAD 检测到说话结束，服务端自动触发翻译生成
createResponse: true
```

不需要客户端手动调用 `session.sendEvent({ type: 'response.create' })`，服务端检测到说话结束（一个完整的句子）后**自动启动 LLM 推理 + TTS 合成**。

#### ③ `azure_semantic_vad` 语义级 VAD

```typescript
type: 'azure_semantic_vad',
silenceDurationInMs: 200,   // 仅需200ms静音就判定句末
speechDurationInMs: 80,     // 80ms以上的语音才有效
```

语义 VAD 比简单能量 VAD 更智能，能识别句子是否语义完整（避免在连接词处截断），确保翻译单元是完整的句子，提升翻译质量。

#### ④ 流式 TTS + 流式播放

服务端 TTS 不会等翻译文本全部生成完再合成，而是**边生成文本边合成语音**：

```
LLM 输出：["Thank", " you", " for", " your", " speech"] （逐 Token）
                ↓
TTS 合成：   |---合成中---|
                              ↓
客户端播放：                  |---播放---|
```

客户端 `Pcm16Player` 维护一个精确的时间线队列，每个音频块按顺序无缝拼接，不会有停顿或重叠。

#### ⑤ 延迟测量维度

Translator 专门记录两种延迟：

```
startLatency = 检测到说话开始 → 第一个音频块到达的时间差
endLatency   = 检测到说话结束 → 第一个音频块到达的时间差
```

`startLatency` 反映了系统是否能在用户说话期间就开始翻译（理想同传的指标），`endLatency` 则反映了等说话结束后的延迟。

---

## 7. 音频管线详解

### 7.1 Chat 模式音频管线

```
麦克风（系统）
  ↓ getUserMedia（echoCancellation + noiseSuppression）
  ↓ AudioContext（24kHz）
  ↓ MediaStreamAudioSourceNode
  ↓ AudioWorkletNode（audio-recorder-processor.js）
    ├─ Float32 → Int16 PCM16 转换
    └─ 每帧回调 → chatClient.sendAudio(uint8Data)
         ↓ session.sendAudio(bytes)  → WebSocket 流式推送

AI 回复音频接收：
  onResponseAudioDelta → pcmPlayer.enqueuePcm16(chunk, 24kHz)
    ↓ AudioBufferSourceNode → AnalyserNode → AudioContext.destination
    ↓ 音量回调 → 驱动可视化圆圈动画（绿色录制 / 紫色播放）
```

**AudioWorklet vs ScriptProcessorNode**：

| 方案 | 特点 |
|------|------|
| AudioWorklet（Chat用）| 在独立 Audio 线程运行，不阻塞主线程，推荐 |
| ScriptProcessorNode（Translator用）| 在主线程运行，已废弃但兼容性好，demo 足够 |

### 7.2 Translator 模式音频管线

```
麦克风
  ↓ getUserMedia
  ↓ AudioContext（16kHz）
  ↓ createScriptProcessor(4096)
    ↓ onaudioprocess：Float32 → PCM16 → Uint8LE
         ↓ interpreter.sendMicPcmChunk(bytes)
              ↓ session.sendAudio(bytes) → WebSocket

翻译音频输出：
  onResponseAudioDelta → pcmPlayer.enqueuePcm16(chunk, outputSampleRate)
    ↓ AudioBufferSourceNode → AnalyserNode → 扬声器
```

### 7.3 PCM 格式转换链

```
Web 麦克风原始数据: Float32 [-1.0, +1.0]
  ↓ floatTo16BitPCM()
Int16 [-32768, +32767]（有符号16位）
  ↓ int16ToUint8LE()
Uint8 小端字节流（每个 Int16 → 2字节）→ 发送给服务端

服务端返回音频: Uint8 PCM16 小端
  ↓ pcm16BytesToFloat32LE()
Float32 [-1.0, +1.0] → AudioBuffer → Web Audio API 播放
```

---

## 8. 延迟度量与成本计算

### 8.1 延迟指标

| 指标 | 说明 | 适用场景 |
|------|------|---------|
| `startLatency` | 说话开始 → 第一帧音频到达 | 评估流式响应能力 |
| `endLatency` | 说话结束 → 第一帧音频到达 | 评估整体响应速度 |
| `firstTokenLatency` | 响应创建 → 第一个文本 Token | LLM 推理速度 |
| `totalLatency` | 响应创建 → 响应完成 | 整轮对话耗时 |
| P90 延迟 | 90th 百分位延迟 | 稳定性评估 |

### 8.2 定价层级

服务按以下维度计费（单位：$/百万 Token）：

| 层级 | 代表模型 | 输入音频 | 输出音频 |
|------|---------|---------|---------|
| Pro | gpt-4o, gpt-4.1, gpt-5 | $17 | $38 |
| Standard | gpt-4o-mini, gpt-4.1-mini | $15 | $33 |
| Lite | phi4-mm-realtime, gpt-5-nano | $15 | $33 |

> 音频 Token 换算：10 输入音频 Token ≈ 1秒音频；20 输出音频 Token ≈ 1秒音频

**选用 OpenAI 原生声音**（alloy、shimmer 等）时，使用 `native-audio` 价格档：
- Pro 档：输入 $44/M tokens，输出 $88/M tokens（更高，因为音频直接由 LLM 生成）

---

## 9. 高级功能与扩展场景

### 9.1 Chat 模式可解锁的场景

#### 场景一：AI 数字人客服

```typescript
config.avatar = {
  enabled: true,
  type: 'video',
  character: 'lisa',
  style: 'casual-sitting',
  customized: false,
}
// 效果：用户与一个会说话的 3D 数字人交互
// 扩展：传入 customized: true, customAvatarName: '自定义形象' 即可用企业 IP 形象
```

#### 场景二：带工具调用的语音助手

```typescript
// 在 tools 中注册任意业务 API
tools.push({
  type: 'function',
  name: 'queryOrderStatus',
  description: '查询用户订单状态',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: '订单号' }
    },
    required: ['orderId'],
  },
});
// AI 会在合适时机主动调用，完成"语音查单"等业务
```

#### 场景三：纯 ASR 模式（语音转文字）

```typescript
config.asrOnly = true
// turnDetection.createResponse = false
// 系统只做语音识别，不生成 AI 回复，适合实时字幕场景
```

#### 场景四：噪声抑制 + 回声消除

```typescript
inputAudioNoiseReduction: { type: 'azure_deep_noise_suppression' }
inputAudioEchoCancellation: { type: 'server_echo_cancellation' }
// 服务端深度降噪，适合嘈杂会议室、在线课堂等场景
```

#### 场景五：多语言识别

```typescript
config.recognitionLanguage = 'auto'  // 自动检测语言
// 或指定：'zh-CN', 'en-US', 'ja-JP' 等
```

### 9.2 Translator 模式可解锁的场景

#### 场景一：多语种会议同传

```typescript
// 使用支持多语言的 Voice
voiceName: 'en-US-AvaMultilingualNeural'  // 多语言 Neural Voice
asrLanguages: 'zh-CN,en-US,ja-JP'        // 支持多语言输入
targetLanguage: 'en'                       // 统一翻译成英文
```

#### 场景二：低延迟极限优化

```typescript
// 使用 Lite 层级模型降低延迟和成本
model: 'phi4-mm-realtime'    // 或 'gpt-5-nano'
silenceDurationInMs: 100     // 100ms 静音即触发（更快）
speechDurationInMs: 50       // 50ms 有效语音即检测
prefixPaddingInMs: 200       // 减少前缀填充
```

#### 场景三：自定义翻译专业领域

```typescript
// 在 Prompt 中注入专业词表和行业要求
prompt: `You are a simultaneous interpreter specializing in medical terminology.
Target language: zh.
Domain glossary:
- myocardial infarction → 心肌梗死
- percutaneous coronary intervention → 经皮冠状动脉介入治疗
Rules: Use formal medical Chinese...`
```

#### 场景四：filler word 过滤

```typescript
removeFillerWords: true
// 自动过滤 "um", "uh", "like", "you know" 等填充词
// 让翻译文本更干净，TTS 输出更流畅
```

### 9.3 两模式通用的高级配置

#### Semantic VAD 精调

```typescript
type: 'azure_semantic_vad',
eouModel: 'semantic_detection_v1',     // 语义句末检测模型
eouThresholdLevel: 'low',              // low=更快触发 / high=更准确但等更久
eouTimeoutInMs: 800,                   // 最长等待时间
```

| `eouThresholdLevel` | 适用场景 |
|--------------------|---------|
| `low` | 连续快速对话、实时翻译 |
| `medium`（默认）| 通用场景 |
| `high` | 用户常有停顿思考的场景（减少误触发）|

---

## 10. 落地建议与最佳实践

### 10.1 选型决策树

```
需要实时语音交互？
  ├─ 是双向对话（用户 ↔ AI）？
  │    ├─ 需要 Avatar/数字人？ → Chat 模式 + Avatar
  │    ├─ 需要调用业务 API？  → Chat 模式 + Function Calling
  │    └─ 普通语音问答？       → Chat 模式（标准配置）
  └─ 是单向翻译（用户说 → AI 翻译输出）？
       ├─ 会议/演讲实时同传？  → Translator 模式
       ├─ 需要极低延迟？       → Translator + Lite 模型
       └─ 多语言输入？         → Translator + azure-speech ASR
```

### 10.2 成本控制建议

1. **按场景选模型层级**：简单翻译用 Lite（phi4-mm-realtime），复杂对话用 Pro
2. **使用 Azure Standard Voice**：比 OpenAI Native Audio 便宜约 2x
3. **监控 cachedAudioTokens**：重复会话内容可以利用 KV Cache 降低成本
4. **`asrOnly` 模式**：纯转写场景不生成回复，大幅节省输出 Token 费用

### 10.3 生产部署注意事项

1. **API Key 安全**：前端直接使用 API Key 仅适用于 Demo，生产环境应通过后端代理转发并鉴权
2. **WebSocket 重连**：网络断开时需要重新建立会话，建议实现自动重连逻辑
3. **AudioContext 限制**：浏览器要求用户交互后才能创建 AudioContext（用 `resume()` 处理）
4. **移动端兼容**：AudioWorklet 在部分旧版 iOS Safari 中不支持，可降级到 ScriptProcessorNode
5. **并发 Session 数**：Azure Voice Live 服务有并发限制，大规模部署需提前申请提额

### 10.4 调试技巧

- 开启 `showInfoLogs`（Translator）查看服务端 VAD 事件时序
- 开启 `showResponseLatency`（Chat）定量分析延迟分布
- 使用浏览器控制台过滤 `[VoiceLive Event]` 前缀日志查看完整事件流
- `TurnMetrics` 结构记录了每轮的详细时间戳，可导出分析

---

## 总结

| | Chat | Translator |
|-|------|------------|
| **核心机制** | 全双工对话，用户打断AI | 非打断流式翻译 |
| **同传关键** | N/A | `interruptResponse: false` + 流式 TTS 播放队列 |
| **VAD 策略** | `server_vad`（快） + 客户端 VAD（精确延迟）| `azure_semantic_vad`（语义判断，准确截句）|
| **音频采样** | 24kHz（高质量）| 16kHz（ASR 标准）|
| **模型选择** | 对话优化模型（含 GPT Realtime）| 全模型支持（含 Lite 低成本）|
| **扩展能力** | Avatar + Function Calling | 多语言 + 专业词表 Prompt |
| **适合场景** | 客服、陪伴、助手 | 会议、演讲、直播同传 |

Azure Voice Live 的强大之处在于将 ASR、LLM、TTS 的完整流水线集成为一个实时流式 API，开发者只需关注**Prompt 设计**和**事件响应逻辑**，即可快速构建延迟极低、体验自然的语音 AI 应用。
