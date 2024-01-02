import { fabric } from 'fabric';
import { generateId } from '../../utils';
import { getCanvasVisibleTopLeft } from '../utils/canvasUtils';
import { FixedArray } from '../../types';

export const RULER_ELEMENTS = {
	X_RULER_BACKGROUND: 'X_RULER_BACKGROUND',
	Y_RULER_BACKGROUND: 'Y_RULER_BACKGROUND',
	X_RULER_LINE: 'X_RULER_LINE',
	Y_RULER_LINE: 'Y_RULER_LINE',
	X_RULER_MARKER: 'X_RULER_MARKER',
	Y_RULER_MARKER: 'Y_RULER_MARKER',
	X_RULER_MARKER_TEXT: 'X_RULER_MARKER_TEXT',
	Y_RULER_MARKER_TEXT: 'Y_RULER_MARKER_TEXT',
	X_MOVE_MARKER: 'X_MOVE_MARKER',
	Y_MOVE_MARKER: 'Y_MOVE_MARKER',
} as const;

export function getCanvasZoomScale(zoom: number): number {
	if (zoom <= 0.05) return 2000;
	if (zoom <= 0.1) return 1000;
	if (zoom <= 0.2) return 500;
	if (zoom <= 0.5) return 250;
	if (zoom < 1) return 100;
	if (zoom >= 1 && zoom < 3) return 50;
	if (zoom >= 3 && zoom < 6) return 25;
	if (zoom >= 6 && zoom < 8) return 10;
	if (zoom >= 8) return 5;
	return 100;
}

const getAdjustedMarkerTextPosition = (num: number) => {
	const sign = Math.sign(num) > 0;
	const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
	if (num === 0) return 3;
	return sign ? 3 + digits : 10;
};
export function handleZoomRuler(
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	zoom: number,
	pan: FixedArray<number, 6>,
	canvas: fabric.Canvas,
	blockRef: React.MutableRefObject<fabric.Rect | null>,
) {
	canvasRef.current
		?.getObjects()
		.filter(item =>
			[
				RULER_ELEMENTS.X_RULER_MARKER,
				RULER_ELEMENTS.X_RULER_MARKER_TEXT,
				RULER_ELEMENTS.Y_RULER_MARKER,
				RULER_ELEMENTS.Y_RULER_MARKER_TEXT,
				RULER_ELEMENTS.X_MOVE_MARKER,
				RULER_ELEMENTS.Y_MOVE_MARKER,
			].includes(item.data?.type),
		)
		.forEach(item => {
			canvasRef.current?.remove(item);
		});

	const { left, top } = getCanvasVisibleTopLeft(canvasRef);

	const interval = getCanvasZoomScale(zoom);
	const nearest = Math.round(left / interval) * interval;
	const canvasWidth = canvasRef.current?.width as number;
	for (let i = nearest; i < (canvasWidth + -pan[4]) / canvas.getZoom(); i += interval) {
		const line = new fabric.Line([i, 0, i, 5 / zoom], {
			stroke: '#000',
			strokeWidth: 2 / zoom,
			left: i,
			selectable: false,
			hoverCursor: 'default',
			top: (-pan[5] + 16) / zoom,
			data: {
				ignoreSnapping: true,
				type: RULER_ELEMENTS.X_RULER_MARKER,
				id: generateId(),
			},
		});
		const text = new fabric.Text(`${i}`, {
			left: i - getAdjustedMarkerTextPosition(i) / zoom,
			top: -pan[5] / zoom,
			fontSize: 10 / zoom,
			fontFamily: 'Inter',
			selectable: false,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: RULER_ELEMENTS.X_RULER_MARKER_TEXT,
				id: generateId(),
			},
		});

		canvasRef.current?.add(line, text);
	}

	const nearestTop = Math.round(top / interval) * interval;
	const canvasHeight = canvasRef.current?.height as number;
	for (let i = nearestTop; i < (canvasHeight + -pan[5]) / canvas.getZoom(); i += interval) {
		const line = new fabric.Line([0, i, 5 / zoom, i], {
			stroke: '#000',
			strokeWidth: 2 / zoom,
			top: i,
			selectable: false,
			hoverCursor: 'default',
			left: (-pan[4] + 16) / zoom,
			data: {
				ignoreSnapping: true,
				type: RULER_ELEMENTS.Y_RULER_MARKER,
				id: generateId(),
			},
		});
		const text = new fabric.Text(`${i}`, {
			top: i + getAdjustedMarkerTextPosition(i) / zoom,
			left: -pan[4] / zoom,
			fontSize: 10 / zoom,
			fontFamily: 'Inter',
			fill: '#000',
			selectable: false,
			angle: 270,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: RULER_ELEMENTS.Y_RULER_MARKER_TEXT,
				id: generateId(),
			},
		});
		canvasRef.current?.add(line, text);
	}
	blockRef.current?.set({
		left: -pan[4] / zoom,
		top: -pan[5] / zoom,
		strokeWidth: 1 / zoom,
		width: 20 / zoom,
		height: 20 / zoom,
	});
	blockRef.current?.moveTo((canvasRef.current?.getObjects()?.length as number) - 1);
	blockRef.current?.setCoords();
	canvasRef.current?.requestRenderAll();
}

