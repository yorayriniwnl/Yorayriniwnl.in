import { WAR_ROOM_HOTSPOTS, type HotspotConfig, type HotspotId } from "./hubData";

export type NormalizedPoint = readonly [number, number];

export type LabelSide = "top" | "bottom" | "left" | "right";

export type CinematicHotspotRegion = {
  id: HotspotId;
  /** Clockwise polygon in normalized image space (0..1, top-left origin). */
  polygon: readonly NormalizedPoint[];
  /** Reticle anchor point in normalized image space (0..1, top-left origin). */
  anchor: NormalizedPoint;
  /** Preferred direction to place the reticle label relative to anchor. */
  labelSide: LabelSide;
  /** Target optical depth in depth.png (0 = far skyline, 1 = near foreground). */
  focusDepth: number;
  /** Sharp focal zone half-width in perceptual depth space. */
  focusBand: number;
  /** Depth plane used to keep SVG outlines locked to WebGL POM parallax. */
  parallaxDepth: number;
  /** Front-to-back hit-testing priority (higher wins on shared edges). */
  zOrder: number;
};

export type CinematicHotspot = CinematicHotspotRegion & {
  hotspot: HotspotConfig;
};

export type CinematicCameraFrame = {
  zoom: number;
  dollyShiftX: number;
  dollyShiftY: number;
  roll: number;
  rayDeltaX: number;
  rayDeltaY: number;
  viewportAspect: number;
  plateAspect: number;
  viewW: number;
  viewH: number;
  focusDepth: number;
};

export const CINEMATIC_IMAGE_WIDTH = 2560;
export const CINEMATIC_IMAGE_HEIGHT = 1440;
export const CINEMATIC_IMAGE_ASPECT = CINEMATIC_IMAGE_WIDTH / CINEMATIC_IMAGE_HEIGHT;

/** Must match FOCUS_DEPTH in CinematicWarRoom.tsx POM shader. */
export const POM_FOCUS_DEPTH = 0.28;
/** Default idle optical focus depth (operator hero). */
export const DEFAULT_FOCUS_DEPTH = 0.275;
export const DEFAULT_FOCUS_BAND = 0.15;

export function createStaticCameraFrame(viewW: number, viewH: number): CinematicCameraFrame {
  const safeW = Math.max(1, viewW);
  const safeH = Math.max(1, viewH);
  return {
    zoom: 1,
    dollyShiftX: 0,
    dollyShiftY: 0,
    roll: 0,
    rayDeltaX: 0,
    rayDeltaY: 0,
    viewportAspect: safeW / safeH,
    plateAspect: CINEMATIC_IMAGE_ASPECT,
    viewW: safeW,
    viewH: safeH,
    focusDepth: DEFAULT_FOCUS_DEPTH,
  };
}

/**
 * 11 clickable image-space regions traced to public/cinematic/painting-2k.jpg
 * and measured against public/cinematic/depth.png.
 * Ordered left-to-right for intuitive keyboard Tab / Arrow navigation.
 */
