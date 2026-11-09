import React from "react";
import { createRoot } from "react-dom/client";
import { SalonApp } from "./components/salon/salon-app";
import "./styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode><SalonApp /></React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}
