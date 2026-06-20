import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installNotificationInbox } from "./lib/notifications-init";
import { registerPWA } from "./lib/pwa-register";

installNotificationInbox();
registerPWA();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
