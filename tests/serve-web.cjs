// Serves web/ on a free local port for browser tests. Resolves to { base, close }.
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, extname, sep } = require('node:path');
const webRoot = resolve(__dirname, '../web');
const types = { '.js':'application/javascript', '.mjs':'application/javascript', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.ttf':'font/ttf' };

module.exports = async function serveWeb() {
  const server = createServer(async (request, response) => {
    const file = resolve(webRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(webRoot + sep)) { response.writeHead(404).end(); return; }
    try {
      const content = await readFile(file);
      response.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
      response.end(content);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return { base: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(ok => server.close(ok)) };
};
