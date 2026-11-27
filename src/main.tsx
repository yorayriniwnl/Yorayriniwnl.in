import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";

const isWarRoom = document.documentElement.dataset.page === "war-room"
  || window.location.pathname.replace(/\/+$/, "") === "/3d";
const Page = lazy(() => isWarRoom
  ? import("./PlayableWarRoomPage")
  : import("./App"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </React.StrictMode>,
);
