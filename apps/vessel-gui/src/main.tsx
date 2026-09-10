import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Убираем браузерный контекст-меню (перезагрузка/печать и т.п.)
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);