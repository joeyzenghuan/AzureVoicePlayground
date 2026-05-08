# Voice Live Translator — Parameter Sweep Report

**Generated:** 2026-04-12 02:19:19 UTC
**Audio:** break非常抱歉您入住的 (67.45s, Chinese customer service with break tags)
**Goal:** Find optimal VAD parameters for sentence-level turn segmentation

---

## Reference Text (TTS Input, 10 natural sentences)

1. 非常抱歉您入住的酒店没有达到您的预期。
2. 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情，
3. 遇到这样的情况确实让人不舒服，也很影响出行的心情。
4. 但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。
5. 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择：
6. 首先我们可以立即联系酒店帮您更换房间，确保您能有一个更舒适的入住环境；
7. 第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响；
8. 第三我们会主动向酒店方面提出补偿要求，比如申请房费减免，或者升级您的房型，让您能获得一定的补偿和更好的服务。
9. 请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。
10. 我们会一直为您跟进，直到问题圆满解决。

---

## Executive Summary

| Rank | Experiment | Turns | Fragments | Avg E2E | Cost | Score |
|-----:|------------|------:|----------:|--------:|-----:|------:|
| 1 | A_semantic_silence400 **BEST** | 7 | 0 | 1680ms | $0.2316 | **79/100** |
| 2 | E_server_vad_silence500 | 8 | 0 | 1930ms | $0.2093 | **77/100** |
| 3 | D_semantic_silence500_speech150 | 8 | 0 | 2010ms | $0.1880 | **76/100** |
| 4 | B_semantic_silence600 | 6 | 0 | 1880ms | $0.1891 | **74/100** |
| 5 | C_semantic_silence800_speech200 | 2 | 0 | 1620ms | $0.1336 | **70/100** |
| 6 | F_server_vad_silence800 | 3 | 0 | 1810ms | $0.1474 | **69/100** |

**Winner: A_semantic_silence400** — semantic_vad | silence=400ms | speech=80ms | prefix=300ms | threshold=0.5

---

## Quality Scoring Breakdown

Scoring: Turn Count (30) + Fragment Penalty (30) + Latency (20) + Coverage (20) = 100

### A_semantic_silence400
```
Turn count: 7 (ideal ~10) → 24/30
Fragments: 0 short fragments → 30/30
Avg E2E: 1680ms → 5/20
Sentence coverage: 10/10 → 20/20
Total: 79/100
```

### E_server_vad_silence500
```
Turn count: 8 (ideal ~10) → 26/30
Fragments: 0 short fragments → 30/30
Avg E2E: 1930ms → 1/20
Sentence coverage: 10/10 → 20/20
Total: 77/100
```

### D_semantic_silence500_speech150
```
Turn count: 8 (ideal ~10) → 26/30
Fragments: 0 short fragments → 30/30
Avg E2E: 2010ms → 0/20
Sentence coverage: 10/10 → 20/20
Total: 76/100
```

### B_semantic_silence600
```
Turn count: 6 (ideal ~10) → 22/30
Fragments: 0 short fragments → 30/30
Avg E2E: 1880ms → 2/20
Sentence coverage: 10/10 → 20/20
Total: 74/100
```

### C_semantic_silence800_speech200
```
Turn count: 2 (ideal ~10) → 14/30
Fragments: 0 short fragments → 30/30
Avg E2E: 1620ms → 6/20
Sentence coverage: 10/10 → 20/20
Total: 70/100
```

### F_server_vad_silence800
```
Turn count: 3 (ideal ~10) → 16/30
Fragments: 0 short fragments → 30/30
Avg E2E: 1810ms → 3/20
Sentence coverage: 10/10 → 20/20
Total: 69/100
```

---

## Full Statistics Comparison

