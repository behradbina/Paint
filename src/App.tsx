import "./App.css";
import { tools as tool, colorPlatte as colorsList } from "./bin/data";
import { useState, useEffect, useLayoutEffect } from "react";
import { PointEvent, Tool } from "./interfaces/types";
import { useDrawVariables } from "./helpers/useDrawVariables";
import { useDrawShapes } from "./helpers/useDrawShapes";
import Capitalize from "./utils/Capitalize";
import JSZip from "jszip";
import { saveAs } from "file-saver";

function App() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  const [startPoint, setStartPoint] = useState<PointEvent | undefined>();
  const [colorPlatte, setColorPlatte] = useState<string[]>([]);
  const [cursorStyle, setCursorStyle] = useState<string>("/tools/brush.svg");
  const [color, setColor] = useState<string>("#000");
  const [opacity, setOpacity] = useState<number>(1); // NEW
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [range, setRange] = useState<string>("5");
  const [selectTool, setSelectTool] = useState<string>("brush");
  const [actions, setActions] = useState<any[]>([]);
  const [currentPoints, setCurrentPoints] = useState<PointEvent[]>([]);
  const { canvas, ctx, snapShot } = useDrawVariables();
  const { drawCircle, drawLine, drawRectangle, drawEraser, drawTriangle } = useDrawShapes(ctx, color, startPoint, range);

  // type OrientationLockType =
  // | 'any'
  // | 'natural'
  // | 'landscape'
  // | 'landscape-primary'
  // | 'landscape-secondary'
  // | 'portrait'
  // | 'portrait-primary'
  // | 'portrait-secondary';

  // useEffect(() => {
  //   const orientation = screen.orientation as ScreenOrientation & {
  //     lock?: (orientation: OrientationLockType) => Promise<void>;
  //   };

  //   if (orientation?.lock) {
  //     orientation.lock('landscape').catch((err) =>
  //       console.warn('Orientation lock failed:', err)
  //     );
  //   }
  // }, []);  



  useEffect(() => {
    setTools(tool);
    setColorPlatte(colorsList);
  }, []);

  useEffect(() => {
    if (!canvas) return;
    ctx.current = canvas.current?.getContext("2d");
  }, [canvas, ctx]);

  useLayoutEffect(() => {
    if (canvas.current) {
      canvas.current.width = canvas.current.clientWidth;
      canvas.current.height = canvas.current.clientHeight;
    }
  }, [canvas]);

  const onSelectTool = (name: string) => {
    setSelectTool(name.toLowerCase());
    if (name.toLowerCase() === "brush") {
      setCursorStyle("/tools/brush.svg");
    } else if (name.toLowerCase() === "eraser") {
      setCursorStyle("/eraser.svg");
    } else {
      setCursorStyle("");
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    if (!ctx.current || !canvas.current) return;

    ctx.current.beginPath();
    snapShot.current = ctx.current.getImageData(0, 0, canvas.current.width, canvas.current.height);

    const rect = canvas.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    if (!isDrawing || !ctx.current || !canvas.current || !snapShot.current) return;

    ctx.current.putImageData(snapShot.current, 0, 0);
    ctx.current.globalAlpha = opacity; // Apply opacity

    const rect = canvas.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
      default:
        break;
    }

    setCurrentPoints((prev) => [...prev, point]);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(false);
    if (!startPoint || !canvas.current || !ctx.current) return;

    const rect = canvas.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    const endPoint: PointEvent = {
      x: endX,
      y: endY,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      pointerType: e.pointerType,
      timestamp: Date.now(),
    };

    ctx.current.globalAlpha = 1; // Reset opacity

    let shapeMeta: any = {
      order: actions.length + 1,
      action_type:
        selectTool === "brush"
          ? "drawLine"
          : selectTool === "eraser"
          ? "drawEraser"
          : `draw${selectTool.charAt(0).toUpperCase() + selectTool.slice(1)}`,
      color,
      opacity,
      line_width: parseInt(range),
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
          Math.pow(startPoint.x - endPoint.x, 2) + Math.pow(startPoint.y - endPoint.y, 2)
        );
        shapeMeta.center = startPoint;
        shapeMeta.radius = radius;
        break;
      default:
        break;
    }

    setActions((prev) => [...prev, shapeMeta]);
    setCurrentPoints([]);
    setStartTimestamp(null);
  };

  const onSelectColor = (e: string) => {
    setColor(e);
  };

  // const onClearCanvas = () => {
  //   if (canvas.current) ctx.current?.clearRect(0, 0, canvas.current.width, canvas.current.height);
  // }; 

  return (
    <>
      <div className="h-screen bg-[#F5F5F5] flex items-center ">
        <div className="toolbar w-[20%] py-4 px-5 h-full bg-white">
          <h2 className="text-[20px] font-semibold">Shapes</h2>
          <ul className="list-none mt-6">
            {tools.map((tool, index) => (
              <li
                className="flex gap-4 my-4 group cursor-pointer items-center"
                key={index}
                onClick={() => onSelectTool(tool.name)}
              >
                <i
                  dangerouslySetInnerHTML={{ __html: tool.icon }}
                  className={`toolIcon ${Capitalize(selectTool) === tool.name ? "active" : ""}`}
                />
                <span
                  className="text-[20px] text-gray-600 group-hover:text-[#764abc]"
                  style={Capitalize(selectTool) === tool.name ? { color: "#764abc" } : {}}
                >
                  {tool.name}
                </span>
              </li>
            ))}
          </ul>

          {/* Size slider */}
          <div className="size mt-4">
            <label className="block mb-2 text-gray-700 font-medium">Brush Size: {range}</label>
            <input
              type="range"
              min="1"
              max="100"
              value={range}
              className="range-slider"
              onChange={(e) => setRange(e.target.value)}
            />
          </div>

          {/* Opacity slider */}
          <div className="opacity-slider mt-4">
            <label className="block mb-2 text-gray-700 font-medium">Opacity: {(opacity * 100).toFixed(0)}%</label>
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

          {/* Color palette */}
          <div className="color-plate mt-4">
            <div className="text-center flex items-center gap-5 mb-4">
              <div className="border-[#4A98F7] border-solid border-2 p-1 rounded-[50%] cursor-pointer">
                <p
                  className="rounded-[50%] border border-solid w-7 h-7"
                  style={{ backgroundColor: color }}
                ></p>
              </div>
            </div>
            <ul className="list-none flex gap-1 flex-wrap">
              {colorPlatte.map((color, index) => {
                return (
                  <li
                    className="rounded-[50%] border-[#adadad] border border-solid w-5 h-5 cursor-pointer"
                    key={index}
                    style={{ backgroundColor: color }}
                    onClick={() => onSelectColor(color)}
                  />
                );
              })}
            </ul>
          </div>

          <div className="mt-5">
            <button
              className="px-4 py-3 mt-2 rounded-lg bg-[#764abc] text-white border-[#764abc] border-2 border-solid"
              onClick={async () => {
                if (!canvas.current) return;

                const zip = new JSZip();

                // Add image
                const imageData = canvas.current.toDataURL("image/png");
                const imgBase64 = imageData.split(",")[1];
                zip.file("drawing.png", imgBase64, { base64: true });

                // Add metadata
                const metadata = JSON.stringify(actions, null, 2);
                zip.file("drawing_metadata.json", metadata);

                // Generate ZIP
                const content = await zip.generateAsync({ type: "blob" });
                saveAs(content, `drawing_${Date.now()}.zip`);
              }}
            >
              Download ZIP
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="canvas-container w-[90%] h-[95%] bg-white shadow-lg mx-5 rounded-lg">
          <canvas
            className="w-full h-full touch-none"
            ref={canvas}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerMove={onPointerMove}
            style={{ cursor: cursorStyle ? `url(${cursorStyle}),auto` : "default" }}
          ></canvas>
        </div>
      </div>
    </>
  );
}

export default App;
