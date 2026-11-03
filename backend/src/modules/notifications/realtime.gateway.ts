import { Logger } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { REALTIME_NAMESPACE, userRoom } from '../../infra/realtime/realtime-emitter.service';
import { COOKIES, parseCookieHeader } from '../auth/auth-cookies.service';
import { TokenService } from '../auth/token.service';

/**
 * Socket.IO `/realtime` namespace (server → client only). The handshake must carry a valid user
 * access token (`auth.token` for mobile, the `remi_at` cookie for web); the server alone puts the
 * socket in `user:{id}`. Sockets are disconnected when the token expires so clients reconnect with
 * a fresh one. CORS and the Redis adapter are configured in RedisIoAdapter.
 */
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly tokens: TokenService) {}

  afterInit(nsp: Namespace): void {
    nsp.use((socket, next) => {
      this.authenticate(socket)
        .then(() => next())
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const header = socket.handshake.headers.authorization;
    let token: string | undefined;
    if (typeof auth?.token === 'string' && auth.token) token = auth.token;
    else if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) token = header.slice(7).trim();
    else token = parseCookieHeader(socket.handshake.headers.cookie)[COOKIES.userAccess];
    if (!token || token.length > 4096) throw new Error('missing token');

    const payload = await this.tokens.verifyUser(token);
    const userId = payload.sub;
    (socket.data as { userId?: string }).userId = userId;
    await socket.join(userRoom(userId));
    const exp = (payload as { exp?: number }).exp;
    if (exp) {
      const ms = exp * 1000 - Date.now();
      const timer = setTimeout(() => socket.disconnect(true), Math.max(0, ms));
      timer.unref();
      socket.once('disconnect', () => clearTimeout(timer));
    }
    // Clients never emit anything; ignore and drop unexpected events.
    socket.onAny(() => undefined);
    this.logger.debug({ userId }, 'socket connected');
  }
}