| Metric | A_semantic_silence400 | B_semantic_silence600 | C_semantic_silence800_speech200 | D_semantic_silence500_speech150 | E_server_vad_silence500 | F_server_vad_silence800 |
|--------|------:|------:|------:|------:|------:|------:|
| VAD Type | azure_semantic_vad | azure_semantic_vad | azure_semantic_vad | azure_semantic_vad | server_vad | server_vad |
| Silence Duration | 400ms | 600ms | 800ms | 500ms | 500ms | 800ms |
| Speech Duration | 80ms | 80ms | 200ms | 150ms | 80ms | 80ms |
| Prefix Padding | 300ms | 300ms | 300ms | 300ms | 500ms | 500ms |
| Threshold | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 | 0.5 |
| Turns | 7 | 6 | 2 | 8 | 8 | 3 |
| Fragments | 0 | 0 | 0 | 0 | 0 | 0 |
| Empty Turns | 0 | 0 | 0 | 0 | 0 | 0 |
| Avg E2E Latency | 1680ms | 1880ms | 1620ms | 2010ms | 1930ms | 1810ms |
| P50 E2E Latency | 1490ms | 1680ms | 1500ms | 1810ms | 1650ms | 1980ms |
| P90 E2E Latency | 2390ms | 2510ms | 1730ms | 2700ms | 2910ms | 2100ms |
| Total Cost | $0.2316 | $0.1891 | $0.1336 | $0.1880 | $0.2093 | $0.1474 |
| Cost/Input sec | $0.00364 | $0.00294 | $0.00197 | $0.00295 | $0.00330 | $0.00223 |
| Input Audio | 63.6s | 64.3s | 67.7s | 63.7s | 63.5s | 66.2s |
| Output Audio | 71.2s | 71.0s | 70.5s | 69.8s | 72.0s | 69.8s |
| Session Time | 95.4s | 95.6s | 95.6s | 95.7s | 95.7s | 95.8s |
| Coverage | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 | 10/10 |

---

## Experiment: A_semantic_silence400

**semantic_vad | silence=400ms | speech=80ms | prefix=300ms | threshold=0.5**

### Per-Turn Breakdown (7 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3599ms | 1450ms | 非常抱歉，您入住的酒店没有达到您的预期。 | We are very sorry that the hotel you stayed at did not meet your expectations. | $0.004419 |
| 2 | 11793ms | 1368ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。但请您放心。 | Our platform has always highly valued every guest's feedback, and I fully understand how you feel right now. Encountering such a situation is indeed unpleasant and can really affect your travel mood. But please rest assured. | $0.026678 |
| 3 | 3900ms | 1493ms | 我们一定会认真对待您的问题，积极为您解决这个问题的。 | We will definitely take your issue seriously and actively work to resolve it for you. | $0.003325 |
| 4 | 4614ms | 1453ms | 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。 | I have prepared several solutions for you, and you can choose based on your actual needs. | $0.017062 |
| 5 | 5609ms | 1836ms | 首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。 | First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. | $0.022361 |
| 6 | 23222ms | 2386ms | 第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。 | Second, if you are no longer satisfied with this hotel, we can also coordinate a free cancellation of your booking and recommend other hotels nearby of the same or higher grade to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee waiver or upgrading your room type so that you receive some compensation and better service. | $0.093096 |
| 7 | 10841ms | 1754ms | 请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进。直到问题圆满解决。 | Please take some time to consider which option best suits your needs, or if you have other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved. | $0.064620 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。但请您放心。我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进。直到问题圆满解决。

### Concatenated Translation

We are very sorry that the hotel you stayed at did not meet your expectations. Our platform has always highly valued every guest's feedback, and I fully understand how you feel right now. Encountering such a situation is indeed unpleasant and can really affect your travel mood. But please rest assured. We will definitely take your issue seriously and actively work to resolve it for you. I have prepared several solutions for you, and you can choose based on your actual needs. First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. Second, if you are no longer satisfied with this hotel, we can also coordinate a free cancellation of your booking and recommend other hotels nearby of the same or higher grade to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee waiver or upgrading your room type so that you receive some compensation and better service. Please take some time to consider which option best suits your needs, or if you have other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved.


---

## Experiment: B_semantic_silence600

**semantic_vad | silence=600ms | speech=80ms | prefix=300ms | threshold=0.5**

### Per-Turn Breakdown (6 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3498ms | 1649ms | 非常抱歉，您入住的酒店没有达到您的预期。 | We are very sorry that the hotel you stayed at did not meet your expectations. | $0.004254 |
| 2 | 16014ms | 1481ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。这样的情况确实是让人不舒服，也很影响出行的心情。但请您放心。我们一定会认真对待您的问题，积极为您解决这个问题的。 | Our platform has always valued every guest's feedback highly, and I fully understand how you feel right now. This kind of situation is indeed uncomfortable and can greatly affect your travel mood. But please rest assured. We will definitely take your issue seriously and work actively to resolve it for you. | $0.043597 |
| 3 | 4661ms | 1675ms | 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。 | At present, I have prepared several solutions for you, and you can choose according to your actual needs. | $0.004270 |
| 4 | 5605ms | 2510ms | 首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。 | First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. | $0.013898 |
| 5 | 23233ms | 2265ms | 第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。 | Second, if you are no longer satisfied with this hotel, we can also help you cancel the order for free and recommend other hotels nearby of the same or higher standard, ensuring your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee reduction or upgrading your room, so that you can receive some compensation and better service. | $0.076598 |
| 6 | 11303ms | 1701ms | 请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。 | Please take a moment to consider which option best suits your needs, or if you have any other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved. | $0.046492 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。这样的情况确实是让人不舒服，也很影响出行的心情。但请您放心。我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。

