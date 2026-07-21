"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

export interface LiveAlert {
  id: number;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
}

interface AlertContextType {
  alerts: LiveAlert[];
  activeToast: LiveAlert | null;
  dismissToast: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [activeToast, setActiveToast] = useState<LiveAlert | null>(null);

  useEffect(() => {
    let isMounted = true;
    const authSession = sessionStorage.getItem('godseye_auth');
    if (!authSession) return;

    const token = JSON.parse(authSession).token;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const wsUrl = `${wsProtocol}//${hostname}:8000/ws/alerts?token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const incomingAlert: LiveAlert = JSON.parse(event.data);
        setAlerts((prev) => [incomingAlert, ...prev].slice(0, 100));
        setActiveToast(incomingAlert);

        if (incomingAlert.severity !== 'critical') {
          setTimeout(() => {
            setActiveToast((current) => current?.id === incomingAlert.id ? null : current);
          }, 6000);
        }
      } catch (err) {
        console.error("Malformed core alert payload:", err);
      }
    };

    socket.onerror = (err) => {
      if (isMounted) console.error("Alert infrastructure downlink fault:", err);
    };

    return () => {
      isMounted = false;
      socket.close();
    };
  }, []);

  return (
    <AlertContext.Provider value={{ alerts, activeToast, dismissToast: () => setActiveToast(null) }}>
      {children}
      {activeToast && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded border shadow-2xl animate-bounce backdrop-blur-md ${
          activeToast.severity === 'critical' ? 'bg-red-950/90 border-red-500 text-red-200' 
            : activeToast.severity === 'warning' ? 'bg-amber-950/90 border-amber-500 text-amber-200'
            : 'bg-slate-900/90 border-blue-500 text-blue-200'
        }`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <span className="text-xs font-mono uppercase tracking-widest opacity-60 block mb-1">
                // CRITICAL INTERCEPT ALERT
              </span>
              <h4 className="font-bold font-mono text-sm">{activeToast.title}</h4>
              <p className="text-xs mt-1 font-sans opacity-90">{activeToast.message}</p>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="ml-4 font-mono text-xs opacity-50 hover:opacity-100 transition-opacity p-1"
            >
              [X]
            </button>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be executed inside an AlertProvider context container.");
  return context;
};