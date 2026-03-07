/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createServer as createHttp} from 'http';
import {createServer as createHttps} from 'https';
import {createVercelHandler} from './vercelHandler.ts';
import type {DevServerOptions} from './types.ts';
import type {IncomingMessage, Server as HttpServer, ServerResponse} from 'http';
import type {Server as HttpsServer} from 'https';

const DEFAULT_DEV_SERVER_OPTIONS: DevServerOptions = {
    port: 3000,
    protocol: 'http',
};

/** Converts Node's IncomingMessage to a Web standard Request */
async function nodeIncomingToRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);
    const host = req.headers.host || 'localhost';
    const protocol = 'http';
    const url = `${protocol}://${host}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
        } else {
            headers.set(key, value);
        }
    }
    return new Request(url, {
        method: req.method || 'GET',
        headers,
        body: body.length > 0 ? body : undefined,
    });
}

/** Writes a Web standard Response to Node's ServerResponse */
async function writeWebResponseToNode(webResponse: Response, res: ServerResponse): Promise<void> {
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    const buffer = Buffer.from(await webResponse.arrayBuffer());
    res.end(buffer);
}

/** Starts a dev server using Bun's native Request/Response support */
function startBunDevServer(handler: ReturnType<typeof createVercelHandler>, options: DevServerOptions): any {
    const url = `${options.protocol}://localhost:${options.port}`;
    const server = (globalThis as any).Bun.serve({
        port: options.port,
        fetch: handler.POST,
    });
    console.log(`mion vercel dev server (bun) running on ${url}`);

    const shutdownHandler = () => {
        console.log(`Shutting down mion vercel dev server on ${url}`);
        server.stop(true);
        process.exit(0);
    };
    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);

    return server;
}

/** Starts a dev server using Node's http/https module with Request/Response adapters */
function startNodeDevServer(
    handler: ReturnType<typeof createVercelHandler>,
    options: DevServerOptions
): Promise<HttpServer | HttpsServer> {
    return new Promise((resolve, reject) => {
        const requestListener = async (req: IncomingMessage, res: ServerResponse) => {
            try {
                const webRequest = await nodeIncomingToRequest(req);
                const webResponse = await handler.POST(webRequest);
                await writeWebResponseToNode(webResponse, res);
            } catch (err) {
                if (!res.writableEnded) {
                    res.statusCode = 500;
                    res.end('Internal Server Error');
                } else {
                    console.error('Error handling request:', err);
                }
            }
        };

        const server = options.protocol === 'https' ? createHttps(requestListener) : createHttp(requestListener);

        server.on('error', reject);

        server.listen(options.port, () => {
            console.log(`mion vercel dev server (node) running on ${options.protocol}://localhost:${options.port}`);
            resolve(server);
        });

        const shutdownHandler = () => {
            console.log(`Shutting down mion vercel dev server on ${options.protocol}://localhost:${options.port}`);
            server.close(() => process.exit(0));
        };
        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
    });
}

/** Starts a local dev server for the Vercel handler. Auto-detects Bun or Node runtime. */
export async function startVercelDevServer(options?: Partial<DevServerOptions>): Promise<HttpServer | HttpsServer | any> {
    const opts: DevServerOptions = {...DEFAULT_DEV_SERVER_OPTIONS, ...options};
    const handler = createVercelHandler();
    if (typeof (globalThis as any)?.Bun !== 'undefined') return startBunDevServer(handler, opts);
    return startNodeDevServer(handler, opts);
}
