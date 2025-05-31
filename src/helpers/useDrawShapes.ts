import { PointEvent } from "../interfaces/types";

export const useDrawShapes = (ctx: any, color: any, startPoint: PointEvent | undefined, range: string) => {
  let ctxInstance = ctx.current;

  const drawLine = (e: PointEvent) => {
    if (!ctxInstance) return;
    ctxInstance.lineTo(e.x, e.y);
    ctxInstance.lineWidth = range;
    ctxInstance.strokeStyle = color;
    ctxInstance.stroke();
  };

  const drawRectangle = (endPoint: PointEvent) => {
    if (!ctxInstance) return;
    if (!startPoint) return;
    ctxInstance.strokeStyle = color;
    ctxInstance.strokeRect(startPoint.x, startPoint.y, endPoint.x - startPoint.x, endPoint.y - startPoint.y);
  };

  const drawCircle = (endPoint: PointEvent) => {
    if (!ctxInstance) return;
    if (!startPoint) return;
    ctxInstance.beginPath();
    ctxInstance.lineWidth = range;
    ctxInstance.strokeStyle = color;
    const radius = Math.sqrt(Math.pow(startPoint.x - endPoint.x, 2) + Math.pow(startPoint.y - endPoint.y, 2));
    ctxInstance.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
    ctxInstance.stroke();
  };

  const drawEraser = (e: PointEvent) => {
    if (!ctxInstance) return;
    ctxInstance.lineTo(e.x, e.y);
    ctxInstance.lineWidth = parseInt(range) + 10;
    ctxInstance.strokeStyle = "#fff";
    ctxInstance.stroke();
  };

  const drawTriangle = (e: PointEvent) => {
    if (!ctxInstance) return;
    if (!startPoint) return;
    ctxInstance.strokeStyle = color;
    ctxInstance.lineWidth = range;
    ctxInstance.beginPath();
    ctxInstance.moveTo(startPoint.x, startPoint.y);
    ctxInstance.lineTo(e.x, e.y);
    ctxInstance.lineTo(startPoint.x * 2 - e.x, e.y);
    ctxInstance.closePath();
    ctxInstance.stroke();
  };

  return { drawLine, drawCircle, drawRectangle, drawEraser, drawTriangle };
};
