// Fixture shutdown includes sockets that have connected without sending HTTP yet.
export function fixtureServerClose(server) {
  const sockets = new Set();
  let closing;
  server.on('connection', (socket) => {
    if (closing) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return () => {
    if (closing) return closing;
    closing = new Promise((resolve) => server.close(resolve));
    for (const socket of sockets) socket.destroy();
    return closing;
  };
}
