import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { useDisclosure, useHotkeys } from '@mantine/hooks';
import { IconLayersSubtract, IconLetterT, IconPhoto, IconSquare } from '@tabler/icons-react';
import { fabric } from 'fabric';
import { Artboard } from '../../types';
import ImageModal from '../image/AddImage';
import { updateActiveArtboardLayers } from '../app/actions';
import { useDispatch } from 'react-redux';
import { generateId } from '../../utils';
import { FABRIC_JSON_ALLOWED_KEYS } from '../../constants';

type AddMenuProps = {
	artboardRef: React.RefObject<fabric.Rect>;
	selectedArtboard: Artboard | null;
	canvasRef: React.RefObject<fabric.Canvas>;
};

export default function AddMenu({ artboardRef, selectedArtboard, canvasRef }: AddMenuProps) {
	const [imageModalOpened, { open: openImageModal, close: closeImageModal }] = useDisclosure();
	const dispatch = useDispatch();
	const addText = () => {
		if (!selectedArtboard) {
			return;
		}
		if (!artboardRef.current) {
			return;
		}
		const left = artboardRef.current.left;
		const top = artboardRef.current.top;
		const width = artboardRef.current.width;
		const height = artboardRef.current.height;
		if (!left || !top || !width || !height) {
			return;
		}
		// calculate the center of the artboard
		const centerX = left + width / 2;
		const centerY = top + height / 2;
		const text = new fabric.Textbox('', {
			left: centerX,
			top: centerY,
			fontFamily: 'Inter',
			fontSize: 20,
			width: width / 10,
			data: {
				displayText: 'Text',
				id: generateId(),
			},
		});

		canvasRef.current?.add(text);
		canvasRef.current?.setActiveObject(text);
		text.enterEditing();
		text.selectAll();
		dispatch(updateActiveArtboardLayers(canvasRef.current?.toJSON(FABRIC_JSON_ALLOWED_KEYS).objects || []));
	};

	useHotkeys([
		[
			'T',
			(event: KeyboardEvent) => {
				event.preventDefault();
				addText();
			},
		],
		[
			'I',
			(event: KeyboardEvent) => {
				event.preventDefault();
				openImageModal();
			},
		],
	]);

	return (
		<>
			<Group spacing={4}>
				<Tooltip label="Add text (T)" openDelay={500}>
					<ActionIcon onClick={addText}>
						<IconLetterT size={14} />
					</ActionIcon>
				</Tooltip>
				<Tooltip label="Add image (I)" openDelay={500}>
					<ActionIcon onClick={openImageModal}>
						<IconPhoto size={14} />
					</ActionIcon>
				</Tooltip>
				<Tooltip label="Add shape" openDelay={500}>
					<ActionIcon>
						<IconSquare
							onClick={() => {
								for (let index = 0; index < 10; index++) {
									const rect = new fabric.Rect({
										left: Math.random() * 1000,
										top: Math.random() * 1000,
										fill: '#' + Math.floor(Math.random() * 16777215).toString(16),
										width: 100,
										height: 100,
										data: {
											displayText: 'Shape',
											id: generateId(),
										},
									});
									canvasRef.current?.add(rect);
								}
								canvasRef.current?.requestRenderAll();
							}}
							size={14}
						/>
					</ActionIcon>
				</Tooltip>
				<Tooltip label="Add preset" openDelay={500}>
					<ActionIcon>
						<IconLayersSubtract size={14} />
					</ActionIcon>
				</Tooltip>
				<Tooltip label="Add ssssss" openDelay={500}>
					<ActionIcon
						onClick={() => {
							// const path = new fabric.Path('M 0 0 L 300 100 L 200 300 z');
							// path.set({ fill: 'red', stroke: 'green', opacity: 1 });
							// canvasRef.current.add(path);
							const pathData = [
								{ type: 'M', x: 640.2236101689765, y: 254.25, node: true },
								{ type: 'L', x: 660.230555920009, y: 318.99336766507327, node: true },
								{ type: 'L', x: 724.973587, y: 318.99336766507327, node: true },
								{ type: 'L', x: 672.5953039318672, y: 359.0066323349269, node: true },
								{ type: 'L', x: 692.6018932371097, y: 423.75, node: true },
								{ type: 'L', x: 640.2236101689765, y: 383.73636054075814, node: true },
								{ type: 'L', x: 587.8452201671065, y: 423.75, node: true },
								{ type: 'L', x: 607.8519164060858, y: 359.0066323349269, node: true },
								{ type: 'L', x: 555.473587, y: 318.99336766507327, node: true },
								{ type: 'L', x: 620.2166644179439, y: 318.99336766507327, node: true },
								{ type: 'Z' },
							];

							// write your own parser to convert SVG path to fabric.Path here
							const pathh = pathData
								.map(function (path) {
									return [path.type, path.x, path.y].join(' ');
								})
								.join(' ');

							const fabricPath = new fabric.Path(pathh, {
								left: 0,
								top: 0,
								fill: 'blue', // Set the fill color
								stroke: 'black', // Set the stroke color
								strokeWidth: 2, // Set the stroke width
							});
							// double click on the path to enter editing mode
							fabricPath.on('mousedblclick', function (options) {
								console.log(' fabric.Control(', fabricPath);
								// add control points to the path
								fabricPath.path.forEach(function (path) {
									canvasRef.current?.add(
										new fabric.Circle({
											radius: 5,
											fill: 'red',
											left: path[1],
											top: path[2],
											originX: 'center',
											originY: 'center',
											hasControls: false,
											hoverCursor: 'pointer',
											selectable: true,
											hoverCursor: 'pointer',
										}),
									);
								});
							});
							// add point to above path

							console.log('fabricPath', fabricPath);

							canvasRef.current.add(fabricPath);
							// Add the custom square to the canvas
						}}
					>
						<IconPhoto size={14} />
					</ActionIcon>
				</Tooltip>
			</Group>
			<ImageModal
				selectedArtboard={selectedArtboard}
				artboardRef={artboardRef}
				canvasRef={canvasRef}
				imageModalOpened={imageModalOpened}
				closeImageModal={closeImageModal}
			/>
		</>
	);
}
