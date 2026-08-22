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
  return new Request(url, { method, headers, body });
}
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
async function serveFetchHandler(handler, req, res, isSecure) {
  const webResponse = await handler(await nodeRequestToWeb(req, isSecure));
  await writeWebResponseToNode(webResponse, res);
}
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
export {
  nodeRequestToWeb,
  serveFetchHandler,
  writeWebResponseToNode
};
//# sourceMappingURL=nodeWebBridge.js.map
