import type { ServerResponse } from 'node:http';

/** Hub SSE: cada sala (bar) tem seus clientes conectados. Os eventos só avisam "mudou" — o cliente busca o estado. */
const salas = new Map<string, Set<ServerResponse>>();

export function inscrever(barId: string, res: ServerResponse, origem?: string) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...(origem ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin' } : {}),
  });
  res.write('retry: 3000\n\n');
  if (!salas.has(barId)) salas.set(barId, new Set());
  salas.get(barId)!.add(res);
  const batida = setInterval(() => res.write(': ping\n\n'), 25_000);
  res.on('close', () => {
    clearInterval(batida);
    salas.get(barId)?.delete(res);
  });
}

export function notificar(barId: string, evento = 'estado') {
  for (const res of salas.get(barId) ?? []) res.write(`event: ${evento}\ndata: {}\n\n`);
}
