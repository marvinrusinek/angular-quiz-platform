import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { describeAddress, LISTEN_HOST, listenOnAllInterfaces } from '../src/listen';
import { fixtureDependencies } from './helpers/fixtures';

/**
 * The server binds to 0.0.0.0 EXPLICITLY (a compatibility measure for host port scans) and reports what it is actually
 * bound to. These tests open a real socket on an ephemeral port and reach it over IPv4 — they never touch a database.
 */

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, family: 4 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

describe('listenOnAllInterfaces', () => {
  const config = loadConfig({ NODE_ENV: 'test', ALLOWED_ORIGINS: 'http://localhost:4200' } as NodeJS.ProcessEnv);
  let server: http.Server | undefined;

  afterEach(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    server = undefined;
  });

  it('binds to 0.0.0.0 and answers /api/health over IPv4', async () => {
    const bound = await new Promise<string>((resolve) => {
      server = listenOnAllInterfaces(createApp(config, fixtureDependencies()), 0, resolve);
    });
    const address = server!.address() as AddressInfo;

    expect(LISTEN_HOST).toBe('0.0.0.0');
    expect(address.address).toBe('0.0.0.0');
    expect(address.family).toBe('IPv4');
    expect(bound).toBe(`0.0.0.0:${address.port} (IPv4)`);

    const res = await get(address.port, '/api/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('uses the validated numeric port from the config', () => {
    const fromEnv = loadConfig({
      NODE_ENV: 'test',
      ALLOWED_ORIGINS: 'http://localhost:4200',
      PORT: '10000'
    } as NodeJS.ProcessEnv);
    expect(fromEnv.port).toBe(10000);
    expect(typeof fromEnv.port).toBe('number');
  });

  it('describes what the socket reports, including a null address', () => {
    expect(describeAddress({ address: '0.0.0.0', family: 'IPv4', port: 10000 })).toBe('0.0.0.0:10000 (IPv4)');
    expect(describeAddress(null)).toContain('null');
    expect(describeAddress('/tmp/app.sock')).toBe('/tmp/app.sock');
  });
});
