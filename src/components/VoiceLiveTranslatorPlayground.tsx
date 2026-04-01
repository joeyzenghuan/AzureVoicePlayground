import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  buildInterpreterPrompt,
  DEFAULT_CONFIG,
  MODEL_OPTIONS,
  TARGET_LANGUAGE_OPTIONS,
  type VoiceLiveConfig,
} from '../lib/voiceLive/defaults';
import { MicCapture } from '../lib/voiceLive/audio/micCapture';
import { floatTo16BitPCM, int16ToUint8LE } from '../lib/voiceLive/audio/pcm16';
import {
  VoiceLiveInterpreter,
  DEBUG_CATEGORIES,
  type SessionLogItem,
  type DebugCategory,
  type HighlightColor,
} from '../lib/voiceLive/interpreter';
import { calculatePercentile, calculateAverage, calculateCost, calculateTurnCostBreakdown, type TurnMetrics } from '../lib/voiceLive/metrics';

interface VoiceLiveTranslatorPlaygroundProps {
  endpoint: string;
  apiKey: string;
}

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return '-';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

const ALL_CATEGORIES = DEBUG_CATEGORIES.map((c) => c.key);

const CATEGORY_BADGE_STYLES: Record<DebugCategory, { bg: string; text: string; border: string }> = {
  conversation: { bg: 'bg-blue-900/40', text: 'text-blue-300', border: 'border-blue-700/50' },
  server_event: { bg: 'bg-purple-900/40', text: 'text-purple-300', border: 'border-purple-700/50' },
  client_event: { bg: 'bg-orange-900/40', text: 'text-orange-300', border: 'border-orange-700/50' },
  token_usage: { bg: 'bg-teal-900/40', text: 'text-teal-300', border: 'border-teal-700/50' },
  cost: { bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-700/50' },
  latency: { bg: 'bg-pink-900/40', text: 'text-pink-300', border: 'border-pink-700/50' },
  vad: { bg: 'bg-indigo-900/40', text: 'text-indigo-300', border: 'border-indigo-700/50' },
  asr: { bg: 'bg-sky-900/40', text: 'text-sky-300', border: 'border-sky-700/50' },
  session: { bg: 'bg-gray-800/60', text: 'text-gray-300', border: 'border-gray-600/50' },
  error: { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-700/50' },
};

const CATEGORY_CHIP_STYLES: Record<DebugCategory, { activeBg: string; activeText: string; activeBorder: string }> = {
  conversation: { activeBg: 'bg-blue-600', activeText: 'text-white', activeBorder: 'border-blue-500' },
  server_event: { activeBg: 'bg-purple-600', activeText: 'text-white', activeBorder: 'border-purple-500' },
  client_event: { activeBg: 'bg-orange-600', activeText: 'text-white', activeBorder: 'border-orange-500' },
  token_usage: { activeBg: 'bg-teal-600', activeText: 'text-white', activeBorder: 'border-teal-500' },
  cost: { activeBg: 'bg-yellow-600', activeText: 'text-white', activeBorder: 'border-yellow-500' },
  latency: { activeBg: 'bg-pink-600', activeText: 'text-white', activeBorder: 'border-pink-500' },
  vad: { activeBg: 'bg-indigo-600', activeText: 'text-white', activeBorder: 'border-indigo-500' },
  asr: { activeBg: 'bg-sky-600', activeText: 'text-white', activeBorder: 'border-sky-500' },
  session: { activeBg: 'bg-gray-600', activeText: 'text-white', activeBorder: 'border-gray-500' },
  error: { activeBg: 'bg-red-600', activeText: 'text-white', activeBorder: 'border-red-500' },
};

/* ── Reusable UI helpers for Advanced Settings ── */

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        className="text-gray-400 hover:text-blue-500"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow((v) => !v); }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <path d="M12 16v-4M12 8h.01" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-gray-900 text-gray-100 text-xs rounded-lg shadow-xl z-50 leading-relaxed pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  );
}

