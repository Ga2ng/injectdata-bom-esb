import { insertLog } from '../database/db.js';

const VALID_LEVELS = new Set(['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'WARN']);
const clients = new Set();

function writeSseMessage(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function broadcast(type, payload) {
  const message = { type, payload };
  for (const res of clients) {
    try {
      writeSseMessage(res, message);
    } catch {
      clients.delete(res);
    }
  }
}

export function sendToClient(res, type, payload) {
  writeSseMessage(res, { type, payload });
}

/**
 * Persist an activity log entry to SQLite and broadcast it to connected SSE clients.
 */
export function log(level, event, message) {
  const safeLevel = level === 'WARN' ? 'WARNING' : VALID_LEVELS.has(level) ? level : 'INFO';
  const entry = insertLog({
    createdAt: new Date().toISOString(),
    level: safeLevel,
    event,
    message,
  });
  broadcast('log', entry);
  return entry;
}

export function broadcastStatus(statusSnapshot) {
  broadcast('status', statusSnapshot);
}

