import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CinematicWarRoom, type CinematicTelemetry } from "./CinematicWarRoom";
import {
  CINEMATIC_HOTSPOTS,
  CINEMATIC_HOTSPOT_BY_ID,
  computeCoverTransform,
  createStaticCameraFrame,
  DEFAULT_FOCUS_BAND,
  DEFAULT_FOCUS_DEPTH,
  hitTestPlateHotspot,
  projectPlatePointToViewport,
  type CinematicCameraFrame,
  type CinematicHotspot,
} from "../data/cinematicHotspots";
import type { HotspotConfig, HotspotId } from "../data/hubData";

export type WarRoomCinematicProps = {
  selectedHotspot: HotspotId | null;
  onSelectHotspot: (hotspot: HotspotConfig | null) => void;
  lanternBright: boolean;
  onToggleLantern: () => void;
  onOpenAssets: () => void;
  inputSuspended?: boolean;
};

const FALLBACK_PAINTING_URL = "/cinematic/painting-2k.jpg";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("rm") || params.get("reducedMotion") === "1") return true;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("rm") || params.get("reducedMotion") === "1") {
      setReduced(true);
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return reduced;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatFocusMeters(depth: number): string {
  const meters = clamp(0.65 + Math.pow(1 - depth, 1.8) * 5.8, 0.65, 6.5);
  return `${meters.toFixed(1)}M`;
}

function computeReticlePlacement(
  anchorX: number,
  anchorY: number,
  item: CinematicHotspot,
  viewW: number,
  viewH: number,
  drawerOpen: boolean,
): { cardX: number; cardY: number; elbowX: number; elbowY: number } {
  const cardW = Math.min(264, Math.max(196, viewW - 32));
  const cardH = 92;
  const padX = 16;
  const topBound = 76;
  const bottomBound = viewH - 96;
  const rightMargin = drawerOpen && viewW > 820 ? Math.min(440, viewW * 0.42) + 28 : 16;
  const maxCardLeft = Math.max(padX, viewW - rightMargin - cardW);

  let idealLeft = anchorX - cardW * 0.5;
  let idealTop = anchorY - cardH - 36;

  if (item.labelSide === "left") {
    idealLeft = anchorX - cardW - 44;
    idealTop = anchorY - cardH * 0.5;
  } else if (item.labelSide === "right") {
    idealLeft = anchorX + 44;
    idealTop = anchorY - cardH * 0.5;
  } else if (item.labelSide === "bottom") {
    idealLeft = anchorX - cardW * 0.5;
    idealTop = anchorY + 38;
  }

  if (item.labelSide === "right" && idealLeft > maxCardLeft) {
    idealLeft = anchorX - cardW - 44;
  } else if (item.labelSide === "left" && idealLeft < padX) {
    idealLeft = anchorX + 44;
  } else if (item.labelSide === "top" && idealTop < topBound) {
    idealTop = anchorY + 38;
  }

  const cardX = clamp(idealLeft, padX, maxCardLeft);
  const cardY = clamp(idealTop, topBound, Math.max(topBound, bottomBound - cardH));

  const cardCenterX = cardX + cardW * 0.5;
  const cardCenterY = cardY + cardH * 0.5;
  const elbowX =
    Math.abs(cardCenterX - anchorX) > cardW * 0.45
      ? cardCenterX > anchorX
        ? cardX
        : cardX + cardW
      : cardCenterX;
  const elbowY =
    Math.abs(cardCenterX - anchorX) > cardW * 0.45
      ? cardCenterY
      : cardCenterY > anchorY
        ? cardY
        : cardY + cardH;

  return { cardX, cardY, elbowX, elbowY };
}

export default function WarRoomCinematic({
  selectedHotspot,
  onSelectHotspot,
  lanternBright,
  onToggleLantern,
  onOpenAssets,
  inputSuspended = false,
}: WarRoomCinematicProps) {
  const reducedMotion = usePrefersReducedMotion();
  const stageRef = useRef<HTMLElement | null>(null);

  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 1280, h: 720 });
  const [fallbackActive, setFallbackActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("fallback") || params.has("nowebgl");
  });
  const [ready, setReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [hoveredId, setHoveredId] = useState<HotspotId | null>(null);
  const [focusedId, setFocusedId] = useState<HotspotId | null>(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [letterbox, setLetterbox] = useState(false);
  const [telemetry, setTelemetry] = useState<CinematicTelemetry | null>(null);

  const hoveredItem = hoveredId ? CINEMATIC_HOTSPOT_BY_ID.get(hoveredId) ?? null : null;
  const focusedItem = focusedId ? CINEMATIC_HOTSPOT_BY_ID.get(focusedId) ?? null : null;
  const selectedItem = selectedHotspot
    ? CINEMATIC_HOTSPOT_BY_ID.get(selectedHotspot) ?? null
    : null;
  const reticleItem = hoveredItem ?? focusedItem;
  const activeItem = reticleItem ?? selectedItem;
  const visibleReticleItem =
    reticleItem && reticleItem.id !== selectedHotspot ? reticleItem : null;

  const activeItemRef = useRef<CinematicHotspot | null>(activeItem);
  activeItemRef.current = activeItem;
  const selectedHotspotRef = useRef<HotspotId | null>(selectedHotspot);
  selectedHotspotRef.current = selectedHotspot;
  const inputSuspendedRef = useRef(inputSuspended);
  inputSuspendedRef.current = inputSuspended;

  const coverTransform = useMemo(
    () => computeCoverTransform(viewport.w, viewport.h),
    [viewport.w, viewport.h],
  );
  const cameraFrameRef = useRef<CinematicCameraFrame>(
    createStaticCameraFrame(viewport.w, viewport.h),
  );

  // Direct DOM refs so 60fps camera/parallax overlay projection triggers ZERO React re-renders
  const markerBtnRefs = useRef<Partial<Record<HotspotId, HTMLButtonElement | null>>>({});
  const outlineGlowRef = useRef<SVGPolygonElement | null>(null);
  const outlineFillRef = useRef<SVGPolygonElement | null>(null);
  const outlineCoreRef = useRef<SVGPolygonElement | null>(null);
  const outlineDashRef = useRef<SVGPolygonElement | null>(null);
  const fallbackMaskPolyRef = useRef<SVGPolygonElement | null>(null);
  const reticleAnchorGroupRef = useRef<SVGGElement | null>(null);
  const reticleLeaderRef = useRef<SVGPolylineElement | null>(null);
  const reticleCardRef = useRef<HTMLDivElement | null>(null);
  const lastTriggerRef = useRef<HotspotId | null>(null);

  const syncOverlayGeometry = useCallback((frame: CinematicCameraFrame) => {
    cameraFrameRef.current = frame;

    for (const item of CINEMATIC_HOTSPOTS) {
      const btn = markerBtnRefs.current[item.id];
      if (!btn) continue;
      const [rawX, rawY] = projectPlatePointToViewport(
        item.anchor[0],
        item.anchor[1],
        item.parallaxDepth,
        frame,
      );
      const ax = clamp(rawX, 22, Math.max(22, frame.viewW - 22));
      const ay = clamp(rawY, 22, Math.max(22, frame.viewH - 22));
      btn.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)`;
    }

    const active = activeItemRef.current;
    if (!active) return;

    const pointsStr = active.polygon
      .map(([u, v]) => {
        const [sx, sy] = projectPlatePointToViewport(u, v, active.parallaxDepth, frame);
        return `${sx.toFixed(1)},${sy.toFixed(1)}`;
      })
      .join(" ");

    if (outlineGlowRef.current) outlineGlowRef.current.setAttribute("points", pointsStr);
    if (outlineFillRef.current) outlineFillRef.current.setAttribute("points", pointsStr);
    if (outlineCoreRef.current) outlineCoreRef.current.setAttribute("points", pointsStr);
    if (outlineDashRef.current) outlineDashRef.current.setAttribute("points", pointsStr);
    if (fallbackMaskPolyRef.current) fallbackMaskPolyRef.current.setAttribute("points", pointsStr);

    const [rawAx, rawAy] = projectPlatePointToViewport(
      active.anchor[0],
      active.anchor[1],
      active.parallaxDepth,
      frame,
    );
    const ax = clamp(rawAx, 22, Math.max(22, frame.viewW - 22));
    const ay = clamp(rawAy, 22, Math.max(22, frame.viewH - 22));

    if (reticleAnchorGroupRef.current) {
      reticleAnchorGroupRef.current.setAttribute(
        "transform",
        `translate(${ax.toFixed(1)}, ${ay.toFixed(1)})`,
      );
    }

    const { cardX, cardY, elbowX, elbowY } = computeReticlePlacement(
      ax,
      ay,
      active,
      frame.viewW,
      frame.viewH,
      Boolean(selectedHotspotRef.current),
    );

    if (reticleLeaderRef.current) {
      const midX = ax + (elbowX - ax) * 0.48;
      reticleLeaderRef.current.setAttribute(
        "points",
        `${ax.toFixed(1)},${ay.toFixed(1)} ${midX.toFixed(1)},${elbowY.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)}`,
      );
    }

    if (reticleCardRef.current) {
      reticleCardRef.current.style.transform = `translate3d(${cardX.toFixed(1)}px, ${cardY.toFixed(1)}px, 0)`;
    }
  }, []);

  // Measure viewport dimensions cleanly
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ w: rect.width, h: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep overlay geometry synchronized on fallback mode, resize, or selection changes
  useEffect(() => {
    if (fallbackActive) {
      syncOverlayGeometry(createStaticCameraFrame(viewport.w, viewport.h));
    } else {
      syncOverlayGeometry(cameraFrameRef.current);
    }
  }, [activeItem, fallbackActive, selectedHotspot, viewport.w, viewport.h, syncOverlayGeometry]);

  // Restore focus to the last activated hotspot button when drawer closes
  const prevSelectedRef = useRef<HotspotId | null>(selectedHotspot);
  useEffect(() => {
    if (prevSelectedRef.current && !selectedHotspot && lastTriggerRef.current) {
      const btn = markerBtnRefs.current[lastTriggerRef.current];
      if (btn && document.activeElement === document.body) {
        btn.focus({ preventScroll: true });
      }
    }
    prevSelectedRef.current = selectedHotspot;
  }, [selectedHotspot]);

  const handleEngineReady = useCallback(() => {
    setLoadProgress(100);
    setReady(true);
  }, []);

  const handleEngineProgress = useCallback((progress: number) => {
    setLoadProgress(Math.round(progress * 100));
  }, []);

  const handleEngineError = useCallback((err: Error) => {
    console.warn("Cinematic WebGL unavailable, activating static fallback:", err.message);
    setFallbackActive(true);
    setReady(true);
  }, []);

  const activateHotspot = useCallback(
    (item: CinematicHotspot) => {
      lastTriggerRef.current = item.id;
      onSelectHotspot(item.hotspot);
    },
    [onSelectHotspot],
  );

  const handleStagePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (inputSuspendedRef.current) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(".warroom-dock, .warroom-drawer, .warroom-mode-switch, .warroom-badge")
    ) {
      setHoveredId(null);
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const hit = hitTestPlateHotspot(localX, localY, cameraFrameRef.current);
    setHoveredId(hit?.id ?? null);
  }, []);

  const handleStagePointerLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  const handleStageClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (inputSuspendedRef.current) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button, a, .warroom-dock, .warroom-drawer, .warroom-mode-switch, .warroom-badge",
        )
      ) {
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const hit = hitTestPlateHotspot(localX, localY, cameraFrameRef.current);
      if (hit) {
        activateHotspot(hit);
      } else if (selectedHotspotRef.current) {
        onSelectHotspot(null);
      }
    },
    [activateHotspot, onSelectHotspot],
  );

  const focusHotspotAtIndex = useCallback((index: number) => {
    const total = CINEMATIC_HOTSPOTS.length;
    const wrapped = ((index % total) + total) % total;
    const target = CINEMATIC_HOTSPOTS[wrapped];
    setFocusedId(target.id);
    markerBtnRefs.current[target.id]?.focus({ preventScroll: true });
  }, []);

  const handleHotspotKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number, item: CinematicHotspot) => {
      if (inputSuspendedRef.current) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusHotspotAtIndex(index + 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusHotspotAtIndex(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusHotspotAtIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusHotspotAtIndex(CINEMATIC_HOTSPOTS.length - 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setFocusedId(null);
        event.currentTarget.blur();
        if (selectedHotspotRef.current) onSelectHotspot(null);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateHotspot(item);
      }
    },
    [activateHotspot, focusHotspotAtIndex, onSelectHotspot],
  );

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (inputSuspendedRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === "m" || event.key === "M") {
        setShowMarkers((v) => !v);
        return;
      }

      if (
        !selectedHotspotRef.current &&
        (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
        !target?.closest(".cinematic-markers")
      ) {
        event.preventDefault();
        focusHotspotAtIndex(event.key === "ArrowRight" ? 0 : CINEMATIC_HOTSPOTS.length - 1);
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [focusHotspotAtIndex]);

  const targetFocusDepth = activeItem ? activeItem.focusDepth : DEFAULT_FOCUS_DEPTH;
  const targetFocusBand = activeItem ? activeItem.focusBand : DEFAULT_FOCUS_BAND;
  const targetDofStrength = activeItem ? 0.52 : 0.06;

  const stageClassName =
    "warroom-stage cinematic-stage" +
    (hoveredItem ? " is-hotspot-hover" : "") +
    (reducedMotion ? " is-reduced-motion" : "") +
    (fallbackActive ? " is-fallback" : "");

  return (
    <section
      ref={stageRef}
      className={stageClassName}
      aria-label="Cinematic War Room interactive scene"
      onPointerMove={handleStagePointerMove}
      onPointerLeave={handleStagePointerLeave}
      onClick={handleStageClick}
    >
      {/* WebGL Living-Painting Engine with Golden-Angle Bokeh -> Emissive UnrealBloom -> ACES Grade + Depth-Occluded 3D Particles */}
      {!fallbackActive && (
        <CinematicWarRoom
          className="cinematic-canvas"
          paused={inputSuspended}
          focusDepth={targetFocusDepth}
          focusBand={targetFocusBand}
          dofStrength={targetDofStrength}
          lanternBright={lanternBright}
          letterbox={letterbox}
          onCameraFrame={syncOverlayGeometry}
          onTelemetry={setTelemetry}
          onReady={handleEngineReady}
          onProgress={handleEngineProgress}
          onError={handleEngineError}
        />
      )}

      {/* Graceful Non-WebGL Fallback with CSS feathered Depth-of-Field spotlight */}
      {fallbackActive && (
        <div className="cinematic-fallback" aria-hidden="true">
          <img
            src={FALLBACK_PAINTING_URL}
            alt="YOR War Room cinematic painting"
            className="cinematic-fallback__img"
            onLoad={() => setReady(true)}
            style={{
              left: `${coverTransform.offsetX}px`,
              top: `${coverTransform.offsetY}px`,
              width: `${coverTransform.drawW}px`,
              height: `${coverTransform.drawH}px`,
            }}
          />
          <div
            className={
              "cinematic-fallback__blur-wrap" + (activeItem ? " is-active" : "")
            }
            style={{
              mask: activeItem ? "url(#cinematic-fallback-dof-mask)" : undefined,
              WebkitMask: activeItem ? "url(#cinematic-fallback-dof-mask)" : undefined,
            }}
          >
            <img
              src={FALLBACK_PAINTING_URL}
              alt=""
              className="cinematic-fallback__blur"
              style={{
                left: `${coverTransform.offsetX}px`,
                top: `${coverTransform.offsetY}px`,
                width: `${coverTransform.drawW}px`,
                height: `${coverTransform.drawH}px`,
              }}
            />
          </div>
        </div>
      )}

      {!ready && (
        <div className="warroom-loader" role="status" aria-live="polite">
          <div className="warroom-loader__ring" />
          <span>LOADING CINEMATIC WAR ROOM</span>
          <strong>{loadProgress}%</strong>
          <small>Adaptive Plate · Depth Particles · Golden-Angle Bokeh · UnrealBloom · ACES Grade</small>
        </div>
      )}

      {fallbackActive && <div className="warroom-vignette" aria-hidden="true" />}

      {/* Precision SVG overlay: glowing silhouette outline, reticle target, leader line & fallback mask */}
      <svg
        className="cinematic-svg"
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        aria-hidden="true"
      >
        <defs>
          <filter id="cinematic-outline-glow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="5.5" result="blurOuter" />
            <feGaussianBlur stdDeviation="2.0" result="blurInner" />
            <feMerge>
              <feMergeNode in="blurOuter" />
              <feMergeNode in="blurInner" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {fallbackActive && (
            <>
              <filter id="cinematic-fallback-feather" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
              <mask
                id="cinematic-fallback-dof-mask"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={viewport.w}
                height={viewport.h}
              >
                <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
                <polygon
                  ref={fallbackMaskPolyRef}
                  points=""
                  fill="black"
                  filter="url(#cinematic-fallback-feather)"
                />
              </mask>
            </>
          )}
        </defs>

        {activeItem && (
          <g className="cinematic-outline-group">
            <polygon ref={outlineFillRef} points="" className="cinematic-outline__fill" />
            <polygon
              ref={outlineGlowRef}
              points=""
              className="cinematic-outline__glow"
              filter="url(#cinematic-outline-glow)"
            />
            <polygon ref={outlineCoreRef} points="" className="cinematic-outline__core" />
            <polygon ref={outlineDashRef} points="" className="cinematic-outline__dash" />
            {visibleReticleItem && (
              <>
                <polyline ref={reticleLeaderRef} points="" className="cinematic-reticle-leader" />
                <g ref={reticleAnchorGroupRef} className="cinematic-reticle-node">
                  <circle r="13" className="cinematic-reticle-node__ring" />
                  <path d="M -18 0 L -8 0 M 8 0 L 18 0 M 0 -18 L 0 -8 M 0 8 L 0 18" />
                  <circle r="2.8" className="cinematic-reticle-node__dot" />
                </g>
              </>
            )}
          </g>
        )}
      </svg>

      {/* Accessible keyboard-navigable hotspot markers (Tab / Arrow keys / Enter / Space) */}
      <div
        className={"cinematic-markers" + (showMarkers ? "" : " is-subtle")}
        role="group"
        aria-label="War Room interactive hotspots"
      >
        {CINEMATIC_HOTSPOTS.map((item, index) => {
          const isActive = activeItem?.id === item.id;
          const isSelected = selectedHotspot === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                markerBtnRefs.current[item.id] = node;
              }}
              type="button"
              className={
                "cinematic-marker" +
                (isActive ? " is-active" : "") +
                (isSelected ? " is-selected" : "")
              }
              aria-label={`${item.hotspot.label}: ${item.hotspot.subtitle}`}
              aria-expanded={isSelected}
              onFocus={() => setFocusedId(item.id)}
              onBlur={() => setFocusedId((prev) => (prev === item.id ? null : prev))}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
              onClick={() => activateHotspot(item)}
              onKeyDown={(event) => handleHotspotKeyDown(event, index, item)}
            >
              <span className="cinematic-marker__ring" aria-hidden="true" />
              <span className="cinematic-marker__dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Tactical Reticle Label anchored to active hovered/focused hotspot */}
      {visibleReticleItem && (
        <div
          ref={reticleCardRef}
          className="cinematic-reticle-card"
          role="status"
          aria-live="polite"
        >
          <div className="cinematic-reticle-card__top">
            <span>{visibleReticleItem.hotspot.code}</span>
            <small>DOF {formatFocusMeters(visibleReticleItem.focusDepth)}</small>
          </div>
          <strong>{visibleReticleItem.hotspot.label}</strong>
          <p>{visibleReticleItem.hotspot.subtitle}</p>
          <div className="cinematic-reticle-card__hint">
            <span>
              {visibleReticleItem.hotspot.directGame ? "DIRECT GAME LAUNCH" : "INSPECT STATION"}
            </span>
            <small>CLICK / ENTER</small>
          </div>
        </div>
      )}

      {/* Top-left Sector Badge */}
      <div className="warroom-badge">
        <span>
          SECTOR 02 //{" "}
          {fallbackActive
            ? "CINEMATIC FALLBACK (NO WEBGL)"
            : reducedMotion
              ? "CINEMATIC // REDUCED MOTION"
              : "CINEMATIC WAR ROOM"}
        </span>
        <small>
          {fallbackActive
            ? "WebGL unavailable · Static scene active · Hover or Tab to inspect"
            : "Hover or Tab to refocus depth of field · Click or Enter to inspect · M pins"}
        </small>
      </div>

      {/* Bottom Centered Tactical Dock (keeps foreground Chess Knight, Notebook, and Laptop unobstructed) */}
      <div
        className="warroom-dock cinematic-dock"
        role="toolbar"
        aria-label="Cinematic War Room controls"
      >
        <div className="warroom-dock__presets cinematic-dock__status">
          <span className="cinematic-dock__readout">
            <b>{activeItem ? activeItem.hotspot.code : `${CINEMATIC_HOTSPOTS.length} STATIONS`}</b>
            <small>
              {activeItem
                ? `FOCUS ${formatFocusMeters(activeItem.focusDepth)}`
                : "TAB / ARROWS TO CYCLE"}
            </small>
          </span>
          <button
            type="button"
            className={showMarkers ? "is-active" : ""}
            aria-pressed={showMarkers}
            onClick={() => setShowMarkers((v) => !v)}
            title="Toggle subtle station pins (M)"
          >
            Pins {showMarkers ? "On" : "Off"}
          </button>
          {telemetry && !fallbackActive && (
            <span className="warroom-telemetry" aria-label="Render performance">
              <b>{telemetry.plateTier.toUpperCase()}</b>
              <i>{telemetry.fps} FPS</i>
              <small>{telemetry.scale.toFixed(2)}×</small>
            </span>
          )}
          <button
            type="button"
            className={letterbox ? "is-active" : ""}
            aria-pressed={letterbox}
            onClick={() => setLetterbox((v) => !v)}
            title="Toggle cinematic letterbox bars"
          >
            Bars {letterbox ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={lanternBright ? "is-active" : ""}
            aria-pressed={lanternBright}
            onClick={onToggleLantern}
            title="Toggle crimson cage lantern intensity"
          >
            Lantern {lanternBright ? "High" : "Dim"}
          </button>
          <button
            type="button"
            onClick={onOpenAssets}
            title="Download Blender GLB files and 4K render"
          >
            GLBs &amp; 4K
          </button>
        </div>
      </div>
    </section>
  );
}
