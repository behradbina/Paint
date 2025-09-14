import "./App.css";
import { tools as tool, colorPlatte as colorsList } from "./bin/data";
import { useState, useEffect, useLayoutEffect } from "react";
import { PointEvent, Tool } from "./interfaces/types";
import { useDrawVariables } from "./helpers/useDrawVariables";
import { useDrawShapes } from "./helpers/useDrawShapes";
import Capitalize from "./utils/Capitalize";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import axios from "axios";

function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const [startPoint, setStartPoint] = useState<PointEvent | undefined>();
  const [colorPlatte, setColorPlatte] = useState<string[]>([]);
  const [cursorStyle, setCursorStyle] = useState<string>("/tools/brush.svg");

  const [brushColor, setBrushColor] = useState<string>("#000");
  const [bucketColor, setBucketColor] = useState<string>("#000");

  const [opacity, setOpacity] = useState<number>(1);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState("5");
  const [eraserSize, setEraserSize] = useState("10");
  const [selectTool, setSelectTool] = useState<string>("brush");
  const [actions, setActions] = useState<any[]>([]);
  const [currentPoints, setCurrentPoints] = useState<PointEvent[]>([]);
  const { canvas, ctx, snapShot } = useDrawVariables();
  const currentSize = selectTool === "eraser" ? eraserSize : brushSize;

  // --- undo/redo stacks ---
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  const activeColor = selectTool === "bucket" ? bucketColor : brushColor;

  const { drawCircle, drawLine, drawRectangle, drawEraser, drawTriangle } =
    useDrawShapes(ctx, activeColor, startPoint, currentSize);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvas.current) return { x: 0, y: 0 };
    const rect = canvas.current.getBoundingClientRect();
    const scaleX = canvas.current.width / rect.width;
    const scaleY = canvas.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    const hasReloaded = sessionStorage.getItem("hasReloadedLandscape");
    const handleOrientationChange = () => {
      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      if (!isLandscape && !hasReloaded) {
        sessionStorage.setItem("hasReloadedLandscape", "true");
        window.location.reload();
      }
    };
    window.addEventListener("orientationchange", handleOrientationChange);
    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
    };
  }, []);

  useEffect(() => {
    setTools(tool);
    setColorPlatte(colorsList);
  }, []);

  // Setup canvas size, context and push initial snapshot into undoStack
  useLayoutEffect(() => {
    if (!canvas.current) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.current.clientWidth;
    const height = canvas.current.clientHeight;
    canvas.current.width = width * ratio;
    canvas.current.height = height * ratio;

    ctx.current = canvas.current.getContext("2d");
    if (ctx.current) {
      ctx.current.lineJoin = "round";
      ctx.current.lineCap = "round";

      // push initial (empty) snapshot only if undoStack is empty
      try {
        const initial = ctx.current.getImageData(
          0,
          0,
          canvas.current.width,
          canvas.current.height
        );
        setUndoStack((prev) => (prev.length === 0 ? [initial] : prev));
      } catch (err) {
        // getImageData might fail in some contexts — ignore safely
        console.warn("Couldn't capture initial canvas snapshot:", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  const onSelectTool = (name: string) => {
    setSelectTool(name.toLowerCase());
    if (name.toLowerCase() === "brush") setCursorStyle("/tools/brush.svg");
    else if (name.toLowerCase() === "eraser") setCursorStyle("/eraser.svg");
    else if (name.toLowerCase() === "bucket") setCursorStyle("/bucket.svg");
    else setCursorStyle("");
  };

  const hexToRgba = (hex: string, alpha = 255) => {
    if (!hex || hex[0] !== "#") return [0, 0, 0, alpha];
    const bigint = parseInt(
      hex.slice(1).length === 3
        ? hex
          .slice(1)
          .split("")
          .map((ch) => ch + ch)
          .join("")
        : hex.slice(1),
      16
    );
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b, alpha];
  };

  // ---------------------------
  // Flood Fill & Dilate
  // ---------------------------
  const scanlineFloodFill = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    fillColor: number[],
    tolerance = 20
  ): { filledPixels: number; filledPercent: number } => {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    startX = Math.max(0, Math.min(canvasWidth - 1, startX));
    startY = Math.max(0, Math.min(canvasHeight - 1, startY));

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const pixelCount = canvasWidth * canvasHeight;
    const idx = (x: number, y: number) => (y * canvasWidth + x) * 4;

    const startPos = idx(startX, startY);
    const startColor = [
      data[startPos],
      data[startPos + 1],
      data[startPos + 2],
      data[startPos + 3],
    ];

    const colorsEqualWithinTolerance = (c1: number[], c2: number[]) => {
      for (let i = 0; i < 4; i++)
        if (Math.abs(c1[i] - c2[i]) > tolerance) return false;
      return true;
    };
    if (colorsEqualWithinTolerance(startColor, fillColor))
      return { filledPixels: 0, filledPercent: 0 };

    const matchStart = (x: number, y: number) => {
      const p = idx(x, y);
      for (let i = 0; i < 4; i++)
        if (Math.abs(data[p + i] - startColor[i]) > tolerance) return false;
      return true;
    };

    const stack: { x: number; y: number }[] = [];
    stack.push({ x: startX, y: startY });

    let filledPixels = 0;
    while (stack.length) {
      const { x: xSeed, y: ySeed } = stack.pop()!;
      let x = xSeed;

      while (x >= 0 && matchStart(x, ySeed)) x--;
      x++;
      let spanUp = false;
      let spanDown = false;

      for (; x < canvasWidth && matchStart(x, ySeed); x++) {
        const p = idx(x, ySeed);
        data[p] = fillColor[0];
        data[p + 1] = fillColor[1];
        data[p + 2] = fillColor[2];
        data[p + 3] = fillColor[3];
        filledPixels++;

        if (ySeed > 0) {
          if (matchStart(x, ySeed - 1)) {
            if (!spanUp) {
              stack.push({ x: x, y: ySeed - 1 });
              spanUp = true;
            }
          } else spanUp = false;
        }
        if (ySeed < canvasHeight - 1) {
          if (matchStart(x, ySeed + 1)) {
            if (!spanDown) {
              stack.push({ x: x, y: ySeed + 1 });
              spanDown = true;
            }
          } else spanDown = false;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const filledPercent = (filledPixels / pixelCount) * 100;
    return { filledPixels, filledPercent };
  };

  const dilateFill = (
    ctx: CanvasRenderingContext2D,
    imageData: ImageData,
    fillColor: number[],
    passes = 2
  ) => {
    const { width, height, data } = imageData;
    const idx = (x: number, y: number) => (y * width + x) * 4;

    for (let pass = 0; pass < passes; pass++) {
      const copy = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const p = idx(x, y);
          const isFilled =
            data[p] === fillColor[0] &&
            data[p + 1] === fillColor[1] &&
            data[p + 2] === fillColor[2] &&
            data[p + 3] === fillColor[3];

          if (!isFilled) {
            const neighbors = [
              idx(x - 1, y),
              idx(x + 1, y),
              idx(x, y - 1),
              idx(x, y + 1),
            ];
            for (let n of neighbors) {
              if (
                data[n] === fillColor[0] &&
                data[n + 1] === fillColor[1] &&
                data[n + 2] === fillColor[2] &&
                data[n + 3] === fillColor[3]
              ) {
                copy[p] = fillColor[0];
                copy[p + 1] = fillColor[1];
                copy[p + 2] = fillColor[2];
                copy[p + 3] = fillColor[3];
                break;
              }
            }
          }
        }
      }

      data.set(copy);
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // ---------------------------
  // Undo/Redo helpers
  // ---------------------------
  const saveState = () => {
    if (!ctx.current || !canvas.current) return;
    try {
      const snapshot = ctx.current.getImageData(
        0,
        0,
        canvas.current.width,
        canvas.current.height
      );
      setUndoStack((prev) => [...prev, snapshot]);
      // new action invalidates redo history
      setRedoStack([]);
    } catch (err) {
      console.warn("saveState failed:", err);
    }
  };

  const handleUndo = () => {
    if (!ctx.current || !canvas.current) return;
    if (undoStack.length <= 1) return;

    const currentState = undoStack[undoStack.length - 1];
    const previousState = undoStack[undoStack.length - 2];

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentState]);

    try {
      ctx.current.putImageData(previousState, 0, 0);
    } catch (err) {
      console.warn("handleUndo putImageData failed:", err);
    }

    // پیدا کردن آخرین اکشن واقعی
    const lastRealAction = actions
      .slice()
      .reverse()
      .find((a) => !["undo", "redo"].includes(a.action_type));

    setActions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        order: prev.length + 1,
        action_type: "undo",
        target_action_id: lastRealAction?.id || null,
        timestamp: Date.now(),
      },
    ]);
  };


  const handleRedo = () => {
    if (!ctx.current || !canvas.current) return;
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, nextState]);

    try {
      ctx.current.putImageData(nextState, 0, 0);
    } catch (err) {
      console.warn("handleRedo putImageData failed:", err);
    }

    // پیدا کردن آخرین undo برای وصل شدن
    const lastUndo = actions
      .slice()
      .reverse()
      .find((a) => a.action_type === "undo");

    setActions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        order: prev.length + 1,
        action_type: "redo",
        target_action_id: lastUndo?.target_action_id || null,
        timestamp: Date.now(),
      },
    ]);
  };

  // ---------------------------
  // Pointer Handlers
  // ---------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (!ctx.current || !canvas.current) return;

    // For bucket: perform fill immediately on down
    if (selectTool === "bucket") {
      const coords = getCanvasCoords(e);
      const x = Math.floor(coords.x);
      const y = Math.floor(coords.y);
      const a = Math.round(opacity * 255);
      const fillColor = hexToRgba(bucketColor, a);
      const tolerance = 20;

      // snapshot BEFORE filling? We will save result AFTER fill (we already have initial in undoStack),
      // but to be consistent we capture resulting state after fill via saveState()
      const start = Date.now();
      const { filledPixels, filledPercent } = scanlineFloodFill(
        ctx.current,
        x,
        y,
        fillColor,
        tolerance
      );

      dilateFill(
        ctx.current,
        ctx.current.getImageData(0, 0, canvas.current.width, canvas.current.height),
        fillColor,
        2
      );

      // register action (use prev length to compute order inside callback to avoid stale value)
      const actionId = crypto.randomUUID();

      setActions((prev) => [
        ...prev,
        {
          id: actionId,
          order: prev.length + 1,
          action_type: "fill",
          color: bucketColor,
          opacity,
          point: { x, y },
          area_pixels: filledPixels,
          area_percent: Number(filledPercent.toFixed(2)),
          timestamp: Date.now(),
          elapsed_ms: Date.now() - start,
          tolerance,
        },
      ]);


      // save state after fill (push resulting image)
      saveState();
      return;
    }

    // Drawing tools: begin action (we'll save resulting state on pointerUp)
    setIsDrawing(true);
    ctx.current.beginPath();
    snapShot.current = ctx.current.getImageData(
      0,
      0,
      canvas.current.width,
      canvas.current.height
    );

    const { x, y } = getCanvasCoords(e);
    const point: PointEvent = {
      x,
      y,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      timestamp: Date.now(),
    };
    setStartPoint(point);
    setStartTimestamp(Date.now());
    setCurrentPoints([point]);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !ctx.current || !canvas.current || !snapShot.current)
      return;

    ctx.current.putImageData(snapShot.current, 0, 0);
    ctx.current.globalAlpha = opacity;

    const { x, y } = getCanvasCoords(e);
    const point: PointEvent = {
      x,
      y,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      timestamp: Date.now(),
    };

    switch (selectTool) {
      case "brush":
        drawLine(point);
        break;
      case "rectangle":
        drawRectangle(point);
        break;
      case "circle":
        drawCircle(point);
        break;
      case "triangle":
        drawTriangle(point);
        break;
      case "eraser":
        drawEraser(point);
        break;
    }

    setCurrentPoints((prev) => [...prev, point]);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    if (!startPoint || !canvas.current || !ctx.current) return;

    const { x: endX, y: endY } = getCanvasCoords(e);
    const endPoint: PointEvent = {
      x: endX,
      y: endY,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      timestamp: Date.now(),
    };

    ctx.current.globalAlpha = 1;

    let shapeMeta: any = {
      order: actions.length + 1,
      action_type:
        selectTool === "brush"
          ? "drawLine"
          : selectTool === "eraser"
            ? "drawEraser"
            : `draw${selectTool.charAt(0).toUpperCase() + selectTool.slice(1)}`,
      color: activeColor,
      opacity,
      line_width: parseInt(currentSize),
      timestamp_start: startTimestamp,
      timestamp_end: Date.now(),
      pressure: endPoint.pressure,
    };

    switch (selectTool) {
      case "brush":
      case "eraser":
        shapeMeta.points = currentPoints;
        break;
      case "triangle":
        shapeMeta.points = [
          startPoint,
          endPoint,
          { x: startPoint.x * 2 - endPoint.x, y: endPoint.y },
        ];
        break;
      case "rectangle":
        shapeMeta.points = [
          startPoint,
          { x: endPoint.x, y: startPoint.y },
          endPoint,
          { x: startPoint.x, y: endPoint.y },
        ];
        break;
      case "circle":
        const radius = Math.sqrt(
          Math.pow(startPoint.x - endPoint.x, 2) +
          Math.pow(startPoint.y - endPoint.y, 2)
        );
        shapeMeta.center = startPoint;
        shapeMeta.radius = radius;
        break;
    }

    if (selectTool !== "bucket") {
      // add action and save current canvas as new state in undo stack
      const actionId = crypto.randomUUID();
      shapeMeta.id = actionId;

      setActions((prev) => [...prev, shapeMeta]);

      saveState();
    }
    setCurrentPoints([]);
    setStartTimestamp(null);
  };

  const onSelectColor = (c: string) => {
    if (selectTool === "bucket") setBucketColor(c);
    else setBrushColor(c);
  };

  return (
    <>
      <div className="h-screen bg-[#F5F5F5] flex items-center ">
        <div className="toolbar w-[20%] px-5 h-full bg-white">
          <ul className="list-none mt-6">
            {tools.map((tool, index) => (
              <li
                className="flex gap-4 my-2 group cursor-pointer items-center"
                key={index}
                onClick={() => onSelectTool(tool.name)}
              >
                <i
                  dangerouslySetInnerHTML={{ __html: tool.icon }}
                  className={`toolIcon ${Capitalize(selectTool) === tool.name ? "active" : ""
                    }`}
                />
                <span
                  className="text-[20px] text-gray-600 group-hover:text-[#764abc]"
                  style={
                    Capitalize(selectTool) === tool.name
                      ? {
                        color: "rgb(118 74 188 / var(--tw-bg-opacity))",
                        fontWeight: "bolder",
                      }
                      : {}
                  }
                >
                  {tool.name}
                </span>
              </li>
            ))}
          </ul>

          <div className="size mt-4">
            {selectTool !== "eraser" && selectTool !== "bucket" && (
              <>
                <label className="block mb-2 text-gray-700 font-medium">
                  Brush Size: {brushSize}
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={brushSize}
                  className="range-slider"
                  onChange={(e) => setBrushSize(e.target.value)}
                />
              </>
            )}

            {selectTool === "eraser" && (
              <>
                <label className="block mb-2 text-gray-700 font-medium">
                  Eraser Size: {eraserSize}
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={eraserSize}
                  className="range-slider"
                  onChange={(e) => setEraserSize(e.target.value)}
                />
              </>
            )}
          </div>

          <div className="opacity-slider mt-4">
            <label className="block mb-2 text-gray-700 font-medium">
              Opacity: {(opacity * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>

          {selectTool !== "eraser" && (
            <div className="color-plate mt-4">
              <div className="text-center flex items-center gap-5 mb-4">
                <div className="border-[#4A98F7] border-solid border-2 p-1 rounded-[50%] cursor-pointer">
                  <p
                    className="rounded-[50%] border border-solid w-7 h-7"
                    style={{ backgroundColor: activeColor }}
                  ></p>
                </div>
              </div>
              <ul className="list-none flex gap-1 flex-wrap">
                {colorPlatte.map((c, index) => (
                  <li
                    className="rounded-[50%] border-[#adadad] border border-solid w-5 h-5 cursor-pointer"
                    key={index}
                    style={{ backgroundColor: c }}
                    onClick={() => onSelectColor(c)}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Undo / Redo buttons */}
          <div className="mt-5 flex gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-gray-200 text-black border border-solid"
              onClick={handleUndo}
            >
              Undo
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-gray-200 text-black border border-solid"
              onClick={handleRedo}
            >
              Redo
            </button>
          </div>

          <div className="mt-5">
            <button
              className="px-4 py-3 mt-2 rounded-lg bg-[#764abc] text-white border-[#764abc] border-2 border-solid"
              onClick={async () => {
                if (!canvas.current) return;

                const zip = new JSZip();

                // ---- Save final image ----
                const imageData = canvas.current.toDataURL("image/png");
                const imgBase64 = imageData.split(",")[1];
                zip.file("drawing.png", imgBase64, { base64: true });

                // ---- Save actions metadata ----
                const metadata = JSON.stringify(actions, null, 2);
                zip.file("drawing_metadata.json", metadata);

                // ---- Save history (undo/redo) ----
                const serializeHistory = (stack: ImageData[]) => {
                  if (!canvas.current) return [];
                  const tempCanvas = document.createElement("canvas");
                  const tempCtx = tempCanvas.getContext("2d")!;
                  tempCanvas.width = canvas.current.width;
                  tempCanvas.height = canvas.current.height;

                  return stack.map((imgData) => {
                    tempCtx.putImageData(imgData, 0, 0);
                    return tempCanvas.toDataURL("image/png"); // Base64
                  });
                };

                const history = {
                  undoStack: serializeHistory(undoStack),
                  redoStack: serializeHistory(redoStack),
                };

                zip.file("history.json", JSON.stringify(history, null, 2));

                // ---- Generate ZIP ----
                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, `drawing_${Date.now()}.zip`);

                try {
                  const formData = new FormData();
                  formData.append("zip", content, `drawing_${Date.now()}.zip`);
                  const response = await axios.post(
                    "https://518aadf6-7e4e-4624-8f09-4779bda0efd1-00-4d6tp3ts7ghm.worf.replit.dev/upload-zip",
                    formData,
                    {
                      headers: { "Content-Type": "multipart/form-data" },
                    }
                  );
                  console.log("Upload successful, file ID:", response.data.fileId);
                  alert("File uploaded on drive!");
                } catch (error) {
                  console.error("Upload error:", error);
                  alert("Error found while uploading!");
                }
              }}

            >
              Download ZIP
            </button>
          </div>
        </div>

        <div className="canvas-container w-[90%] h-[95%] bg-white shadow-lg mx-5 rounded-lg">
          <canvas
            className="w-full h-full touch-none"
            ref={canvas}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerMove={onPointerMove}
            style={{
              cursor: cursorStyle ? `url(${cursorStyle}) 0 32, auto` : "default",
            }}
          ></canvas>
        </div>
      </div>
    </>
  );
}

export default App;
