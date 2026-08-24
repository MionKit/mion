//#region src/vite-plugin/nodeWebBridge.ts
/** Builds a web Request from node's IncomingMessage. */
async function nodeRequestToWeb(req, isSecure = false) {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === void 0) continue;
		if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
		else headers.set(key, value);
	}
	const host = req.headers.host || "localhost";
	const url = `${isSecure ? "https" : "http"}://${host}${req.url || "/"}`;
	const method = req.method || "GET";
	const body = method === "GET" || method === "HEAD" ? void 0 : await readBody(req);
	return new Request(url, {
		method,
		headers,
		body
	});
}
/** Writes a web Response back to node's ServerResponse. */
async function writeWebResponseToNode(webResponse, res) {
	res.statusCode = webResponse.status;
	const setCookie = webResponse.headers.getSetCookie?.() ?? [];
	if (setCookie.length) res.setHeader("set-cookie", setCookie);
	webResponse.headers.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie") return;
		res.setHeader(key, value);
	});
	if (!webResponse.body) {
		res.end();
		return;
	}
	res.end(Buffer.from(await webResponse.arrayBuffer()));
}
/** Serves one node request through a fetch-style handler. */
async function serveFetchHandler(handler, req, res, isSecure) {
	await writeWebResponseToNode(await handler(await nodeRequestToWeb(req, isSecure)), res);
}
/** Collects the request body (dev-only: buffered, not streamed). Copied into a Uint8Array backed by
*  a plain ArrayBuffer: node's Buffer (and any ArrayBufferLike-backed view) is not accepted as a
*  BodyInit under DOM lib settings, which the consuming project's tsconfig may well be on. */
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			chunks.push(chunk);
			size += chunk.byteLength;
		});
		req.on("error", reject);
		req.on("end", () => {
			if (!size) return resolve(void 0);
			const body = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				body.set(chunk, offset);
				offset += chunk.byteLength;
			}
			resolve(body);
		});
	});
}
//#endregion
export { nodeRequestToWeb, serveFetchHandler, writeWebResponseToNode };

//# sourceMappingURL=nodeWebBridge.js.map