const CINEMATIC_REGIONS: readonly CinematicHotspotRegion[] = [
  {
    id: "portrait",
    polygon: [
      [0.075, 0.004],
      [0.330, 0.004],
      [0.310, 0.392],
      [0.062, 0.318],
    ],
    anchor: [0.195, 0.188],
    labelSide: "right",
    focusDepth: 0.11,
    focusBand: 0.065,
    parallaxDepth: 0.11,
    zOrder: 3,
  },
  {
    id: "helmet",
    polygon: [
      [0.082, 0.314],
      [0.135, 0.336],
      [0.168, 0.388],
      [0.190, 0.448],
      [0.188, 0.518],
      [0.165, 0.544],
      [0.014, 0.538],
      [0.003, 0.486],
      [0.008, 0.405],
      [0.036, 0.346],
    ],
    anchor: [0.095, 0.432],
    labelSide: "right",
    focusDepth: 0.2,
    focusBand: 0.06,
    parallaxDepth: 0.2,
    zOrder: 6,
  },
  {
    id: "chess",
    polygon: [
      [0.118, 0.738],
      [0.138, 0.752],
      [0.151, 0.785],
      [0.144, 0.808],
      [0.134, 0.825],
      [0.144, 0.872],
      [0.140, 0.912],
      [0.153, 0.952],
      [0.148, 0.974],
      [0.086, 0.974],
      [0.090, 0.928],
      [0.098, 0.872],
      [0.094, 0.824],
      [0.104, 0.775],
    ],
    anchor: [0.122, 0.805],
    labelSide: "top",
    focusDepth: 0.776,
    focusBand: 0.075,
    parallaxDepth: 0.776,
    zOrder: 11,
  },
  {
    id: "notebook",
    polygon: [
      [0.142, 0.840],
      [0.238, 0.822],
      [0.298, 0.942],
      [0.200, 0.970],
    ],
    anchor: [0.215, 0.875],
    labelSide: "top",
    focusDepth: 0.776,
    focusBand: 0.075,
    parallaxDepth: 0.776,
    zOrder: 10,
  },
  {
    id: "operator",
    polygon: [
      [0.472, 0.122],
      [0.526, 0.152],
      [0.558, 0.228],
      [0.552, 0.335],
      [0.578, 0.398],
      [0.608, 0.488],
      [0.635, 0.608],
      [0.642, 0.705],
      [0.712, 0.785],
      [0.738, 0.868],
      [0.718, 0.930],
      [0.678, 0.928],
      [0.595, 0.882],
      [0.548, 0.912],
      [0.495, 0.915],
      [0.405, 0.918],
      [0.330, 0.892],
      [0.276, 0.872],
      [0.242, 0.816],
      [0.156, 0.812],
      [0.146, 0.752],
      [0.122, 0.706],
      [0.180, 0.655],
      [0.205, 0.528],
      [0.262, 0.422],
      [0.312, 0.382],
      [0.348, 0.298],
      [0.392, 0.298],
      [0.398, 0.218],
      [0.422, 0.148],
    ],
    anchor: [0.465, 0.565],
    labelSide: "top",
    focusDepth: 0.275,
    focusBand: 0.115,
    parallaxDepth: 0.275,
    zOrder: 8,
  },
  {
    id: "window",
    polygon: [
      [0.508, 0.004],
      [0.672, 0.004],
      [0.670, 0.360],
      [0.642, 0.412],
      [0.608, 0.462],
      [0.586, 0.462],
      [0.576, 0.388],
      [0.554, 0.335],
      [0.562, 0.235],
      [0.542, 0.165],
      [0.508, 0.128],
    ],
    anchor: [0.598, 0.195],
    labelSide: "left",
    focusDepth: 0.016,
    focusBand: 0.07,
    parallaxDepth: 0.016,
    zOrder: 1,
  },
  {
    id: "husky",
    polygon: [
      [0.680, 0.356],
      [0.696, 0.414],
      [0.728, 0.422],
      [0.754, 0.402],
      [0.782, 0.468],
      [0.758, 0.515],
      [0.778, 0.578],
      [0.768, 0.625],
      [0.756, 0.655],
      [0.790, 0.724],
      [0.852, 0.778],
      [0.910, 0.835],
      [0.885, 0.868],
      [0.822, 0.880],
      [0.784, 0.878],
      [0.742, 0.808],
      [0.700, 0.758],
      [0.642, 0.708],
      [0.628, 0.618],
      [0.606, 0.525],
      [0.614, 0.448],
      [0.648, 0.408],
    ],
    anchor: [0.715, 0.568],
    labelSide: "top",
    focusDepth: 0.19,
    focusBand: 0.065,
    parallaxDepth: 0.19,
    zOrder: 7,
  },
  {
    id: "poster",
    polygon: [
      [0.674, 0.004],
      [0.870, 0.004],
      [0.858, 0.522],
      [0.768, 0.524],
      [0.780, 0.470],
      [0.754, 0.405],
      [0.728, 0.420],
      [0.704, 0.418],
      [0.686, 0.355],
      [0.674, 0.358],
    ],
    anchor: [0.772, 0.215],
    labelSide: "left",
    focusDepth: 0.075,
    focusBand: 0.06,
    parallaxDepth: 0.075,
    zOrder: 2,
  },
  {
    id: "bookshelf",
    polygon: [
      [0.896, 0.004],
      [0.998, 0.004],
      [0.998, 0.398],
      [0.898, 0.398],
    ],
    anchor: [0.94, 0.225],
    labelSide: "left",
    focusDepth: 0.094,
    focusBand: 0.06,
    parallaxDepth: 0.094,
    zOrder: 4,
  },
  {
    id: "lantern",
    polygon: [
      [0.896, 0.416],
      [0.946, 0.414],
      [0.998, 0.410],
      [0.998, 0.592],
      [0.954, 0.602],
      [0.896, 0.598],
    ],
    anchor: [0.94, 0.506],
    labelSide: "left",
    focusDepth: 0.114,
    focusBand: 0.06,
    parallaxDepth: 0.114,
    zOrder: 5,
  },
  {
    id: "laptop",
    polygon: [
      [0.968, 0.656],
      [0.998, 0.660],
      [0.998, 0.914],
      [0.924, 0.900],
    ],
    anchor: [0.956, 0.785],
    labelSide: "left",
    focusDepth: 0.482,
    focusBand: 0.075,
    parallaxDepth: 0.482,
    zOrder: 9,
  },
];

const HOTSPOT_BY_ID = new Map<HotspotId, HotspotConfig>(
  WAR_ROOM_HOTSPOTS.map((hotspot) => [hotspot.id, hotspot]),
);

