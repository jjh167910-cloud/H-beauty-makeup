import React from "react";
import { createRoot } from "react-dom/client";
import { SalonApp } from "./components/salon/salon-app";
import { TryOnPage } from "./components/tryon-page";
import "./styles.css";

// This site is the makeup try-on on its own; the whole salon app with VITE_SITE=salon (npm run dev:salon, the tests).
const site = import.meta.env.VITE_SITE === "salon" ? <SalonApp /> : <TryOnPage />;
const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode>{site}</React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}
