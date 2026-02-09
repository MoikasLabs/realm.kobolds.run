'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  useAgents, 
  useMetrics, 
  useConnectionState, 
  useSelectedZone, 
  useHoveredZone,
  useViewport,
  STATIC_ZONES,
  useRealtimeStore
} from '@/lib/store/realtimeStore';
import type { AgentState } from '@/types/realtime';
import { useSocket } from '@/hooks/useSocket';
import { useAgentUpdates } from '@/hooks/useAgentUpdates';


// Performance constants
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
const INTERPOLATION_DURATION = 100;
const METRICS_THROTTLE_MS = 100;
const DIRTY_RECT_PADDING = 10;

export function WorldMap2D() {
  // Refs for canvas and animation
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const agentCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Individual selectors - only re-render when these specific values change
  const agents = useAgents();
  const viewport = useViewport();
  const metrics = useMetrics();
  const isConnected = useConnectionState();
  const selectedZone = useSelectedZone();
  const hoveredZone = useHoveredZone();
  
  // Get store actions (stable selectors - only change if store action reference changes)
  const setConnectionState = useRealtimeStore((state) => state.setConnectionState);
  const updatePing = useRealtimeStore((state) => state.updatePing);
  const updateMetricsAction = useRealtimeStore((state) => state.updateMetrics);
  const updateViewportAction = useRealtimeStore((state) => state.updateViewport);
  const selectZone = useRealtimeStore((state) => state.selectZone);
  const setHoveredZone = useRealtimeStore((state) => state.setHoveredZone);
  const applyDeltaUpdate = useRealtimeStore((state) => state.applyDeltaUpdate);

  // ======= NON-REACTIVE RENDER LOOP STATE (outside React) =======
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const lastMetricsPushRef = useRef<number>(performance.now());
  const renderTimeRef = useRef<number>(0);
  const visibleCountRef = useRef<number>(0);
  const interpolatedCountRef = useRef<number>(0);
  
  const interpolatedPositionsRef = useRef<Map<string, {
    current: { x: number; y: number };
    target: { x: number; y: number };
    startTime: number;
    duration: number;
  }>>(new Map());

  // Local refs for performance-critical data
  const agentsRef = useRef<Map<string, AgentState>>(agents);
  const viewportRef = useRef(viewport);

  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // Coordinate conversion (memoized, uses ref for current viewport)
  const worldToScreen = useCallback((x: number, y: number): [number, number] => {
    const v = viewportRef.current;
    const screenX = v.width / 2 + (x * v.scale) + v.offsetX;
    const screenY = v.height / 2 - (y * v.scale) + v.offsetY;
    return [screenX, screenY];
  }, []);

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    const v = viewportRef.current;
    const worldX = (sx - v.width / 2 - v.offsetX) / v.scale;
    const worldY = -(sy - v.height / 2 - v.offsetY) / v.scale;
    return [worldX, worldY];
  }, []);

  const isAgentVisible = useCallback((agent: AgentState): boolean => {
    const v = viewportRef.current;
    const [x, y] = worldToScreen(agent.position.x, agent.position.y);
    const margin = (agent.radius + DIRTY_RECT_PADDING) * 2;
    return x >= -margin && x <= v.width + margin && y >= -margin && y <= v.height + margin;
  }, [worldToScreen]);

  const getAgentZone = useCallback((agent: AgentState): string | null => {
    let closestZone: string | null = null;
    let minDistance = Infinity;
    STATIC_ZONES.forEach(zone => {
      const dx = agent.position.x - zone.position[0];
      const dy = agent.position.y - zone.position[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        closestZone = zone.id;
      }
    });
    return closestZone;
  }, []);

  // Render agents (60fps)
  const renderAgentLayer = useCallback((timestamp: number) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let visibleCount = 0;
    let interpolatedCount = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    agentsRef.current.forEach((agent) => {
      if (!isAgentVisible(agent)) return;
      visibleCount++;

      let renderX: number;
      let renderY: number;
      const interp = interpolatedPositionsRef.current.get(agent.id);
      const now = timestamp;

      if (agent.targetPosition && interp) {
        const elapsed = now - interp.startTime;
        const progress = Math.min(1, elapsed / interp.duration);
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        renderX = interp.current.x + (agent.targetPosition.x - interp.current.x) * easeOutCubic;
        renderY = interp.current.y + (agent.targetPosition.y - interp.current.y) * easeOutCubic;
        if (progress < 1) { interpolatedCount++; }
        else { interpolatedPositionsRef.current.delete(agent.id); }
      } else {
        renderX = agent.position.x;
        renderY = agent.position.y;
      }

      const [screenX, screenY] = worldToScreen(renderX, renderY);

      // Draw glow
      ctx.fillStyle = agent.color + '30';
      ctx.beginPath();
      ctx.arc(screenX, screenY, agent.radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw agent
      ctx.fillStyle = agent.color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, agent.radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw status ring
      const statusColor = agent.status === 'active' ? '#22c55e' :
                         agent.status === 'working' ? '#eab308' :
                         agent.status === 'error' ? '#ef4444' : '#6b7280';
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY, agent.radius + 2, 0, Math.PI * 2);
      ctx.stroke();

      // Name label
      if (agent.id === 'shalom' || hoveredZone === getAgentZone(agent)) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(agent.name, screenX, screenY - agent.radius - 6);
      }
    });

    visibleCountRef.current = visibleCount;
    interpolatedCountRef.current = interpolatedCount;
  }, [isAgentVisible, worldToScreen, hoveredZone, getAgentZone]);

  // Socket.IO connection using reusable hook
  const { socket, isConnected: socketConnected } = useSocket({
    // No custom callbacks – we will handle events via useAgentUpdates hook
  });

  // Sync store connection state with socket hook
  useEffect(() => {
    setConnectionState(socketConnected);
  }, [socketConnected]);

  // Subscribe to Socket.IO events and update store
  useAgentUpdates({ socket, isConnected: socketConnected });

  // ======= RENDER LOOP - 60fps OUTSIDE REACT =======
  useEffect(() => {
    const gameLoop = (timestamp: number) => {
      frameCountRef.current++;
      
      if (timestamp - lastFpsUpdateRef.current >= 1000) {
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = timestamp;
      }

      const renderStart = performance.now();
      renderAgentLayer(timestamp);
      renderTimeRef.current = performance.now() - renderStart;

      // Throttle metrics to React (100ms)
      if (timestamp - lastMetricsPushRef.current >= METRICS_THROTTLE_MS) {
        // Direct store access - no hook dependency
        const store = useRealtimeStore.getState();
        store.updateMetrics({
          fps: frameCountRef.current / ((timestamp - lastFpsUpdateRef.current) / 1000),
          frameTime: FRAME_TIME,
          renderTime: renderTimeRef.current,
          visibleAgents: visibleCountRef.current,
          interpolatedAgents: interpolatedCountRef.current,
          wsLatency: store.wsLatency
        });
        lastMetricsPushRef.current = timestamp;
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    };

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderAgentLayer]); // Only depends on renderAgentLayer

  // Render static layers
  const renderStaticLayer = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const v = viewportRef.current;
    canvas.width = v.width;
    canvas.height = v.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSize = 10 * v.scale;
    const offsetX = (v.width / 2 + v.offsetX) % gridSize;
    const offsetY = (v.height / 2 + v.offsetY) % gridSize;

    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Zones
    STATIC_ZONES.forEach(zone => {
      const [x, y] = worldToScreen(zone.position[0], zone.position[1]);
      const isHovered = hoveredZone === zone.id;
      const isSelected = selectedZone?.id === zone.id;

      ctx.fillStyle = zone.color + (isHovered || isSelected ? '80' : '40');
      ctx.strokeStyle = isHovered || isSelected ? zone.color : zone.color + '60';
      ctx.lineWidth = isHovered || isSelected ? 3 : 2;

      if (zone.type === 'cylinder') {
        const radius = (zone.cylinderRadius || 15) * v.scale;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const width = (zone.width || 20) * v.scale;
        const depth = (zone.depth || 20) * v.scale;
        const halfW = width / 2;
        const halfD = depth / 2;
        ctx.fillRect(x - halfW, y - halfD, width, depth);
        ctx.strokeRect(x - halfW, y - halfD, width, depth);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = isHovered || isSelected ? 'bold 14px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.name, x, y);
    });
  }, [worldToScreen, hoveredZone, selectedZone]);

  // ======= RESIZE HANDLER - FIXED TO PREVENT INFINITE LOOP =======
  // Use ref to track last dimensions - never trigger re-render from here
  const lastSizeRef = useRef({ width: 0, height: 0 });
  
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      // Use ref to check if actually changed - prevents loop
      if (lastSizeRef.current.width !== rect.width || lastSizeRef.current.height !== rect.height) {
        lastSizeRef.current = { width: rect.width, height: rect.height };
        
        // Update canvases directly
        if (staticCanvasRef.current) {
          staticCanvasRef.current.width = rect.width;
          staticCanvasRef.current.height = rect.height;
        }
        if (agentCanvasRef.current) {
          agentCanvasRef.current.width = rect.width;
          agentCanvasRef.current.height = rect.height;
        }
        
        // Update store (this may cause re-render, but we won't re-run this effect due to refs)
        updateViewportAction({ width: rect.width, height: rect.height });
        
        // Trigger static render
        renderStaticLayer();
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
    // NO viewport deps - we use refs to check changes
  }, [updateViewportAction, renderStaticLayer]);

  // Re-render static when zones change
  useEffect(() => {
    renderStaticLayer();
  }, [hoveredZone, selectedZone, renderStaticLayer]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    for (const zone of STATIC_ZONES) {
      const dx = worldX - zone.position[0];
      const dz = worldY - zone.position[1];
      const hit = zone.type === 'cylinder' 
        ? (dx * dx + dz * dz <= (zone.cylinderRadius || 15) ** 2)
        : (Math.abs(dx) <= (zone.width || 20) / 2 && Math.abs(dz) <= (zone.depth || 20) / 2);
      if (hit) {
        setHoveredZone(zone.id);
        return;
      }
    }
    setHoveredZone(null);
  }, [screenToWorld, setHoveredZone]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const [worldX, worldY] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    for (const zone of STATIC_ZONES) {
      const dx = worldX - zone.position[0];
      const dz = worldY - zone.position[1];
      const hit = zone.type === 'cylinder'
        ? (dx * dx + dz * dz <= (zone.cylinderRadius || 15) ** 2)
        : (Math.abs(dx) <= (zone.width || 20) / 2 && Math.abs(dz) <= (zone.depth || 20) / 2);
      if (hit) {
        selectZone(zone);
        return;
      }
    }
    selectZone(null);
  }, [screenToWorld, selectZone]);

  // Wheel handler with passive:false to avoid warnings
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    updateViewportAction({ scale: Math.max(2, Math.min(50, viewportRef.current.scale * delta)) });
    // Defer static re‑render to next tick
    setTimeout(() => renderStaticLayer(), 0);
  }, [updateViewportAction, renderStaticLayer]);

  // UI memoized
  const agentList = useMemo(() => 
    Array.from(agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      color: agent.color,
      status: agent.status
    })), 
  [agents]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-slate-900">
      <canvas ref={staticCanvasRef} className="absolute inset-0" style={{ imageRendering: 'crisp-edges' }} />
      <canvas 
        ref={agentCanvasRef} 
        className="absolute inset-0 cursor-crosshair" 
        style={{ imageRendering: 'crisp-edges' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Zone Popup */}
      {selectedZone && (
        <div className="absolute top-4 right-4 w-80 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg z-20">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-white">{selectedZone.name}</h3>
            <button onClick={() => selectZone(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <p className="text-sm text-slate-300 mb-3">{selectedZone.description}</p>
        </div>
      )}

      {/* UI */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg z-20">
        <h2 className="text-xl font-bold text-white mb-2">🐉 Shalom&apos;s Realm</h2>
        <div className="space-y-1 text-sm">
          <p className="text-slate-400">Connection: <span className={`w-2 h-2 rounded-full inline-block ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} /> {isConnected ? 'Live' : 'Disconnected'}</p>
          <p className="text-slate-400">Agents: {agents.size}</p>
          <p className="text-slate-400">FPS: {Math.round(metrics.fps) || '--'}</p>
          <p className="text-slate-400">Latency: {metrics.wsLatency}ms</p>
        </div>
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
          {agentList.map(agent => (
            <div key={agent.id} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} />
              <span className={agent.id === 'shalom' ? 'text-indigo-300 font-semibold' : 'text-slate-300'}>{agent.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-20">
        <button onClick={() => { updateViewportAction({ scale: Math.min(50, viewport.scale * 1.2) }); setTimeout(renderStaticLayer, 0); }} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">Zoom In</button>
        <button onClick={() => { updateViewportAction({ scale: Math.max(2, viewport.scale / 1.2) }); setTimeout(renderStaticLayer, 0); }} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">Zoom Out</button>
        <button onClick={() => { updateViewportAction({ offsetX: 0, offsetY: 0, scale: 8 }); setTimeout(renderStaticLayer, 0); }} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm">Reset</button>
      </div>
    </div>
  );
}
