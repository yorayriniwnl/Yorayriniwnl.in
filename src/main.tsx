import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";

const isWarRoom = document.documentElement.dataset.page === "war-room"
  || window.location.pathname.replace(/\/+$/, "") === "/3d";
const WarRoomPage = lazy(() => import("./PlayableWarRoomPage"));
const HomePage = lazy(() => import("./App"));
const Page = isWarRoom ? WarRoomPage : HomePage;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </React.StrictMode>,
);
