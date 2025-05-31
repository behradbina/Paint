import { useRef } from "react";

export const useDrawVariables = () => {
    const canvas = useRef<HTMLCanvasElement | null>(null);
    const ctx = useRef<CanvasRenderingContext2D | undefined | null>(null)
    const snapShot = useRef<ImageData>()

    return {
        canvas, ctx, snapShot
    }
}