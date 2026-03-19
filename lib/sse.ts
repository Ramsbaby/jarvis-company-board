type SendFn = (data: string) => void;
const clients = new Set<SendFn>();

export function broadcastEvent(event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(send => {
    try { send(data); } catch { clients.delete(send); }
  });
}

export function addClient(send: SendFn) { clients.add(send); }
export function removeClient(send: SendFn) { clients.delete(send); }
