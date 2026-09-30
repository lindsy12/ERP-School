const express = require("express");
require("dotenv").config();

const pool = require("./db/connection");
const financeRoutes = require("./routes/finance.routes");
const errorHandler = require("./middleware/errorHandler");
const swaggerUi = require("swagger-ui-express");
const openapi = require("./docs/openapi");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ service: "finance-service", status: "OK", database: "connected" });
  } catch (error) {
    res.status(500).json({ service: "finance-service", status: "ERROR", database: "not connected" });
  }
});

app.use("/api/v1/finance", financeRoutes);
app.use("/api/v1/finance/docs", swaggerUi.serve, swaggerUi.setup(openapi));
app.get("/api/v1/finance/openapi.json", (req, res) => res.json(openapi));
app.use(errorHandler);

module.exports = app;
