import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { session } from "./api";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Not signed in: the shared sign-in page sends the user back here afterwards.
session()
  .then(({ requireSession }) => {
    if (!requireSession()) return;
    window.addEventListener("auth:expired", () => requireSession());
    root.render(<React.StrictMode><App /></React.StrictMode>);
  })
  .catch(() => {
    root.render(<p style={{ padding: 30 }}>Cannot load the ERP sign-in module. Open this page through the gateway (http://localhost:3000/finance/).</p>);
  });
