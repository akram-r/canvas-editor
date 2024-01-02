//TODO: optimize snapping
import { fabric } from 'fabric';
import React from 'react';
import { guidesRefType, snappingObjectType } from '../../types';
import { getCanvasVisibleTopLeft } from '../utils/canvasUtils';

export function snapToObject(
	target: snappingObjectType,
	objects: snappingObjectType[],
	guidesRef: React.MutableRefObject<guidesRefType>,
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	snapDistance: number,
) {
	let left = false;
	let right = false;
	let top = false;
	let bottom = false;
	let centerX = false;
	let centerY = false;
	objects.forEach(function (obj) {
		if (obj === target) return;

		// Snap to the top edge
		if (Math.abs(target.top - obj?.top - obj.getScaledHeight()) < snapDistance) {
			target.set({ top: obj.top + obj.getScaledHeight() });
			top = true;
		}
		if (Math.abs(target.top - obj.top) < snapDistance) {
			target.set({ top: obj.top });
			top = true;
		}

		if (Math.abs(target.top - obj.top - obj.getScaledHeight() / 2) < snapDistance) {
			top = true;
			target.set({ top: obj.top + obj.getScaledHeight() / 2 });
		}
		if (Math.abs(target.top + target.getScaledHeight() - obj.top) < snapDistance) {
			target.set({ top: obj.top - target.getScaledHeight() });
			bottom = true;
		}

		if (Math.abs(target.top + target.getScaledHeight() - obj.top - obj.getScaledHeight()) < snapDistance) {
			target.set({ top: obj.top + obj.getScaledHeight() - target.getScaledHeight() });
			bottom = true;
		}

		if (Math.abs(target.top + target.getScaledHeight() - obj.top - obj.getScaledHeight() / 2) < snapDistance) {
			bottom = true;
			target.set({ top: obj.top + obj.getScaledHeight() / 2 - target.getScaledHeight() });
		}

		if (Math.abs(target.left - obj.left - obj.getScaledWidth()) < snapDistance) {
			left = true;
			target.set({ left: obj.left + obj.getScaledWidth() });
		}
		if (Math.abs(target.left - obj.left) < snapDistance) {
			left = true;
			target.set({ left: obj.left });
		}
		if (Math.abs(target.left - obj.left - obj.getScaledWidth() / 2) < snapDistance) {
			left = true;
			target.set({ left: obj.left + obj.getScaledWidth() / 2 });
		}
		// Snap to the right edge
		if (Math.abs(target.left + target.getScaledWidth() - obj.left) < snapDistance) {
			target.set({ left: obj.left - target.getScaledWidth() });
			right = true;
		}

		if (Math.abs(target.left + target.getScaledWidth() - obj.left - obj.getScaledWidth()) < snapDistance) {
			target.set({ left: obj.left + obj.getScaledWidth() - target.getScaledWidth() });
			right = true;
		}

		if (Math.abs(target.left + target.getScaledWidth() - obj.left - obj.getScaledWidth() / 2) < snapDistance) {
			right = true;
			target.set({ left: obj.left + obj.getScaledWidth() / 2 - target.getScaledWidth() });
		}

		if (Math.abs(target.left + target.getScaledWidth() / 2 - obj.left - obj.getScaledWidth() / 2) < snapDistance) {
			target.set({ left: obj.left + obj.getScaledWidth() / 2 - target.getScaledWidth() / 2 });
			centerX = true;
		}

		if (Math.abs(target.left + target.getScaledWidth() / 2 - obj.left) < snapDistance) {
			target.set({ left: obj.left - target.getScaledWidth() / 2 });
			centerX = true;
		}
		if (Math.abs(target.left + target.getScaledWidth() / 2 - obj.left - obj.getScaledWidth()) < snapDistance) {
			target.set({ left: obj.left + obj.getScaledWidth() - target.getScaledWidth() / 2 });
			centerX = true;
		}

		if (Math.abs(target.top + target.getScaledHeight() / 2 - obj.top - obj.getScaledHeight() / 2) < snapDistance) {
			target.set({ top: obj.top + obj.getScaledHeight() / 2 - target.getScaledHeight() / 2 });
			centerY = true;
		}
		if (Math.abs(target.top + target.getScaledHeight() / 2 - obj.top) < snapDistance) {
			target.set({ top: obj.top - target.getScaledHeight() / 2 });
			centerY = true;
		}

		if (Math.abs(target.top + target.getScaledHeight() / 2 - obj.top - obj.getScaledHeight()) < snapDistance) {
			target.set({ top: obj.top + obj.getScaledHeight() - target.getScaledHeight() / 2 });
			centerY = true;
		}

		if (left) {
			guidesRef?.current?.left?.set({ opacity: 1, left: target.left });
		} else {
			guidesRef?.current?.left?.set({ opacity: 0, left: target.left });
		}

		if (right) {
			guidesRef?.current?.right?.set({ opacity: 1, left: target.left + target.getScaledWidth() });
		} else {
			guidesRef?.current?.right?.set({ opacity: 0 });
		}

		if (top) {
			guidesRef?.current?.top?.set({ opacity: 1, top: target.top });
		} else {
			guidesRef?.current?.top?.set({ opacity: 0 });
		}

		if (bottom) {
			guidesRef?.current?.bottom?.set({ opacity: 1, top: target.top + target.getScaledHeight() });
		} else {
			guidesRef?.current?.bottom?.set({ opacity: 0 });
		}
		if (centerX) {
			guidesRef?.current?.centerX?.set({ opacity: 1, left: target.left + target.getScaledWidth() / 2 });
		} else {
			guidesRef?.current?.centerX?.set({ opacity: 0 });
		}
		if (centerY) {
			guidesRef?.current?.centerY?.set({ opacity: 1, top: target.top + target.getScaledHeight() / 2 });
		} else {
			guidesRef?.current?.centerY?.set({ opacity: 0 });
		}
		guidesRef?.current?.left?.setCoords();
		guidesRef?.current?.right?.setCoords();
		guidesRef?.current?.top?.setCoords();
		guidesRef?.current?.bottom?.setCoords();
		guidesRef?.current?.centerX?.setCoords();
		guidesRef?.current?.centerY?.setCoords();
		canvasRef.current?.renderAll();
	});
}

