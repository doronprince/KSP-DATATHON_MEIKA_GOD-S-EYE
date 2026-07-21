"use client";

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

interface AnalyticsPayload {
    category_data: { category: string; count: number }[];
    timeline_data: { month: string; count: number }[];
    demographic_data: { demographic: string; count: number }[];
}

export default function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsPayload | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            const authSession = sessionStorage.getItem('godseye_auth');
            if (!authSession) {
                setLoading(false);
                return;
            }

            const token = JSON.parse(authSession).token;
            try {
                const response = await fetch('http://localhost:8000/api/analytics', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    setData(await response.json());
                }
            } catch (error) {
                console.error("Failed to fetch analytics", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    if (loading || !data) return <div className="text-emerald-500/50 p-6 animate-pulse font-mono text-sm">Accessing Intelligence Core Analytics...</div>;

    const COLORS = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac'];

    return (
        <div className="p-6 bg-black min-h-screen text-emerald-400 font-mono">
            <h2 className="text-xl font-bold mb-6 text-emerald-500 tracking-widest uppercase border-b border-emerald-800 pb-4">
                SYSTEM ANALYTICS & THREAT FORECAST
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

                {/* Categorical Breakdown */}
                <div className="bg-neutral-900 p-6 border border-emerald-800 shadow-[0_0_15px_rgba(34,197,94,0.1)] xl:col-span-2">
                    <h3 className="text-xs tracking-widest font-semibold mb-4 text-zinc-400 uppercase">Incident Distribution by Typology</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.category_data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                <XAxis dataKey="category" stroke="#4ade80" fontSize={10} tick={{ fill: '#4ade80' }} />
                                <YAxis stroke="#4ade80" allowDecimals={false} fontSize={12} tick={{ fill: '#4ade80' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #166534', color: '#4ade80' }} />
                                <Bar dataKey="count" fill="#15803d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Socio-Demographics */}
                <div className="bg-neutral-900 p-6 border border-emerald-800 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                    <h3 className="text-xs tracking-widest font-semibold mb-4 text-zinc-400 uppercase">Socio-Demographic Impact</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={data.demographic_data} dataKey="count" nameKey="demographic" cx="50%" cy="50%" innerRadius={60} outerRadius={80}>
                                    {data.demographic_data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #166534', color: '#4ade80' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Temporal Trajectory */}
                <div className="bg-neutral-900 p-6 border border-emerald-800 shadow-[0_0_15px_rgba(34,197,94,0.1)] xl:col-span-3">
                    <h3 className="text-xs tracking-widest font-semibold mb-4 text-zinc-400 uppercase">Temporal Threat Trajectory</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.timeline_data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                                <XAxis dataKey="month" stroke="#4ade80" fontSize={12} tick={{ fill: '#4ade80' }} />
                                <YAxis stroke="#4ade80" allowDecimals={false} fontSize={12} tick={{ fill: '#4ade80' }} />
                                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #166534', color: '#4ade80' }} />
                                <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}