/**
 * Reusable Socket.IO Hook for Next.js
 * 
 * A custom hook that manages Socket.IO connection lifecycle.
 * Handles connecting, disconnecting, and provides a stable socket reference.
 * 
 * @example
 * ```tsx
 * const { socket, isConnected, socketReady } = useSocket({
 *   onConnect: () => console.log('Connected'),
 *   onDisconnect: () => console.log('Disconnected'),
 *   onMessage: (event, data) => console.log(event, data)
 * });
 * ```
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_CONFIG, SOCKET_EVENTS } from '@/lib/socket/config';

export interface UseSocketOptions {
  /** Callback on successful connection */
  onConnect?: () => void;
  /** Callback on disconnect */
  onDisconnect?: (reason?: string) => void;
  /** Callback on connection error */
  onError?: (error: Error) => void;
  /** Callback for generic socket events */
  onMessage?: (event: string, data: unknown) => void;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

export interface UseSocketReturn {
  /** Socket.IO client instance (null until connected) */
  socket: Socket | null;
  /** Connection status */
  isConnected: boolean;
  /** Socket is ready to use */
  socketReady: boolean;
  /** Manually connect (if autoConnect is false) */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Emit an event */
  emit: (event: string, data?: unknown) => void;
  /** Subscribe to a specific event */
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  /** Unsubscribe from a specific event */
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

/**
 * Custom hook for managing Socket.IO connections
 * 
 * Features:
 * - Single socket instance per component instance
 * - Auto-connect on mount (configurable)
 * - Cleanup on unmount
 * - Type-safe event handling
 * - Reconnection handled by Socket.IO library
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const {
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    autoConnect = true,
  } = options;

  // Socket instance ref (persists between renders)
  const socketRef = useRef<Socket | null>(null);
  // Track if we've connected (prevent duplicate connections)
  const hasConnectedRef = useRef(false);

  // State for React to respond to
  const [isConnected, setIsConnected] = useState(false);
  const [socketReady, setSocketReady] = useState(false);

  /**
   * Connect to Socket.IO server
   */
  const connect = useCallback(() => {
    if (typeof window === 'undefined') {
      console.warn('[useSocket] Cannot connect on server-side');
      return;
    }

    if (socketRef.current?.connected) {
      console.log('[useSocket] Already connected, skipping');
      return;
    }

    if (hasConnectedRef.current) {
      console.log('[useSocket] Socket already initialized, connecting...');
      socketRef.current?.connect();
      return;
    }

    console.log('[useSocket] Connecting to Socket.IO server...');
    const socket = io(undefined, SOCKET_CONFIG);

    socketRef.current = socket;
    hasConnectedRef.current = true;

    // Connection handlers
    socket.on(SOCKET_EVENTS.CONNECT, () => {
      console.log('[useSocket] Connected to Socket.IO server');
      setIsConnected(true);
      setSocketReady(true);
      onConnect?.();
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason?: string) => {
      console.log('[useSocket] Disconnected from Socket.IO server:', reason);
      setIsConnected(false);
      setSocketReady(false);
      onDisconnect?.(reason);
    });

    socket.on(SOCKET_EVENTS.CONNECT_ERROR, (err: Error) => {
      console.error('[useSocket] Connection error:', err.message);
      onError?.(err);
    });

    socket.on(SOCKET_EVENTS.ERROR, (err: Error) => {
      console.error('[useSocket] Socket error:', err);
      onError?.(err);
    });

    // Generic message handler
    if (onMessage) {
      const handleMessage = (event: string, ...args: unknown[]) => {
        onMessage(event, args);
      };
      socket.onAny(handleMessage);
    }

    // Socket is ready to emit (even if not fully connected)
    setSocketReady(true);
  }, [onConnect, onDisconnect, onError, onMessage]);

  /**
   * Disconnect from Socket.IO server
   */
  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      console.log('[useSocket] Disconnecting from Socket.IO...');
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setSocketReady(false);
      hasConnectedRef.current = false;
    }
  }, []);

  /**
   * Emit an event to the server
   */
  const emit = useCallback((event: string, data?: unknown) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('[useSocket] Cannot emit - socket not initialized');
      return;
    }
    if (!socket.connected) {
      console.warn('[useSocket] Cannot emit - socket not connected');
      return;
    }
    socket.emit(event, data);
  }, []);

  /**
   * Subscribe to a specific event
   */
  const on = useCallback((event: string, callback: (...args: unknown[]) => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('[useSocket] Cannot listen - socket not initialized');
      return;
    }
    socket.on(event, callback);
  }, []);

  /**
   * Unsubscribe from a specific event
   */
  const off = useCallback((event: string, callback?: (...args: unknown[]) => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('[useSocket] Cannot unlisten - socket not initialized');
      return;
    }
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.off(event);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    socketReady,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}

/**
 * Hook specifically for realm.shalohm.co real-time updates
 * Provides typed event handlers for full state and delta updates
 */
export function useRealmSocket() {
  return useSocket({
    // Auto-connect is true by default
    // Specific callbacks for realm events
  });
}