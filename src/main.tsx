import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { TryOnPage } from "./components/tryon-page";
import "./styles.css";

/** /salon: the salon's inbox (its chats with customers); every other path: the try-on. */
const SalonInbox = lazy(() => import("./components/salon-inbox"));
const salon = location.pathname.replace(/\/+$/, "") === "/salon";
const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode>{salon ? <Suspense fallback={null}><SalonInbox /></Suspense> : <TryOnPage />}</React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}
