import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNotificationInbox } from "./lib/notifications-init";

installNotificationInbox();

createRoot(document.getElementById("root")!).render(<App />);
