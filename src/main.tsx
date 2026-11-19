import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { TryOnPage } from "./components/tryon-page";
import "./styles.css";

/** /salon: the salon's inbox (its chats with customers); /bench: the artist's scores (the Phase 2 gate); else the try-on. */
const SalonInbox = lazy(() => import("./components/salon-inbox"));
const ArtistBench = lazy(() => import("./components/artist-bench"));
const path = location.pathname.replace(/\/+$/, "");
const page = path === "/salon" ? <SalonInbox /> : path === "/bench" ? <ArtistBench /> : null;
const root = document.getElementById("root");
if (root) createRoot(root).render(<React.StrictMode>{page ? <Suspense fallback={null}>{page}</Suspense> : <TryOnPage />}</React.StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
}
