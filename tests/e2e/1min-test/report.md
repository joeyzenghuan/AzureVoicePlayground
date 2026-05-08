# Voice Live Translator — 1-Minute Performance Test Report

**Generated:** 2026-04-05 15:28:15 UTC

---

## Test Setup

| Parameter | Value |
|-----------|-------|
| Audio File | xiecheng-finance.wav (60.14 s, Chinese finance news) |
| Model | gpt-4.1-mini (Voice Live Basic / standard pricing) |
| VAD Type | server_vad |
| VAD Threshold | 0.5 |
| Prefix Padding | 500 ms |
| Silence Duration | 300 ms |
| Voice Provider | Azure Neural |
| Voice Name | en-US-AndrewMultilingualNeural (Andrew, Male, conversational) |
| ASR Model | azure-speech |
| ASR Languages | zh, en |
| Target Language | English |
| Input Audio Format | pcm16 @ 16 kHz |
| Output Audio Format | pcm16 @ 24 kHz |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Turns | **8** |
| Session | **77.0s** |
| Cost | **$0.1556** |
| Cost/sec | **$0.00202** |
| Cost/Input | **$0.00252** |
| Avg E2E Latency | **1.86s** |
| P50 E2E Latency | **1.66s** |
| P90 E2E Latency | **3.04s** |
| Input Audio | **61.7s** |
| Output Audio | **84.0s** |

---

## Per-Turn Breakdown

| # | Duration | E2E Latency | Input (ASR) | Output (Translation) | In Text | Cached Text | In Audio | Cached Audio | Out Text | Out Audio | Total Tokens | Cost |
|--:|--------:|-----------:|-------------|----------------------|--------:|------------:|---------:|-------------:|---------:|----------:|-------------:|-----:|
| 1 | 8171ms | 1262ms | 各位投资者，各位分析师，大家好，下面由我层行为大家简要回顾携程集团2025年度财务业绩。 | Dear investors and analysts, hello everyone. I will now briefly review Ctrip Group's financial performance for the year 2025. | 0 | 0 | 222 | 117 | 28 | 163 | 413 | $0.008822 |
| 2 | 1230ms | 817ms | 全年实现净。 | The full year achieved a net. | 26 | 0 | 0 | 0 | 9 | 38 | 73 | $0.001295 |
| 3 | 4090ms | 1661ms | 约人民币538亿元，同比增长18.5%。 | Approximately RMB 53.8 billion, representing a year-on-year growth of 18.5%. | 33 | 26 | 281 | 234 | 22 | 165 | 501 | $0.009826 |
| 4 | 5877ms | 1741ms | 得益于国际业务的加速扩张，海外GMV总交易额同比增长超过70%。 | Thanks to the accelerated expansion of international business, the total overseas GMV transaction volume increased by more than 70% year-on-year. | 53 | 33 | 394 | 329 | 29 | 206 | 682 | $0.012939 |
| 5 | 11502ms | 2738ms | 现金流方面，全年经营性现金流OCF经营现金流约210亿元FCF自由现金流，约180亿元FCF转化率持续保持在高位。 | In terms of cash flow, the full-year operating cash flow (OCF) was approximately RMB 21 billion, and free cash flow (FCF) was about RMB 18 billion, with the FCF conversion rate remaining consistently high. | 80 | 53 | 637 | 514 | 50 | 313 | 1080 | $0.020256 |
| 6 | 11213ms | 3043ms | 截至年底，现金及等价物加短期投资合计约800亿元，资产负债率维持在较低水平，DE Ratio资产负债率约0.35 。 | As of the end of the year, cash and cash equivalents plus short-term investments totaled approximately RMB 80 billion, and the debt-to-equity ratio remained at a low level, with a DE ratio of about 0.35. | 128 | 80 | 1281 | 1159 | 49 | 288 | 1746 | $0.029342 |
| 7 | 7843ms | 2079ms | 展望2026年，公司将继续通过提升TakeRate佣金率和优化KAC获客成本来巩固盈利能力。 | Looking ahead to 2026, the company will continue to consolidate its profitability by increasing the Take Rate commission rate and optimizing the KAC customer acquisition cost. | 175 | 128 | 544 | 462 | 33 | 216 | 968 | $0.015685 |
| 8 | 11786ms | 1572ms | 以上是本年度财报的核心要点，感谢各位的关注。各位投资者、各位分析师，大家好，下面由我曾行为大家简要回顾携程集团2025年度财务业绩。 | The above are the key points of this year's financial report. Thank you all for your attention. Dear investors and analysts, hello everyone. I, Zeng, will now briefly review Ctrip Group's financial performance for the year 2025. | 206 | 175 | 3102 | 2967 | 51 | 292 | 3651 | $0.057473 |
| **Avg/Total** | 61712ms | 1864ms | | | 701 | 495 | 6461 | 5782 | 271 | 1681 | 9114 | $0.155638 |

