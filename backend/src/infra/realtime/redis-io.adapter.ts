import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { redisOptionsFromUrl } from '../redis/redis.constants';

/** Socket.IO with the Redis adapter (multi-replica fan-out) and the CORS allowlist. */
export class RedisIoAdapter extends IoAdapter {
  private readonly log = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  connect(): void {
    const options = { ...redisOptionsFromUrl(this.redisUrl), maxRetriesPerRequest: null, lazyConnect: false };
    const pub = new Redis(options);
    const sub = pub.duplicate();
    for (const c of [pub, sub]) c.on('error', (err: Error) => this.log.warn(`Socket.IO Redis error: ${err.message}`));
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true, methods: ['GET', 'POST'] },
      maxHttpBufferSize: 64 * 1024,
      serveClient: false,
    }) as Server;
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => c.disconnect())));
  }
}
