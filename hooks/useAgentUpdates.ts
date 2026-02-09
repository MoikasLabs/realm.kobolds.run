/**
 * Agent Updates Hook
 * 
 * Handles Socket.IO event subscriptions for agent state updates.
 * Connects the socket to the realtime store.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { useRealtimeStore } from '@/lib/store/realtimeStore';
import { SOCKET_EVENTS } from '@/lib/socket/config';
import type { AgentState } from '@/types/realtime';

export interface UseAgentUpdatesOptions {
  socket: Socket | null;
  isConnected: boolean;
  onFullState?: (agents: AgentState[]) => void;
  onDeltaUpdate?: (update: unknown) => void;
}

/**
 * Hook to subscribe to agent updates from Socket.IO
 * 
 * This hook manages the connection between Socket.IO events
 * and the Zustand store for agent state.
 */
export function useAgentUpdates({
  socket,
  isConnected,
  onFullState,
  onDeltaUpdate,
}: UseAgentUpdatesOptions) {
  const interpolatedPositionsRef = useRef<
    Map<
      string,
      {
        current: { x: number; y: number };
        target: { x: number; y: number };
        startTime: number;
        duration: number;
      }
    >
  >(new Map());

  const { updatePing, applyDeltaUpdate } = useRealtimeStore();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    console.log('[useAgentUpdates] Setting up event handlers...');

    // Handle full state update (initial connection)
    const handleFullState = (update: any) => {
      console.log('[useAgentUpdates] Received full state:', update);
      
      // Update store
      applyDeltaUpdate(update);

      // Initialize interpolated positions
      if (update.fullState) {
        const now = performance.now();
        update.fullState.forEach((agent: AgentState) => {
          interpolatedPositionsRef.current.set(agent.id, {
            current: { ...agent.position },
            target: agent.targetPosition || { ...agent.position },
            startTime: now,
            duration: 100, // INTERPOLATION_DURATION
          });
        });
      }

      onFullState?.(update.fullState || []);
    };

    // Handle delta update (incremental changes)
    const handleDeltaUpdate = (update: any) => {
      console.log('[useAgentUpdates] Received delta update:', update);
      
      // Update interpolated positions
      if (update.agents) {
        const agentsMap = useRealtimeStore.getState().agents;
        
        update.agents.forEach((delta: { id: string; position?: { x: number; y: number } }) => {
          if (delta.position) {
            const current = interpolatedPositionsRef.current.get(delta.id);
            const existing = agentsMap.get(delta.id);
            
            if (current) {
              current.current = { ...current.target };
              current.target = delta.position;
              current.startTime = performance.now();
              current.duration = 100;
            } else if (existing) {
              interpolatedPositionsRef.current.set(delta.id, {
                current: { ...existing.position },
                target: delta.position,
                startTime: performance.now(),
                duration: 100,
              });
            }
          }
        });
      }

      // Update store
      applyDeltaUpdate(update);
      onDeltaUpdate?.(update);
    };

    // Handle pong for latency measurement
    const handlePong = (data: { timestamp: number }) => {
      const latency = Date.now() - data.timestamp;
      updatePing(latency);
    };

    // Subscribe to events
    socket.on(SOCKET_EVENTS.FULL_STATE, handleFullState);
    socket.on(SOCKET_EVENTS.DELTA_UPDATE, handleDeltaUpdate);
    socket.on(SOCKET_EVENTS.PONG, handlePong);

    // Cleanup
    return () => {
      socket.off(SOCKET_EVENTS.FULL_STATE, handleFullState);
      socket.off(SOCKET_EVENTS.DELTA_UPDATE, handleDeltaUpdate);
      socket.off(SOCKET_EVENTS.PONG, handlePong);
      console.log('[useAgentUpdates] Cleaned up event handlers');
    };
  }, [socket, isConnected, onFullState, onDeltaUpdate, updatePing, applyDeltaUpdate]);

  return {
    interpolatedPositions: interpolatedPositionsRef.current,
  };
}