---

## Conversation Log

| # | Timestamp | Direction | Content |
|--:|-----------|-----------|----------|
| 1 | 23:27:00.240 | INFO | 🎤 |
| 2 | 23:27:06.102 | INFO | 🎤 各位投资者，各位分析师，大家好，下面由我层行为大家简要回顾携程集团2025年度财务业绩。 |
| 3 | 23:27:08.006 | INFO | 🔊 Dear investors and analysts, hello everyone. I will now briefly review Ctrip Group's financial performance for the year 2025. |
| 4 | 23:27:08.091 | INFO | 🎤 全年实现净。 |
| 5 | 23:27:08.792 | INFO | 🔊 The full year achieved a net. |
| 6 | 23:27:10.419 | INFO | 🎤 |
| 7 | 23:27:12.584 | INFO | 🎤 约人民币538亿元，同比增长18.5%。 |
| 8 | 23:27:14.435 | INFO | 🔊 Approximately RMB 53.8 billion, representing a year-on-year growth of 18.5%. |
| 9 | 23:27:15.574 | INFO | 🎤 |
| 10 | 23:27:19.572 | INFO | 🎤 得益于国际业务的加速扩张，海外GMV总交易额同比增长超过70%。 |
| 11 | 23:27:21.751 | INFO | 🔊 Thanks to the accelerated expansion of international business, the total overseas GMV transaction volume increased by more than 70% year-on-year. |
| 12 | 23:27:28.071 | INFO | 🎤 |
| 13 | 23:27:32.451 | INFO | 🎤 现金流方面，全年经营性现金流OCF经营现金流约210亿元FCF自由现金流，约180亿元FCF转化率持续保持在高位。 |
| 14 | 23:27:35.671 | INFO | 🔊 In terms of cash flow, the full-year operating cash flow (OCF) was approximately RMB 21 billion, and free cash flow (FCF) was about RMB 18 billion, with the FCF conversion rate remaining consistently high. |
| 15 | 23:27:38.060 | INFO | 🎤 |
| 16 | 23:27:41.413 | INFO | 🎤 |
| 17 | 23:27:44.753 | INFO | 🎤 截至年底，现金及等价物加短期投资合计约800亿元，资产负债率维持在较低水平，DE Ratio资产负债率约0.35 。 |
| 18 | 23:27:48.131 | INFO | 🔊 As of the end of the year, cash and cash equivalents plus short-term investments totaled approximately RMB 80 billion, and the debt-to-equity ratio remained at a low level, with a DE ratio of about 0.35. |
| 19 | 23:27:53.439 | INFO | 🎤 展望2026年，公司将继续通过提升TakeRate佣金率和优化KAC获客成本来巩固盈利能力。 |
| 20 | 23:27:55.789 | INFO | 🔊 Looking ahead to 2026, the company will continue to consolidate its profitability by increasing the Take Rate commission rate and optimizing the KAC customer acquisition cost. |
| 21 | 23:27:56.255 | INFO | 🎤 |
| 22 | 23:27:59.746 | INFO | 🎤 |
| 23 | 23:28:00.554 | INFO | 🎤 |
| 24 | 23:28:01.936 | INFO | 🎤 |
| 25 | 23:28:06.556 | INFO | 🎤 以上是本年度财报的核心要点，感谢各位的关注。各位投资者、各位分析师，大家好，下面由我曾行为大家简要回顾携程集团2025年度财务业绩。 |
| 26 | 23:28:10.222 | INFO | 🔊 The above are the key points of this year's financial report. Thank you all for your attention. Dear investors and analysts, hello everyone. I, Zeng, will now briefly review Ctrip Group's financial performance for the year 2025. |

---

## Full Configuration

```json
{
  "model": "gpt-4.1-mini",
  "targetLanguage": "en",
  "prompt": "You are a simultaneous interpreter.\nTarget language: en.\n\nRules:\n1) Translate sentence by sentence (output each sentence as it completes).\n2) Keep context consistent across turns (pronouns, terms, tone, references).\n3) Preserve meaning faithfully; do not add explanations or extra content.\n4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.\n5) Output translation text only.",
  "asrModel": "azure-speech",
  "asrLanguages": "zh,en",
  "turnDetectionType": "server_vad",
  "threshold": 0.5,
  "prefixPaddingInMs": 500,
  "silenceDurationInMs": 300,
  "voiceProvider": "azure-standard",
  "voiceName": "en-US-AndrewMultilingualNeural",
  "inputAudioFormat": "pcm16",
  "inputAudioSamplingRate": 16000,
  "outputAudioFormat": "pcm16",
  "interruptResponse": false,
  "removeFillerWords": false,
  "speechDurationInMs": 80
}
```
