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

  // 🎨 رنگ‌ها جدا
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

  // 🎨 رنگ فعال
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

  useEffect(() => {
    if (!canvas) return;
    ctx.current = canvas.current?.getContext("2d");
    if (ctx.current) {
      ctx.current.lineJoin = "round";
      ctx.current.lineCap = "round";
    }
  }, [canvas, ctx]);

  useLayoutEffect(() => {
    if (canvas.current) {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.current.clientWidth;
      const height = canvas.current.clientHeight;
      canvas.current.width = width * ratio;
      canvas.current.height = height * ratio;
    }
  }, [canvas]);

  const onSelectTool = (name: string) => {
    setSelectTool(name.toLowerCase());
    if (name.toLowerCase() === "brush") {
      setCursorStyle("/tools/brush.svg");
    } else if (name.toLowerCase() === "eraser") {
      setCursorStyle("/eraser.svg");
    } else if (name.toLowerCase() === "bucket") {
      setCursorStyle("/bucket.svg");
    } else {
      setCursorStyle("");
    }
  };

  const hexToRgba = (hex: string, alpha = 255) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b, alpha];
  };

  const colorsMatch = (a: number[], b: number[]) => {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  };

  const floodFill = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    fillColor: number[]
  ): { filledPixels: number; filledPercent: number } => {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const startPos = (startY * canvasWidth + startX) * 4;
    const startColor = [
      data[startPos],
      data[startPos + 1],
      data[startPos + 2],
      data[startPos + 3],
    ];

    if (colorsMatch(startColor, fillColor))
      return { filledPixels: 0, filledPercent: 0 };

    const stack: [number, number][] = [[startX, startY]];
    let filledPixels = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const pos = (y * canvasWidth + x) * 4;

      const currentColor = [
        data[pos],
        data[pos + 1],
        data[pos + 2],
        data[pos + 3],
      ];

      if (colorsMatch(currentColor, startColor)) {
        data[pos] = fillColor[0];
        data[pos + 1] = fillColor[1];
        data[pos + 2] = fillColor[2];
        data[pos + 3] = fillColor[3];
        filledPixels++;

        if (x + 1 < canvasWidth) stack.push([x + 1, y]);
        if (x - 1 >= 0) stack.push([x - 1, y]);
        if (y + 1 < canvasHeight) stack.push([x, y + 1]);
        if (y - 1 >= 0) stack.push([x, y - 1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const totalPixels = canvasWidth * canvasHeight;
    const filledPercent = (filledPixels / totalPixels) * 100;

    return { filledPixels, filledPercent };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    if (!ctx.current || !canvas.current) return;

    // 🪣 Bucket
    if (selectTool === "bucket") {
      const { x, y } = getCanvasCoords(e);
      const fillColor = hexToRgba(bucketColor, Math.round(opacity * 255));
      const { filledPixels, filledPercent } = floodFill(
        ctx.current,
        Math.floor(x),
        Math.floor(y),
        fillColor
      );

      setActions((prev) => [
        ...prev,
        {
          order: actions.length + 1,
          action_type: "fill",
          color: bucketColor,
          opacity,
          point: { x, y },
          area_pixels: filledPixels,
          area_percent: filledPercent.toFixed(2),
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // ✏️ Drawing tools
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
      setActions((prev) => [...prev, shapeMeta]);
    }
    setCurrentPoints([]);
    setStartTimestamp(null);
  };

  // 🎨 انتخاب رنگ
  const onSelectColor = (c: string) => {
    if (selectTool === "bucket") {
      setBucketColor(c);
    } else {
      setBrushColor(c);
    }
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
                  className={`toolIcon ${
                    Capitalize(selectTool) === tool.name ? "active" : ""
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

          {/* Brush/Eraser Size */}
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

          {/* Opacity */}
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

          {/* Color Palette */}
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

          {/* Download/Upload */}
          <div className="mt-5">
            <button
              className="px-4 py-3 mt-2 rounded-lg bg-[#764abc] text-white border-[#764abc] border-2 border-solid"
              onClick={async () => {
                if (!canvas.current) return;

                const zip = new JSZip();

                const imageData = canvas.current.toDataURL("image/png");
                const imgBase64 = imageData.split(",")[1];
                zip.file("drawing.png", imgBase64, { base64: true });

                const metadata = JSON.stringify(actions, null, 2);
                zip.file("drawing_metadata.json", metadata);

                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, `drawing_${Date.now()}.zip`);

                try {
                  const formData = new FormData();
                  formData.append("zip", content, `drawing_${Date.now()}.zip`);

                  const response = await axios.post(
                    "https://518aadf6-7e4e-4624-8f09-4779bda0efd1-00-4d6tp3ts7ghm.worf.replit.dev/upload-zip",
                    formData,
                    {
                      headers: {
                        "Content-Type": "multipart/form-data",
                      },
                    }
                  );

                  console.log(
                    "Upload successful, file ID:",
                    response.data.fileId
                  );
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

        {/* Canvas */}
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
