export function handleZoomRuler(
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	zoom: number,
	pan: number[] | undefined,
	canvas: fabric.Canvas,
	blockRef: React.MutableRefObject<fabric.Rect | null>,
) {
	canvasRef.current
		?.getObjects()
		.filter(
			item =>
				item.data?.type === 'xrulermarker' ||
				item.data?.type === 'xrulermarkertext' ||
				item.data?.type === 'grid' ||
				item.data?.type === 'yrulermarker' ||
				item.data?.type === 'yrulermarkertext',
		)
		.forEach(item => {
			canvasRef.current?.remove(item);
		});

	const getVisibleTopLeft = (canvasRef: React.MutableRefObject<fabric.Canvas | null>) => {
		const canvas = canvasRef.current as fabric.Canvas;
		const vpt = canvas.viewportTransform as unknown as fabric.IPoint[];
		const scrollTop = window.scrollY || document.documentElement.scrollTop;
		const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		const visibleTop = -vpt[5] / vpt[0] + scrollTop / vpt[0];
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		const visibleLeft = -vpt[4] / vpt[0] + scrollLeft / vpt[0];
		return { top: visibleTop, left: visibleLeft };
	};
	const { left, top } = getVisibleTopLeft(canvasRef);
	// find value nearest to 10
	function roundToNearest10(number) {
		return Math.round(number / 10) * 10;
	}

	const interval = () => {
		if (zoom <= 0.05) return 2000;
		if (zoom <= 0.1) return 1000;
		if (zoom <= 0.2) return 500;
		if (zoom <= 0.5) return 250;
		if (zoom < 1) return 100;
		if (zoom >= 1 && zoom < 3) return 50;
		// if (zoom >= 2 && zoom < 3) return 25;
		if (zoom >= 3 && zoom < 6) return 25;
		// if (zoom >= 4 && zoom < 5) return 10;
		if (zoom >= 6 && zoom < 8) return 10;
		if (zoom >= 8) return 5;
	};
	const diff = (num: number) => {
		// find digits in number

		const sign = Math.sign(num) > 0;
		console.log(sign);
		const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
		if (num === 0) return 3;
		return sign ? 3 + digits : 10;
	};
	const nearest = Math.round(left / interval()) * interval();
	for (let i = nearest; i < (canvasRef.current?.width + -pan[4]) / canvas.getZoom(); i += interval()) {
		console.count('xrulermarker');
		const line = new fabric.Line([i, 0, i, 5 / zoom], {
			stroke: '#000',
			strokeWidth: 2 / zoom,
			left: i,
			selectable: false,
			hoverCursor: 'default',
			top: (-pan[5] + 16) / zoom,
			data: {
				ignoreSnapping: true,
				type: 'yrulermarker',
				id: generateId(),
			},
		});
		const text = new fabric.Text(`${i}`, {
			left: i - diff(i) / zoom,
			// left: i - Math.abs(diff(i)) / zoom,
			top: -pan[5] / zoom,
			fontSize: 10 / zoom,

			fontFamily: 'Monospace',
			// fill: '#000',
			selectable: false,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: 'xrulermarkertext',
				id: generateId(),
			},
		});

		canvasRef.current?.add(line, text);
	}

	const nearestTop = Math.round(top / interval()) * interval();
	for (let i = nearestTop; i < (canvasRef.current?.height + -pan[5]) / canvas.getZoom(); i += interval()) {
		const diff = (num: number) => {
			// find digits in number
			const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
			return 3 + digits;
		};
		const line = new fabric.Line([0, i, 5 / zoom, i], {
			stroke: '#000',
			strokeWidth: 2 / zoom,
			top: i,
			selectable: false,
			hoverCursor: 'default',
			left: (-pan[4] + 16) / zoom,
			data: {
				ignoreSnapping: true,
				type: 'yrulermarker',
				id: generateId(),
			},
		});
		line.bringForward();

		const text = new fabric.Text(`${i}`, {
			top: i - Math.abs(diff(i)) / zoom,
			left: -pan[4] / zoom,
			fontSize: 10 / zoom,
			fontFamily: 'Inter',
			fill: '#000',
			selectable: false,
			angle: 270,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: 'yrulermarkertext',
				id: generateId(),
			},
		});
		// const line2 = new fabric.Line([i, 0, i, canvasRef.current?.height], {
		// 	stroke: '#000',
		// 	strokeWidth: 1 / zoom,
		// 	left: i,
		// 	selectable: false,
		// 	hoverCursor: 'default',
		// 	data: {
		// 		type: 'grid',
		// 		ignoreSnapping: true,
		// 		id: generateId(),
		// 	},
		// });
		text.bringForward();
		text.moveTo(0);
		line.moveTo(0);
		canvasRef.current?.add(line, text);
	}
	blockRef.current?.set({
		left: -pan[4] / zoom,
		top: -pan[5] / zoom,
		strokeWidth: 1 / zoom,
		width: 20 / zoom,
		height: 20 / zoom,
	});
	blockRef.current.moveTo(canvasRef.current?.getObjects().length - 1);
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
	console.log('first', colorScheme);
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
			type: 'xruler',
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
			type: 'yruler',
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
	canvasRef.current?.remove(xaxisRef.current, yaxisRef.current, blockRef.current);
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
		.filter(x => x.data.type === 'xRulerLine')
		.forEach(x => {
			const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
			x?.set({
				padding: 10,
				strokeWidth: 2 / zoom,
				top: (-pan[5] + 20) / zoom,
				height: canvasHeight / zoom,
			});
		});

	allObjects
		.filter(x => x.data.type === 'yRulerLine')
		.forEach(x => {
			console.log('y', x);
			const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
			x?.set({
				padding: 10 / zoom,
				strokeWidth: 2 / zoom,
				left: (-pan[4] + 20) / zoom,
				width: canvasWidth / zoom,
			});
		});
}
