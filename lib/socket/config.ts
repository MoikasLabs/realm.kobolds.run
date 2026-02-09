import type { ManagerOptions, SocketOptions } from 'socket.io-client';

/**
 * Socket.IO Configuration for Vercel Pages Router
 * 
 * This configuration ensures proper Socket.IO connection with Next.js Pages Router on Vercel.
 * Key settings:
 * - path: '/api/socket' - matches the server route
 * - transports: ['polling', 'websocket'] - polling first, upgrade to WebSocket when possible
 * - reconnection: enabled with backoff for better reliability
 */

export const SOCKET_CONFIG: Partial<ManagerOptions & SocketOptions> = {
  // Path to Socket.IO server endpoint (must match both client and server)
  path: '/api/socket',

  // Vercel serverless ONLY supports polling (WebSocket upgrade is unreliable)
  transports: ['polling'],

  // Reconnection settings for reliability
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,

  // Ping/Pong for connection health
  forceNew: false,

  // Query parameters (can be used for versioning, auth, etc.)
  query: { _v: '4' },
};

/**
 * Socket.IO event names used throughout the app
 * Centralized for type safety and easier refactoring
 */
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  ERROR: 'error',

  // Server events
  FULL_STATE: 'full',
  DELTA_UPDATE: 'delta',
  PONG: 'pong',

  // Client events
  VIEWPORT: 'viewport',
  PING: 'ping',
  SUBSCRIBE: 'subscribe',
} as const;

export type SocketEventNames = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
