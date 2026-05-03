const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ✅ Health check
app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

// ✅ Root route
app.get("/", (req, res) => {
  res.json({
    message: "n8n MCP Proxy Server is running",
    status: "online",
  });
});

// ✅ 🔥 MCP discovery
app.get("/.well-known/ai-plugin.json", (req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "n8n MCP",
    name_for_model: "n8n_mcp",
    description_for_human: "n8n MCP proxy",
    description_for_model: "Proxy to n8n MCP server",
    api: {
      type: "openapi",
      url: "https://fineness-mutilated-strudel.ngrok-free.dev/mcp-proxy",
    },
    auth: {
      type: "none",
    },
  });
});

// ✅ 🔥 MCP PROXY (GET + POST)
app.all("/mcp-proxy", async (req, res) => {
  console.log("🔥 Incoming:", {
    method: req.method,
    body: req.body,
    query: req.query,
  });

  // ✅ Claude handshake
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      jsonrpc: "2.0",
      capabilities: {
        tools: {},
      },
    });
  }

  try {
    // ✅ Forward to n8n MCP
    const response = await axios({
      method: "post",
      url: "http://localhost:5678/mcp-server/http",
      data: req.body,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    res.json(response.data);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(500).json({
      error: "Failed to reach n8n MCP",
      details: err.message,
    });
  }
});

// ✅ Test route
app.post("/send", async (req, res) => {
  try {
    const response = await axios.post(
      "http://localhost:5678/webhook/test",
      { message: "Hello from Node" }
    );

    res.json(response.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error connecting to n8n");
  }
});

// Start server
const PORT = process.env.PORT || 3002; // Using 3002 to avoid conflict if both run
app.listen(PORT, () => {
  console.log(`n8n MCP Proxy running on http://localhost:${PORT}`);
});