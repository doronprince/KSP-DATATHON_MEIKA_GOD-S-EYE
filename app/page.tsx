"use client";

import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import NetworkGraph from './NetworkGraph';
import AnalyticsDashboard from './AnalyticsDashboard';
import LiveMapComponent from './LiveMap';
import OperationalAuditLogs from './AuditLogs';
import GodsEyeSidebar from './Sidebar';
import { AlertProvider } from './AlertContext';
import { useKannadaVoice } from './useKannadaVoice';

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

interface UserSession {
  token: string;
  badgeId: string;
  name: string;
  role: string;
}

const API_BASE = 'http://127.0.0.1:8000';
const SESSION_ID = typeof window !== 'undefined' ? (window.sessionStorage.getItem('godseye_session_id') ?? crypto.randomUUID()) : 'server';
if (typeof window !== 'undefined') window.sessionStorage.setItem('godseye_session_id', SESSION_ID);

type Tab = 'chat' | 'network' | 'analytics' | 'geospatial' | 'audit';

export default function GodsEyeUI() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginBadge, setLoginBadge] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<Message[]>([{
    id: '1', role: 'assistant', content: "Gods Eye initialized. Secure connection established. Database schema mapped and ready for intelligence queries."
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Hook for Native Kannada Voice Input
  const { isRecording, toggleRecording, isSupported } = useKannadaVoice((text) => {
    setInput((prev) => prev + (prev ? ' ' : '') + text);
  });

  useEffect(() => {
    const savedSession = sessionStorage.getItem('godseye_auth');
    if (savedSession) setCurrentUser(JSON.parse(savedSession));
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kgid: loginBadge, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Registration failed');

      setSuccessMsg(data.message);
      setIsRegistering(false);
      setLoginPass('');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const formData = new URLSearchParams();
    formData.append('username', loginBadge);
    formData.append('password', loginPass);

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) throw new Error('Invalid K.G.I.D. or Password');
      const data = await res.json();

      const sessionData = {
        token: data.access_token,
        badgeId: loginBadge,
        name: data.name,
        role: data.role
      };

      setCurrentUser(sessionData);
      sessionStorage.setItem('godseye_auth', JSON.stringify(sessionData));
    } catch (err: any) {
      setAuthError('ACCESS DENIED: ' + err.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('godseye_auth');
    setLoginPass('');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(20, 100, 20);
    doc.text(`KSP GOD'S EYE - ${tab.toUpperCase()} BRIEFING`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`Authorized Personnel: ${currentUser?.name} [${currentUser?.role}]`, 14, 28);
    doc.text(`K.G.I.D.: ${currentUser?.badgeId}`, 14, 34);
    doc.text(`Timestamp: ${new Date().toLocaleString()}`, 14, 40);

    const tableData = messages.map(m => [
      m.role === 'user' ? (currentUser?.role?.toUpperCase() || 'USER') : 'SYSTEM',
      m.content || '',
      m.xaiTrace?.query_executed || 'N/A'
    ]);

    autoTable(doc, {
      startY: 48,
      head: [['Entity', 'Intelligence Request / Response', 'Audit Trail (SQL)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [20, 80, 20] },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold' }, 1: { cellWidth: 90 }, 2: { cellWidth: 60, textColor: [100, 100, 100] } }
    });

    doc.save(`KSP_${tab.toUpperCase()}_Report_${new Date().getTime()}.pdf`);
  };

  const speakResponse = (text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !currentUser) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiPayload = {
        session_id: SESSION_ID,
        messages: [...messages, userMsg].filter(m => m.role === 'user' || m.role === 'assistant').slice(-12)
          .map(m => ({ role: m.role, content: m.content })),
      };

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify(apiPayload),
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      if (!res.ok) throw new Error('Server Communication Error');
      const data = await res.json();

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.final_answer ?? 'No answer returned.',
        xaiTrace: { tool_used: data.tool_used, query_executed: data.query_executed, debug_raw_data: data.debug_raw_data },
      };

      setMessages(prev => [...prev, assistantMsg]);
      speakResponse(assistantMsg.content);

    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'SYSTEM ERROR: Secure Connection Lost.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-green-400 font-mono">
        <div className="border border-green-700 bg-gray-900 p-8 max-w-md w-full shadow-[0_0_15px_rgba(34,197,94,0.2)]">
          <h1 className="text-2xl font-bold mb-2 tracking-widest text-center">KSP GOD&apos;S EYE</h1>
          <p className="text-xs text-gray-500 mb-6 text-center uppercase">Secure Access Terminal</p>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            <input
              type="text"
              value={loginBadge}
              onChange={(e) => setLoginBadge(e.target.value.toUpperCase())}
              placeholder="ENTER K.G.I.D."
              className="w-full bg-black border border-green-800 p-3 text-green-300 focus:outline-none focus:border-green-500 transition-colors"
              required
            />
            <input
              type="password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              placeholder="PASSWORD"
              className="w-full bg-black border border-green-800 p-3 text-green-300 focus:outline-none focus:border-green-500 transition-colors"
              required
            />

            {authError && <p className="text-red-500 text-xs animate-pulse font-bold border border-red-900 p-2 bg-red-950/30">{authError}</p>}
            {successMsg && <p className="text-green-500 text-xs font-bold border border-green-900 p-2 bg-green-950/30">{successMsg}</p>}

            <button type="submit" className="w-full bg-green-700 hover:bg-green-600 text-black font-bold py-3 mt-2 transition-colors">
              {isRegistering ? 'VERIFY K.G.I.D. & REGISTER' : 'AUTHENTICATE'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); setSuccessMsg(''); }}
              className="text-xs text-gray-400 hover:text-green-400 underline decoration-gray-700 underline-offset-4 transition-colors"
            >
              {isRegistering ? 'Return to Login' : 'First Time Setup? Register Account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AlertProvider>
      <div className="flex h-screen bg-black text-green-400 font-mono overflow-hidden">

        {/* --- INTEGRATED SIDEBAR --- */}
        <GodsEyeSidebar currentTab={tab} setTab={(t: string) => setTab(t as Tab)} />

        <div className="flex flex-col flex-1 p-4 overflow-hidden">
          <header className="border-b border-green-800 pb-4 mb-4 flex justify-between items-center">
            <h1 className="text-xl font-bold tracking-widest">TERMINAL // {currentUser.role.toUpperCase()}</h1>

            {/* GLOBAL UTILITY BUTTONS */}
            <div className="flex gap-2">
              <button onClick={exportPDF} className="px-3 py-1 border border-blue-500 text-blue-400 hover:bg-blue-900 hover:text-white transition-colors text-xs flex items-center gap-2">💾 EXPORT PDF</button>
              <button onClick={() => setVoiceEnabled(!voiceEnabled)} className={`px-3 py-1 border transition-colors text-xs ${voiceEnabled ? 'border-green-500 bg-green-900 text-white' : 'border-gray-500 text-gray-500 hover:bg-gray-800'}`}>
                {voiceEnabled ? 'AUDIO: ON' : 'AUDIO: MUTED'}
              </button>
              <button onClick={handleLogout} className="px-3 py-1 border border-red-700 text-red-500 hover:bg-red-900 hover:text-white transition-colors text-xs">LOGOUT</button>
            </div>
          </header>

          {tab === 'network' ? (
            <div className="flex-1 min-h-0">
              <NetworkGraph/>
            </div>
          ) : tab === 'analytics' ? (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <AnalyticsDashboard />
            </div>
          ) : tab === 'geospatial' ? (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <LiveMapComponent />
            </div>
          ) : tab === 'audit' ? (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <OperationalAuditLogs />
            </div>
          ) : (
            <>
              <main className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-3xl p-4 border ${msg.role === 'user' ? 'border-blue-700 bg-blue-900/30 text-blue-200' : 'border-green-700 bg-green-900/20 text-green-300'}`}>
                      <p className="text-xs mb-2 font-bold opacity-75">{msg.role === 'user' ? `${currentUser.name} [${currentUser.role}]` : 'GODS EYE CORE'}</p>
                      <p className="leading-relaxed">{msg.content}</p>
                    </div>
                    {msg.xaiTrace && (
                      <div className="max-w-3xl mt-2 p-3 bg-black border border-gray-700 text-xs text-gray-400 w-full shadow-inner">
                        <p className="font-bold text-gray-300 mb-1">XAI DATA TRACE:</p>
                        <p><span className="text-purple-400">SQL Executed:</span> <code className="bg-gray-900 px-1">{msg.xaiTrace.query_executed}</code></p>
                      </div>
                    )}
                  </div>
                ))}
                {loading && <p className="animate-pulse text-yellow-500 mt-4">Synthesizing intelligence...</p>}
              </main>

              <footer className="mt-4 flex gap-2">
                {/* --- INTEGRATED NATIVE KANNADA VOICE INPUT --- */}
                {isSupported && (
                  <button
                    onClick={toggleRecording}
                    type="button"
                    className={`px-4 py-3 font-bold border transition-colors ${
                      isRecording 
                        ? 'bg-red-900 border-red-500 text-red-200 animate-pulse' 
                        : 'bg-gray-900 border-green-700 text-green-500 hover:bg-gray-800'
                    }`}
                  >
                    {isRecording ? '🎙️ LISTENING...' : '🎙️ KANNADA'}
                  </button>
                )}

                <input
                  type="text" value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Enter investigative query..." className="flex-1 bg-gray-900 border border-green-700 p-4 text-green-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button onClick={handleSend} disabled={loading} className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-black px-8 font-bold transition-colors">EXECUTE</button>
              </footer>
            </>
          )}
        </div>
      </div>
    </AlertProvider>
  );
}