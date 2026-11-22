import type { Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Bind the HTTP server to ALL IPv4 interfaces, explicitly.
 *
 * `app.listen(port)` with no host lets Node choose: it binds the IPv6 wildcard `::` (dual-stack) when IPv6 is available
 * and `0.0.0.0` otherwise. A host platform's port scan (Render's "no open ports detected") is documented to look for a
 * server bound to `0.0.0.0` on the PORT it provides, so the host is stated rather than inherited. This is a
 * compatibility measure: it is not a proven root cause of any deployment failure, and it changes nothing else (the port
 * is still the validated numeric `config.port`).
 */
export const LISTEN_HOST = '0.0.0.0';

/** "0.0.0.0:10000 (IPv4)" — what the server is ACTUALLY bound to, as reported by the socket after listening. */
export function describeAddress(address: string | AddressInfo | null): string {
  if (address === null) return 'unknown (server.address() returned null)';
  if (typeof address === 'string') return address; // a pipe / unix socket path
  return `${address.address}:${address.port} (${address.family})`;
}

export function listenOnAllInterfaces(
  app: Express,
  port: number,
  onListening: (boundTo: string) => void
): Server {
  const server = app.listen(port, LISTEN_HOST, () => onListening(describeAddress(server.address())));
  return server;
}
