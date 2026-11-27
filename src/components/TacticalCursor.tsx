import { useEffect, useRef } from "react";

type CursorMode = "default" | "canvas" | "hotspot" | "interactive" | "dragging" | "native";

type CursorStateEvent = CustomEvent<{ mode: CursorMode }>;

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], summary, label[for]';
const NATIVE_SELECTOR = 'input, textarea, select, [contenteditable="true"], .game-room';
const IDLE_HIDE_MS = 1600;

export default function TacticalCursor({ enabled }: { enabled: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dotPosRef = useRef<HTMLDivElement | null>(null);
  const ringPosRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (!enabled) {
      html.classList.remove("has-custom-cursor");
      return;
    }

    const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let isFine = fineQuery.matches;
    let isReduced = reducedQuery.matches;

    const syncRootClass = () => {
      html.classList.toggle("has-custom-cursor", isFine);
    };
    syncRootClass();

    const root = rootRef.current;
    const dotPos = dotPosRef.current;
    const ringPos = ringPosRef.current;
    if (!root || !dotPos || !ringPos) {
      return () => {
        html.classList.remove("has-custom-cursor");
      };
    }

    let targetX = -100;
    let targetY = -100;
    let ringX = -100;
    let ringY = -100;
    let lastWakeX = -100;
    let lastWakeY = -100;
    let visible = false;
    let idleHidden = false;
    let pressed = false;
    let mode: CursorMode = "default";
    let rafId = 0;
    let idleTimer: number | null = null;

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const applyVisualState = () => {
      const show = isFine && visible && !idleHidden && mode !== "dragging" && mode !== "native";
      root.dataset.visible = show ? "true" : "false";
      root.dataset.mode = mode;
      root.dataset.pressed = pressed ? "true" : "false";
    };

    const scheduleIdleHide = () => {
      clearIdleTimer();
      if (mode === "canvas" || mode === "hotspot") {
        idleTimer = window.setTimeout(() => {
          idleHidden = true;
          lastWakeX = targetX;
          lastWakeY = targetY;
          applyVisualState();
        }, IDLE_HIDE_MS);
      }
    };

    const stopRaf = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const stepRing = () => {
      rafId = 0;
      if (isReduced) {
        ringX = targetX;
        ringY = targetY;
      } else {
        const dx = targetX - ringX;
        const dy = targetY - ringY;
        if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
          ringX = targetX;
          ringY = targetY;
        } else {
          ringX += dx * 0.28;
          ringY += dy * 0.28;
          rafId = window.requestAnimationFrame(stepRing);
        }
      }
      ringPos.style.transform = `translate3d(${ringX.toFixed(2)}px, ${ringY.toFixed(2)}px, 0)`;
    };

    const ensureRaf = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(stepRing);
      }
    };

    const resolveModeFromElement = (el: Element | null): CursorMode => {
      if (!el) return "default";
      if (el.closest(NATIVE_SELECTOR)) return "native";
      if (el instanceof HTMLCanvasElement && el.closest(".warroom-stage")) {
        const ds = el.dataset.cursor as CursorMode | undefined;
        if (ds === "dragging" || ds === "hotspot" || ds === "canvas") return ds;
        return "canvas";
      }
      if (el.closest(INTERACTIVE_SELECTOR)) return "interactive";
      return "default";
    };

    const setMode = (next: CursorMode) => {
      if (mode === next) return;
      mode = next;
      if (mode === "dragging" || mode === "native") {
        clearIdleTimer();
      } else if (visible && !idleHidden) {
        scheduleIdleHide();
      }
      applyVisualState();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isFine || e.pointerType === "touch") return;
      const x = e.clientX;
      const y = e.clientY;
      const wasHidden = !visible || idleHidden || mode === "dragging" || mode === "native";

      targetX = x;
      targetY = y;
      dotPos.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      if (idleHidden) {
        if (Math.hypot(x - lastWakeX, y - lastWakeY) < 3) return;
        idleHidden = false;
      }

      if (wasHidden || isReduced) {
        ringX = x;
        ringY = y;
        ringPos.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        stopRaf();
      } else {
        ensureRaf();
      }

      visible = true;
      const target = e.target instanceof Element ? e.target : document.elementFromPoint(x, y);
      if (mode !== "dragging") {
        mode = resolveModeFromElement(target);
      }
      scheduleIdleHide();
      applyVisualState();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isFine || e.pointerType === "touch") return;
      pressed = true;
      applyVisualState();
    };

    const onPointerUp = () => {
      if (!pressed && mode !== "dragging") return;
      pressed = false;
      if (visible) {
        const el = document.elementFromPoint(targetX, targetY);
        mode = resolveModeFromElement(el);
        scheduleIdleHide();
      }
      applyVisualState();
    };

    const onPointerLeave = () => {
      visible = false;
      pressed = false;
      clearIdleTimer();
      stopRaf();
      applyVisualState();
    };

    const onCursorState = (e: Event) => {
      const detail = (e as CursorStateEvent).detail;
      if (!detail?.mode) return;
      if (detail.mode === "dragging") {
        setMode("dragging");
        return;
      }
      if (visible) {
        const el = document.elementFromPoint(targetX, targetY);
        if (el instanceof HTMLCanvasElement && el.closest(".warroom-stage")) {
          setMode(detail.mode);
        } else {
          setMode(resolveModeFromElement(el));
        }
      }
    };

    const onCursorWalk = () => {
      if (!visible || idleHidden) return;
      if (mode === "canvas" || mode === "hotspot") {
        idleHidden = true;
        lastWakeX = targetX;
        lastWakeY = targetY;
        clearIdleTimer();
        applyVisualState();
      }
    };

    const onFineChange = (e: MediaQueryListEvent) => {
      isFine = e.matches;
      syncRootClass();
      applyVisualState();
    };

    const onReducedChange = (e: MediaQueryListEvent) => {
      isReduced = e.matches;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("blur", onPointerLeave);
    window.addEventListener("yor-cursor-state", onCursorState);
    window.addEventListener("yor-cursor-walk", onCursorWalk);
    fineQuery.addEventListener("change", onFineChange);
    reducedQuery.addEventListener("change", onReducedChange);

    applyVisualState();

    return () => {
      clearIdleTimer();
      stopRaf();
      html.classList.remove("has-custom-cursor");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      window.removeEventListener("yor-cursor-state", onCursorState);
      window.removeEventListener("yor-cursor-walk", onCursorWalk);
      fineQuery.removeEventListener("change", onFineChange);
      reducedQuery.removeEventListener("change", onReducedChange);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={rootRef}
      className="yor-cursor"
      data-visible="false"
      data-mode="default"
      data-pressed="false"
      aria-hidden="true"
    >
      <div ref={ringPosRef} className="yor-cursor__ring-pos">
        <svg className="yor-cursor__ring" viewBox="0 0 36 36" width="36" height="36" fill="none">
          <circle className="yor-cursor__circle" cx="18" cy="18" r="15" strokeWidth="1" />
          <g className="yor-cursor__ticks" strokeWidth="1.2" strokeLinecap="square">
            <line x1="18" y1="1" x2="18" y2="5.5" />
            <line x1="35" y1="18" x2="30.5" y2="18" />
            <line x1="18" y1="35" x2="18" y2="30.5" />
            <line x1="1" y1="18" x2="5.5" y2="18" />
          </g>
        </svg>
      </div>
      <div ref={dotPosRef} className="yor-cursor__dot-pos">
        <span className="yor-cursor__dot" />
      </div>
    </div>
  );
}