export function renderAxis(
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	xaxisRef: React.MutableRefObject<fabric.Rect | null>,
	yaxisRef: React.MutableRefObject<fabric.Rect | null>,
	blockRef: React.MutableRefObject<fabric.Rect | null>,
	colorScheme: string,
) {
	const zoom = canvasRef.current?.getZoom() as number;
	const xaxis = new fabric.Rect({
		left: 0,
		top: 0,
		fill: colorScheme === 'dark' ? '#000' : '#fff',
		width: canvasRef.current?.width,
		height: 20,
		selectable: false,
		stroke: colorScheme === 'dark' ? '#fff' : '#000',
		strokeWidth: 1 / zoom,
		data: {
			displayText: 'Shape',
			id: generateId(),
			ignoreSnapping: true,
			type: RULER_ELEMENTS.X_RULER_BACKGROUND,
		},
	});
	const yaxis = new fabric.Rect({
		left: 0,
		top: 0,
		fill: colorScheme === 'dark' ? '#000' : '#fff',
		width: 20,
		selectable: false,
		height: canvasRef.current?.height,
		stroke: colorScheme === 'dark' ? '#fff' : '#000',
		strokeWidth: 1 / zoom,
		data: {
			displayText: 'Shape',
			id: generateId(),
			type: RULER_ELEMENTS.Y_RULER_BACKGROUND,
			ignoreSnapping: true,
		},
	});
	const block = new fabric.Rect({
		left: 0,
		top: 0,
		fill: colorScheme === 'dark' ? '#000' : '#fff',
		width: 20 / zoom,
		selectable: false,
		height: 20 / zoom,
		stroke: colorScheme === 'dark' ? '#fff' : '#000',
		strokeWidth: 1 / zoom,
		data: {
			displayText: 'Shape',
			id: generateId(),
			type: 'block',
			ignoreSnapping: true,
		},
	});

	canvasRef.current?.remove(
		xaxisRef.current as fabric.Rect,
		yaxisRef.current as fabric.Rect,
		blockRef.current as fabric.Rect,
	);
	xaxisRef.current = xaxis;
	yaxisRef.current = yaxis;
	blockRef.current = block;
	canvasRef.current?.add(xaxis, yaxis, block);
	handleZoomRuler(canvasRef, 1, [0, 0, 0, 0, 0, 0], canvasRef.current as fabric.Canvas, blockRef);
	canvasRef.current?.requestRenderAll();
}

export function rulerMarkerAdjust(canvasRef: React.MutableRefObject<fabric.Canvas | null>) {
	const allObjects = canvasRef?.current?.getObjects() as fabric.Object[];
	const zoom = canvasRef.current?.getZoom() as number;
	const canvasHeight = canvasRef.current?.height as number;
	const canvasWidth = canvasRef.current?.width as number;
	allObjects
		.filter(x => x.data.type === RULER_ELEMENTS.X_RULER_LINE)
		.forEach(x => {
			const pan = canvasRef.current?.viewportTransform as FixedArray<number, 6>;
			x?.set({
				strokeWidth: 2 / zoom,
				top: (-pan[5] + 20) / zoom,
				height: canvasHeight / zoom,
				padding: 10 / zoom,
			});
			x.setCoords();
		});

	allObjects
		.filter(x => x.data.type === RULER_ELEMENTS.Y_RULER_LINE)
		.forEach(x => {
			const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
			x?.set({
				strokeWidth: 2 / zoom,
				left: (-pan[4] + 20) / zoom,
				width: canvasWidth / zoom,
				padding: 10 / zoom,
			});
			x.setCoords();
		});
}

export const filterRulerObjects = (arr: fabric.Object[] | undefined) => {
	if (!arr) return [];
	return arr.filter(obj => !Object.values(RULER_ELEMENTS).includes(obj?.data?.type));
};
