const express = require("express");
require("dotenv").config();

const pool = require("./db/connection");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      service: "finance-service",
      status: "OK",
      database: "connected"
    });
  } catch (error) {
    res.status(500).json({
      service: "finance-service",
      status: "ERROR",
      database: "not connected"
    });
  }
});

module.exports = app;