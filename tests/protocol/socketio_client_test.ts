import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { SocketIOClient } from '../../denops/overleaf/protocol/socketio_client.ts';
import { ConnectionState } from '../../denops/overleaf/protocol/socketio_types.ts';

Deno.test('initial state is disconnected', () => {
  const client = new SocketIOClient({
    serverUrl: 'https://example.com',
    cookies: 'test=1',
  });
  assertEquals(client.state, ConnectionState.Disconnected);
});

Deno.test('connect fails with invalid server', async () => {
  const client = new SocketIOClient({
    serverUrl: 'https://localhost:19999',
    cookies: 'test=1',
  });
  await assertRejects(
    () => client.connect(),
    Error,
  );
});

/** Helper: create a mock Socket.IO v0.9 server. */
function createMockServer(opts?: {
  onEvent?: (socket: WebSocket, msg: string) => void;
}) {
  const sockets: WebSocket[] = [];

  const server = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
    const url = new URL(req.url);

    if (url.pathname === '/socket.io/1/' && !req.headers.get('upgrade')) {
      return new Response('test-sid:25:60:websocket', { status: 200 });
    }

    if (url.pathname.startsWith('/socket.io/1/websocket/')) {
      const { socket, response } = Deno.upgradeWebSocket(req);
      sockets.push(socket);

      socket.onopen = () => socket.send('1::');

      socket.onmessage = (ev) => {
        const msg = String(ev.data);
        if (msg.startsWith('2')) {
          socket.send('2::');
          return;
        }
        if (msg.startsWith('0')) {
          socket.close();
          return;
        }
        opts?.onEvent?.(socket, msg);
      };

      return response;
    }

    return new Response('Not found', { status: 404 });
  });

  const serverUrl = `http://127.0.0.1:${server.addr.port}`;

  const cleanup = async () => {
    for (const s of sockets) {
      try {
        if (s.readyState === WebSocket.OPEN) s.close();
      } catch { /* ignore */ }
    }
    await server.shutdown();
  };

  return { server, serverUrl, cleanup, sockets };
}

Deno.test('handshake + websocket flow with mock server', async () => {
  const { serverUrl, cleanup } = createMockServer();

  try {
    const client = new SocketIOClient({ serverUrl, cookies: 'session=abc' });

    const connected = new Promise<void>((resolve) => {
      client.on('connect', resolve);
    });

    await client.connect();
    await connected;

    assertEquals(client.state, ConnectionState.Connected);
    client.disconnect();
    assertEquals(client.state, ConnectionState.Disconnected);
  } finally {
    await cleanup();
  }
});

Deno.test('emitEvent with ack callback', async () => {
  const { serverUrl, cleanup } = createMockServer({
    onEvent: (socket, msg) => {
      const match = msg.match(/^5:(\d+)\+::/);
      if (match) {
        const id = match[1];
        // Server sends error-first: [null, ...data]
        socket.send(`6:::${id}+[null,"ok",{"status":"joined"}]`);
      }
    },
  });

  try {
    const client = new SocketIOClient({ serverUrl, cookies: 'x=1' });
    await client.connect();

    const result = await new Promise<unknown[]>((resolve, reject) => {
      client.emitEvent('joinDoc', ['doc123'], (err, ...args) => {
        if (err) reject(err);
        else resolve(args);
      });
    });

    assertEquals(result, ['ok', { status: 'joined' }]);
    client.disconnect();
  } finally {
    await cleanup();
  }
});

Deno.test('receives server events', async () => {
  const { serverUrl, cleanup, sockets } = createMockServer();

  try {
    const client = new SocketIOClient({ serverUrl, cookies: 'x=1' });
    await client.connect();

    const eventReceived = new Promise<{ name: string; args: unknown[] }>((resolve) => {
      client.on('event', (name, args) => resolve({ name, args }));
    });

    while (sockets.length === 0 || sockets[0].readyState !== WebSocket.OPEN) {
      await new Promise((r) => setTimeout(r, 10));
    }

    sockets[0].send('5:::{"name":"otUpdateApplied","args":[{"v":5,"doc":"abc"}]}');

    const ev = await eventReceived;
    assertEquals(ev.name, 'otUpdateApplied');
    assertEquals(ev.args, [{ v: 5, doc: 'abc' }]);

    client.disconnect();
  } finally {
    await cleanup();
  }
});