### Concatenated Translation

We are very sorry that the hotel you stayed at did not meet your expectations. Our platform has always valued every guest's feedback highly, and I fully understand how you feel right now. This kind of situation is indeed uncomfortable and can greatly affect your travel mood. But please rest assured. We will definitely take your issue seriously and work actively to resolve it for you. At present, I have prepared several solutions for you, and you can choose according to your actual needs. First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. Second, if you are no longer satisfied with this hotel, we can also help you cancel the order for free and recommend other hotels nearby of the same or higher standard, ensuring your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee reduction or upgrading your room, so that you can receive some compensation and better service. Please take a moment to consider which option best suits your needs, or if you have any other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved.


---

## Experiment: C_semantic_silence800_speech200

**semantic_vad | silence=800ms | speech=200ms | prefix=300ms | threshold=0.5**

### Per-Turn Breakdown (2 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3853ms | 1505ms | 非常抱歉，您入住的酒店没有达到您的预期。 | I am very sorry that the hotel you stayed at did not meet your expectations. | $0.004203 |
| 2 | 63857ms | 1730ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。这样的情况确实是让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面。面提出补偿要求，比如申请房费减免或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者是如果您有其他想法也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。 | Our platform has always attached great importance to the feedback of every guest, and I fully understand how you feel right now.   Such a situation is indeed unpleasant and can affect your travel mood.   But please rest assured, we will take your issue seriously and work actively to resolve it for you.   Currently, I have prepared several solutions for you to choose from based on your actual needs.   First, we can immediately contact the hotel to help you change rooms, ensuring you have a more comfortable stay.   Second, if you are no longer satisfied with this hotel, we can also coordinate to help you cancel the booking for free and recommend other nearby hotels of the same or higher standard, ensuring your trip is not affected.   Third, we will proactively request compensation from the hotel, such as applying for a room rate reduction or upgrading your room type, so you can receive some compensation and better service.   Please consider which option best meets your needs, or if you have other ideas, feel free to let us know at any time.   We will continue to follow up for you until the issue is fully resolved. | $0.129367 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。这样的情况确实是让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面。面提出补偿要求，比如申请房费减免或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者是如果您有其他想法也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。

### Concatenated Translation

I am very sorry that the hotel you stayed at did not meet your expectations. Our platform has always attached great importance to the feedback of every guest, and I fully understand how you feel right now.  
Such a situation is indeed unpleasant and can affect your travel mood.  
But please rest assured, we will take your issue seriously and work actively to resolve it for you.  
Currently, I have prepared several solutions for you to choose from based on your actual needs.  
First, we can immediately contact the hotel to help you change rooms, ensuring you have a more comfortable stay.  
Second, if you are no longer satisfied with this hotel, we can also coordinate to help you cancel the booking for free and recommend other nearby hotels of the same or higher standard, ensuring your trip is not affected.  
Third, we will proactively request compensation from the hotel, such as applying for a room rate reduction or upgrading your room type, so you can receive some compensation and better service.  
Please consider which option best meets your needs, or if you have other ideas, feel free to let us know at any time.  
We will continue to follow up for you until the issue is fully resolved.


---

## Experiment: D_semantic_silence500_speech150

**semantic_vad | silence=500ms | speech=150ms | prefix=300ms | threshold=0.5**

