"use client";

import React, { useEffect, useState } from 'react';

interface AuditLog {
  id: number;
  kgid: string;
  action: string;
  query_executed: string;
  timestamp: string;
}

export default function OperationalAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      const authStorage = sessionStorage.getItem("godseye_auth");
      const token = authStorage ? JSON.parse(authStorage).token : null;

      try {
        const res = await fetch("http://localhost:8000/api/admin/audit-logs", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.detail || "Verification exception.");
        }
        setLogs(await res.json());
      } catch (err: any) {
        setError(err.message || "Failed to parse system operations logs.");
      }
    }
    loadLogs();
  }, []);

  if (error) {
    return (
      <div className="p-6 text-red-400 font-mono text-xs bg-black h-full flex items-center justify-center">
        [!] SECURITY ALERT: {error}
      </div>
    );
  }

  return (
    <div className="p-6 bg-black text-zinc-300 font-mono flex flex-col h-full">
      <div className="mb-6 border-b border-zinc-800 pb-4">
        <h2 className="text-red-400 font-bold text-lg">// CORE OPERATIONS SECURITY AUDIT TRAIL</h2>
        <p className="text-[11px] text-zinc-500 mt-0.5">Monitoring all systemic SQLite runtime executions and data queries</p>
      </div>

      <div className="flex-1 overflow-x-auto border border-zinc-900 rounded bg-neutral-950">
        <table className="w-full text-left text-xs text-zinc-400">
          <thead className="bg-neutral-900 text-zinc-500 uppercase font-bold text-[10px] tracking-wider border-b border-zinc-900">
            <tr>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Operator (KGID)</th>
              <th className="p-3">Action Type</th>
              <th className="p-3">System SQL Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-900/40 transition-colors">
                <td className="p-3 whitespace-nowrap text-zinc-500 text-[11px]">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="p-3 whitespace-nowrap font-bold text-zinc-300">{log.kgid}</td>
                <td className="p-3 CustomsCell font-medium">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    log.action.includes("BLOCKED") ? "bg-red-950 text-red-400 border border-red-900/50" : "bg-zinc-900 text-zinc-400"
                  }`}>
                    {log.action}
                  </span>
                </td>
                <td className="p-3 max-w-md truncate font-sans text-zinc-400 text-[11px]" title={log.query_executed}>
                  {log.query_executed || "-- None --"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}