function SettingsGroup({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border-t border-gray-200 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-xs font-semibold text-emerald-700 uppercase tracking-wider bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2"
      >
        <span>{title}</span>
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, info, children }: { label: string; info: string; children: ReactNode }) {
  return (
    <div>
      <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
        {label}
        <InfoTip text={info} />
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const selectCls = inputCls;
const disabledCls = `${inputCls} disabled:bg-gray-100`;

function CategoryBadge({ category }: { category: DebugCategory }) {
  const style = CATEGORY_BADGE_STYLES[category];
  const label = DEBUG_CATEGORIES.find((c) => c.key === category)?.label ?? category;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.bg} ${style.text} ${style.border}`}>
      {label}
    </span>
  );
}

export function VoiceLiveTranslatorPlayground({ endpoint, apiKey }: VoiceLiveTranslatorPlaygroundProps) {
  const [config, setConfig] = useState<VoiceLiveConfig>(() => {
    const raw = localStorage.getItem('voicelive.translator.config');
    if (!raw) {
      const c = { ...DEFAULT_CONFIG };
      c.prompt = buildInterpreterPrompt(c.targetLanguage);
      return c;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<VoiceLiveConfig>;
      const merged = { ...DEFAULT_CONFIG, ...parsed };
      merged.prompt = merged.prompt?.trim() ? merged.prompt : buildInterpreterPrompt(merged.targetLanguage);
      return merged;
    } catch {
      const c = { ...DEFAULT_CONFIG };
      c.prompt = buildInterpreterPrompt(c.targetLanguage);
      return c;
    }
  });

  const [statusText, setStatusText] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [logs, setLogs] = useState<SessionLogItem[]>([]);
  const [debugMode, setDebugMode] = useState(() => {
    return localStorage.getItem('voicelive.translator.debugMode') === 'true';
  });
  const [enabledCategories, setEnabledCategories] = useState<Set<DebugCategory>>(() => {
    const raw = localStorage.getItem('voicelive.translator.debugCategories');
    if (raw) {
      try {
        const arr = JSON.parse(raw) as DebugCategory[];
        return new Set(arr);
      } catch { /* fall through */ }
    }
    return new Set(ALL_CATEGORIES);
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(() => new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audioFileStatus, setAudioFileStatus] = useState<string>('');
  const [isStreamingFile, setIsStreamingFile] = useState(false);
  const audioFileAbortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [turns, setTurns] = useState(() => 0);
  const [turnMetrics, setTurnMetrics] = useState<TurnMetrics[]>(() => []);
  const [showTurnTable, setShowTurnTable] = useState(false);
  const [sessionStartMs, setSessionStartMs] = useState(() => 0);
  const [inputAudioSeconds, setInputAudioSeconds] = useState(() => 0);
  const [inputAudioTokens, setInputAudioTokens] = useState(() => 0);
  const [cachedAudioSeconds, setCachedAudioSeconds] = useState(() => 0);
  const [cachedAudioTokens, setCachedAudioTokens] = useState(() => 0);
  const [outputAudioSeconds, setOutputAudioSeconds] = useState(() => 0);
  const [outputAudioTokens, setOutputAudioTokens] = useState(() => 0);
  const [inputTextTokens, setInputTextTokens] = useState(() => 0);
  const [cachedTextTokens, setCachedTextTokens] = useState(() => 0);
  const [outputTextTokens, setOutputTextTokens] = useState(() => 0);
  const [startLatencies, setStartLatencies] = useState<number[]>(() => []);
  const [endLatencies, setEndLatencies] = useState<number[]>(() => []);
  const [e2eLatencies, setE2eLatencies] = useState<number[]>(() => []);

  const interpreterRef = useRef<VoiceLiveInterpreter | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const logViewRef = useRef<HTMLDivElement | null>(null);
  const prevLangRef = useRef<string>(config.targetLanguage);

  if (!interpreterRef.current) {
    interpreterRef.current = new VoiceLiveInterpreter({
      onState: (s) => {
        setIsConnected(s.isConnected);
        setLogs(s.logs);
        setTurns(s.totals.turns);
        setTurnMetrics(s.turns);
        setSessionStartMs(s.totals.sessionStartMs);
        setInputAudioSeconds(s.totals.inputAudioSeconds);
        setInputAudioTokens(s.totals.inputAudioTokens);
        setCachedAudioSeconds(s.totals.cachedAudioSeconds);
        setCachedAudioTokens(s.totals.cachedAudioTokens);
        setOutputAudioSeconds(s.totals.outputAudioSeconds);
        setOutputAudioTokens(s.totals.outputAudioTokens);
        setInputTextTokens(s.totals.inputTextTokens);
        setCachedTextTokens(s.totals.cachedTextTokens);
        setOutputTextTokens(s.totals.outputTextTokens);
        setStartLatencies(s.totals.startLatencies);
        setEndLatencies(s.totals.endLatencies);
        setE2eLatencies(s.totals.e2eLatencies);
      },
    });
  }

  const interpreter = interpreterRef.current;

  useEffect(() => {
    localStorage.setItem('voicelive.translator.config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('voicelive.translator.debugMode', String(debugMode));
  }, [debugMode]);

  useEffect(() => {
    localStorage.setItem('voicelive.translator.debugCategories', JSON.stringify([...enabledCategories]));
  }, [enabledCategories]);

  // Cleanup on unmount - disconnect when switching playgrounds
  useEffect(() => {
    return () => {
      const client = interpreterRef.current;
      if (client?.snapshot.isConnected) {
        console.log('[VoiceLive Translator] Disconnecting on unmount');
        client.disconnect().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    const prevLang = prevLangRef.current;
    if (prevLang === config.targetLanguage) return;

    const prevDefault = buildInterpreterPrompt(prevLang);
    if (config.prompt.trim() === prevDefault.trim()) {
      setConfig((c) => ({ ...c, prompt: buildInterpreterPrompt(c.targetLanguage) }));
    }

    prevLangRef.current = config.targetLanguage;
  }, [config.targetLanguage, config.prompt]);

  useEffect(() => {
    const el = logViewRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const sessionTimeSeconds = sessionStartMs > 0 ? (Date.now() - sessionStartMs) / 1000 : 0;
  const avgE2eLatency = e2eLatencies.length > 0 ? calculateAverage(e2eLatencies) : 0;
  const p90E2eLatency = e2eLatencies.length > 0 ? calculatePercentile(e2eLatencies, 90) : 0;

  const pricingTier = useMemo(() => {
    const modelOption = MODEL_OPTIONS.find((m) => m.id === config.model);
    if (!modelOption) return 'standard' as const;
    if (modelOption.tier === 'basic') return 'standard' as const;
    return modelOption.tier as 'pro' | 'standard' | 'lite';
  }, [config.model]);

  const totalCost = calculateCost(
    {
      turns,
      sessionStartMs,
      inputAudioSeconds,
      inputAudioTokens,
      cachedAudioSeconds,
      cachedAudioTokens,
      outputAudioSeconds,
      outputAudioTokens,
      inputTextTokens,
      cachedTextTokens,
      outputTextTokens,
      startLatencies,
      endLatencies,
      e2eLatencies,
    },
    pricingTier,
    config.voiceProvider
  );
  const costPerSecond = sessionTimeSeconds > 0 ? totalCost / sessionTimeSeconds : 0;

  const visibleLogs = useMemo(() => {
    if (!debugMode) {
      // Default mode: only show conversation items (input/output/user) and errors
      return logs.filter((l) => l.category === 'conversation' || l.category === 'error');
    }
    // Debug mode: filter by enabled categories
    return logs.filter((l) => enabledCategories.has(l.category));
  }, [logs, debugMode, enabledCategories]);

  const modelOptions = useMemo(() => {
    const tiers: Record<string, string[]> = {};
    for (const m of MODEL_OPTIONS) {
      tiers[m.tier] ??= [];
      tiers[m.tier].push(m.id);
    }
    return tiers;
  }, []);

  function toggleCategory(cat: DebugCategory) {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function selectAllCategories() {
    setEnabledCategories(new Set(ALL_CATEGORIES));
  }

  function deselectAllCategories() {
    setEnabledCategories(new Set());
  }

  function toggleLogExpanded(logId: string) {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  }

  async function onConnect() {
    setStatusText('Connecting...');
    try {
      await interpreter.connect({ ...config, endpoint, apiKey });
      setStatusText('Connected');
      await startMic();
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : String(e));
    }
  }

  async function onDisconnect() {
    setStatusText('Disconnecting...');
    try {
      await stopMic();
      await interpreter.disconnect();
      setStatusText('Disconnected');
    } catch (e) {
      setStatusText(e instanceof Error ? e.message : String(e));
    }
  }

  async function startMic() {
    if (isMicOn) return;
    if (!interpreter.snapshot.isConnected) {
      setStatusText('Connect first');
      return;
    }

    micRef.current = new MicCapture(
      { sampleRate: 16000, bufferSize: 4096 },
      {
        onChunk: (bytes) => {
          void interpreter.sendMicPcmChunk(bytes);
        },
        onState: (s, detail) => {
          if (s === 'started') setIsMicOn(true);
          if (s === 'stopped') setIsMicOn(false);
          if (s === 'error') setStatusText(detail ?? 'Mic error');
        },
      }
    );
    await micRef.current.start();
  }

  async function stopMic() {
    if (!micRef.current) {
      setIsMicOn(false);
      return;
    }
    await micRef.current.stop();
    micRef.current = null;
    setIsMicOn(false);
  }

  async function streamAudioFile(file: File) {
    if (!interpreter.snapshot.isConnected) {
      setAudioFileStatus('Not connected');
      return;
    }

    const abort = new AbortController();
    audioFileAbortRef.current = abort;
    setIsStreamingFile(true);
    setAudioFileStatus(`Decoding ${file.name}...`);

    try {
      const arrayBuf = await file.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: config.inputAudioSamplingRate });
      const decoded = await audioCtx.decodeAudioData(arrayBuf);

      // Get mono channel and resample to target rate
      const channelData = decoded.getChannelData(0);
      const targetRate = config.inputAudioSamplingRate;
      let samples: Float32Array;

      if (decoded.sampleRate !== targetRate) {
        // Resample using OfflineAudioContext
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(channelData.length * targetRate / decoded.sampleRate), targetRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = decoded;
        source.connect(offlineCtx.destination);
        source.start();
        const rendered = await offlineCtx.startRendering();
        samples = rendered.getChannelData(0);
      } else {
        samples = channelData;
      }

      await audioCtx.close();

      // Stream at ~3x real-time speed using mic-sized chunks.
      // Too slow (1x) = VAD fragments on natural pauses.
      // Too fast (instant) = server sees data gaps between bursts, creates 4-6ms artifacts.
      // 3x is a good balance: fast enough for testing, steady enough for clean VAD.
      const speedMultiplier = 3;
      const chunkSize = 4096; // same as mic capture
      const chunkDurationMs = (chunkSize / targetRate) * 1000;
      const sendIntervalMs = chunkDurationMs / speedMultiplier;
      const totalChunks = Math.ceil(samples.length / chunkSize);
      const totalDuration = (samples.length / targetRate).toFixed(1);
      const estimatedTime = (samples.length / targetRate / speedMultiplier).toFixed(0);

      setAudioFileStatus(`Streaming ${file.name} (${totalDuration}s audio, ~${estimatedTime}s at ${speedMultiplier}x)...`);

      for (let i = 0; i < totalChunks; i++) {
        if (abort.signal.aborted) {
          setAudioFileStatus('Streaming cancelled');
          break;
        }

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, samples.length);
        const chunk = samples.slice(start, end);
        const pcm16 = floatTo16BitPCM(chunk);
        const bytes = int16ToUint8LE(pcm16);

        await interpreter.sendMicPcmChunk(bytes);

        // Pace at speedMultiplier × real-time
        if (i < totalChunks - 1) {
          await new Promise((r) => setTimeout(r, sendIntervalMs));
        }
      }

      if (!abort.signal.aborted) {
        setAudioFileStatus(`Done streaming ${file.name}`);
      }
    } catch (e) {
      setAudioFileStatus(e instanceof Error ? e.message : 'Failed to process audio');
    } finally {
      setIsStreamingFile(false);
      audioFileAbortRef.current = null;
    }
  }

  function cancelAudioFileStream() {
    audioFileAbortRef.current?.abort();
  }

  const allSelected = enabledCategories.size === ALL_CATEGORIES.length;
  const noneSelected = enabledCategories.size === 0;

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Left side - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Voice Live Translator</h1>
              <p className="text-blue-100 mt-1">
                Real-time voice translation powered by Azure Voice Live
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                isConnected ? 'bg-green-500/20 text-green-100' : 'bg-white/20 text-white/80'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-white/60'}`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
              {isMicOn && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Bar */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Turns</p>
              <p className="text-sm font-semibold text-gray-900">{turns}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Session</p>
              <p className="text-sm font-semibold text-gray-900">{sessionTimeSeconds.toFixed(1)}s</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Cost</p>
              <p className="text-sm font-semibold text-gray-900">${totalCost.toFixed(4)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Cost/sec</p>
              <p className="text-sm font-semibold text-gray-900">${costPerSecond.toFixed(5)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Avg E2E Latency</p>
              <p className="text-sm font-semibold text-gray-900">{formatMs(avgE2eLatency)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">P90 E2E Latency</p>
              <p className="text-sm font-semibold text-gray-900">{formatMs(p90E2eLatency)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Input Audio</p>
              <p className="text-sm font-semibold text-gray-900">{inputAudioSeconds.toFixed(1)}s</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Output Audio</p>
              <p className="text-sm font-semibold text-gray-900">{outputAudioSeconds.toFixed(1)}s</p>
            </div>
          </div>
        </div>

        {/* Per-Turn Statistics Table */}
        {turnMetrics.length > 0 && (
          <div className="bg-white border-b border-gray-200">
            <button
              onClick={() => setShowTurnTable((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>Per-Turn Statistics ({turnMetrics.length} turns)</span>
              <svg className={`w-4 h-4 transition-transform ${showTurnTable ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTurnTable && (
              <div className="overflow-x-auto max-h-64 overflow-y-auto border-t border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-500 text-left">
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold text-right">Duration</th>
                      <th className="px-3 py-2 font-semibold text-right">E2E Latency</th>
                      <th className="px-3 py-2 font-semibold text-left">Input (ASR)</th>
                      <th className="px-3 py-2 font-semibold text-left">Output (Translation)</th>
                      <th className="px-3 py-2 font-semibold text-right">Input Text</th>
                      <th className="px-3 py-2 font-semibold text-right">Cached Text</th>
                      <th className="px-3 py-2 font-semibold text-right">Input Audio</th>
                      <th className="px-3 py-2 font-semibold text-right">Cached Audio</th>
                      <th className="px-3 py-2 font-semibold text-right">Output Text</th>
                      <th className="px-3 py-2 font-semibold text-right">Output Audio</th>
                      <th className="px-3 py-2 font-semibold text-right">Total Tokens</th>
                      <th className="px-3 py-2 font-semibold text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {turnMetrics.map((t, i) => {
                      const u = t.usage;
                      const cost = u ? calculateTurnCostBreakdown(u, pricingTier, config.voiceProvider).total : 0;
                      return (
                        <tr key={t.responseId} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-700">{i + 1}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{t.speechStartedAtMs && t.speechStoppedAtMs ? `${t.speechStoppedAtMs - t.speechStartedAtMs}ms` : '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-pink-600">{t.e2eLatencyMs != null ? `${t.e2eLatencyMs}ms` : '-'}</td>
                          <td className="px-3 py-1.5 text-left text-gray-600 max-w-[160px] truncate" title={t.userTranscript ?? ''}>{t.userTranscript ?? '-'}</td>
                          <td className="px-3 py-1.5 text-left text-gray-600 max-w-[160px] truncate" title={t.assistantText ?? ''}>{t.assistantText ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.inputTokenDetails.textTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.inputTokenDetails.cachedTokensDetails.textTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.inputTokenDetails.audioTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.inputTokenDetails.cachedTokensDetails.audioTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.outputTokenDetails.textTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{u?.outputTokenDetails.audioTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-800">{u?.totalTokens ?? '-'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-emerald-700">{u ? `$${cost.toFixed(6)}` : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200 sticky bottom-0">
                    <tr className="font-semibold text-gray-800">
                      <td className="px-3 py-2">Avg/Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{(() => { const total = turnMetrics.reduce((s, t) => s + (t.speechStartedAtMs && t.speechStoppedAtMs ? t.speechStoppedAtMs - t.speechStartedAtMs : 0), 0); return total > 0 ? `${total}ms` : '-'; })()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-pink-600">{e2eLatencies.length > 0 ? `${Math.round(calculateAverage(e2eLatencies))}ms` : '-'}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.inputTokenDetails.textTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.inputTokenDetails.cachedTokensDetails.textTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.inputTokenDetails.audioTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.inputTokenDetails.cachedTokensDetails.audioTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.outputTokenDetails.textTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.outputTokenDetails.audioTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{turnMetrics.reduce((s, t) => s + (t.usage?.totalTokens ?? 0), 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">${totalCost.toFixed(6)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Log Panel */}
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {/* Log Header with Debug Toggle */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-gray-900">
              {debugMode ? 'Debug Log' : 'Conversation Log'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { interpreter.resetStats(); setExpandedLogs(new Set()); }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 border border-gray-300 hover:bg-gray-100 transition-colors"
                title="Clear all logs and reset statistics"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            <button
              onClick={() => setDebugMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                debugMode
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                  : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {debugMode ? 'Debug ON' : 'Debug OFF'}
            </button>
            </div>
          </div>

          {/* Category Filter Chips (visible only in debug mode) */}
          {debugMode && (
            <div className="mb-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Filter Categories</span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllCategories}
                    disabled={allSelected}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-default"
                  >
                    All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={deselectAllCategories}
                    disabled={noneSelected}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-default"
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEBUG_CATEGORIES.map((cat) => {
                  const active = enabledCategories.has(cat.key);
                  const chipStyle = CATEGORY_CHIP_STYLES[cat.key];
                  return (
                    <button
                      key={cat.key}
                      onClick={() => toggleCategory(cat.key)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? `${chipStyle.activeBg} ${chipStyle.activeText} ${chipStyle.activeBorder}`
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {active && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Log Content */}
          <div
            ref={logViewRef}
            className="flex-1 overflow-y-auto bg-gray-900 rounded-lg p-4 font-mono text-sm"
          >
            {visibleLogs.map((l) => {
              const isExpanded = expandedLogs.has(l.id);
              const hasDetail = !!l.detail;
              const isHighlight = l.highlight && debugMode;
              const hlColor = l.highlightColor ?? 'amber';
              const hlStyles: Record<HighlightColor, { bg: string; ts: string; text: string; arrow: string }> = {
                amber: { bg: 'bg-amber-500/10 border-amber-500/30', ts: 'text-amber-400', text: 'text-amber-200 font-medium', arrow: 'text-amber-400' },
                green: { bg: 'bg-emerald-500/10 border-emerald-500/30', ts: 'text-emerald-400', text: 'text-emerald-200 font-medium', arrow: 'text-emerald-400' },
              };
              const hl = isHighlight ? hlStyles[hlColor] : null;
              const isConv = debugMode && l.category === 'conversation';
              const convTextStyle = isConv
                ? l.level === 'input'
                  ? 'bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 rounded px-1.5 py-0.5'
                  : l.level === 'output'
                  ? 'bg-yellow-500/20 border border-yellow-400/30 text-yellow-100 rounded px-1.5 py-0.5'
                  : 'bg-sky-500/20 border border-sky-400/30 text-sky-100 rounded px-1.5 py-0.5'
                : null;

              return (
                <div key={l.id} className="group py-0.5">
                  <div
                    className={`flex gap-2 items-start ${
                      hl
                        ? `${hl.bg} border rounded-md px-2 py-1 -mx-1`
                        : hasDetail && debugMode
                        ? 'cursor-pointer hover:bg-white/5 rounded px-1 -mx-1'
                        : ''
                    }`}
                    onClick={hasDetail && debugMode ? () => toggleLogExpanded(l.id) : undefined}
                  >
                    {/* Timestamp with milliseconds */}
                    <span className={`shrink-0 tabular-nums ${hl ? hl.ts : 'text-gray-500'}`}>
                      {formatTimestamp(l.ts)}
                    </span>

                    {/* Level badge (non-debug) or Category badge (debug) */}
                    {debugMode ? (
                      <CategoryBadge category={l.category} />
                    ) : (
                      <span
                        className={`shrink-0 w-14 font-semibold ${
                          l.level === 'error'
                            ? 'text-red-400'
                            : l.level === 'input'
                            ? 'text-blue-400'
                            : l.level === 'output'
                            ? 'text-green-400'
                            : l.level === 'user'
                            ? 'text-yellow-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {l.level.toUpperCase()}
                      </span>
                    )}

                    {/* Message text */}
                    <span className={`break-all flex-1 ${
                      hl
                        ? hl.text
                        : convTextStyle
                        ? ''
                        : debugMode
                        ? l.category === 'error' ? 'text-red-300'
                          : 'text-gray-300'
                        : 'text-gray-100'
                    }`}>
                      {l.e2eMs != null ? (
                        <>
                          {l.text.replace('E2E', '')}
                          {' '}
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-400/40 text-pink-200 font-bold tabular-nums">
                            E2E {l.e2eMs}ms
                          </span>
                        </>
                      ) : convTextStyle ? (
                        <span className={convTextStyle}>{l.text}</span>
                      ) : l.text}
                    </span>

                    {/* Expand indicator */}
                    {hasDetail && debugMode && (
                      <svg
                        className={`w-4 h-4 shrink-0 transition-transform ${hl ? hl.arrow : 'text-gray-500'} ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>

                  {/* Expandable detail */}
                  {hasDetail && debugMode && isExpanded && (
                    <div className={`ml-[5.5rem] mt-1 mb-2 p-3 rounded-md border text-xs font-mono whitespace-pre leading-relaxed ${CATEGORY_BADGE_STYLES[l.category].bg} ${CATEGORY_BADGE_STYLES[l.category].border} ${CATEGORY_BADGE_STYLES[l.category].text}`}>
                      {l.detail}
                    </div>
                  )}
                </div>
              );
            })}
            {visibleLogs.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                {debugMode
                  ? 'No matching debug logs. Adjust category filters or start a session.'
                  : 'No logs yet. Click Start to begin translation.'}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">
              {statusText || 'Ready to translate'}
            </p>
            {debugMode && (
              <p className="text-xs text-gray-400">
                Showing {visibleLogs.length} of {logs.length} events
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Configuration Panel */}
      <div className="w-full md:w-80 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-6 flex flex-col overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h2>

        <div className="space-y-4 flex-1">
          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={config.model}
              onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <optgroup label="Voice Live Pro">
                {modelOptions.pro?.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
              <optgroup label="Voice Live Basic">
                {modelOptions.basic?.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
              <optgroup label="Voice Live Lite">
                {modelOptions.lite?.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Target Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
            <select
              value={config.targetLanguage}
              onChange={(e) => setConfig((c) => ({ ...c, targetLanguage: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TARGET_LANGUAGE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
          </div>

          {/* Connect/Disconnect Button */}
          <div className="pt-2">
            {!isConnected ? (
              <button
                onClick={onConnect}
                disabled={!endpoint || !apiKey}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start Translation
              </button>
            ) : (
              <button
                onClick={onDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Stop
              </button>
            )}
          </div>

          {/* Mic Status & Audio File Upload */}
          {isConnected && (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 p-3 rounded-md ${isMicOn ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
                <svg className={`w-5 h-5 ${isMicOn ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className={`text-sm font-medium ${isMicOn ? 'text-green-700' : 'text-gray-500'}`}>
                  {isMicOn ? 'Microphone active' : 'Microphone off'}
                </span>
              </div>

              {/* Audio File Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) streamAudioFile(file);
                  e.target.value = '';
                }}
              />
              {isStreamingFile ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2.5 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-xs text-blue-700 truncate">{audioFileStatus}</span>
                    </div>
                  </div>
                  <button
                    onClick={cancelAudioFileStream}
                    className="px-2.5 py-2 text-xs font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Audio File
                </button>
              )}
              {audioFileStatus && !isStreamingFile && (
                <p className="text-xs text-gray-500 text-center">{audioFileStatus}</p>
              )}
            </div>
          )}

          {/* Advanced Settings */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-sm font-medium text-gray-700"
            >
              <span>Advanced Settings</span>
              <svg
                className={`w-5 h-5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-1">
                {/* Prompt (always visible at top) */}
                <div className="pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      Prompt
                      <InfoTip text="System instructions that guide the model's translation behavior." />
                    </label>
                    <button
                      onClick={() => setConfig((c) => ({ ...c, prompt: buildInterpreterPrompt(c.targetLanguage) }))}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Reset
                    </button>
                  </div>
                  <textarea
                    value={config.prompt}
                    onChange={(e) => setConfig((c) => ({ ...c, prompt: e.target.value }))}
                    rows={6}
                    className={inputCls}
                  />
                </div>

                {/* ── Model Parameters ── */}
                <SettingsGroup title="Model Parameters">
                  <Field label="Temperature" info="Controls randomness of output. Lower values (e.g. 0.2) produce more focused results, higher values (e.g. 0.8) increase creativity. Server default: 0.7">
                    <input
                      type="number"
                      min={0} max={1} step={0.1}
                      value={config.temperature ?? ''}
                      onChange={(e) => setConfig((c) => ({ ...c, temperature: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                      placeholder="Not set (server default)"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Max Response Tokens" info="Maximum number of tokens the model can generate per response. Leave empty for unlimited output.">
                    <input
                      type="number"
                      min={1}
                      value={config.maxResponseOutputTokens ?? ''}
                      onChange={(e) => setConfig((c) => ({ ...c, maxResponseOutputTokens: e.target.value === '' ? undefined : parseInt(e.target.value) }))}
                      placeholder="Not set (unlimited)"
                      className={inputCls}
                    />
                  </Field>
                </SettingsGroup>

                {/* ── ASR & Recognition ── */}
                <SettingsGroup title="ASR & Recognition">
                  <Field label="ASR Model" info="Speech recognition model. 'azure-speech' uses Azure's speech service with language detection. Others use OpenAI's transcription models.">
                    <select
                      value={config.asrModel}
                      onChange={(e) => setConfig((c) => ({ ...c, asrModel: e.target.value as VoiceLiveConfig['asrModel'] }))}
                      className={selectCls}
                    >
                      <option value="azure-speech">azure-speech</option>
                      <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
                      <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
                      <option value="whisper-1">whisper-1</option>
                    </select>
                  </Field>
                  <Field label="ASR Languages" info="Language hints for speech recognition (comma-separated). E.g. 'en,zh' or 'en-US,zh-CN'. Only for azure-speech model.">
                    <input
                      type="text"
                      value={config.asrLanguages}
                      onChange={(e) => setConfig((c) => ({ ...c, asrLanguages: e.target.value }))}
                      placeholder="en,zh or en-US,zh-CN"
                      disabled={config.asrModel !== 'azure-speech'}
                      className={disabledCls}
                    />
                  </Field>
                  <Field label="Phrase List" info="Comma-separated list of phrases to boost recognition accuracy. Useful for domain-specific terms, proper nouns, or technical jargon. E.g. 'Azure,OpenAI,GPT-4'">
                    <input
                      type="text"
                      value={config.phraseList ?? ''}
                      onChange={(e) => setConfig((c) => ({ ...c, phraseList: e.target.value || undefined }))}
                      placeholder="Not set"
                      className={inputCls}
                    />
                  </Field>
                </SettingsGroup>

                {/* ── Turn Detection (VAD) ── */}
                <SettingsGroup title="Turn Detection (VAD)">
                  <Field label="Type" info="Voice Activity Detection method. 'server_vad' uses basic energy-based detection. 'azure_semantic_vad' uses AI-powered semantic understanding to detect natural speech boundaries.">
                    <select
                      value={config.turnDetectionType}
                      onChange={(e) => setConfig((c) => ({ ...c, turnDetectionType: e.target.value as VoiceLiveConfig['turnDetectionType'] }))}
                      className={selectCls}
                    >
                      <option value="server_vad">server_vad</option>
                      <option value="azure_semantic_vad">azure_semantic_vad</option>
                    </select>
                  </Field>
                  <Field label="Threshold" info="VAD activation threshold (0.0-1.0). Higher values require louder/clearer speech to trigger detection. Lower values are more sensitive but may pick up background noise.">
                    <input type="number" min={0} max={1} step={0.05} value={config.threshold}
                      onChange={(e) => setConfig((c) => ({ ...c, threshold: parseFloat(e.target.value) || 0 }))}
                      className={inputCls} />
                  </Field>
                  <Field label="Prefix Padding (ms)" info="Duration of audio (ms) to include before speech is detected. Helps capture the very beginning of utterances that might otherwise be clipped.">
                    <input type="number" min={0} step={50} value={config.prefixPaddingInMs}
                      onChange={(e) => setConfig((c) => ({ ...c, prefixPaddingInMs: parseInt(e.target.value) || 0 }))}
                      className={inputCls} />
                  </Field>
                  <Field label="Silence Duration (ms)" info="How long the silence (ms) must last to consider the user has finished speaking. Shorter = faster response but may cut off pauses mid-sentence.">
                    <input type="number" min={0} step={50} value={config.silenceDurationInMs}
                      onChange={(e) => setConfig((c) => ({ ...c, silenceDurationInMs: parseInt(e.target.value) || 0 }))}
                      className={inputCls} />
                  </Field>
                  {config.turnDetectionType === 'azure_semantic_vad' && (
                    <>
                      <Field label="Speech Duration (ms)" info="Minimum speech duration (ms) to be considered valid input. Filters out very short sounds like coughs or clicks. Semantic VAD only.">
                        <input type="number" min={0} step={10} value={config.speechDurationInMs}
                          onChange={(e) => setConfig((c) => ({ ...c, speechDurationInMs: parseInt(e.target.value) || 0 }))}
                          className={inputCls} />
                      </Field>
                      <Field label="Remove Filler Words" info="Remove filler words like 'um', 'uh', 'hmm' from the transcription output. Semantic VAD only.">
                        <select value={config.removeFillerWords ? 'true' : 'false'}
                          onChange={(e) => setConfig((c) => ({ ...c, removeFillerWords: e.target.value === 'true' }))}
                          className={selectCls}>
                          <option value="false">Off</option>
                          <option value="true">On</option>
                        </select>
                      </Field>
                      <Field label="VAD Languages" info="Language hints for semantic VAD (comma-separated, e.g. 'en,zh'). Helps the VAD model better detect speech boundaries for specific languages.">
                        <input type="text" value={config.vadLanguages ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, vadLanguages: e.target.value || undefined }))}
                          placeholder="Not set (auto-detect)"
                          className={inputCls} />
                      </Field>
                    </>
                  )}
                  <Field label="Interrupt Response" info="Allow user speech to interrupt the AI's audio response. When enabled, the AI stops speaking when the user starts talking.">
                    <select value={config.interruptResponse ? 'true' : 'false'}
                      onChange={(e) => setConfig((c) => ({ ...c, interruptResponse: e.target.value === 'true' }))}
                      className={selectCls}>
                      <option value="false">Off (default)</option>
                      <option value="true">On</option>
                    </select>
                  </Field>
                  <Field label="Auto Truncate" info="Automatically truncate the audio buffer when a turn is detected. Removes audio data before the detected speech to save bandwidth.">
                    <select value={config.autoTruncate == null ? '' : config.autoTruncate ? 'true' : 'false'}
                      onChange={(e) => setConfig((c) => ({ ...c, autoTruncate: e.target.value === '' ? undefined : e.target.value === 'true' }))}
                      className={selectCls}>
                      <option value="">Not set (server default)</option>
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  </Field>
                </SettingsGroup>

                {/* ── Voice ── */}
                <SettingsGroup title="Voice">
                  <Field label="Provider" info="Voice synthesis provider. 'OpenAI' uses native voices. 'Azure Neural' uses Azure TTS with SSML. 'Personal Voice' replicates a user's voice from a short sample. 'Custom Voice' uses a professionally trained custom voice model.">
                    <select
                      value={config.voiceProvider}
                      onChange={(e) => {
                        const p = e.target.value as VoiceLiveConfig['voiceProvider'];
                        const defaults: Record<string, string> = {
                          'openai': 'alloy',
                          'azure-standard': 'en-US-AvaMultilingualNeural',
                          'azure-personal': '',
                          'azure-custom': '',
                        };
                        setConfig((c) => ({
                          ...c,
                          voiceProvider: p,
                          voiceName: defaults[p] ?? '',
                          voiceModel: p === 'azure-personal' ? 'DragonLatestNeural' : undefined,
                        }));
                      }}
                      className={selectCls}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="azure-standard">Azure Neural</option>
                      <option value="azure-personal">Azure Personal Voice</option>
                      <option value="azure-custom">Azure Custom Voice</option>
                    </select>
                  </Field>
                  {/* Voice Name: dropdown for openai/azure-standard, text input for personal/custom */}
                  {config.voiceProvider === 'openai' && (
                    <Field label="Voice Name" info="The specific OpenAI voice to use.">
                      <select value={config.voiceName}
                        onChange={(e) => setConfig((c) => ({ ...c, voiceName: e.target.value }))}
                        className={selectCls}>
                        <option value="alloy">Alloy</option>
                        <option value="ash">Ash</option>
                        <option value="ballad">Ballad</option>
                        <option value="coral">Coral</option>
                        <option value="echo">Echo</option>
                        <option value="sage">Sage</option>
                        <option value="shimmer">Shimmer</option>
                        <option value="verse">Verse</option>
                      </select>
                    </Field>
                  )}
                  {config.voiceProvider === 'azure-standard' && (
                    <Field label="Voice Name" info="Azure neural voice name.">
                      <select value={config.voiceName}
                        onChange={(e) => setConfig((c) => ({ ...c, voiceName: e.target.value }))}
                        className={selectCls}>
                        <option value="en-US-AvaMultilingualNeural">Ava (Female, conversational)</option>
                        <option value="en-US-Ava:DragonHDLatestNeural">Ava HD (Female, friendly)</option>
                        <option value="en-US-AndrewMultilingualNeural">Andrew (Male, conversational)</option>
                        <option value="en-US-GuyMultilingualNeural">Guy (Male, professional)</option>
                        <option value="zh-CN-XiaochenMultilingualNeural">Xiaochen (Female, assistant)</option>
                      </select>
                    </Field>
                  )}
                  {config.voiceProvider === 'azure-personal' && (
                    <>
                      <Field label="Personal Voice Name" info="The name/ID of your personal voice speaker profile. Create one via Azure AI Speech portal.">
                        <input type="text" value={config.voiceName}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceName: e.target.value }))}
                          placeholder="your-personal-voice-name" className={inputCls} />
                      </Field>
                      <Field label="Base Model" info="The base neural model used for personal voice synthesis. 'DragonLatestNeural' is the standard model. 'DragonHDOmniLatestNeural' is the high-definition variant.">
                        <select value={config.voiceModel ?? 'DragonLatestNeural'}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceModel: e.target.value }))}
                          className={selectCls}>
                          <option value="DragonLatestNeural">DragonLatestNeural</option>
                          <option value="DragonHDOmniLatestNeural">DragonHDOmniLatestNeural</option>
                        </select>
                      </Field>
                    </>
                  )}
                  {config.voiceProvider === 'azure-custom' && (
                    <>
                      <Field label="Custom Voice Name" info="The name of your custom neural voice (e.g. 'en-US-CustomNeural'). Must be deployed on the same Foundry resource.">
                        <input type="text" value={config.voiceName}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceName: e.target.value }))}
                          placeholder="en-US-CustomNeural" className={inputCls} />
                      </Field>
                      <Field label="Endpoint ID" info="The deployment endpoint ID (GUID) for your custom voice model. Find this in Azure AI Speech portal under your custom voice deployment.">
                        <input type="text" value={config.voiceEndpointId ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceEndpointId: e.target.value || undefined }))}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={inputCls} />
                      </Field>
                    </>
                  )}
                  {/* Voice Temperature: available for azure-standard, azure-personal, azure-custom */}
                  {config.voiceProvider !== 'openai' && (
                    <Field label="Voice Temperature" info="Controls variation in voice output (0.0-1.0). Lower = more consistent, higher = more expressive variation. Only effective with HD voices.">
                      <input type="number" min={0} max={1} step={0.1}
                        value={config.voiceTemperature ?? ''}
                        onChange={(e) => setConfig((c) => ({ ...c, voiceTemperature: e.target.value === '' ? undefined : parseFloat(e.target.value) }))}
                        placeholder="Not set (server default)" className={inputCls} />
                    </Field>
                  )}
                  {/* SSML properties: only for azure-standard and azure-custom */}
                  {(config.voiceProvider === 'azure-standard' || config.voiceProvider === 'azure-custom') && (
                    <>
                      <Field label="Style" info="Speaking style. Available styles depend on the voice. Common: cheerful, sad, angry, friendly, shouting, whispering.">
                        <input type="text" value={config.voiceStyle ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceStyle: e.target.value || undefined }))}
                          placeholder="Not set (default style)" className={inputCls} />
                      </Field>
                      <Field label="Rate" info="Speech rate. Values: '0.5' to '2.0' (multiplier), or '+20%', '-10%'. Default: 1.0.">
                        <input type="text" value={config.voiceRate ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceRate: e.target.value || undefined }))}
                          placeholder="Not set (1.0)" className={inputCls} />
                      </Field>
                      <Field label="Pitch" info="Pitch adjustment. Values: '+10%', '-5%', or semitones '+2st'. Default: 0.">
                        <input type="text" value={config.voicePitch ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voicePitch: e.target.value || undefined }))}
                          placeholder="Not set (default)" className={inputCls} />
                      </Field>
                      <Field label="Volume" info="Volume adjustment. Values: '80%', or '+10dB', '-5dB'. Default: 100%.">
                        <input type="text" value={config.voiceVolume ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceVolume: e.target.value || undefined }))}
                          placeholder="Not set (100%)" className={inputCls} />
                      </Field>
                      <Field label="Locale" info="Specific locale (e.g. 'en-US', 'zh-CN'). Overrides the voice's default locale.">
                        <input type="text" value={config.voiceLocale ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voiceLocale: e.target.value || undefined }))}
                          placeholder="Not set (auto)" className={inputCls} />
                      </Field>
                      <Field label="Prefer Locales" info="Preferred locale order for multilingual voices (comma-separated, e.g. 'en-US,zh-CN').">
                        <input type="text" value={config.voicePreferLocales ?? ''}
                          onChange={(e) => setConfig((c) => ({ ...c, voicePreferLocales: e.target.value || undefined }))}
                          placeholder="Not set" className={inputCls} />
                      </Field>
                    </>
                  )}
                </SettingsGroup>

                {/* ── Audio Format ── */}
                <SettingsGroup title="Audio Format">
                  <Field label="Input Format" info="Format of audio sent from the microphone. 'pcm16' is required for browser mic capture. Changing this may cause recording to fail.">
                    <select value={config.inputAudioFormat}
                      onChange={(e) => setConfig((c) => ({ ...c, inputAudioFormat: e.target.value }))}
                      className={selectCls}>
                      <option value="pcm16">pcm16</option>
                      <option value="g711_ulaw">g711_ulaw</option>
                      <option value="g711_alaw">g711_alaw</option>
                    </select>
                  </Field>
                  <Field label="Input Sampling Rate" info="Sampling rate of input audio in Hz. Must match the AudioContext sample rate. 16000 Hz is the default for browser mic capture.">
                    <select value={config.inputAudioSamplingRate}
                      onChange={(e) => setConfig((c) => ({ ...c, inputAudioSamplingRate: parseInt(e.target.value) }))}
                      className={selectCls}>
                      <option value={8000}>8000 Hz</option>
                      <option value={16000}>16000 Hz</option>
                      <option value={24000}>24000 Hz</option>
                    </select>
                  </Field>
                  <Field label="Output Format" info="Format and quality of audio received from the server. 'pcm16' = 24kHz (best quality), 'pcm16-16000hz' = 16kHz, 'pcm16-8000hz' = 8kHz (smallest).">
                    <select value={config.outputAudioFormat}
                      onChange={(e) => setConfig((c) => ({ ...c, outputAudioFormat: e.target.value }))}
                      className={selectCls}>
                      <option value="pcm16">pcm16 (24kHz)</option>
                      <option value="pcm16-16000hz">pcm16-16000hz</option>
                      <option value="pcm16-8000hz">pcm16-8000hz</option>
                      <option value="g711_ulaw">g711_ulaw</option>
                      <option value="g711_alaw">g711_alaw</option>
                    </select>
                  </Field>
                  <Field label="Noise Reduction" info="Enable server-side noise reduction on input audio. Helps in noisy environments by filtering background noise before speech recognition.">
                    <select value={config.noiseReduction == null ? '' : config.noiseReduction ? 'true' : 'false'}
                      onChange={(e) => setConfig((c) => ({ ...c, noiseReduction: e.target.value === '' ? undefined : e.target.value === 'true' }))}
                      className={selectCls}>
                      <option value="">Not set (server default)</option>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </Field>
                  <Field label="Echo Cancellation" info="Enable server-side echo cancellation to prevent the AI's audio output from being picked up by the microphone and causing feedback loops.">
                    <select value={config.echoCancellation == null ? '' : config.echoCancellation ? 'true' : 'false'}
                      onChange={(e) => setConfig((c) => ({ ...c, echoCancellation: e.target.value === '' ? undefined : e.target.value === 'true' }))}
                      className={selectCls}>
                      <option value="">Not set (server default)</option>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </Field>
                </SettingsGroup>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