### Per-Turn Breakdown (8 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3458ms | 1529ms | 非常抱歉，您入住的酒店没有达到您的预期。 | I am very sorry that the hotel you stayed at did not meet your expectations. | $0.004143 |
| 2 | 10302ms | 1807ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的一些心情。 | Our platform has always valued every guest's feedback, and I fully understand how you feel right now. Encountering such situations is indeed unpleasant and can greatly affect the mood of your trip. | $0.019882 |
| 3 | 1246ms | 2699ms | 但请您放心。 | But please rest assured. | $0.000950 |
| 4 | 4017ms | 1628ms | 我们一定会认真对待您的问题，积极为您解决这个问题的。 | We will definitely take your issue seriously and actively work to resolve it for you. | $0.009127 |
| 5 | 4604ms | 1586ms | 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。 | I have prepared several solutions for you, and you can choose according to your actual needs. | $0.017355 |
| 6 | 5759ms | 1885ms | 首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。 | First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. | $0.013786 |
| 7 | 23356ms | 2378ms | 第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。 | Second, if you are no longer satisfied with this hotel, we can also assist you with a free cancellation and recommend other hotels nearby of the same or higher standard to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room charge reduction or upgrading your room type, so you can receive some compensation and better service. | $0.076870 |
| 8 | 10915ms | 2574ms | 请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。 | Please take some time to consider which option better suits your needs, or if you have other ideas, feel free to let us know at any time. We will continue to follow up for you until the issue is fully resolved. | $0.045934 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的一些心情。但请您放心。我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。

### Concatenated Translation

I am very sorry that the hotel you stayed at did not meet your expectations. Our platform has always valued every guest's feedback, and I fully understand how you feel right now. Encountering such situations is indeed unpleasant and can greatly affect the mood of your trip. But please rest assured. We will definitely take your issue seriously and actively work to resolve it for you. I have prepared several solutions for you, and you can choose according to your actual needs. First, we can immediately contact the hotel to help you change your room, ensuring you have a more comfortable stay. Second, if you are no longer satisfied with this hotel, we can also assist you with a free cancellation and recommend other hotels nearby of the same or higher standard to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room charge reduction or upgrading your room type, so you can receive some compensation and better service. Please take some time to consider which option better suits your needs, or if you have other ideas, feel free to let us know at any time. We will continue to follow up for you until the issue is fully resolved.


---

## Experiment: E_server_vad_silence500

**server_vad | silence=500ms | prefix=500ms | threshold=0.5**

### Per-Turn Breakdown (8 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3452ms | 1649ms | 非常抱歉，您入住的酒店没有达到您的预期。 | We are very sorry that the hotel you stayed at did not meet your expectations. | $0.004681 |
| 2 | 10282ms | 1627ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。 | Our platform has always valued the feedback of every guest, and I now fully understand how you feel. Encountering such a situation is indeed unpleasant and greatly affects the mood of your trip. | $0.020553 |
| 3 | 1010ms | 2909ms | 但请您放心。 | But please rest assured. | $0.000983 |
| 4 | 4091ms | 1467ms | 我们一定会认真对待您的问题，积极为您解决这个问题的。 | We will definitely take your issue seriously and actively work to resolve it for you. | $0.009352 |
| 5 | 4598ms | 1504ms | 目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。 | Currently, I have prepared several solutions for you, and you can choose according to your actual needs. | $0.018130 |
| 6 | 5754ms | 1784ms | 首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。 | First, we can immediately contact the hotel to help you change rooms, ensuring you have a more comfortable stay. | $0.013953 |
| 7 | 23358ms | 2533ms | 第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。 | Second, if you are no longer satisfied with this hotel, we can also coordinate a free cancellation of your booking and recommend other nearby hotels of the same or higher grade to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee discount or upgrading your room type, so that you can receive some compensation and better service. | $0.094883 |
| 8 | 10911ms | 1975ms | 请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。 | Please take some time to consider which solution best meets your needs, or if you have any other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved. | $0.046746 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。但请您放心。我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。第二，如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免。或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。

### Concatenated Translation

We are very sorry that the hotel you stayed at did not meet your expectations. Our platform has always valued the feedback of every guest, and I now fully understand how you feel. Encountering such a situation is indeed unpleasant and greatly affects the mood of your trip. But please rest assured. We will definitely take your issue seriously and actively work to resolve it for you. Currently, I have prepared several solutions for you, and you can choose according to your actual needs. First, we can immediately contact the hotel to help you change rooms, ensuring you have a more comfortable stay. Second, if you are no longer satisfied with this hotel, we can also coordinate a free cancellation of your booking and recommend other nearby hotels of the same or higher grade to ensure your trip is not affected. Third, we will proactively request compensation from the hotel, such as applying for a room fee discount or upgrading your room type, so that you can receive some compensation and better service. Please take some time to consider which solution best meets your needs, or if you have any other ideas, feel free to let us know at any time. We will continue to follow up with you until the issue is fully resolved.


---

## Experiment: F_server_vad_silence800

**server_vad | silence=800ms | prefix=500ms | threshold=0.5**

### Per-Turn Breakdown (3 turns)

