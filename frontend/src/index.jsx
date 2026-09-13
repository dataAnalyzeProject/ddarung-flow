import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import StaticDemoApp from "./static-demo/StaticDemoApp";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <StaticDemoApp />
  </React.StrictMode>,
);

reportWebVitals();
