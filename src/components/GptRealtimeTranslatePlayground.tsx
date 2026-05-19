import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  TranslateRealtimeClient,
  type ConnectionStatus,
} from '../lib/gptRealtime/translateClient';
import { WhisperRealtimeClient } from '../lib/gptRealtime/whisperClient';
import { GptRealtimeAudioHandler } from '../lib/gptRealtime/audioHandler';
import { streamAudioFileRealtime } from '../lib/gptRealtime/streamAudioFile';

interface TranslationEntry {
  id: string;
  translated: string;
  timestamp: Date;
  isFinal: boolean;
}

interface PairedTranscriptEntry {
  id: string;
  source: string;
  translated: string;
  timestamp: Date;
  sourceFinal: boolean;
  translationFinal: boolean;
}

const TARGET_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'th', label: 'Thai' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'cs', label: 'Czech' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'he', label: 'Hebrew' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'tl', label: 'Tagalog' },
];

const SOURCE_LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  ...TARGET_LANGUAGES,
];

interface GptRealtimeTranslatePlaygroundProps {
  endpoint: string;
  apiKey: string;
}

export function GptRealtimeTranslatePlayground({ endpoint, apiKey }: GptRealtimeTranslatePlaygroundProps) {
  const [deployment, setDeployment] = useState(
    () => localStorage.getItem('gpt-translate-deployment') || 'gpt-realtime-translate',
  );
  const [targetLanguage, setTargetLanguage] = useState(
    () => localStorage.getItem('gpt-translate-target-lang') || 'en',
  );
  const [showSourceTranscriptConfig, setShowSourceTranscriptConfig] = useState(false);
  const [enableSourceTranscript, setEnableSourceTranscript] = useState(
    () => localStorage.getItem('gpt-translate-enable-source-transcript') === 'true',
  );
  const [sourceTranscriptDeployment, setSourceTranscriptDeployment] = useState(
    () => localStorage.getItem('gpt-translate-source-deployment') || '',
  );
  const [sourceTranscriptLanguage, setSourceTranscriptLanguage] = useState(
    () => localStorage.getItem('gpt-translate-source-language') || '',
  );
  const [sourceTranscriptPrompt, setSourceTranscriptPrompt] = useState(
    () => localStorage.getItem('gpt-translate-source-prompt') || '',
  );

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [pairedEntries, setPairedEntries] = useState<PairedTranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStreamingFile, setIsStreamingFile] = useState(false);
  const [audioFileStatus, setAudioFileStatus] = useState('');

  const clientRef = useRef<TranslateRealtimeClient | null>(null);
  const sourceTranscriptClientRef = useRef<WhisperRealtimeClient | null>(null);
  const audioHandlerRef = useRef<GptRealtimeAudioHandler | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileAbortRef = useRef<AbortController | null>(null);

  // Current in-progress entry
  const currentEntryRef = useRef<{ id: string; translated: string } | null>(null);
  const currentPairRef = useRef<{
    id: string;
    hasSource: boolean;
    hasTranslated: boolean;
    sourceFinal: boolean;
    translationFinal: boolean;
  } | null>(null);

  // Persist config
  useEffect(() => {
    localStorage.setItem('gpt-translate-deployment', deployment);
  }, [deployment]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-target-lang', targetLanguage);
  }, [targetLanguage]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-enable-source-transcript', String(enableSourceTranscript));
  }, [enableSourceTranscript]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-source-deployment', sourceTranscriptDeployment);
  }, [sourceTranscriptDeployment]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-source-language', sourceTranscriptLanguage);
  }, [sourceTranscriptLanguage]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-source-prompt', sourceTranscriptPrompt);
  }, [sourceTranscriptPrompt]);
  useEffect(() => {
    localStorage.removeItem('gpt-translate-source-transcript');
  }, []);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length, pairedEntries.length]);

  // Cleanup
  useEffect(() => {
    return () => {
      sourceTranscriptClientRef.current?.disconnect();
      clientRef.current?.disconnect();
      audioHandlerRef.current?.destroy();
    };
  }, []);

  const addOrUpdateEntry = useCallback((id: string, translated: string, isFinal: boolean) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.id === id);
      if (existing) {
        return prev.map((e) => (e.id === id ? { ...e, translated, isFinal } : e));
      }
      return [...prev, { id, translated, timestamp: new Date(), isFinal }];
    });
  }, []);

  const createPairedEntry = useCallback(() => {
    const id = crypto.randomUUID();
    currentPairRef.current = {
      id,
      hasSource: false,
      hasTranslated: false,
      sourceFinal: false,
      translationFinal: false,
    };
    setPairedEntries((prev) => [
      ...prev,
      {
        id,
        source: '',
        translated: '',
        timestamp: new Date(),
        sourceFinal: false,
        translationFinal: false,
      },
    ]);
    return id;
  }, []);

  const updatePairedEntry = useCallback((
    id: string,
    updater: (entry: PairedTranscriptEntry) => PairedTranscriptEntry,
  ) => {
    setPairedEntries((prev) => prev.map((entry) => (entry.id === id ? updater(entry) : entry)));
  }, []);

  const ensurePairedEntryForTranslation = useCallback(() => {
    const current = currentPairRef.current;
    if (!current) return createPairedEntry();
    if (current.translationFinal && current.sourceFinal) return createPairedEntry();
    return current.id;
  }, [createPairedEntry]);

  const ensurePairedEntryForSource = useCallback(() => {
    const current = currentPairRef.current;
    if (!current) return createPairedEntry();
    if (current.hasSource) return createPairedEntry();
    return current.id;
  }, [createPairedEntry]);

  const handlePairedTranslationDelta = useCallback((delta: string) => {
    const pairId = ensurePairedEntryForTranslation();
    if (currentPairRef.current?.id === pairId) {
      currentPairRef.current.hasTranslated = true;
      currentPairRef.current.translationFinal = false;
    }
    updatePairedEntry(pairId, (entry) => ({
      ...entry,
      translated: entry.translated + delta,
      translationFinal: false,
    }));
  }, [ensurePairedEntryForTranslation, updatePairedEntry]);

  const handlePairedTranslationDone = useCallback(() => {
    const current = currentPairRef.current;
    if (!current) return;
    current.translationFinal = true;
    updatePairedEntry(current.id, (entry) => ({
      ...entry,
      translationFinal: true,
    }));
  }, [updatePairedEntry]);

  const handleSourceTranscriptDelta = useCallback((delta: string) => {
    const pairId = ensurePairedEntryForSource();
    if (currentPairRef.current?.id === pairId) {
      currentPairRef.current.hasSource = true;
      currentPairRef.current.sourceFinal = false;
    }
    updatePairedEntry(pairId, (entry) => ({
      ...entry,
      source: entry.source + delta,
      sourceFinal: false,
    }));
  }, [ensurePairedEntryForSource, updatePairedEntry]);

  const handleSourceTranscriptDone = useCallback((finalText?: string) => {
    const current = currentPairRef.current;
    if (!current) {
      if (!finalText) return;
      const pairId = createPairedEntry();
      currentPairRef.current = {
        id: pairId,
        hasSource: true,
        hasTranslated: false,
        sourceFinal: true,
        translationFinal: false,
      };
      updatePairedEntry(pairId, (entry) => ({
        ...entry,
        source: finalText,
        sourceFinal: true,
      }));
      return;
    }

    current.hasSource = true;
    current.sourceFinal = true;
    updatePairedEntry(current.id, (entry) => ({
      ...entry,
      source: finalText || entry.source,
      sourceFinal: true,
    }));
  }, [createPairedEntry, updatePairedEntry]);

  const handleSourceSpeechStarted = useCallback(() => {
    ensurePairedEntryForSource();
  }, [ensurePairedEntryForSource]);

  const sendAudioToActiveSessions = useCallback((audioData: ArrayBuffer) => {
    clientRef.current?.sendAudio(audioData);
    sourceTranscriptClientRef.current?.sendAudio(audioData);
  }, []);

  async function handleConnect() {
    if (!apiKey.trim() || !endpoint.trim()) {
      setError('Please configure Endpoint & API Key in the left sidebar');
      return;
    }
    if (enableSourceTranscript && !sourceTranscriptDeployment.trim()) {
      setError('Please configure a Source Transcript deployment in Advanced Source Transcript settings');
      return;
    }

    sourceTranscriptClientRef.current?.disconnect();
    clientRef.current?.disconnect();
    audioHandlerRef.current?.destroy();
    currentEntryRef.current = null;
    currentPairRef.current = null;

    const audioHandler = new GptRealtimeAudioHandler();
    audioHandlerRef.current = audioHandler;
    if (circleRef.current) {
      audioHandler.setCircleElement(circleRef.current);
    }

    const client = new TranslateRealtimeClient({
      endpoint: endpoint.trim(),
      apiKey: apiKey.trim(),
      deployment: deployment.trim(),
      targetLanguage,
      onOutputAudioData: (audioData) => {
        audioHandler.playAudio(audioData);
      },
      onOutputTranscriptDelta: (delta) => {
        if (enableSourceTranscript) {
          handlePairedTranslationDelta(delta);
          return;
        }
        const entry = currentEntryRef.current;
        if (entry) {
          entry.translated += delta;
          addOrUpdateEntry(entry.id, entry.translated, false);
        } else {
          const newId = crypto.randomUUID();
          currentEntryRef.current = { id: newId, translated: delta };
          addOrUpdateEntry(newId, delta, false);
        }
      },
      onSpeechStarted: () => {
        if (enableSourceTranscript) {
          return;
        }
        // Finalize previous entry
        if (currentEntryRef.current?.translated) {
          addOrUpdateEntry(currentEntryRef.current.id, currentEntryRef.current.translated, true);
        }
        currentEntryRef.current = null;
      },
      onTurnComplete: () => {
        if (enableSourceTranscript) {
          handlePairedTranslationDone();
          return;
        }
        if (currentEntryRef.current?.translated) {
          addOrUpdateEntry(currentEntryRef.current.id, currentEntryRef.current.translated, true);
          currentEntryRef.current = null;
        }
      },
      onError: (err) => setError(err),
      onStatusChange: (s) => {
        setStatus(s);
        if (s === 'disconnected') {
          currentEntryRef.current = null;
        }
      },
    });

    clientRef.current = client;
    sourceTranscriptClientRef.current = null;

    if (enableSourceTranscript) {
      const sourceClient = new WhisperRealtimeClient({
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        deployment: sourceTranscriptDeployment.trim(),
        language: sourceTranscriptLanguage || undefined,
        prompt: sourceTranscriptPrompt || undefined,
        onTranscriptDelta: handleSourceTranscriptDelta,
        onTranscriptDone: handleSourceTranscriptDone,
        onSpeechStarted: handleSourceSpeechStarted,
        onError: (err) => setError(`Source transcript error: ${err}`),
        onStatusChange: (s) => {
          if (s === 'disconnected') {
            currentPairRef.current = null;
          }
        },
      });

      sourceTranscriptClientRef.current = sourceClient;
    }

    try {
      setError(null);
      await client.connect();
      if (sourceTranscriptClientRef.current) {
        await sourceTranscriptClientRef.current.connect();
      }
      await audioHandler.startRecording((audioData) => {
        sendAudioToActiveSessions(audioData);
      });
      setIsRecording(true);
    } catch (err) {
      sourceTranscriptClientRef.current?.disconnect();
      client.disconnect();
      setIsRecording(false);
      setError(`Connection failed: ${err}`);
    }
  }

  function handleDisconnect() {
    audioFileAbortRef.current?.abort();
    audioHandlerRef.current?.stopRecording();
    audioHandlerRef.current?.clearPlayback();
    sourceTranscriptClientRef.current?.disconnect();
    clientRef.current?.disconnect();
    setIsRecording(false);
    setIsStreamingFile(false);
  }

  function toggleRecording() {
    if (isRecording) {
      audioHandlerRef.current?.stopRecording();
      setIsRecording(false);
    } else if (audioHandlerRef.current && clientRef.current) {
      audioHandlerRef.current.startRecording((audioData) => {
        sendAudioToActiveSessions(audioData);
      });
      setIsRecording(true);
    }
  }

  function handleClear() {
    setEntries([]);
    setPairedEntries([]);
    currentEntryRef.current = null;
    currentPairRef.current = null;
  }

  async function handleTrySampleAudio() {
    try {
      setAudioFileStatus('Loading sample audio...');
      const resp = await fetch(`${import.meta.env.BASE_URL}test-audio/continuous_zh_20s.wav`);
      const blob = await resp.blob();
      const file = new File([blob], 'continuous_zh_20s.wav', { type: 'audio/wav' });
      await handleStreamAudioFile(file);
    } catch (e) {
      setAudioFileStatus(e instanceof Error ? e.message : 'Failed to load sample');
    }
  }

  async function handleStreamAudioFile(file: File) {
    if (!clientRef.current || status !== 'connected') {
      setAudioFileStatus('Not connected');
      return;
    }

    // Pause mic while streaming file
    const wasMicOn = isRecording;
    if (wasMicOn) {
      audioHandlerRef.current?.stopRecording();
      setIsRecording(false);
    }

    const abort = new AbortController();
    audioFileAbortRef.current = abort;
    setIsStreamingFile(true);

    try {
      await streamAudioFileRealtime({
        file,
        sampleRate: 24000,
        chunkDurationMs: 200,
        signal: abort.signal,
        onChunk: (pcm16) => {
          sendAudioToActiveSessions(pcm16);
        },
        onProgress: (_percent, statusText) => {
          setAudioFileStatus(statusText);
        },
      });
      if (abort.signal.aborted) {
        setAudioFileStatus('Streaming cancelled');
      }
    } catch (e) {
      setAudioFileStatus(e instanceof Error ? e.message : 'Failed to process audio');
    } finally {
      setIsStreamingFile(false);
      audioFileAbortRef.current = null;
      // Restore mic
      if (wasMicOn && clientRef.current && status === 'connected') {
        audioHandlerRef.current?.startRecording((audioData) => {
          sendAudioToActiveSessions(audioData);
        });
        setIsRecording(true);
      }
    }
  }

  function cancelAudioFileStream() {
    audioFileAbortRef.current?.abort();
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Main Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">GPT Realtime Translate</h1>
              <p className="text-indigo-100 mt-1">Full-duplex real-time speech translation with Azure OpenAI</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  status === 'connected' ? 'bg-green-500/20 text-green-100' : 'bg-white/20 text-white/80'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400' : 'bg-white/60'}`} />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {isRecording && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Audio visualization */}
        <div className="flex-shrink-0 flex flex-col items-center py-6 bg-white border-b border-gray-100" style={{ height: '200px' }}>
          <div
            ref={circleRef}
            className="rounded-full transition-all duration-150 ease-out flex items-center justify-center"
            style={{ width: '100px', height: '100px', backgroundColor: '#e5e7eb' }}
          >
            <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          {status !== 'connected' && (
            <p className="text-sm text-gray-400 mt-2">Click Connect to begin translation</p>
          )}
        </div>

        {/* Transcript + translation entries */}
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {entries.length === 0 && (!enableSourceTranscript || pairedEntries.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">
                {enableSourceTranscript
                  ? 'Connect and speak — source transcript and translations appear here in real time'
                  : 'Connect and speak — translations appear here in real time'}
              </p>
            </div>
          ) : (
            <div className={`mx-auto ${enableSourceTranscript ? 'max-w-6xl' : 'max-w-3xl'}`}>
              {enableSourceTranscript ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Source Transcript + Translation
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700">
                        Parallel Mode
                      </span>
                      <span className="text-xs text-gray-400">
                        Opens a second WebSocket to `{sourceTranscriptDeployment.trim() || 'source deployment'}`
                      </span>
                    </div>
                  </div>
                  {pairedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`grid grid-cols-1 xl:grid-cols-2 gap-4 rounded-xl border p-4 ${
                        entry.sourceFinal && entry.translationFinal
                          ? 'border-gray-200 bg-gray-50'
                          : 'border-indigo-200 bg-white'
                      }`}
                    >
                      <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
                          Source Transcript
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {entry.source || <span className="text-gray-400 italic">listening...</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-3">{entry.timestamp.toLocaleTimeString()}</p>
                      </div>

                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                        <p className="text-xs text-indigo-500 mb-2 font-medium uppercase tracking-wide">
                          Translation ({TARGET_LANGUAGES.find((l) => l.value === targetLanguage)?.label || targetLanguage})
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {entry.translated || <span className="text-gray-400 italic">translating...</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-3">{entry.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 rounded-lg border ${
                        entry.isFinal ? 'border-gray-200 bg-gray-50' : 'border-indigo-200 bg-indigo-50'
                      }`}
                    >
                      <div>
                        <p className="text-xs text-indigo-500 mb-1 font-medium uppercase tracking-wide">
                          Translation ({TARGET_LANGUAGES.find((l) => l.value === targetLanguage)?.label || targetLanguage})
                        </p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {entry.translated || <span className="text-gray-400 italic">translating...</span>}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-3">{entry.timestamp.toLocaleTimeString()}</p>
                    </div>
                  ))}
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={entries.length === 0 && pairedEntries.length === 0}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            Clear
          </button>
          <div className="flex-1" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {/* Right Config Panel */}
      <div className="w-full md:w-80 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-6 flex flex-col overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h2>
        <div className="space-y-4 flex-1">
          {/* Deployment Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deployment Name</label>
            <input
              type="text"
              value={deployment}
              onChange={(e) => setDeployment(e.target.value)}
              disabled={status === 'connected'}
              placeholder="gpt-realtime-translate"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Endpoint & API Key from left sidebar</p>
          </div>

          {/* Target Language */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={status === 'connected'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
            >
              {TARGET_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Language to translate into (audio + text)</p>
          </div>

          {/* Advanced source transcript */}
          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowSourceTranscriptConfig((prev) => !prev)}
              className="w-full flex items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-700">Advanced Source Transcript</p>
                <p className="text-xs text-gray-500 mt-1">
                  Optional source-language captions using a separate realtime transcription WebSocket
                </p>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showSourceTranscriptConfig ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSourceTranscriptConfig && (
              <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={enableSourceTranscript}
                    onChange={(e) => setEnableSourceTranscript(e.target.checked)}
                    disabled={status === 'connected'}
                    className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-700">Enable source transcript</span>
                    <span className="block text-xs text-gray-500 mt-1">
                      Adds source-language captions next to translation output and opens a second WebSocket.
                    </span>
                  </span>
                </label>

                {enableSourceTranscript && (
                  <>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-medium text-emerald-800">Parallel Mode</p>
                      <p className="text-xs text-emerald-700 mt-1">
                        Recommended mode. Translation stays on the main translate WebSocket, while source transcript uses a second WebSocket connected to a dedicated transcription deployment.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transcription Deployment</label>
                      <input
                        type="text"
                        value={sourceTranscriptDeployment}
                        onChange={(e) => setSourceTranscriptDeployment(e.target.value)}
                        disabled={status === 'connected'}
                        placeholder="gpt-realtime-whisper"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This deployment is used by the second WebSocket for source-language captions.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Source Language</label>
                      <select
                        value={sourceTranscriptLanguage}
                        onChange={(e) => setSourceTranscriptLanguage(e.target.value)}
                        disabled={status === 'connected'}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100"
                      >
                        {SOURCE_LANGUAGES.map((language) => (
                          <option key={`${language.value || 'auto'}-source`} value={language.value}>
                            {language.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Leave on Auto-detect unless the input language is fixed.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transcription Prompt</label>
                      <textarea
                        value={sourceTranscriptPrompt}
                        onChange={(e) => setSourceTranscriptPrompt(e.target.value)}
                        disabled={status === 'connected'}
                        rows={3}
                        placeholder="Optional context or expected terms to improve source transcription"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100 resize-none"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Connect/Disconnect */}
          <div className="pt-2">
            {status !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={
                  !apiKey.trim()
                  || !endpoint.trim()
                  || status === 'connecting'
                  || (enableSourceTranscript && !sourceTranscriptDeployment.trim())
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {status === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                Disconnect
              </button>
            )}
          </div>

          {/* Mic Toggle */}
          {status === 'connected' && (
            <div className="pt-2">
              <button
                onClick={toggleRecording}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md transition-colors ${
                  isRecording ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {isRecording ? 'Mute Microphone' : 'Unmute Microphone'}
              </button>
            </div>
          )}

          {/* Audio File Upload */}
          {status === 'connected' && (
            <div className="border-t border-gray-200 pt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleStreamAudioFile(file);
                  e.target.value = '';
                }}
              />
              {isStreamingFile ? (
                <div className="space-y-2">
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-xs text-indigo-700 truncate">{audioFileStatus}</span>
                    </div>
                  </div>
                  <button
                    onClick={cancelAudioFileStream}
                    className="w-full px-3 py-2 text-xs font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
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
              {!isStreamingFile && (
                <button
                  onClick={handleTrySampleAudio}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors mt-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Try Sample (Chinese 20s)
                </button>
              )}
              {audioFileStatus && !isStreamingFile && (
                <p className="text-xs text-gray-500 text-center mt-1">{audioFileStatus}</p>
              )}
            </div>
          )}

          {/* About */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">About</h3>
            <p className="text-xs text-gray-600">
              Full-duplex real-time speech translation using GPT Realtime Translate.
              Speak in any language and get translated audio and text output simultaneously.
              Similar to simultaneous interpretation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
