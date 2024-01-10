import { Divider, Stack } from '@mantine/core';
import Animation from '../modules/animate';
import ClipMask from '../modules/clipmask';
import ImagePanel from '../modules/image/Panel';
import Position from '../modules/position';
import AlignmentPanel from '../modules/position/Alignment';
import TextPanel from '../modules/text/Panel';
import { RULER_LINES } from '../modules/ruler';
import Opacity from '../modules/opacity';
import ShapePanel from '../modules/shapes/ShapePanel';
import { Artboard } from '../types';

type PanelProps = {
	canvas: fabric.Canvas;
	currentSelectedElements: fabric.Object[];
	saveArtboardChanges: () => void;
	activeArtboard: Artboard | null;
};

const Panel = ({ canvas, currentSelectedElements, saveArtboardChanges, activeArtboard }: PanelProps) => {
	const isVideoEnabled = localStorage.getItem('video') === 'true';
	const isRulerLine = Object.values(RULER_LINES).includes(currentSelectedElements?.[0]?.data?.type);
	if (!currentSelectedElements.length || isRulerLine) {
		return null;
	}

	if (!activeArtboard) {
		return null;
	}

	return (
		<Stack>
			{currentSelectedElements.length === 1 && (
				<>
					<AlignmentPanel
						canvas={canvas}
						currentSelectedElements={currentSelectedElements}
						activeArtboard={activeArtboard}
					/>
					<Divider />
					<Position canvas={canvas} currentSelectedElements={currentSelectedElements} />

					{currentSelectedElements?.[0]?.data?.type === 'shape' && (
						<ShapePanel canvas={canvas} currentSelectedElements={currentSelectedElements} />
					)}

					{currentSelectedElements?.[0]?.type === 'textbox' && (
						<TextPanel canvas={canvas} currentSelectedElements={currentSelectedElements} />
					)}
					{currentSelectedElements?.[0]?.type === 'image' && (
						<ImagePanel canvas={canvas} currentSelectedElements={currentSelectedElements} />
					)}
					<Opacity
						canvas={canvas}
						currentSelectedElements={currentSelectedElements}
						saveArtboardChanges={saveArtboardChanges}
					/>
				</>
			)}
			{currentSelectedElements.length > 1 ? (
				<ClipMask currentSelectedElements={currentSelectedElements} canvas={canvas} />
			) : null}
			<Divider />
			{isVideoEnabled && (
				<Animation
					canvas={canvas}
					currentSelectedElements={currentSelectedElements}
					saveArtboardChanges={saveArtboardChanges}
				/>
			)}
		</Stack>
	);
};

export default Panel;
