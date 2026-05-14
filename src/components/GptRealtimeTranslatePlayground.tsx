import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TranslateRealtimeClient, type ConnectionStatus } from '../lib/gptRealtime/translateClient';
import { GptRealtimeAudioHandler } from '../lib/gptRealtime/audioHandler';
import { streamAudioFileRealtime } from '../lib/gptRealtime/streamAudioFile';

interface TranslationEntry {
  id: string;
  source: string;
  translated: string;
  timestamp: Date;
  isFinal: boolean;
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
  const [enableSourceTranscript, setEnableSourceTranscript] = useState(
    () => localStorage.getItem('gpt-translate-source-transcript') !== 'false',
  );

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TranslationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStreamingFile, setIsStreamingFile] = useState(false);
  const [audioFileStatus, setAudioFileStatus] = useState('');

  const clientRef = useRef<TranslateRealtimeClient | null>(null);
  const audioHandlerRef = useRef<GptRealtimeAudioHandler | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileAbortRef = useRef<AbortController | null>(null);

  // Current in-progress entry
  const currentEntryRef = useRef<{ id: string; source: string; translated: string } | null>(null);

  // Persist config
  useEffect(() => {
    localStorage.setItem('gpt-translate-deployment', deployment);
  }, [deployment]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-target-lang', targetLanguage);
  }, [targetLanguage]);
  useEffect(() => {
    localStorage.setItem('gpt-translate-source-transcript', enableSourceTranscript.toString());
  }, [enableSourceTranscript]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  // Cleanup
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      audioHandlerRef.current?.destroy();
    };
  }, []);

  const addOrUpdateEntry = useCallback((id: string, source: string, translated: string, isFinal: boolean) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.id === id);
      if (existing) {
        return prev.map((e) => (e.id === id ? { ...e, source, translated, isFinal } : e));
      }
      return [...prev, { id, source, translated, timestamp: new Date(), isFinal }];
    });
  }, []);

  async function handleConnect() {
    if (!apiKey.trim() || !endpoint.trim()) {
      setError('Please configure Endpoint & API Key in the left sidebar');
      return;
    }

    clientRef.current?.disconnect();
    audioHandlerRef.current?.destroy();
    currentEntryRef.current = null;

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
      enableSourceTranscript,
      onOutputAudioData: (audioData) => {
        audioHandler.playAudio(audioData);
      },
      onOutputTranscriptDelta: (delta) => {
        const entry = currentEntryRef.current;
        if (entry) {
          entry.translated += delta;
          addOrUpdateEntry(entry.id, entry.source, entry.translated, false);
        } else {
          const newId = crypto.randomUUID();
          currentEntryRef.current = { id: newId, source: '', translated: delta };
          addOrUpdateEntry(newId, '', delta, false);
        }
      },
      onInputTranscriptDelta: (delta) => {
        const entry = currentEntryRef.current;
        if (entry) {
          entry.source += delta;
          addOrUpdateEntry(entry.id, entry.source, entry.translated, false);
        } else {
          const newId = crypto.randomUUID();
          currentEntryRef.current = { id: newId, source: delta, translated: '' };
          addOrUpdateEntry(newId, delta, '', false);
        }
      },
      onSpeechStarted: () => {
        // Finalize previous entry
        if (currentEntryRef.current) {
          addOrUpdateEntry(
            currentEntryRef.current.id,
            currentEntryRef.current.source,
            currentEntryRef.current.translated,
            true,
          );
        }
        const newId = crypto.randomUUID();
        currentEntryRef.current = { id: newId, source: '', translated: '' };
      },
      onTurnComplete: () => {
        if (currentEntryRef.current) {
          addOrUpdateEntry(
            currentEntryRef.current.id,
            currentEntryRef.current.source,
            currentEntryRef.current.translated,
            true,
          );
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

    try {
      setError(null);
      await client.connect();
      await audioHandler.startRecording((audioData) => {
        client.sendAudio(audioData);
      });
      setIsRecording(true);
    } catch (err) {
      setError(`Connection failed: ${err}`);
    }
  }

  function handleDisconnect() {
    audioFileAbortRef.current?.abort();
    audioHandlerRef.current?.stopRecording();
    audioHandlerRef.current?.clearPlayback();
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
        clientRef.current?.sendAudio(audioData);
      });
      setIsRecording(true);
    }
  }

  function handleClear() {
    setEntries([]);
    currentEntryRef.current = null;
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
          clientRef.current?.sendAudio(pcm16);
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
          clientRef.current?.sendAudio(audioData);
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

        {/* Translation entries - two-column layout */}
        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">Connect and speak — source and translation appear side by side</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl mx-auto">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`grid grid-cols-2 gap-3 p-3 rounded-lg border ${
                    entry.isFinal ? 'border-gray-200 bg-gray-50' : 'border-indigo-200 bg-indigo-50'
                  }`}
                >
                  {/* Source */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1 font-medium">Source</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {entry.source || <span className="text-gray-400 italic">listening...</span>}
                    </p>
                  </div>
                  {/* Translation */}
                  <div>
                    <p className="text-xs text-indigo-500 mb-1 font-medium">
                      Translation ({TARGET_LANGUAGES.find((l) => l.value === targetLanguage)?.label || targetLanguage})
                    </p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {entry.translated || <span className="text-gray-400 italic">translating...</span>}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 col-span-2">{entry.timestamp.toLocaleTimeString()}</p>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={entries.length === 0}
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

          {/* Source Transcript */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={enableSourceTranscript}
                onChange={(e) => setEnableSourceTranscript(e.target.checked)}
                disabled={status === 'connected'}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Show Source Transcript</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Also transcribe the original speech for side-by-side view
            </p>
          </div>

          {/* Connect/Disconnect */}
          <div className="pt-2">
            {status !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={!apiKey.trim() || !endpoint.trim() || status === 'connecting'}
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
