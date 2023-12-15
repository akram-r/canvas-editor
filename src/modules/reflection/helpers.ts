import { fabric as Fabric } from 'fabric';

export interface SmartObject extends fabric.Object {
	reflection?: fabric.Object | null;
}

export const createReflection = (original: SmartObject, canvas: fabric.Canvas) => {
	// Clone the original object to create the reflection
	original.clone((cloned: SmartObject) => {
		const reflection: SmartObject = cloned;
		reflection.set({
			// Set reflection properties
			top: original.top! + original.getScaledHeight(),
			scaleY: 0 - original.scaleY!,
			opacity: 0.25,
			data: {
				type: 'reflection',
				parent: original.data.id,
			},
			selectable: false,
			fill: new Fabric.Gradient({
				type: 'linear',
				coords: {
					x1: 0,
					y1: 0,
					x2: 0,
					y2: reflection.height, // Vertical gradient
				},
				colorStops: [
					{ offset: 0, color: 'rgba(0,0,0,0)' }, // Adjust color and opacity as needed
					{ offset: 1, color: 'rgba(0,0,0,0.8)' },
				],
			}),
		});

		// Add the reflection to the canvas and link it to the original
		canvas.add(reflection);
		original.reflection = reflection;
		// set the z-index of the reflection to be just behind the original
		const objectIndex = canvas.getObjects().indexOf(original);
		canvas.moveTo(reflection, objectIndex);
	});
};

export const updateReflection = (original: SmartObject, canvas: fabric.Canvas) => {
	// Set the reflection's position and angle to match the original
	if (original.reflection) {
		const elementTop = original.top!;
		const elementLeft = original.left!;

		const sin = Math.sin(Fabric.util.degreesToRadians(original.angle!));
		const cos = Math.cos(Fabric.util.degreesToRadians(original.angle!));

		const height = original.getScaledHeight();
		const leftAdjustment = height * sin;
		const topAdjustment = height * cos;

		// Set reflection position
		original.reflection.set({
			top: elementTop + topAdjustment,
			left: elementLeft - leftAdjustment,
			angle: original.angle,
			scaleX: original.scaleX,
			scaleY: -original.scaleY!,
			flipX: original.flipX,
			flipY: !original.flipY,
		});

		// Update the canvas display
		canvas.requestRenderAll();
	}
};