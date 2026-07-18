import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn } from "child_process";

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("[Server] Spawning Python FastAPI backend on port 8000...");
  
  // Spawn the FastAPI server in the background (runs uvicorn on port 8000)
  const fastapi = spawn("python3", ["main.py"], {
    stdio: "inherit",
    shell: true,
  });

  fastapi.on("error", (err) => {
    console.error("[Server] Failed to start Python FastAPI backend:", err);
  });

  // Ensure python process is killed when node exits
  const killFastApi = () => {
    console.log("[Server] Killing FastAPI backend...");
    fastapi.kill("SIGTERM");
  };
  
  process.on("exit", killFastApi);
  process.on("SIGINT", () => {
    killFastApi();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    killFastApi();
    process.exit(0);
  });

  // Wait a tiny bit for python server to spin up, then register proxy
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      ws: true,
      logger: console,
    })
  );

  // Vite middleware or static serving
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Starting Vite in middleware mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Production environment detected. Serving static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Core router running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Fatal server startup error:", err);
});
