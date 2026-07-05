import express from "express";
import { Readable } from "stream";
import http from "http";
import https from "https";
import { URL } from "url";

// Disable SSL certificate verification globally for proxy fetches.
// A significant number of IPTV providers use expired, generic, or self-signed certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

// Helper to perform quick connect check of stream with redirect following and User-Agent preservation
function testStreamUrl(targetUrl: string, res: express.Response, redirectCount = 0) {
  if (redirectCount > 5) {
    return res.json({ status: "dead", error: "Too many redirects" });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    const options: any = {
      method: "GET",
      headers: {
        "User-Agent": "IPTVSmarters/1.0.3",
        "Accept": "*/*"
      },
      rejectUnauthorized: false
    };

    const req = client.get(targetUrl, options, (proxyRes) => {
      if (proxyRes.statusCode && [301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        const location = proxyRes.headers.location;
        if (location) {
          const redirectUrl = new URL(location, targetUrl).toString();
          testStreamUrl(redirectUrl, res, redirectCount + 1);
          return;
        }
      }

      // Immediately close and destroy connection to save bandwith
      proxyRes.destroy();

      if (proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 400) {
        return res.json({ status: "working", httpStatus: proxyRes.statusCode });
      } else {
        return res.json({ status: "dead", error: `HTTP ${proxyRes.statusCode}` });
      }
    });

    req.setTimeout(8000, () => {
      req.destroy();
      if (!res.headersSent) {
        res.json({ status: "dead", error: "Connection timeout" });
      }
    });

    req.on("error", (err) => {
      req.destroy();
      if (!res.headersSent) {
        res.json({ status: "dead", error: err.message || "Connection failed" });
      }
    });

  } catch (err: any) {
    if (!res.headersSent) {
      res.json({ status: "dead", error: err.message || "Invalid URL" });
    }
  }
}

// Fast Stream Testing Proxy Endpoint (Aborted GET request to check stream online status with minimal bandwidth)
app.get("/api/proxy/test", (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }
  testStreamUrl(targetUrl, res);
});

// Helper to rewrite .m3u8 content, converting relative segment/sub-playlist URLs to go through our proxy
function rewriteM3U8(content: string, baseUrl: string, reqOrigin: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  
  let baseParsed: URL | null = null;
  try {
    baseParsed = new URL(baseUrl);
  } catch {}

  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Case 1: Line is a URI (does not start with #)
    if (!trimmed.startsWith('#')) {
      try {
        const resolvedUrl = new URL(trimmed, baseUrl);
        
        // Propagate search params (like tokens/auth) from baseUrl to resolved segment URL if missing
        if (baseParsed && baseParsed.search && !resolvedUrl.search) {
          resolvedUrl.search = baseParsed.search;
        }
        
        return `${reqOrigin}/api/stream?url=${encodeURIComponent(resolvedUrl.toString())}`;
      } catch {
        return line;
      }
    }

    // Case 2: Tag contains URI="..." attribute (e.g. #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA)
    if (trimmed.startsWith('#')) {
      return line.replace(/URI=["']([^"']+)["']/g, (match, p1) => {
        try {
          const resolvedUrl = new URL(p1, baseUrl);
          
          if (baseParsed && baseParsed.search && !resolvedUrl.search) {
            resolvedUrl.search = baseParsed.search;
          }
          
          return `URI="${reqOrigin}/api/stream?url=${encodeURIComponent(resolvedUrl.toString())}"`;
        } catch {
          return match;
        }
      });
    }

    return line;
  });

  return rewrittenLines.join('\n');
}

// Helper to pipe infinite live streams with redirect following and User-Agent preservation
function pipeStream(targetUrl: string, req: express.Request, res: express.Response, redirectCount = 0) {
  if (redirectCount > 5) {
    res.status(502).send("Too many redirects");
    return;
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    const options: any = {
      method: "GET",
      headers: {
        "User-Agent": "IPTVSmarters/1.0.3",
        "Accept": "*/*",
        "Connection": "keep-alive"
      },
      rejectUnauthorized: false
    };

    const proxyReq = client.get(targetUrl, options, (proxyRes) => {
      if (proxyRes.statusCode && [301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        const location = proxyRes.headers.location;
        if (location) {
          const redirectUrl = new URL(location, targetUrl).toString();
          console.log(`Piping redirect: ${redirectUrl}`);
          pipeStream(redirectUrl, req, res, redirectCount + 1);
          return;
        }
      }

      // Configure headers
      res.statusCode = proxyRes.statusCode || 200;
      const contentType = proxyRes.headers["content-type"] || "";
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Connection", "keep-alive");

      const isM3U8 = (contentType.toLowerCase().includes("mpegurl") || 
                      contentType.toLowerCase().includes("m3u8") || 
                      targetUrl.toLowerCase().split('?')[0].endsWith(".m3u8"));

      if (isM3U8) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        
        let rawContent = "";
        proxyRes.on("data", (chunk) => {
          rawContent += chunk.toString("utf8");
        });
        
        proxyRes.on("end", () => {
          const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
          const reqOrigin = `${protocol}://${req.get("host")}`;
          
          const rewrittenContent = rewriteM3U8(rawContent, targetUrl, reqOrigin);
          res.send(rewrittenContent);
        });

        proxyRes.on("error", (err) => {
          console.error("m3u8 reading/parsing error:", err);
          if (!res.headersSent) {
            res.status(502).send(`Error reading stream manifest: ${err.message}`);
          }
        });
      } else {
        const finalContentType = contentType || "video/mp2t";
        res.setHeader("Content-Type", finalContentType);
        // Direct streaming pipe
        proxyRes.pipe(res);
      }

      req.on("close", () => {
        proxyRes.destroy();
      });
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy stream request error:", err);
      if (!res.headersSent) {
        res.status(502).send(`Stream proxy connection failed: ${err.message}`);
      }
    });

  } catch (err: any) {
    console.error("Proxy stream invalid URL:", err);
    if (!res.headersSent) {
      res.status(400).send(`Invalid stream URL: ${err.message}`);
    }
  }
}

// Stream Proxy Endpoint (Pipes raw livestream chunks to bypass Mixed Content + CORS + User-Agent blocks)
app.get("/api/stream", (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send("Missing stream URL parameter.");
  }
  pipeStream(targetUrl, req, res);
});

// Health check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

export default app;
