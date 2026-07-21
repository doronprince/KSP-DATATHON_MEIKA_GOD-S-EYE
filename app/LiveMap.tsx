"use client";

import React, { useEffect, useState } from 'react';

interface CasePin {
  CaseMasterID: number;
  CrimeNo: string;
  CaseNo: string;
  latitude: number;
  longitude: number;
  BriefFacts: string;
}

interface TowerPin {
  id: number;
  phone_number: string;
  target_name: string;
  frequent_towers: { lat: number; lng: number; hits: number }[];
}

export default function LiveMapComponent() {
  const [cases, setCases] = useState<CasePin[]>([]);
  const [towers, setTowers] = useState<TowerPin[]>([]);
  const [viewMode, setViewMode] = useState<'incidents' | 'surveillance'>('incidents');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSpatialData() {
      setIsLoading(true);
      const authStorage = sessionStorage.getItem("godseye_auth");
      const token = authStorage ? JSON.parse(authStorage).token : null;
      const headers = { "Authorization": `Bearer ${token}` };

      try {
        const caseRes = await fetch("http://localhost:8000/api/geospatial/cases", { headers });
        if (caseRes.ok) setCases(await caseRes.json() || []);

        const towerRes = await fetch("http://localhost:8000/api/geospatial/telecom-towers", { headers });
        if (towerRes.ok) setTowers(await towerRes.json() || []);
      } catch (err) {
        console.error("Geospatial visualization pipeline failed:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSpatialData();
  }, []);

  return (
    <div className="flex flex-col h-full bg-black text-zinc-300 font-mono p-6">
      <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-emerald-400 font-bold text-lg">// GEOSPATIAL VECTOR CORRELATION</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Plotting tactical coordination metrics from localized structural tables</p>
        </div>
        <div className="flex bg-neutral-900 p-1 rounded border border-zinc-800 text-xs">
          <button
            onClick={() => setViewMode('incidents')}
            className={`px-3 py-1.5 rounded ${viewMode === 'incidents' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'text-zinc-400'}`}
          >
            FIR Incident Pins ({cases.length})
          </button>
          {towers.length > 0 && (
            <button
              onClick={() => setViewMode('surveillance')}
              className={`px-3 py-1.5 rounded ${viewMode === 'surveillance' ? 'bg-purple-950 text-purple-400 border border-purple-900/40' : 'text-zinc-400'}`}
            >
              Surveillance Towers ({towers.length})
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[450px] bg-neutral-950 border border-zinc-900 rounded relative overflow-hidden flex flex-col items-center justify-center">
        {isLoading ? (
          <div className="text-xs text-emerald-500 animate-pulse">// BUFFERING LIVE MAP MATRIX LAYERS...</div>
        ) : (
          <div className="w-full h-full p-4 overflow-y-auto space-y-3">
            <div className="text-[11px] text-zinc-500 uppercase tracking-widest border-b border-zinc-900 pb-2">
              Showing active plot coordinates (Simulated Engine Console Feed)
            </div>
            {viewMode === 'incidents' ? (
              cases.map((c) => (
                <div key={c.CaseMasterID} className="p-3 bg-neutral-900/60 border border-emerald-950 rounded hover:border-emerald-800 transition-colors">
                  <div className="flex justify-between text-xs font-bold text-emerald-400">
                    <span>FIR No: {c.CrimeNo || "N/A"}</span>
                    <span className="text-zinc-500">[{c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}]</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 font-sans">{c.BriefFacts || "No incident brief registered in structural logs."}</p>
                </div>
              ))
            ) : (
              towers.map((t) => (
                <div key={t.id} className="p-3 bg-neutral-900/60 border border-purple-950 rounded hover:border-purple-800 transition-colors">
                  <div className="flex justify-between text-xs font-bold text-purple-400">
                    <span>Target: {t.target_name} ({t.phone_number})</span>
                    <span className="text-zinc-500 font-normal">Active Tower Cells</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                    Pings: {Array.isArray(t.frequent_towers)
                      ? t.frequent_towers.map((tower, i) => `[${tower.lat}, ${tower.lng}] (${tower.hits} hits)`).join(' | ')
                      : String(t.frequent_towers)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}