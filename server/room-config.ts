import { randomBytes } from "node:crypto";

export interface RoomConfig {
  roomId: string;
  roomName: string;
  roomDescription: string;
  host: string;
  port: number;
  maxAgents: number;
  maxPlayers: number;
  profanityFilter: boolean;
}

/** Generate a URL-safe short ID (12 chars, similar to nanoid) */
function generateRoomId(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = randomBytes(12);
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

/** Load room configuration from environment variables */
export function loadRoomConfig(): RoomConfig {
  return {
    roomId: process.env.ROOM_ID ?? generateRoomId(),
    roomName: process.env.ROOM_NAME ?? "Kobold Kingdom",
    roomDescription: process.env.ROOM_DESCRIPTION ?? "",
    host: process.env.WORLD_HOST ?? "127.0.0.1",
    port: parseInt(process.env.WORLD_PORT ?? "18800", 10),
    maxAgents: parseInt(process.env.MAX_AGENTS ?? "50", 10),
    maxPlayers: parseInt(process.env.MAX_PLAYERS ?? "20", 10),
    profanityFilter: (process.env.PROFANITY_FILTER ?? "on") !== "off",
  };
}
