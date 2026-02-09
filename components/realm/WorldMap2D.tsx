'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useRealtimeStore, useAgents, useMetrics, useConnectionState, useSelectedZone, useHoveredZone, STATIC_ZONES } from '@/lib/store/realtimeStore';
import type { AgentState } from '@/types/realtime';
import { io, Socket } from 'socket.io-client';

// Performance constants
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
const INTERPOLATION_DURATION = 100; // ms to interpolate between positions
const METRICS_THROTTLE_MS = 100; // Throttle metrics pushes to React

// Dirty rectangle padding for agent rendering
const DIRTY_RECT_PADDING = 10;

export function WorldMap2D() {
  // Refs for canvas and animation
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const agentCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  
  // ======= NON-REACTIVE RENDER LOOP STATE (outside React) =======
  // All animation state stored in refs to avoid triggering React cycles
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(performance.now());
  const lastMetricsPushRef = useRef<number>(performance.now());
  const renderTimeRef = useRef<number>(0);
  const visibleCountRef = useRef<number>(0);
  const interpolatedCountRef = useRef<number>(0);
  
  // Interpolation state (managed in refs, NOT in React state)
  const interpolatedPositionsRef = useRef<Map<string, {
    current: { x: number; y: number };
    target: { x: number; y: number };
    startTime: number;
    duration: number;
  }>>(new Map());

  // Zustand store actions
  const store = useRealtimeStore();
  const agents = useAgents();
  const metrics = useMetrics();
  const isConnected = useConnectionState();

  // Local refs for performance-critical data (avoid re-renders)
  const agentsRef = useRef<Map<string, AgentState>>(agents);
  const viewportRef = useRef(store.viewport);

  // Update refs when store changes
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    viewportRef.current = store.viewport;
  }, [store.viewport]);

  // World/screen coordinate conversion (memoized)
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

  // Check if agent is visible (spatial culling)
  const isAgentVisible = useCallback((agent: AgentState): boolean => {
    const v = viewportRef.current;
    const [x, y] = worldToScreen(agent.position.x, agent.position.y);
    const margin = (agent.radius + DIRTY_RECT_PADDING) * 2;

    return x >= -margin && x <= v.width + margin &&
           y >= -margin && y <= v.height + margin;
  }, [worldToScreen]);

  // Render agents (top layer) - 60fps with dirty-rectangle optimization
  const renderAgentLayer = useCallback((timestamp: number) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const v = viewportRef.current;

    // Track visible agents for metrics (stored in refs, not state)
    let visibleCount = 0;
    let interpolatedCount = 0;

    // Clear the entire agent layer
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render each agent
    agentsRef.current.forEach((agent) => {
      // Spatial culling - skip if not visible
      if (!isAgentVisible(agent)) return;

      visibleCount++;

      // Get interpolated position
      let renderX: number;
      let renderY: number;

      const interp = interpolatedPositionsRef.current.get(agent.id);
      const now = timestamp;

      if (agent.targetPosition && interp) {
        // Interpolate between current and target position
        const elapsed = now - interp.startTime;
        const progress = Math.min(1, elapsed / interp.duration);

        // Easing function for smooth movement (ease-out cubic)
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);

        renderX = interp.current.x + (agent.targetPosition.x - interp.current.x) * easeOutCubic;
        renderY = interp.current.y + (agent.targetPosition.y - interp.current.y) * easeOutCubic;

        if (progress < 1) {
          interpolatedCount++;
        } else {
          // Interpolation complete, update current position
          interpolatedPositionsRef.current.delete(agent.id);
        }
      } else {
        renderX = agent.position.x;
        renderY = agent.position.y;
      }

      // Convert to screen coordinates
      const [screenX, screenY] = worldToScreen(renderX, renderY);

      // Draw glow
      ctx.fillStyle = agent.color + '30';
      ctx.beginPath();
      ctx.arc(screenX, screenY, agent.radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw agent dot
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

      // Draw name label for hovered/important agents
      if (agent.id === 'shalom' || store.hoveredZone === getAgentZone(agent)) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(agent.name, screenX, screenY - agent.radius - 6);
      }
    });

    // Store counts in refs for metrics (not React state)
    visibleCountRef.current = visibleCount;
    interpolatedCountRef.current = interpolatedCount;
  }, [isAgentVisible, worldToScreen, store.hoveredZone]);

  // Get zone for an agent (helper)
  const getAgentZone = (agent: AgentState): string | null => {
    // Simple zone detection by distance to zone centers
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
  };

  // WebSocket connection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Socket.IO with polling for Vercel support
    // Vercel doesn't support WebSockets, so we prioritize polling
    const socket = io({
      path: '/api/ws/socket.io',
      transports: ['polling', 'websocket'], // polling first for Vercel
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WorldMap] WebSocket/Socket.IO connected');
      store.setConnectionState(true);
    });

    socket.on('disconnect', () => {
      console.log('[WorldMap] WebSocket/Socket.IO disconnected');
      store.setConnectionState(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WorldMap] Socket.IO connection error:', err.message);
      // Don't set disconnected yet - will retry with polling
    });

    socket.on('full', (update) => {
      // Full state update
      store.applyDeltaUpdate(update);

      // Initialize interpolation for all agents
      update.fullState?.forEach((agent: AgentState) => {
        interpolatedPositionsRef.current.set(agent.id, {
          current: { ...agent.position },
          target: agent.targetPosition || { ...agent.position },
          startTime: performance.now(),
          duration: INTERPOLATION_DURATION
        });
      });
    });

    socket.on('delta', (update) => {
      // Delta update
      store.applyDeltaUpdate(update);

      // Update interpolation targets
      update.agents?.forEach((delta: { id: string; position?: { x: number; y: number }; }) => {
        if (delta.position) {
          const current = interpolatedPositionsRef.current.get(delta.id);
          const existing = agentsRef.current.get(delta.id);

          if (current) {
            // Update interpolation target
            current.current = { ...current.target };
            current.target = delta.position;
            current.startTime = performance.now();
            current.duration = INTERPOLATION_DURATION;
          } else if (existing) {
            // New interpolation entry
            interpolatedPositionsRef.current.set(delta.id, {
              current: { ...existing.position },
              target: delta.position,
              startTime: performance.now(),
              duration: INTERPOLATION_DURATION
            });
          }
        }
      });
    });

    socket.on('pong', (data) => {
      const latency = Date.now() - data.timestamp;
      store.updatePing(latency);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [store]);

  // ======= NON-REACTIVE RENDER LOOP - 60fps OUTSIDE REACT =======
  // This is the key fix for React Error #185 - we manage the animation
  // loop completely outside of React's lifecycle and only push state
  // updates to React throttled at 100ms
  useEffect(() => {
    const gameLoop = (timestamp: number) => {
      // Calculate FPS in refs (not React state)
      frameCountRef.current++;
      
      if (timestamp - lastFpsUpdateRef.current >= 1000) {
        // Store FPS in a ref we can use when we DO push metrics
        frameCountRef.current = frameCountRef.current;
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = timestamp;
      }

      // Render agent layer at 60fps
      const renderStart = performance.now();
      renderAgentLayer(timestamp);
      renderTimeRef.current = performance.now() - renderStart;

      // Throttle metrics push to React state (every 100ms = 10fps state updates)
      if (timestamp - lastMetricsPushRef.current >= METRICS_THROTTLE_MS) {
        store.updateMetrics({
          fps: frameCountRef.current,
          frameTime: FRAME_TIME,
          renderTime: renderTimeRef.current,
          visibleAgents: visibleCountRef.current,
          interpolatedAgents: interpolatedCountRef.current,
          wsLatency: metrics.wsLatency
        });
        lastMetricsPushRef.current = timestamp;
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    };

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderAgentLayer, store, metrics.wsLatency]);

  // Render static zones (bottom layer) - cached, redrawn only on resize/viewport change
  const renderStaticLayer = useCallback(() => {
    const canvas = staticCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const v = viewportRef.current;
    canvas.width = v.width;
    canvas.height = v.height;

    // Clear
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
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

    // Draw zones
    const hoveredZone = store.hoveredZone;
    const selectedZone = store.selectedZone;

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
        const halfWidth = width / 2;
        const halfDepth = depth / 2;

        // Rounded rectangle
        const cornerRadius = 4;
        ctx.beginPath();
        ctx.moveTo(x - halfWidth + cornerRadius, y - halfDepth);
        ctx.lineTo(x + halfWidth - cornerRadius, y - halfDepth);
        ctx.quadraticCurveTo(x + halfWidth, y - halfDepth, x + halfWidth, y - halfDepth + cornerRadius);
        ctx.lineTo(x + halfWidth, y + halfDepth - cornerRadius);
        ctx.quadraticCurveTo(x + halfWidth, y + halfDepth, x + halfWidth - cornerRadius, y + halfDepth);
        ctx.lineTo(x - halfWidth + cornerRadius, y + halfDepth);
        ctx.quadraticCurveTo(x - halfWidth, y + halfDepth, x - halfWidth, y + halfDepth - cornerRadius);
        ctx.lineTo(x - halfWidth, y - halfDepth + cornerRadius);
        ctx.quadraticCurveTo(x - halfWidth, y - halfDepth, x - halfWidth + cornerRadius, y - halfDepth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Zone label
      ctx.fillStyle = '#ffffff';
      ctx.font = isHovered || isSelected ? 'bold 14px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.name, x, y);
    });
  }, [worldToScreen, store.hoveredZone, store.selectedZone]);

  // Initial static layer render and resize handler
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      store.updateViewport({
        width: rect.width,
        height: rect.height
      });

      // Resize both canvases
      if (staticCanvasRef.current) {
        staticCanvasRef.current.width = rect.width;
        staticCanvasRef.current.height = rect.height;
      }
      if (agentCanvasRef.current) {
        agentCanvasRef.current.width = rect.width;
        agentCanvasRef.current.height = rect.height;
      }

      // Re-render static layer
      renderStaticLayer();
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [renderStaticLayer, store]);

  // Re-render static layer when zone selection changes
  useEffect(() => {
    renderStaticLayer();
  }, [store.hoveredZone, store.selectedZone, renderStaticLayer]);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const [worldX, worldY] = screenToWorld(x, y);

    // Check zone hover
    let hovered: string | null = null;
    for (const zone of STATIC_ZONES) {
      const dx = worldX - zone.position[0];
      const dz = worldY - zone.position[1];

      if (zone.type === 'cylinder') {
        const radius = zone.cylinderRadius || 15;
        if (dx * dx + dz * dz <= radius * radius) {
          hovered = zone.id;
          break;
        }
      } else {
        const halfWidth = (zone.width || 20) / 2;
        const halfDepth = (zone.depth || 20) / 2;
        if (Math.abs(dx) <= halfWidth && Math.abs(dz) <= halfDepth) {
          hovered = zone.id;
          break;
        }
      }
    }
    store.setHoveredZone(hovered);
  }, [screenToWorld, store]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = agentCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const [worldX, worldY] = screenToWorld(x, y);

    // Check zone click
    let clickedZone: ReturnType<typeof useSelectedZone> = null;
    for (const zone of STATIC_ZONES) {
      const dx = worldX - zone.position[0];
      const dz = worldY - zone.position[1];

      if (zone.type === 'cylinder') {
        const radius = zone.cylinderRadius || 15;
        if (dx * dx + dz * dz <= radius * radius) {
          clickedZone = zone;
          break;
        }
      } else {
        const halfWidth = (zone.width || 20) / 2;
        const halfDepth = (zone.depth || 20) / 2;
        if (Math.abs(dx) <= halfWidth && Math.abs(dz) <= halfDepth) {
          clickedZone = zone;
          break;
        }
      }
    }

    store.selectZone(clickedZone);
  }, [screenToWorld, store]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(2, Math.min(50, viewportRef.current.scale * delta));

    store.updateViewport({ scale: newScale });

    // Re-render static layer on zoom
    setTimeout(() => renderStaticLayer(), 0);
  }, [renderStaticLayer, store]);

  // Memoized UI components
  const agentList = useMemo(() => {
    return Array.from(agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      color: agent.color,
      status: agent.status
    }));
  }, [agents]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-slate-900">
      {/* Static layer - zones, grid, background */}
      <canvas
        ref={staticCanvasRef}
        className="absolute inset-0"
        style={{ imageRendering: 'crisp-edges' }}
      />

      {/* Dynamic layer - agents only (60fps) */}
      <canvas
        ref={agentCanvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ imageRendering: 'crisp-edges' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Zone Info Popup */}
      {store.selectedZone && (
        <div className="absolute top-4 right-4 w-80 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg z-20">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-bold text-white">{store.selectedZone.name}</h3>
            <button
              onClick={() => store.selectZone(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-slate-300 mb-3">{store.selectedZone.description}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Type:</span>
              <span className="text-slate-200 capitalize">
                {store.selectedZone.type === 'cylinder' ? 'cylinder (moicad)' : 'box (moicad extrude)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Position:</span>
              <span className="text-slate-200">
                ({store.selectedZone.position[0]}, {store.selectedZone.position[1]})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg z-20">
        <h2 className="text-xl font-bold text-white mb-2">🐉 Shalom&apos;s Realm</h2>
        <div className="space-y-1 text-sm">
          <p className="text-slate-400">View: 2D Top-Down (moicad-style)</p>
          <p className="text-slate-400 flex items-center gap-2">
            Connection:
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Live' : 'Disconnected'}
          </p>
          <p className="text-slate-400">Agents: {agents.size} (WebSocket synced)</p>
          <p className="text-slate-400">FPS: {metrics.fps || '--'}</p>
          <p className="text-slate-400">Latency: {metrics.wsLatency}ms</p>
          <p className="text-slate-400">Visible: {metrics.visibleAgents}</p>
        </div>
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
          {agentList.map(agent => (
            <div key={agent.id} className="flex items-center gap-2 text-xs">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              <span className={agent.id === 'shalom' ? 'text-indigo-300 font-semibold' : 'text-slate-300'}>
                {agent.name}
              </span>
              <span className={`w-2 h-2 rounded-full ${
                agent.status === 'active' ? 'bg-green-500' :
                agent.status === 'working' ? 'bg-yellow-500' :
                agent.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
              }`} />
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-4 flex gap-2 z-20">
        <button
          onClick={() => {
            store.updateViewport({ scale: Math.min(50, viewportRef.current.scale * 1.2) });
            setTimeout(() => renderStaticLayer(), 0);
          }}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors text-sm"
        >
          Zoom In
        </button>
        <button
          onClick={() => {
            store.updateViewport({ scale: Math.max(2, viewportRef.current.scale / 1.2) });
            setTimeout(() => renderStaticLayer(), 0);
          }}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors text-sm"
        >
          Zoom Out
        </button>
        <button
          onClick={() => {
            store.updateViewport({ offsetX: 0, offsetY: 0, scale: 8 });
            setTimeout(() => renderStaticLayer(), 0);
          }}
          className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors text-sm"
        >
          Reset View
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-lg p-3 shadow-lg z-20">
        <h4 className="text-sm font-semibold text-slate-200 mb-2">Zones (moicad geometry)</h4>
        <div className="space-y-1 text-xs">
          {STATIC_ZONES.map(zone => (
            <div key={zone.id} className="flex items-center gap-2">
              <span
                className={zone.type === 'cylinder' ? 'w-3 h-3 rounded-full' : 'w-3 h-3 rounded-sm'}
                style={{ backgroundColor: zone.color + '60', border: `1px solid ${zone.color}` }}
              />
              <span className="text-slate-400">{zone.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Debug overlay (optional, shows during development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-20 left-4 bg-black/50 text-xs text-green-400 font-mono p-2 rounded z-20">
          <div>FPS: {metrics.fps}</div>
          <div>Frame: {metrics.frameTime.toFixed(1)}ms</div>
          <div>Render: {metrics.renderTime.toFixed(1)}ms</div>
          <div>WS: {metrics.wsLatency}ms</div>
          <div>Agents: {metrics.agentCount}</div>
          <div>Visible: {metrics.visibleAgents}</div>
          <div>Interp: {metrics.interpolatedAgents}</div>
        </div>
      )}
    </div>
  );
}
