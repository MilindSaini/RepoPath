import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";

/** Receives OpenTelemetry HTTP/JSON exports locally; protobuf OTLP needs an OTLP collector. */
export async function receiveTraces(port: number, output: string): Promise<void> {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") { response.writeHead(405).end("POST only"); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 10_000_000) { response.writeHead(413).end("Trace payload exceeds 10 MB limit"); request.destroy(); return; }
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      await writeFile(output, `${JSON.stringify(value, null, 2)}\n`);
      response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ accepted: true, output }));
    } catch { response.writeHead(400).end("Expected OpenTelemetry JSON payload"); }
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.error(`RepoPath trace receiver listening at http://127.0.0.1:${port}; writing ${output}`);
  await new Promise<void>(() => undefined);
}
