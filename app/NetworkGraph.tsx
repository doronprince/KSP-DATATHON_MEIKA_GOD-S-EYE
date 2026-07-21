"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

type NodeType = 'case' | 'accused' | 'victim' | 'phone' | 'contact';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const API_BASE = 'http://127.0.0.1:8000';

const TYPE_COLORS: Record<NodeType, string> = {
  case: '#22c55e',      // Green
  accused: '#ef4444',   // Red
  victim: '#3b82f6',    // Blue
  phone: '#eab308',     // Yellow
  contact: '#a855f7',   // Purple
};

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const fetchGraph = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Pull secure credential session mapping
      const authSession = sessionStorage.getItem('godseye_auth');
      if (!authSession) {
        throw new Error("Active credentials not found. Authenticate again.");
      }
      const token = JSON.parse(authSession).token;

      const res = await fetch(
        `${API_BASE}/api/network?query=${encodeURIComponent(query)}&depth=${depth}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (res.status === 401) {
        throw new Error("Session expired. Please log out and back in.");
      }
      if (!res.ok) throw new Error(`Server responded with code status ${res.status}`);

      const json: GraphData = await res.json();
      setData(json);
      if (json.nodes.length === 0) {
        setError('No correlating system records discovered.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compile relational map.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [query, depth]);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g');

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => g.attr('transform', event.transform))
    );

    const nodes = data.nodes.map((d) => ({ ...d }));
    const edges: (GraphEdge & d3.SimulationLinkDatum<GraphNode>)[] = data.edges.map((d) => ({ ...d }));

    const simulation = d3
      .forceSimulation(nodes as GraphNode[])
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((d) => (d as GraphNode).id)
          .distance(100)
          .strength(0.5)
      )
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(32));

    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#374151')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.8);

    const linkLabel = g
      .append('g')
      .selectAll('text')
      .data(edges)
      .join('text')
      .text((d) => d.relation)
      .attr('font-size', 9)
      .attr('fill', '#4b5563')
      .attr('text-anchor', 'middle');

    const node = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes as GraphNode[])
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      )
      .on('click', (_event, d) => setSelected(d));

    node
      .append('circle')
      .attr('r', (d) => (d.type === 'case' ? 15 : 11))
      .attr('fill', (d) => TYPE_COLORS[d.type] ?? '#9ca3af')
      .attr('stroke', '#000')
      .attr('stroke-width', 2);

    node
      .append('text')
      .text((d) => d.label)
      .attr('x', 18)
      .attr('y', 4)
      .attr('font-size', 11)
      .attr('fill', '#e5e7eb');

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      linkLabel
        .attr('x', (d) => (((d.source as GraphNode).x ?? 0) + ((d.target as GraphNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as GraphNode).y ?? 0) + ((d.target as GraphNode).y ?? 0)) / 2)
        .attr('dy', -4);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-black text-green-400 font-mono p-4 gap-4">
      <div className="flex flex-wrap gap-2 items-center border-b border-green-800 pb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchGraph()}
          placeholder="Search accused / victim / crime no. / phone"
          className="flex-1 min-w-[240px] bg-gray-900 border border-green-700 p-2 text-green-400 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <label className="text-xs text-gray-400">
          Depth
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="ml-2 bg-gray-900 border border-green-700 text-green-400 p-1"
          >
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
          </select>
        </label>
        <button
          onClick={fetchGraph}
          disabled={loading}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-black px-4 py-2 font-bold"
        >
          {loading ? 'MAPPING...' : 'MAP NETWORK'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm animate-pulse border border-red-900/50 p-2 bg-red-950/20">{error}</p>}

      <div className="flex gap-4 flex-1 min-h-0">
        <div ref={containerRef} className="flex-1 border border-green-900 bg-gray-950 relative overflow-hidden">
          <svg ref={svgRef} width="100%" height="600" />
        </div>

        <div className="w-64 shrink-0 border border-green-900 bg-gray-950 p-3 text-xs space-y-3 flex flex-col justify-between">
          <div>
            <p className="text-gray-300 font-bold mb-2 tracking-wider">TOPOLOGY NODES</p>
            {(Object.keys(TYPE_COLORS) as NodeType[]).map((t) => (
              <div key={t} className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-black"
                  style={{ backgroundColor: TYPE_COLORS[t] }}
                />
                <span className="text-gray-400 uppercase tracking-tight">{t}</span>
              </div>
            ))}
          </div>

          {selected && (
            <div className="border-t border-green-900 pt-3 flex-1 overflow-y-auto mt-2">
              <p className="text-gray-300 font-bold mb-1 tracking-wider">NODE METADATA</p>
              <p className="text-green-300 font-bold break-all">{selected.label}</p>
              <p className="text-gray-500 uppercase font-semibold text-[10px] mb-2">{selected.type}</p>
              {selected.meta && Object.keys(selected.meta).length > 0 && (
                <div className="bg-black p-2 border border-gray-800 text-gray-400 rounded max-h-48 overflow-y-auto">
                  {Object.entries(selected.meta).map(([key, value]) => (
                    <div key={key} className="mb-1">
                      <span className="text-purple-400 capitalize">{key.replace('_', ' ')}:</span>
                      <p className="text-gray-300 whitespace-pre-wrap break-words">{String(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {data && (
            <div className="border-t border-green-900 pt-3 text-gray-500 text-[11px]">
              <p>Active structural footprint:</p>
              <p className="text-gray-400">{data.nodes.length} entities resolved</p>
              <p className="text-gray-400">{data.edges.length} linear relationships</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}