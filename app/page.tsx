"use client";

import React, { useState } from 'react';
import NetworkGraph from './NetworkGraph';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  xaiTrace?: {
    tool_used: string;
    query_executed: string;
    debug_raw_data?: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

const SESSION_ID =
  typeof window !== 'undefined'
    ? (window.sessionStorage.getItem('godseye_session_id') ??
      (() => {
        const id = crypto.randomUUID();
        window.sessionStorage.setItem('godseye_session_id', id);
        return id;
      })())
    : 'server';

type Tab = 'chat' | 'network';

export default function GodsEyeUI() {
  const [tab, setTab] = useState<Tab>('chat');

  const [messages, setMessages] = useState<Message[]>([{
    id: '1', role: 'assistant', content: "Gods Eye initialized. Ready for query via Grok."
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const speakResponse = (text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiPayload = {
        session_id: SESSION_ID,
        messages: [...messages, userMsg]
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-12)
          .map(m => ({ role: m.role, content: m.content })),
      };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Server responded with status ${res.status}: ${errText}`);
      }

      const data = await res.json();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.final_answer ?? 'No answer returned.',
        xaiTrace: {
          tool_used: data.tool_used,
          query_executed: data.query_executed,
          debug_raw_data: data.debug_raw_data,
        },
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakResponse(assistantMsg.content);

    } catch (error) {
      console.error("Fetch Error:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'System Error: Unable to reach Grok core or database. Check connection.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-green-400 font-mono p-4">
      <header className="border-b border-green-800 pb-4 mb-4 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold tracking-widest">KSP GOD&apos;S EYE // GROK NODE</h1>
          <nav className="flex gap-1">
            <button
              onClick={() => setTab('chat')}
              className={`px-3 py-1 border text-xs tracking-wide transition-colors ${
                tab === 'chat'
                  ? 'border-green-500 bg-green-900 text-white'
                  : 'border-gray-700 text-gray-500 hover:bg-gray-800'
              }`}
            >
              CHAT
            </button>
            <button
              onClick={() => setTab('network')}
              className={`px-3 py-1 border text-xs tracking-wide transition-colors ${
                tab === 'network'
                  ? 'border-green-500 bg-green-900 text-white'
                  : 'border-gray-700 text-gray-500 hover:bg-gray-800'
              }`}
            >
              NETWORK
            </button>
          </nav>
        </div>

        {tab === 'chat' && (
          <button
            onClick={() => { console.log('AUDIO CLICKED'); setVoiceEnabled(!voiceEnabled); }}
            className={`px-3 py-1 border transition-colors ${voiceEnabled ? 'border-green-500 bg-green-900 text-white' : 'border-gray-500 text-gray-500 hover:bg-gray-800'}`}
          >
            {voiceEnabled ? 'AUDIO SYS: ONLINE' : 'AUDIO SYS: MUTED'}
          </button>
        )}
      </header>

      {tab === 'network' ? (
        <div className="flex-1 min-h-0">
          <NetworkGraph />
        </div>
      ) : (
        <>
          <main className="flex-1 overflow-y-auto space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-2xl p-3 border ${msg.role === 'user' ? 'border-blue-700 bg-blue-900/30 text-blue-200' : 'border-green-700 bg-green-900/20 text-green-300'}`}>
                  <p>{msg.content}</p>
                </div>

                {msg.xaiTrace && (
                  <div className="max-w-2xl mt-2 p-3 bg-black border border-gray-700 text-xs text-gray-400 w-full">
                    <p className="font-bold text-gray-300 mb-1">XAI DATA TRACE:</p>
                    <p><span className="text-purple-400">SQL Executed:</span> {msg.xaiTrace.query_executed}</p>
                    <p className="mt-1"><span className="text-purple-400">Database Return:</span> {msg.xaiTrace.debug_raw_data}</p>
                  </div>
                )}
              </div>
            ))}
            {loading && <p className="animate-pulse text-yellow-500">Grok is querying intelligence tables...</p>}
          </main>

          <footer className="mt-4 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Enter command (e.g., 'Find CCTV metadata for the white Swift')"
              className="flex-1 bg-gray-900 border border-green-700 p-3 text-green-400 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button onClick={handleSend} disabled={loading} className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-black px-6 font-bold transition-colors">
              EXECUTE
            </button>
          </footer>
        </>
      )}
    </div>
  );
}