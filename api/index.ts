import express from "express";

const app = express();

// Middleware to configure standard CORS headers
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, User-Agent");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Plaintext Proxy Endpoint
app.get("/api/proxy/plaintext", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    // Send standard IPTV smart user-agents to bypass blocks
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "IPTVSmarters/1.0.3",
        "Accept": "*/*"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Target server returned status ${response.status}` });
    }

    const text = await response.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(text);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch target URL" });
  }
});

// JSON Proxy Endpoint
app.get("/api/proxy/json", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "IPTVSmarters/1.0.3",
        "Accept": "application/json, text/plain, */*"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Target server returned status ${response.status}` });
    }

    const text = await response.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      // If the target didn't return valid JSON, respond with text
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(text);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch target URL" });
  }
});

// Stream Proxy Endpoint (Pipes raw livestream chunks to bypass Mixed Content + CORS + User-Agent blocks)
app.get("/api/stream", async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing stream URL parameter.");
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "IPTVSmarters/1.0.3"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to connect to stream: status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "video/mp2t";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (response.body) {
      const reader = response.body.getReader();
      
      req.on("close", () => {
        reader.cancel();
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      res.status(502).send("Target stream has empty body.");
    }
  } catch (error: any) {
    console.error("Stream Proxy error:", error);
    res.status(500).send(`Stream proxy error: ${error.message}`);
  }
});

// Health check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

export default app;