| # | Duration | E2E | Input (ASR) | Output (Translation) | Cost |
|--:|--------:|----:|-------------|----------------------|-----:|
| 1 | 3657ms | 1353ms | 非常抱歉，您入住的酒店没有达到您的预期。 | I am very sorry that the hotel you stayed at did not meet your expectations. | $0.004203 |
| 2 | 27848ms | 1981ms | 我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。 | Our platform has always attached great importance to the feedback of every guest, and I fully understand how you feel right now.   Encountering such a situation is indeed unpleasant and can affect your mood during your trip.   But please rest assured, we will take your issue seriously and actively work to resolve it for you.   Currently, I have prepared several solutions for you to choose from based on your actual needs.   First, we can immediately contact the hotel to help you change your room and ensure you have a more comfortable stay. | $0.052098 |
| 3 | 34698ms | 2095ms | 如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。 | If you are no longer satisfied with this hotel, we can also arrange to cancel your booking for free and recommend other hotels nearby of the same or higher standard to ensure your trip is not affected.   Third, we will proactively request compensation from the hotel, such as applying for a room fee waiver or upgrading your room type, so you can receive some compensation and better service.   Please consider which option best meets your needs, or if you have other ideas, feel free to let us know at any time.   We will continue to follow up for you until the issue is fully resolved. | $0.091089 |

### Concatenated ASR

非常抱歉，您入住的酒店没有达到您的预期。我们平台一直非常重视每一位客人的反馈，我现在也非常理解您现在的心情。遇到这样的情况，确实是让人不舒服，也很影响出行的心情。但请您放心，我们一定会认真对待您的问题，积极为您解决这个问题的。目前我为您准备了几个处理方案，您可以根据自己的实际需求选择。首先，我们可以立即联系酒店，帮您更换房间，确保您能有一个更舒适的入住环境。如果您对这家酒店已经不满意，我们也可以协调帮您免费取消订单，并为您推荐附近同等级或者更高档次的其他酒店，确保您的行程不会受到影响。第三，我们会主动向酒店方面提出补偿要求，比如申请房费减免或者升级您的房型，让您能获得一定的补偿和更好的服务。请您考虑一下，看看哪个方案更符合您的需求，或者如果您有其他想法，也可以随时告诉我们。我们会一直为您跟进，直到问题圆满解决。

### Concatenated Translation

I am very sorry that the hotel you stayed at did not meet your expectations. Our platform has always attached great importance to the feedback of every guest, and I fully understand how you feel right now.  
Encountering such a situation is indeed unpleasant and can affect your mood during your trip.  
But please rest assured, we will take your issue seriously and actively work to resolve it for you.  
Currently, I have prepared several solutions for you to choose from based on your actual needs.  
First, we can immediately contact the hotel to help you change your room and ensure you have a more comfortable stay. If you are no longer satisfied with this hotel, we can also arrange to cancel your booking for free and recommend other hotels nearby of the same or higher standard to ensure your trip is not affected.  
Third, we will proactively request compensation from the hotel, such as applying for a room fee waiver or upgrading your room type, so you can receive some compensation and better service.  
Please consider which option best meets your needs, or if you have other ideas, feel free to let us know at any time.  
We will continue to follow up for you until the issue is fully resolved.

---

## Recommendation

Based on the scoring (turn count accuracy, fragment avoidance, latency, and coverage), **A_semantic_silence400** (semantic_vad | silence=400ms | speech=80ms | prefix=300ms | threshold=0.5) produced the best results with a score of **79/100**.

### Suggested Configuration

```json
{
  "model": "gpt-4.1-mini",
  "targetLanguage": "en",
  "prompt": "You are a simultaneous interpreter.\nTarget language: en.\n\nRules:\n1) Translate sentence by sentence (output each sentence as it completes).\n2) Keep context consistent across turns (pronouns, terms, tone, references).\n3) Preserve meaning faithfully; do not add explanations or extra content.\n4) Keep proper nouns, numbers, and code as-is unless a standard translation is obvious.\n5) Output translation text only.",
  "asrModel": "azure-speech",
  "asrLanguages": "zh,en",
  "turnDetectionType": "azure_semantic_vad",
  "threshold": 0.5,
  "prefixPaddingInMs": 300,
  "silenceDurationInMs": 400,
  "speechDurationInMs": 80,
  "removeFillerWords": false,
  "voiceProvider": "azure-standard",
  "voiceName": "en-US-AndrewMultilingualNeural",
  "inputAudioFormat": "pcm16",
  "inputAudioSamplingRate": 16000,
  "outputAudioFormat": "pcm16",
  "interruptResponse": false
}
```
