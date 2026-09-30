const path = require("path");
const express = require("express");
require("dotenv").config();

const pool = require("./db/connection");
const financeRoutes = require("./routes/finance.routes");
const errorHandler = require("./middleware/errorHandler");
const { identify, requireRole } = require("./middleware/identity");
const HttpError = require("./utils/httpError");
const swaggerUi = require("swagger-ui-express");
const openapi = require("./docs/openapi");

const app = express();
app.disable("x-powered-by");

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ service: "finance-service", status: "OK", database: "connected" });
  } catch (error) {
    res.status(500).json({ service: "finance-service", status: "ERROR", database: "not connected" });
  }
});

// Finance web pages (built from client-app/ into client/). The gateway forwards /finance/* here.
app.use("/finance", express.static(path.join(__dirname, "..", "client")));

app.use("/api/v1/finance/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.get("/api/v1/finance/openapi.json", (req, res) => res.json(openapi));

// Bursar work: school staff and administrators only.
app.use("/api/v1/finance", identify, requireRole("SUPER_ADMIN", "ADMIN", "STAFF"), financeRoutes);

app.use((req, res, next) => next(new HttpError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`)));
app.use(errorHandler);

module.exports = app;
