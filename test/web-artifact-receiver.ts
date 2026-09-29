import fs from "node:fs/promises";
import http from "node:http";

export interface ArtifactReceiver {
  url: string;
  received: Promise<void>;
  close(): Promise<void>;
}

export async function startArtifactReceiver(
  artifactPath: string,
): Promise<ArtifactReceiver> {
  let resolveReceived: () => void;
  let rejectReceived: (error: Error) => void;
  const received = new Promise<void>((resolve, reject) => {
    resolveReceived = resolve;
    rejectReceived = reject;
  });
  const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/artifact") {
      response.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", async () => {
      try {
        await fs.writeFile(artifactPath, Buffer.concat(chunks));
        response.writeHead(204).end();
        resolveReceived();
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        response.writeHead(500).end();
        rejectReceived(failure);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Artifact receiver did not bind a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/artifact`,
    received,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
