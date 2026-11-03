import { createRoot } from "react-dom/client";
import "@/shared/styles/global.css";
import App from "@/app/App";

/* 不启用 StrictMode：双调用 effect 会重放入场时间线 */
createRoot(document.getElementById("root")!).render(<App />);
