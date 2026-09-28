require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "OK"
  });
});

// Route requests to the correct services
app.use(
  "/api/auth",
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/auth": ""
    }
  })
);

app.use(
  "/api/academic",
  createProxyMiddleware({
    target: process.env.ACADEMIC_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/academic": ""
    }
  })
);

app.use(
  "/api/finance",
  createProxyMiddleware({
    target: process.env.FINANCE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/finance": ""
    }
  })
);

app.use(
  "/api/hr",
  createProxyMiddleware({
    target: process.env.HR_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/hr": ""
    }
  })
);

app.use(
  "/api/notifications",
  createProxyMiddleware({
    target: process.env.NOTIFICATION_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      "^/api/notifications": ""
    }
  })
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});