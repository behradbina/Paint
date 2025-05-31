export interface Tool {
  name: string,
  icon: string
}
import type { PointerEvent } from "react";

export interface PointEvent {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  pointerType: PointerEvent<HTMLCanvasElement>["pointerType"];
  timestamp: number;
}
