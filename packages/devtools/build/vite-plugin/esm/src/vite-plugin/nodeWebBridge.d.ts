import { IncomingMessage, ServerResponse } from 'node:http';
export declare function nodeRequestToWeb(req: IncomingMessage, isSecure?: boolean): Promise<Request>;
export declare function writeWebResponseToNode(webResponse: Response, res: ServerResponse): Promise<void>;
export declare function serveFetchHandler(handler: (req: Request) => Response | Promise<Response>, req: IncomingMessage, res: ServerResponse, isSecure?: boolean): Promise<void>;
//# sourceMappingURL=nodeWebBridge.d.ts.map