export function createSnappingLines(canvasRef: React.MutableRefObject<fabric.Canvas | null>) {
	const canvasWidth = (canvasRef.current?.width as number) / (canvasRef.current?.getZoom() as number);
	const canvasHeight = (canvasRef.current?.height as number) / (canvasRef.current?.getZoom() as number);
	const { top, left } = getCanvasVisibleTopLeft(canvasRef);
	const defaultSnapLineProps = {
		opacity: 0,
		evented: false,
		selectable: false,
		stroke: 'blue',
		data: {
			isSnappingLine: true,
		},
	};
	const guidesRef = {
		left: new fabric.Line([0, canvasWidth, 0, 0], {
			...defaultSnapLineProps,
			top,
		}),
		top: new fabric.Line([0, 0, canvasHeight, 0], {
			...defaultSnapLineProps,
			left,
		}),
		right: new fabric.Line([0, canvasWidth, 0, 0], { ...defaultSnapLineProps, top }),
		bottom: new fabric.Line([0, 0, canvasWidth, 0], { ...defaultSnapLineProps, left }),
		centerX: new fabric.Line([0, canvasHeight, 0, 0], { ...defaultSnapLineProps, top }),
		centerY: new fabric.Line([0, 0, canvasHeight, 0], { ...defaultSnapLineProps, left }),
	};
	canvasRef.current
		?.getObjects()
		.filter(obj => obj?.data?.isSnappingLine)
		.forEach(obj => canvasRef.current?.remove(obj));
	canvasRef.current?.add(
		guidesRef.left,
		guidesRef.top,
		guidesRef.right,
		guidesRef.bottom,
		guidesRef.centerX,
		guidesRef.centerY,
	);
	return guidesRef;
}
