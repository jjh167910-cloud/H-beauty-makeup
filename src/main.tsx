import React from "react";
import { createRoot } from "react-dom/client";
import { TryOnPage } from "./components/tryon-page";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode><TryOnPage /></React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}
