import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
const Page = lazy(() => window.location.pathname.replace(/\/+$/, "") === "/3d"
  ? import("./PlayableWarRoomPage")
  : import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </React.StrictMode>,
);