export const CINEMATIC_HOTSPOTS: readonly CinematicHotspot[] = CINEMATIC_REGIONS.map((region) => {
  const hotspot = HOTSPOT_BY_ID.get(region.id);
  if (!hotspot) {
    throw new Error(`Missing WAR_ROOM_HOTSPOTS entry for cinematic hotspot "${region.id}"`);
  }
  return { ...region, hotspot };
});

export const CINEMATIC_HOTSPOTS_BY_Z: readonly CinematicHotspot[] = [...CINEMATIC_HOTSPOTS].sort(
  (a, b) => b.zOrder - a.zOrder,
);

export const CINEMATIC_HOTSPOT_BY_ID = new Map<HotspotId, CinematicHotspot>(
  CINEMATIC_HOTSPOTS.map((item) => [item.id, item]),
);

export type CoverTransform = {
  viewW: number;
  viewH: number;
  drawW: number;
  drawH: number;
  offsetX: number;
  offsetY: number;
};

/**
 * Cover box for static non-WebGL fallback image, matching createStaticCameraFrame(viewW, viewH).
 */
export function computeCoverTransform(viewW: number, viewH: number): CoverTransform {
  const safeW = Math.max(1, viewW);
  const safeH = Math.max(1, viewH);
  const viewAspect = safeW / safeH;

  let drawW: number;
  let drawH: number;
  if (viewAspect >= CINEMATIC_IMAGE_ASPECT) {
    drawW = safeW;
    drawH = drawW / CINEMATIC_IMAGE_ASPECT;
  } else {
    drawH = safeH;
    drawW = drawH * CINEMATIC_IMAGE_ASPECT;
  }

  return {
    viewW: safeW,
    viewH: safeH,
    drawW,
    drawH,
    offsetX: (safeW - drawW) * 0.5,
    offsetY: (safeH - drawH) * 0.5,
  };
}

/**
 * Exact algebraic inverse of CinematicWarRoom's screenToPlateUv + POM raymarch.
 * Maps a top-left normalized image point (u, v) at depth d -> viewport CSS pixels (sx, sy).
 */
export function projectPlatePointToViewport(
  u: number,
  v: number,
  depth: number,
  frame: CinematicCameraFrame,
): [number, number] {
  const plateU = u;
  const plateV = 1 - v; // Three.js textures are Y-up

  const delta = depth - POM_FOCUS_DEPTH;
  const baseU = plateU - frame.rayDeltaX * delta;
  const baseV = plateV - frame.rayDeltaY * delta;

  const cx = (baseU - 0.5 - frame.dollyShiftX) * frame.zoom;
  const cy = (baseV - 0.5 - frame.dollyShiftY) * frame.zoom;

  const c = Math.cos(-frame.roll);
  const s = Math.sin(-frame.roll);
  const mx = cx * frame.plateAspect;
  const my = cy;
  let rx = (c * mx - s * my) / frame.plateAspect;
  let ry = s * mx + c * my;

  if (frame.viewportAspect > frame.plateAspect) {
    ry *= frame.viewportAspect / frame.plateAspect;
  } else {
    rx *= frame.plateAspect / frame.viewportAspect;
  }

  return [(rx + 0.5) * frame.viewW, (0.5 - ry) * frame.viewH];
}

/** Ray-casting point-in-polygon check in 2D. */
export function pointInPolygon(
  x: number,
  y: number,
  polygon: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Exact forward screenToPlateUv + per-hotspot depth POM hit-test against all 11 polygons
 * in front-to-back depth priority order.
 */
export function hitTestPlateHotspot(
  localX: number,
  localY: number,
  frame: CinematicCameraFrame,
): CinematicHotspot | null {
  const su = localX / Math.max(1, frame.viewW);
  const sv = 1 - localY / Math.max(1, frame.viewH);

  let cx = su - 0.5;
  let cy = sv - 0.5;
  if (frame.viewportAspect > frame.plateAspect) {
    cy *= frame.plateAspect / frame.viewportAspect;
  } else {
    cx *= frame.viewportAspect / frame.plateAspect;
  }

  const c = Math.cos(frame.roll);
  const s = Math.sin(frame.roll);
  const mx = cx * frame.plateAspect;
  const my = cy;
  cx = (c * mx - s * my) / frame.plateAspect;
  cy = s * mx + c * my;

  const baseU = cx / frame.zoom + frame.dollyShiftX + 0.5;
  const baseV = cy / frame.zoom + frame.dollyShiftY + 0.5;

  for (const item of CINEMATIC_HOTSPOTS_BY_Z) {
    const delta = item.parallaxDepth - POM_FOCUS_DEPTH;
    const plateU = baseU + frame.rayDeltaX * delta;
    const plateV = baseV + frame.rayDeltaY * delta;
    const imgV = 1 - plateV;
    if (pointInPolygon(plateU, imgV, item.polygon)) {
      return item;
    }
  }
  return null;
}
