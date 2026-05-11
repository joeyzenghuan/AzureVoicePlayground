import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GptRealtimeClient, type ConnectionStatus, type RealtimeVoice } from '../lib/gptRealtime/realtimeClient';
import { GptRealtimeAudioHandler } from '../lib/gptRealtime/audioHandler';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const VOICE_OPTIONS: { value: RealtimeVoice; label: string }[] = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
];

const DEFAULT_SYSTEM_PROMPT = `You are a helpful voice assistant. Keep your responses concise and natural for voice interaction.`;

interface GptRealtimePlaygroundProps {
  endpoint: string;
  apiKey: string;
}

export function GptRealtimePlayground({ endpoint, apiKey }: GptRealtimePlaygroundProps) {
  // Persisted config
  const [deploymentOrModel, setDeploymentOrModel] = useState(
    () => localStorage.getItem('gpt-realtime-deployment') || 'gpt-4o-realtime-preview',
  );
  const isAzure = true; // Always use Azure OpenAI (endpoint & apiKey come from sidebar)
  const [voice, setVoice] = useState<RealtimeVoice>(
    () => (localStorage.getItem('gpt-realtime-voice') as RealtimeVoice) || 'alloy',
  );
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem('gpt-realtime-system-prompt') || DEFAULT_SYSTEM_PROMPT,
  );
  const [showResponseLatency, setShowResponseLatency] = useState(
    () => localStorage.getItem('gpt-realtime-show-latency') === 'true',
  );

  // Runtime state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const clientRef = useRef<GptRealtimeClient | null>(null);
  const audioHandlerRef = useRef<GptRealtimeAudioHandler | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const showResponseLatencyRef = useRef(showResponseLatency);

  // Transcript state tracking
  const transcriptRef = useRef<{
    inputTranscript: string;
    outputTranscript: string;
    inputMessageId: string | null;
    outputMessageId: string | null;
  }>({
    inputTranscript: '',
    outputTranscript: '',
    inputMessageId: null,
    outputMessageId: null,
  });

  // Persist config
  useEffect(() => {
    localStorage.setItem('gpt-realtime-deployment', deploymentOrModel);
  }, [deploymentOrModel]);
  useEffect(() => {
    localStorage.setItem('gpt-realtime-voice', voice);
  }, [voice]);
  useEffect(() => {
    localStorage.setItem('gpt-realtime-system-prompt', systemPrompt);
  }, [systemPrompt]);
  useEffect(() => {
    localStorage.setItem('gpt-realtime-show-latency', showResponseLatency.toString());
    showResponseLatencyRef.current = showResponseLatency;
  }, [showResponseLatency]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      audioHandlerRef.current?.destroy();
    };
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)));
  }, []);

  async function handleConnect() {
    if (!apiKey.trim()) {
      setError('Please configure API Key in the left sidebar');
      return;
    }
    if (!endpoint.trim()) {
      setError('Please configure Endpoint in the left sidebar');
      return;
    }

    // Cleanup existing
    clientRef.current?.disconnect();
    audioHandlerRef.current?.destroy();

    // Reset transcript state
    transcriptRef.current = {
      inputTranscript: '',
      outputTranscript: '',
      inputMessageId: null,
      outputMessageId: null,
    };

    // Create audio handler
    const audioHandler = new GptRealtimeAudioHandler();
    audioHandlerRef.current = audioHandler;
    if (circleRef.current) {
      audioHandler.setCircleElement(circleRef.current);
    }

    const client = new GptRealtimeClient({
      apiKey: apiKey.trim(),
      endpoint: endpoint.trim(),
      deploymentOrModel,
      isAzure,
      voice,
      systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
      onAudioData: (audioData) => {
        audioHandler.playAudio(audioData);
      },
      onOutputTranscript: (text, isDelta) => {
        const ts = transcriptRef.current;

        // Clear input tracking when output starts
        if (ts.inputTranscript) {
          ts.inputTranscript = '';
          ts.inputMessageId = null;
        }

        if (isDelta) {
          ts.outputTranscript += text;
        } else {
          // Full transcript replaces accumulated delta
          ts.outputTranscript = text;
        }

        if (ts.outputMessageId) {
          updateMessage(ts.outputMessageId, ts.outputTranscript);
        } else {
          const newId = crypto.randomUUID();
          ts.outputMessageId = newId;
          addMessage({
            id: newId,
            type: 'assistant',
            content: ts.outputTranscript,
            timestamp: new Date(),
          });
        }
      },
      onInputTranscript: (text) => {
        const ts = transcriptRef.current;
        ts.inputTranscript = text;

        if (ts.inputMessageId) {
          updateMessage(ts.inputMessageId, text);
        } else {
          const newId = crypto.randomUUID();
          ts.inputMessageId = newId;
          addMessage({
            id: newId,
            type: 'user',
            content: text,
            timestamp: new Date(),
          });
        }
      },
      onTurnComplete: () => {
        if (showResponseLatencyRef.current && latency !== null) {
          addMessage({
            id: crypto.randomUUID(),
            type: 'system',
            content: `Response latency: ${Math.round(latency)}ms`,
            timestamp: new Date(),
          });
        }
        transcriptRef.current = {
          inputTranscript: '',
          outputTranscript: '',
          inputMessageId: null,
          outputMessageId: null,
        };
      },
      onInterrupted: () => {
        audioHandler.clearPlayback();
        transcriptRef.current.outputTranscript = '';
        transcriptRef.current.outputMessageId = null;
        addMessage({
          id: crypto.randomUUID(),
          type: 'system',
          content: '[Interrupted]',
          timestamp: new Date(),
        });
      },
      onError: (err) => setError(err),
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'disconnected') {
          transcriptRef.current = {
            inputTranscript: '',
            outputTranscript: '',
            inputMessageId: null,
            outputMessageId: null,
          };
          setLatency(null);
        }
      },
      onLatencyMeasured: (ms) => {
        setLatency(ms);
        console.log(`[GPT Realtime] Response latency: ${ms.toFixed(0)}ms`);
      },
    });

    clientRef.current = client;

    try {
      setError(null);
      await client.connect();
      // Auto-start recording
      await startRecording();
    } catch (err) {
      setError(`Connection failed: ${err}`);
    }
  }

  async function handleDisconnect() {
    audioHandlerRef.current?.stopRecording();
    audioHandlerRef.current?.clearPlayback();
    clientRef.current?.disconnect();
    setIsRecording(false);
  }

  async function startRecording() {
    if (!audioHandlerRef.current || !clientRef.current) return;
    try {
      await audioHandlerRef.current.startRecording((audioData) => {
        clientRef.current?.sendAudio(audioData);
      });
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError(`Microphone access failed: ${err}`);
    }
  }

  function toggleRecording() {
    if (isRecording) {
      audioHandlerRef.current?.stopRecording();
      setIsRecording(false);
    } else {
      startRecording();
    }
  }

  function handleSendText() {
    if (!textInput.trim() || !clientRef.current || status !== 'connected') return;
    addMessage({
      id: crypto.randomUUID(),
      type: 'user',
      content: textInput,
      timestamp: new Date(),
    });
    clientRef.current.sendText(textInput);
    setTextInput('');
  }

  function handleClearMessages() {
    transcriptRef.current = {
      inputTranscript: '',
      outputTranscript: '',
      inputMessageId: null,
      outputMessageId: null,
    };
    setMessages([]);
  }

  function getMessageStyle(type: Message['type']) {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-900 ml-auto';
      case 'assistant':
        return 'bg-gray-100 text-gray-900 mr-auto';
      case 'system':
        return 'bg-yellow-100 text-yellow-800 mx-auto text-xs';
      default:
        return 'bg-gray-100 text-gray-900';
    }
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
      {/* Left side - Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">GPT Realtime</h1>
              <p className="text-green-100 mt-1">
                Real-time voice conversation with Azure OpenAI Realtime API
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  status === 'connected'
                    ? 'bg-green-500/20 text-green-100'
                    : 'bg-white/20 text-white/80'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400' : 'bg-white/60'}`}
                />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {latency !== null && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-white/20 text-white/80">
                  ⚡ {Math.round(latency)}ms
                </span>
              )}
              {isRecording && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-100">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Recording
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Audio visualization circle */}
        <div
          className="flex-shrink-0 flex flex-col items-center py-8 bg-white border-b border-gray-100"
          style={{ height: '280px' }}
        >
          <div
            ref={circleRef}
            className="rounded-full transition-all duration-150 ease-out flex items-center justify-center"
            style={{
              width: '120px',
              height: '120px',
              backgroundColor: '#e5e7eb',
            }}
          >
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          {status !== 'connected' && (
            <p className="text-sm text-gray-400 mt-2">Click Connect to begin conversation</p>
          )}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">Connect and speak to start chatting with GPT</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`max-w-[80%] px-4 py-2 rounded-lg ${getMessageStyle(msg.type)}`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-60 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Text Input */}
        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder="Type a message (or just speak)..."
              disabled={status !== 'connected'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendText}
              disabled={status !== 'connected' || !textInput.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
            <button
              onClick={handleClearMessages}
              disabled={messages.length === 0}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      {/* Right side - Configuration Panel */}
      <div className="w-full md:w-80 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-6 flex flex-col overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Configuration</h2>

        <div className="space-y-4 flex-1">
          {/* Deployment Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deployment Name</label>
            <input
              type="text"
              value={deploymentOrModel}
              onChange={(e) => setDeploymentOrModel(e.target.value)}
              disabled={status === 'connected'}
              placeholder="gpt-4o-realtime-preview"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">
              Endpoint &amp; API Key are configured in the left sidebar
            </p>
          </div>

          {/* Voice */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value as RealtimeVoice)}
              disabled={status === 'connected'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* Show Response Latency */}
          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={showResponseLatency}
                onChange={(e) => setShowResponseLatency(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-gray-700">Show Response Latency</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              Display response time metrics in the chat
            </p>
          </div>

          {/* System Prompt */}
          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={status === 'connected'}
              placeholder="Enter custom instructions..."
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 resize-none font-mono"
            />
          </div>

          {/* Connect/Disconnect Button */}
          <div className="pt-2">
            {status !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={!apiKey.trim() || !endpoint.trim() || status === 'connecting'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {status === 'connecting' ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Disconnect
              </button>
            )}
          </div>

          {/* Mic Toggle (when connected) */}
          {status === 'connected' && (
            <div className="pt-2">
              <button
                onClick={toggleRecording}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md transition-colors ${
                  isRecording
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                {isRecording ? 'Mute Microphone' : 'Unmute Microphone'}
              </button>
            </div>
          )}

          {/* Info */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">About</h3>
            <p className="text-xs text-gray-600">
              Real-time voice conversation using the OpenAI Realtime API.
              Supports both OpenAI and Azure OpenAI endpoints with server-side VAD,
              audio transcription, and multiple voice options.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
