"use client";

import React from 'react';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
}

export default function GodsEyeSidebar({ currentTab, setTab }: SidebarProps) {
  // FIX: the rest of the app (page.tsx) stores the session as a JSON object
  // under the 'godseye_auth' key -- { token, badgeId, name, role } -- not
  // as a raw JWT under 'access_token'. This previously always fell through
  // to the default { name: 'Officer', role: 'standard' }, silently hiding
  // every role-gated nav item regardless of the real logged-in role.
  const getUserProfile = () => {
    if (typeof window === 'undefined') return { name: 'Officer', role: 'standard' };
    try {
      const authSession = sessionStorage.getItem('godseye_auth');
      if (!authSession) return { name: 'Officer', role: 'standard' };
      const parsed = JSON.parse(authSession);
      return { name: parsed.name, role: parsed.role };
    } catch {
      return { name: 'Officer', role: 'standard' };
    }
  };

  const profile = getUserProfile();
  const role = (profile.role || 'standard').toLowerCase();

  const hasSurveillanceAccess = ['supervisor', 'analyst', 'investigator'].includes(role);
  const hasAuditAccess = ['supervisor', 'analyst'].includes(role);

  return (
    <aside className="w-64 bg-black border-r border-emerald-900/40 flex flex-col h-screen select-none font-mono">
      <div className="p-6 border-b border-emerald-900/30 bg-neutral-950">
        <div className="text-emerald-400 font-black tracking-wider text-md">GOD'S EYE PLATFORM</div>
        <div className="text-[10px] text-zinc-500 uppercase mt-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Operator: {profile.name || "Unknown"} ({role})
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto bg-black">
        <button
          onClick={() => setTab("chat")}
          className={`w-full text-left px-3 py-2 text-xs rounded transition-all ${
            currentTab === "chat" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/50" : "text-zinc-400 hover:text-emerald-300"
          }`}
        >
          &gt; Intel Chat Engine
        </button>

        <button
          onClick={() => setTab("network")}
          className={`w-full text-left px-3 py-2 text-xs rounded transition-all ${
            currentTab === "network" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/50" : "text-zinc-400 hover:text-emerald-300"
          }`}
        >
          &gt; Link Topology Graph
        </button>

        {hasSurveillanceAccess && (
          <button
            onClick={() => setTab("geospatial")}
            className={`w-full text-left px-3 py-2 text-xs rounded transition-all ${
              currentTab === "geospatial" ? "bg-purple-950/30 text-purple-400 border border-purple-900/50" : "text-zinc-400 hover:text-purple-300"
            }`}
          >
            &gt; Live Tracking Map
          </button>
        )}

        {hasAuditAccess && (
          <button
            onClick={() => setTab("audit")}
            className={`w-full text-left px-3 py-2 text-xs rounded transition-all ${
              currentTab === "audit" ? "bg-red-950/30 text-red-400 border border-red-900/50" : "text-zinc-400 hover:text-red-300"
            }`}
          >
            &gt; Operations Audit Trail
          </button>
        )}
      </nav>
    </aside>
  );
}