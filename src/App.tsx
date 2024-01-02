import {
	ActionIcon,
	Box,
	Button,
	Center,
	Flex,
	Group,
	Modal,
	NumberInput,
	Stack,
	Text,
	TextInput,
	Tooltip,
	createStyles,
	useMantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure, useHotkeys, useLocalStorage } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconDeviceFloppy, IconDownload, IconFileDownload, IconPlus } from '@tabler/icons-react';
import axios from 'axios';
import { fabric } from 'fabric';
import FontFaceObserver from 'fontfaceobserver';
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Panel from './components/Panel';
import { FABRIC_JSON_ALLOWED_KEYS } from './constants';
import { useQueryParam } from './hooks';
import { appStart, setArtboards, setSelectedArtboard, updateActiveArtboardLayers } from './modules/app/actions';
import { redo, undo } from './modules/history/actions';
import { addVideoToCanvas } from './modules/image/helpers';
import LayerList from './modules/layers/List';
import AddMenu from './modules/menu/AddMenu';
import MiscMenu from './modules/menu/MiscMenu';
import SettingsMenu from './modules/settings';
import ZoomMenu from './modules/zoom';
import store from './store';
import { RootState } from './store/rootReducer';
import { SmartObject } from './modules/reflection/helpers';
import SectionTitle from './components/SectionTitle';
import { createSnappingLines, snapToObject } from './modules/snapping';
import {
	RULER_ELEMENTS,
	findXAxis,
	findYAxis,
	handleZoomRuler,
	initializeRuler,
	removeMovingMarker,
	removeRuler,
	renderAxis,
	rulerBackgroundAdjust,
	rulerMarkerAdjust,
} from './modules/ruler';
import { filterSaveExcludes, filterSnappingExcludes } from './modules/utils/fabricObjectUtils';
import { useModalStyles } from './styles/modal';
import { Artboard, FixedArray, colorSpaceType, guidesRefType, snappingObjectType } from './types';
import { generateId, getMultiplierFor4K } from './utils';

store.dispatch(appStart());

(window as any).switchVideo = () => {
	const isVideoEnabled = JSON.parse(localStorage.getItem('video') || 'false');
	localStorage.setItem('video', JSON.stringify(!isVideoEnabled));
	return 'Video is ' + (isVideoEnabled ? 'disabled' : 'enabled');
};

(window as any).hardReset = () => {
	localStorage.setItem('artboards', JSON.stringify([]));
	window.location.reload();
};

function App() {
	const dispatch = useDispatch();
	const artboards = useSelector((state: RootState) => state.app.artboards);
	const selectedArtboard = useSelector((state: RootState) => state.app.selectedArtboard);
	const [snapDistance, setSnapDistance] = useLocalStorage<string>({
		key: 'snapDistance',
		defaultValue: '2',
	});
	const [showRuler, setShowRuler] = useState(true);
	const theme = useMantineTheme();
	const colorSchemeRef = useRef(theme.colorScheme);
	const { classes } = useStyles();
	const [showSidebar, setShowSidebar] = useState(true);
	const [colorSpace] = useQueryParam('colorSpace', 'srgb');
	const [autosaveChanges, setAutoSaveChanges] = useState(false);
	//TODO: Ak maybe use saga here for scalability and take effect on undo/redo?
	const [currentSelectedElements, setCurrentSelectedElements] = useState<fabric.Object[] | null>(null);
	const { classes: modalClasses } = useModalStyles();
	const [opened, { open, close }] = useDisclosure();
	const [zoomLevel, setZoomLevel] = useState(1);
	const [canvasScrollPoints, setCanvasScrollPoints] = useState(0);
	const newArtboardForm = useForm<Omit<Artboard, 'id'> & { number: number }>({
		initialValues: {
			name: '',
			width: 500,
			height: 500,
			number: 1,
		},
		validate: values => {
			const errors: Record<string, string> = {};
			if (values.name.trim().length === 0) {
				errors.name = 'Artboard name cannot be empty';
			}
			if (values.width < 1) {
				errors.width = 'Artboard width cannot be less than 1px';
			}
			if (values.height < 1) {
				errors.height = 'Artboard height cannot be less than 1px';
			}
			if (values.number < 1) {
				errors.number = 'Number of artboards cannot be less than 1';
			}
			return errors;
		},
	});
	const [isDownloading, setIsDownloading] = useState(false);
	const canvasRef = useRef<fabric.Canvas | null>(null);
	const artboardRef = useRef<fabric.Rect | null>(null);
	const canvasContainerRef = useRef<HTMLDivElement | null>(null);
	const [isCreatingArboards, setIsCreatingArtboards] = useState(false);
	const [showAll, setShowAll] = useState(false);
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const guidesRef = useRef<guidesRefType>({
		left: null,
		top: null,
		right: null,
		bottom: null,
		centerX: null,
		centerY: null,
	});
	const undoable = useSelector((state: RootState) => state.history.undoable);
	const redoable = useSelector((state: RootState) => state.history.redoable);

	useEffect(() => {
		console.log('color', canvasRef?.current);
		colorSchemeRef.current = theme.colorScheme;
		if (canvasRef.current) {
			handleZoomRuler(canvasRef, colorSchemeRef.current);
			rulerBackgroundAdjust(canvasRef, colorSchemeRef.current);
			rulerMarkerAdjust(canvasRef, colorSchemeRef.current);
		}
	}, [theme.colorScheme, canvasRef.current]);
	const colorScheme = colorSchemeRef.current;
	useEffect(() => {
		canvasRef.current = new fabric.Canvas('canvas', {
			// create a canvas with clientWidth and clientHeight
			width: window.innerWidth - 600,
			height: window.innerHeight - 60,
			backgroundColor: '#e9ecef',
			colorSpace: colorSpace as colorSpaceType,
		});
		// Handle element selection TODO: add more element type and handle it
		canvasRef.current?.on('selection:created', function (event) {
			console.log('selection created', event);
			setCurrentSelectedElements(event.selected as fabric.Object[]);
		});
		canvasRef.current?.on('selection:updated', function (event) {
			event?.deselected
				?.filter(item => [RULER_ELEMENTS.X_RULER_LINE, RULER_ELEMENTS.Y_RULER_LINE].includes(item.data?.type))
				.forEach(item => {
					item.set({ stroke: '#000', fill: '#000' });
				});
			removeMovingMarker(canvasRef);
			setCurrentSelectedElements(arr => {
				if (!arr) {
					return null;
				}

				if (event?.e?.shiftKey) {
					// Once the selection is updated, if there is an element in the array, return it
					if (event.selected && event.selected.length > 0) {
						// Add the element to the array if it is not already in the array
						return [...arr, ...event.selected];
					}

					if (event.deselected && event.deselected.length > 0) {
						// Remove the element from the array if it is already in the array
						return arr.filter(item => !event.deselected?.includes(item));
					}
				}
				return event.selected as fabric.Object[];
				// Else if the element is in the desected array, remove it
			});
		});
		canvasRef.current?.on('selection:cleared', function (e) {
			console.log('e', e);
			removeMovingMarker(canvasRef);
			e?.deselected
				?.filter(item => [RULER_ELEMENTS.X_RULER_LINE, RULER_ELEMENTS.Y_RULER_LINE].includes(item.data?.type))
				.forEach(item => {
					console.log('seeee');
					item.set({ stroke: '#000', fill: '#000' });
				});
			setCurrentSelectedElements(null);
		});
		// Add a click event listener to the canvas
		canvasRef.current.on('mouse:down', function (options) {
			if (
				[
					RULER_ELEMENTS.X_RULER_BACKGROUND,
					RULER_ELEMENTS.X_RULER_MARKER,
					RULER_ELEMENTS.X_RULER_MARKER_TEXT,
				].includes(options?.target?.data?.type)
			) {
				const zoom = canvasRef.current?.getZoom() as number;
				const pointer = canvasRef.current?.getPointer(options.e) as { x: number; y: number };
				const canvasHeight = (canvasRef.current?.height as number) / zoom;
				const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
				const line = new fabric.Line([pointer.x, (-pan[5] + 20) / zoom, pointer.x, canvasHeight], {
					stroke: '#000',
					strokeWidth: 2 / zoom,
					hasControls: false,
					hasBorders: false,
					lockRotation: true,

					lockMovementY: true,
					lockScalingX: true,
					lockScalingY: true,
					lockUniScaling: true,
					lockSkewingX: true,
					lockSkewingY: true,
					lockScalingFlip: true,
					padding: 10 / zoom,
					data: {
						type: RULER_ELEMENTS.X_RULER_LINE,
						id: generateId(),
					},
				});
				line.set({ height: canvasHeight });
				canvasRef.current?.add(line);
				canvasRef.current?.renderAll();
			} else if (
				[
					RULER_ELEMENTS.Y_RULER_BACKGROUND,
					RULER_ELEMENTS.Y_RULER_MARKER,
					RULER_ELEMENTS.Y_RULER_MARKER_TEXT,
				].includes(options?.target?.data?.type)
			) {
				const zoom = canvasRef.current?.getZoom() as number;
				const pointer = canvasRef.current?.getPointer(options.e) as { x: number; y: number };
				const canvasWidth = (canvasRef.current?.width as number) / zoom;
				const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
				const line = new fabric.Line([(-pan[4] + 20) / zoom, pointer.y, canvasWidth, pointer.y], {
					stroke: '#000',
					strokeWidth: 2 / zoom,
					lockMovementX: true,
					hasControls: false,
					lockRotation: true,
					lockScalingX: true,
					lockScalingY: true,
					hasBorders: false,
					lockUniScaling: true,
					lockSkewingX: true,
					lockSkewingY: true,
					lockScalingFlip: true,
					padding: 10 / zoom,
					data: {
						type: RULER_ELEMENTS.Y_RULER_LINE,
						id: generateId(),
					},
				});
				line.set({ width: canvasWidth });
				canvasRef.current?.add(line);
				canvasRef.current?.requestRenderAll();
			} else if (
				[RULER_ELEMENTS.X_RULER_LINE, RULER_ELEMENTS.Y_RULER_LINE].includes(options?.target?.data?.type)
			) {
				options.target?.set({ fill: 'red', stroke: 'red' });
			}
		});

		return () => {
			canvasRef.current?.dispose();
		};
	}, []);

	const onMoveHandler = (options: fabric.IEvent) => {
		const target = options.target as fabric.Object;
		if ([RULER_ELEMENTS.X_RULER_LINE].includes(target.data?.type)) {
			removeMovingMarker(canvasRef);
			const pan = canvasRef.current?.viewportTransform as FixedArray<number, 6>;
			const zoom = canvasRef.current?.getZoom() as number;
			canvasRef.current?.add(
				new fabric.Text(`${Math.round(target.left as number)}`, {
					left: (target.left as number) + 5 / zoom,
					top: (-pan[5] + 20) / zoom,
					fill: 'red',
					fontFamily: 'Inter',
					fontSize: 12 / zoom,
					data: { type: RULER_ELEMENTS.X_MOVE_MARKER },
				}),
			);
			return;
		} else if ([RULER_ELEMENTS.Y_RULER_LINE].includes(target.data?.type)) {
			removeMovingMarker(canvasRef);
			const pan = canvasRef.current?.viewportTransform as FixedArray<number, 6>;
			const zoom = canvasRef.current?.getZoom() as number;
			canvasRef.current?.add(
				new fabric.Text(`${Math.round(target.top as number)}`, {
					left: (-pan[4] + 20) / zoom,
					top: (target.top as number) - 5 / zoom,
					fill: 'red',
					fontFamily: 'Inter',
					angle: 270,
					fontSize: 12 / zoom,
					data: { type: RULER_ELEMENTS.Y_MOVE_MARKER },
				}),
			);
			return;
		}

		snapToObject(
			target as snappingObjectType,
			filterSnappingExcludes(canvasRef.current?.getObjects()) as snappingObjectType[],
			guidesRef,
			canvasRef,
			Number(snapDistance),
		);
	};

	const onModifiedHandler = () => {
		Object.entries(guidesRef.current).forEach(([, value]) => {
			value?.set({ opacity: 0 });
		});
	};

	useEffect(() => {
		if (canvasRef.current) {
			canvasRef.current.on('object:moving', onMoveHandler);
			canvasRef.current.on('object:modified', onModifiedHandler);
		}
		return () => {
			canvasRef.current?.off('object:moving', onMoveHandler);
			canvasRef.current?.off('object:modified', onModifiedHandler);
		};
	}, [canvasRef.current, snapDistance]);

	useEffect(() => {
		dispatch(updateActiveArtboardLayers(selectedArtboard?.state?.objects || []));
	}, [selectedArtboard, dispatch]);

	const recreateCanvas = () => {
		//reload window
		saveArtboardChanges();
		window.location.reload();
	};

	const resetZoom = () => {
		canvasRef.current?.setZoom(1);
		// Place the canvas in the center of the screen
		centerBoardToCanvas(artboardRef);
		setZoomLevel(canvasRef.current?.getZoom() || 1);
		if (showRuler) {
			handleZoomRuler(canvasRef, colorScheme);
			renderAxis(canvasRef, colorScheme);
			rulerBackgroundAdjust(canvasRef, colorScheme);
		}
	};

	const centerBoardToCanvas = (artboardRef: React.MutableRefObject<fabric.Rect | null>) => {
		const canvas = canvasRef.current;
		const artboard = artboardRef.current;

		if (!canvas) {
			throw new Error('Canvas is not defined');
		}

		if (!artboard) {
			throw new Error('Artboard is not defined');
		}

		// const object = canvas.getActiveObject();
		const objWidth = artboard.getScaledWidth();
		const objHeight = artboard.getScaledHeight();
		const zoom = canvas.getZoom();
		let panX = 0;
		let panY = 0;

		// WORKS - setViewportTransform
		if (artboard.aCoords) {
			panX = (canvas.getWidth() / zoom / 2 - artboard.aCoords.tl.x - objWidth / 2) * zoom;
			panY = (canvas.getHeight() / zoom / 2 - artboard.aCoords.tl.y - objHeight / 2) * zoom;
			canvas.setViewportTransform([zoom, 0, 0, zoom, panX, panY]);
		}
	};

	const createSingleArtboard = (artboard: Omit<Artboard, 'id'>, index: number) => {
		const id = generateId();
		const newArtboard: Artboard = {
			...artboard,
			name: `${artboard.name} ${index + 1}`,
			id,
		};

		const artboardRect = new fabric.Rect({
			left: (window.innerWidth - 600) / 2 - artboard.width / 2,
			top: (window.innerHeight - 60) / 2 - artboard.height / 2,
			width: artboard.width,
			height: artboard.height,
			fill: '#fff',
			selectable: false,
			hoverCursor: 'default',
			data: {
				type: 'artboard',
				id,
			},
		});

		const offScreenCanvas = new fabric.Canvas('offscreen', {
			width: window.innerWidth - 600,
			height: window.innerHeight - 60,
			backgroundColor: '#e9ecef',
			imageSmoothingEnabled: false,
			colorSpace: colorSpace as colorSpaceType,
		});

		offScreenCanvas.add(artboardRect);
		const json = offScreenCanvas.toJSON(FABRIC_JSON_ALLOWED_KEYS);
		offScreenCanvas.dispose();
		return {
			...newArtboard,
			state: json,
		};
	};

	const addNewArtboard = (artboard: Omit<Artboard, 'id'>) => {
		const validationResult = newArtboardForm.validate();
		if (validationResult.hasErrors) {
			console.log('Errors in new artboard form', validationResult.errors);
			return;
		}
		const id = generateId();
		const newArtboard: Artboard = { ...artboard, id };
		dispatch(setSelectedArtboard(newArtboard));

		canvasRef.current?.clear();
		const artboardRect = new fabric.Rect({
			left: (window.innerWidth - 600) / 2 - artboard.width / 2,
			top: (window.innerHeight - 60) / 2 - artboard.height / 2,
			width: artboard.width,
			height: artboard.height,
			fill: '#fff',
			hoverCursor: 'default',
			selectable: false,
			data: {
				type: 'artboard',
				id,
			},
		});

		canvasRef.current?.add(artboardRect);
		artboardRef.current = artboardRect;
		// Save the state of the canvas
		const json = canvasRef.current?.toJSON(FABRIC_JSON_ALLOWED_KEYS);

		const filteredObjects = filterSaveExcludes(json?.objects);
		const updatedArtboards = [
			...artboards,
			{
				...newArtboard,
				state: {
					...json,
					objects: filteredObjects,
				},
			},
		];
		dispatch(setArtboards(updatedArtboards));
		newArtboardForm.reset();
		close();
	};

	const createMultipleArtboards = (artboard: Omit<Artboard, 'id'>, n: number) => {
		setIsCreatingArtboards(true);
		// Use the addNewArtboard function to create multiple artboards
		const allArtboards = [];
		for (let i = 0; i < n; i++) {
			const newArtboard = createSingleArtboard(artboard, i);
			allArtboards.push(newArtboard);
		}

		// Update the artboards state
		const updatedArtboards = [...artboards, ...allArtboards];
		dispatch(setArtboards(updatedArtboards));
		newArtboardForm.reset();
		dispatch(setSelectedArtboard(allArtboards[0]));
		setIsCreatingArtboards(false);
		close();
	};

	const updateSelectedArtboard = (artboard: Artboard) => {
		if (selectedArtboard?.id === artboard.id) {
			return;
		}

		// clear the canvas of selected artboard
		canvasRef.current?.clear();
		dispatch(setSelectedArtboard(artboard));
	};

	const exportAllArtboards = async () => {
		try {
			// Download all artboards as zip from backend
			setIsDownloading(true);
			const res = await axios.post(
				'http://localhost:5000/api/download',
				{ artboards, origin: window.location.origin },
				{
					responseType: 'blob',
				},
			);

			if (!res.data) {
				throw new Error('Response data is undefined');
			}

			const url = window.URL.createObjectURL(new Blob([res.data]));
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', 'artboards.zip');
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			console.log(res.data);
		} catch (error) {
			console.log(error);
		} finally {
			setIsDownloading(false);
		}
	};

	const exportArtboard = () => {
		const artboardLeftAdjustment = canvasRef.current?.getObjects().find(item => item.data?.type === 'artboard')
			?.left;
		const artboardTopAdjustment = canvasRef.current?.getObjects().find(item => item.data?.type === 'artboard')?.top;

		if (!artboardLeftAdjustment || !artboardTopAdjustment) {
			return;
		}

		// Now we need to create a new canvas and add the artboard to it
		const offscreenCanvas = new fabric.Canvas('print', {
			width: artboardRef.current?.width,
			height: artboardRef.current?.height,
			colorSpace: colorSpace as colorSpaceType,
		});

		const stateJSON = canvasRef.current?.toJSON(FABRIC_JSON_ALLOWED_KEYS);

		const adjustedStateJSONObjects = stateJSON?.objects?.map((item: any) => {
			return {
				...item,
				left: item.left - artboardLeftAdjustment,
				top: item.top - artboardTopAdjustment,
			};
		});
		const adjustedStateJSON = {
			...stateJSON,
			objects: adjustedStateJSONObjects,
		};

		offscreenCanvas.loadFromJSON(adjustedStateJSON, () => {
			offscreenCanvas.renderAll();
			console.log('Offscreen canvas = ', offscreenCanvas.toJSON(FABRIC_JSON_ALLOWED_KEYS));

			const multiplier = getMultiplierFor4K(artboardRef.current?.width, artboardRef.current?.height);

			const config = {
				format: 'png',
				multiplier,
			};

			// render the offscreen canvas to a dataURL
			const dataURL = offscreenCanvas.toDataURL(config);

			const link = document.createElement('a');
			if (dataURL) {
				link.href = dataURL;
				link.download = 'canvas_4k.png';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
			}
		});
	};

	// Take selected options in the selected artboard and when this function is called, group the selected elements
	const createGroup = () => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const activeObject = canvas.getActiveObject();
		if (!activeObject || activeObject.type !== 'activeSelection') {
			return;
		}

		// Cast activeObject to fabric.ActiveSelection
		const activeSelection = activeObject as fabric.ActiveSelection;

		const activeObjects = activeSelection.getObjects();
		const group = new fabric.Group(activeObjects, {
			left: activeSelection.left,
			top: activeSelection.top,
		});

		activeObjects.forEach(object => {
			canvas.remove(object);
		});

		canvas.add(group);
		canvas.renderAll();
	};

	// ungroup function
	const ungroup = () => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const activeObject = canvas.getActiveObject();
		if (!activeObject || activeObject.type !== 'group') {
			return;
		}

		// Cast activeObject to fabric.Group
		const group = activeObject as fabric.Group;

		// Ungroup the objects
		const items = group._objects;
		group._restoreObjectsState();
		canvas.remove(group);
		for (let i = 0; i < items.length; i++) {
			canvas.add(items[i]);
		}

		canvas.renderAll();
	};

	const saveArtboardChanges = () => {
		if (!selectedArtboard) {
			return;
		}

		const json = canvasRef.current?.toJSON(FABRIC_JSON_ALLOWED_KEYS);
		const updatedArtboards = artboards.map(item => {
			if (item.id === selectedArtboard.id) {
				return {
					...item,
					state: {
						...json,
						objects: filterSaveExcludes(json?.objects),
					},
				};
			}
			return item;
		});
		dispatch(setArtboards(updatedArtboards));
	};

	const getMaxMinZoomLevel = () => {
		return {
			minZoom: 0.02,
			maxZoom: 20,
		};
	};

	const zoomFromCenter = (zoom: number) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const { minZoom, maxZoom } = getMaxMinZoomLevel();

		if (zoom > maxZoom) zoom = maxZoom;
		if (zoom < minZoom) zoom = minZoom;
		if (!zoom || isNaN(zoom)) {
			zoom = minZoom;
		}

		const center = canvas.getCenter();
		canvas.zoomToPoint(
			{
				x: center.left,
				y: center.top,
			},
			zoom,
		);
	};

	const zoomToFit = () => {
		const canvas = canvasRef.current;

		if (!canvas) {
			throw new Error('Canvas is not defined');
		}

		// Canvas width and height depending on if the sidebar is open or not
		const canvasWidth = showSidebar ? window.innerWidth - 600 : window.innerWidth;
		const canvasHeight = canvas.getHeight();

		// Artboard width and height
		const artboardWidth = artboardRef.current?.width;
		const artboardHeight = artboardRef.current?.height;

		if (!artboardWidth || !artboardHeight) {
			throw new Error('Artboard width or height is not defined');
		}

		// Calculate the zoom level based on the canvas width and height with 20% padding
		const zoom = Math.min((canvasWidth * 0.8) / artboardWidth, (canvasHeight * 0.8) / artboardHeight);

		// const zoom = Math.min(canvasWidth / artboardWidth, canvasHeight / artboardHeight);

		// Zoom to the center of the canvas
		// zoomFromCenter(zoom);
		centerBoardToCanvas(artboardRef);

		setZoomLevel(canvasRef.current?.getZoom() || zoom);
		if (showRuler) {
			handleZoomRuler(canvasRef, colorSchemeRef.current);
			renderAxis(canvasRef, colorSchemeRef.current);
			rulerBackgroundAdjust(canvasRef, colorSchemeRef.current);
		}
	};

	const zoomIn = () => {
		const zoom = canvasRef.current?.getZoom();
		if (zoom) {
			zoomFromCenter(zoom + 0.1);
			setZoomLevel(canvasRef.current?.getZoom() || zoom + 0.1);
		}
	};

	const zoomOut = () => {
		const zoom = canvasRef.current?.getZoom();
		if (zoom) {
			zoomFromCenter(zoom - 0.1);
			setZoomLevel(canvasRef.current?.getZoom() || zoom - 0.1);
		}
	};

	const deleteElement = () => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const activeObjects = canvas.getActiveObjects();
		console.log('🚀 ~ file: App.tsx:753 ~ deleteElement ~ activeObjects:', activeObjects);
		if (!activeObjects.length) {
			return;
		}

		activeObjects.forEach(object => {
			canvas.remove(object);
		});
		canvas.renderAll();
		dispatch(updateActiveArtboardLayers(canvas.getObjects()));
		saveArtboardChanges();
	};

	const duplicateElement = () => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const activeObjects = canvas.getActiveObjects();
		if (activeObjects.length > 1) {
			return;
		}

		activeObjects[0].clone((cloned: fabric.Object) => {
			canvas.add(cloned);
			canvas.renderAll();
			dispatch(updateActiveArtboardLayers(canvas.getObjects()));
			saveArtboardChanges();
		});
	};

	// Handle the undo and redo actions to update artboards
	useEffect(() => {
		if (!selectedArtboard) {
			return;
		}

		const currentArtboardState = artboards.find(item => item.id === selectedArtboard.id);

		if (!currentArtboardState) {
			return;
		}

		const canvas = canvasRef.current;

		if (!canvas) {
			return;
		}

		const json = currentArtboardState.state;
		canvasRef.current?.loadFromJSON(json, async () => {
			console.log('Loaded from JSON');
			const artboard = canvas.getObjects().find(item => item.data?.type === 'artboard');
			if (artboard) {
				artboardRef.current = artboard as fabric.Rect;
			}

			zoomToFit();

			// create a style sheet
			const artboardTexts = canvas.getObjects().filter(item => item.type === 'textbox');
			// take all texts and then loop over. Read data property inside and get font from it
			const fontPromises = artboardTexts?.map((item: any) => {
				const textItem = item as fabric.Text;
				if (
					textItem.data &&
					typeof textItem.data.font === 'string' &&
					typeof textItem.fontFamily === 'string'
				) {
					const font = textItem.data.font;
					console.debug('font', font, textItem.fontFamily);
					const style = document.createElement('style');

					style.appendChild(document.createTextNode(font));
					document.head.appendChild(style);

					const observer = new FontFaceObserver(textItem.fontFamily || '');

					// load the font
					return observer.load().catch(err => {
						console.log('Font is not available', err);
					});
				} else if (
					textItem.data &&
					typeof textItem.data.boldFont === 'string' &&
					typeof textItem.fontFamily === 'object'
				) {
					const boldFont = textItem.data.boldFont;
					console.debug('boldFont', boldFont, textItem.fontFamily);
					const style = document.createElement('style');

					style.appendChild(document.createTextNode(boldFont));
					document.head.appendChild(style);

					const observer = new FontFaceObserver(textItem.fontFamily || '');

					// load the font
					return observer.load().catch(err => {
						console.log('Bold Font is not available', err);
					});
				}
			});

			// Wait for all the fonts to load
			if (fontPromises) {
				await Promise.all(fontPromises);
			}

			// Attach the reference for reflection object back to the parent object
			(canvas.getObjects() as SmartObject[]).forEach((obj: SmartObject) => {
				const reflection = canvasRef.current
					?.getObjects()
					.find(item => item.data?.type === 'reflection' && item.data.parent === obj.data?.id);
				const reflectionOverlay = canvasRef.current?.getObjects().find(item => {
					return item.data?.type === 'reflectionOverlay' && item.data.parent === obj.data?.id;
				});
				if (reflection) {
					obj.effects.reflection = reflection;
				}
				if (reflectionOverlay) {
					obj.effects.reflectionOverlay = reflectionOverlay;
				}
			});

			guidesRef.current = createSnappingLines(canvasRef);

			renderAxis(canvasRef, colorSchemeRef.current);
			rulerBackgroundAdjust(canvasRef, colorSchemeRef.current);
			handleZoomRuler(canvasRef, colorSchemeRef.current);
			// Get the src of the video element and add it to the canvas
			const videoElements = canvasRef.current?.getObjects().filter(item => item.data?.type === 'video');
			if (videoElements?.length) {
				for (let i = 0; i < videoElements.length; i++) {
					await addVideoToCanvas(videoElements[i].data.src, canvasRef.current!, {
						artboardRef,
					});
				}
			}
			canvas.requestRenderAll();
		});
	}, [selectedArtboard, artboards]);

	useEffect(() => {
		const xaxis = findXAxis(canvasRef);
		const yaxis = findYAxis(canvasRef);
		xaxis?.set({
			fill: theme.colorScheme === 'dark' ? '#fff' : '#000',
			stroke: theme.colorScheme === 'dark' ? '#fff' : '#000',
		});
		yaxis?.set({
			fill: theme.colorScheme === 'dark' ? '#fff' : '#000',
			stroke: theme.colorScheme === 'dark' ? '#fff' : '#000',
		});
	}, [colorScheme, selectedArtboard, artboards]);

	useEffect(() => {
		console.log('show', showRuler);
		if (showRuler) {
			initializeRuler(canvasRef);
		} else {
			removeRuler(canvasRef);
		}
	}, [showRuler]);

	// Handle dragging of canvas with mouse down and alt key pressed
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const handlePan = (opt: any) => {
			// Handle panning based on deltaX and deltaY but prevent zooming
			const e = opt.e;
			e.preventDefault();

			if (e.ctrlKey || e.metaKey) {
				const delta = opt.e.deltaY;
				let zoom = canvasRef?.current?.getZoom() as number;
				zoom *= 0.99 ** delta;
				const { minZoom, maxZoom } = getMaxMinZoomLevel();
				if (zoom > maxZoom) zoom = maxZoom;
				if (zoom < minZoom) zoom = minZoom;
				if (!zoom || isNaN(zoom)) {
					zoom = minZoom;
				}
				canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
				setZoomLevel(zoom);
				canvas.renderAll();
				if (showRuler) {
					rulerBackgroundAdjust(canvasRef, colorSchemeRef.current);
					rulerMarkerAdjust(canvasRef, colorSchemeRef.current);
					handleZoomRuler(canvasRef, colorSchemeRef.current);
				}
			} else {
				const pan = canvas.viewportTransform as FixedArray<number, 6> | undefined;
				if (!pan) {
					return;
				}
				pan[4] -= e.deltaX;
				pan[5] -= e.deltaY;
				canvasRef.current
					?.getObjects()
					.filter(
						item =>
							item.data?.type === RULER_ELEMENTS.X_RULER_MARKER ||
							item.data?.type === RULER_ELEMENTS.X_RULER_MARKER_TEXT ||
							item.data?.type === RULER_ELEMENTS.Y_RULER_MARKER ||
							item.data?.type === RULER_ELEMENTS.Y_RULER_MARKER_TEXT,
					)
					.forEach(item => {
						canvasRef.current?.remove(item);
					});
				if (showRuler) {
					rulerBackgroundAdjust(canvasRef, colorSchemeRef.current);
					rulerMarkerAdjust(canvasRef, colorSchemeRef.current);
					handleZoomRuler(canvasRef, colorSchemeRef.current);
					setCanvasScrollPoints(pan[4] + pan[5]);
				}
				canvas.requestRenderAll();
			}
		};
		canvas.on('mouse:wheel', handlePan);
		return () => {
			canvas.off('mouse:wheel', handlePan);
		};
	}, [selectedArtboard?.height, selectedArtboard?.width]);
	// Update canvas size when viewport size changes
	useEffect(() => {
		const handleResize = () => {
			canvasRef.current?.setDimensions({
				width: window.innerWidth,
				height: window.innerHeight - 60,
			});
			// renderAxis(canvasRef);
			// handleZoomRuler(canvasRef);
			// rulerMarkerAdjust(canvasRef);
		};

		window.addEventListener('resize', handleResize);

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, []);

	// this is hack to reset snapping lines when zoom level changes or scroll changes,ideal solution will be move this to handlePan function and change the snapping lines based on the scroll and zoom level
	useEffect(() => {
		guidesRef.current = createSnappingLines(canvasRef);
	}, [zoomLevel, canvasScrollPoints]);
	useEffect(() => {
		if (!autosaveChanges) {
			return;
		}

		const canvas = canvasRef.current;

		if (!canvas) {
			return;
		}

		// set hasUnsavedChanges to true with 2000ms debounce
		let timeout: NodeJS.Timeout;

		const handleCanvasObjectModification = () => {
			console.log('Object modified');
			timeout = setTimeout(() => {
				setHasUnsavedChanges(true);
				console.log('Marked changes');
			}, 2000);
		};

		canvas.on('object:modified', handleCanvasObjectModification);

		return () => {
			canvas.off('object:modified', handleCanvasObjectModification);
			clearTimeout(timeout);
		};
	}, [autosaveChanges]);

	useEffect(() => {
		if (!hasUnsavedChanges) {
			return;
		}

		saveArtboardChanges();
		setHasUnsavedChanges(false);
	}, [hasUnsavedChanges]);

	useHotkeys([
		[
			'mod+shift+z',
			() => {
				if (redoable) {
					canvasRef.current?.discardActiveObject();
					dispatch(redo());
				}
			},
		],
		[
			'mod+z',
			() => {
				if (undoable) {
					canvasRef.current?.discardActiveObject();
					dispatch(undo());
				}
			},
		],
		[
			'mod+s',
			e => {
				e.preventDefault();
				saveArtboardChanges();
				notifications.show({
					title: 'Changes saved',
					message: 'Phoenix Editor automatically saves your changes',
					icon: <IconCircleCheck size={20} />,
					color: 'green',
					autoClose: 1500,
				});
			},
		],
		[
			'mod+=',
			(event: KeyboardEvent) => {
				event.preventDefault();
				zoomIn();
			},
		],
		[
			'mod+-',
			(event: KeyboardEvent) => {
				event.preventDefault();
				zoomOut();
			},
		],
		[
			'mod+0',
			(event: KeyboardEvent) => {
				event.preventDefault();
				resetZoom();
			},
		],
		[
			'mod+/',
			(event: KeyboardEvent) => {
				event.preventDefault();
				zoomToFit();
			},
		],
		[
			'mod+g',
			(event: KeyboardEvent) => {
				event.preventDefault();
				createGroup();
			},
		],
		[
			'mod+shift+g',
			(event: KeyboardEvent) => {
				event.preventDefault();
				ungroup();
			},
		],
		[
			'backspace',
			(event: KeyboardEvent) => {
				event.preventDefault();
				deleteElement();
			},
		],
		[
			'mod+d',
			(event: KeyboardEvent) => {
				event.preventDefault();
				duplicateElement();
			},
		],
	]);

	return (
		<Box className={classes.root}>
			<Box className={classes.header} px={16}>
				<Flex gap={16} justify={'center'} align={'center'}>
					<Flex justify={'center'} align={'center'} mih={64}>
						{/* <img src="/logo.png" alt="logo" width={64} height={64} /> */}
						<Text className={classes.logo}>Phoenix Editor</Text>
					</Flex>
					<AddMenu artboardRef={artboardRef} selectedArtboard={selectedArtboard} canvasRef={canvasRef} />
					<MiscMenu
						artboards={artboards}
						artboardRef={artboardRef}
						selectedArtboard={selectedArtboard}
						canvasRef={canvasRef}
					/>
				</Flex>
				<Group>
					<SettingsMenu
						recreateCanvas={recreateCanvas}
						canvasRef={canvasRef}
						setShowSidebar={setShowSidebar}
						autosaveChanges={autosaveChanges}
						setAutoSaveChanges={setAutoSaveChanges}
						snapDistance={snapDistance}
						setSnapDistance={setSnapDistance}
						setShowRuler={setShowRuler}
					/>
					<Tooltip label="Save" openDelay={500}>
						<ActionIcon onClick={saveArtboardChanges} size={20}>
							<IconDeviceFloppy />
						</ActionIcon>
					</Tooltip>
					<ZoomMenu
						zoom={zoomLevel}
						zoomIn={zoomIn}
						zoomOut={zoomOut}
						zoomReset={resetZoom}
						zoomToFit={zoomToFit}
					/>
					<Button size="xs" leftIcon={<IconDownload size={14} />} variant="light" onClick={exportArtboard}>
						Export artboard
					</Button>
					<Button
						size="xs"
						leftIcon={<IconFileDownload size={14} />}
						variant="light"
						onClick={exportAllArtboards}
						loading={isDownloading}
						disabled={window.location.hostname.includes('vercel')}
					>
						Export all
					</Button>
				</Group>
			</Box>
			<Flex className={classes.shell}>
				{showSidebar ? (
					<Box className={classes.left}>
						<Stack spacing={0}>
							<Flex sx={{ padding: '0.5rem 1rem' }} align={'center'} justify={'space-between'}>
								<Flex align={'center'} justify={'space-between'} w={'100%'}>
									<SectionTitle>Artboards ({artboards.length})</SectionTitle>
									<Tooltip label="Create new artboard" openDelay={500}>
										<ActionIcon onClick={open} color="violet" size={16}>
											<IconPlus />
										</ActionIcon>
									</Tooltip>
								</Flex>
								<Box>
									{artboards.length >= 100 ? (
										<Button size="xs" variant="subtle" onClick={() => setShowAll(c => !c)}>
											{showAll ? 'Show less' : 'Show all'}
										</Button>
									) : null}
								</Box>
							</Flex>

							<Group sx={{ overflowY: 'auto', margin: 0, padding: 0, gap: 0 }}>
								{artboards.length > 0
									? (!showAll ? artboards.slice(0, 100) : artboards).map(artboard => (
											<Group
												key={artboard.id}
												className={classes.artboardButton}
												onClick={() => updateSelectedArtboard(artboard)}
												align="center"
												style={{
													backgroundColor:
														selectedArtboard?.id === artboard.id
															? theme.colorScheme === 'dark'
																? theme.colors.dark[6]
																: theme.colors.violet[1]
															: 'transparent',
												}}
											>
												<Text size={14}>{artboard.name}</Text>
												<Text size={12} color="gray">
													{artboard.width}x{artboard.height}
												</Text>
											</Group>
									  ))
									: null}
							</Group>
						</Stack>

						<Stack spacing={16} sx={{ padding: '0.5rem 1rem' }}>
							<Stack spacing={8}>
								<LayerList canvas={canvasRef.current} />
							</Stack>
						</Stack>
					</Box>
				) : null}
				<Center className={classes.center} ref={canvasContainerRef}>
					<canvas id="canvas" />
				</Center>
				{showSidebar ? (
					<Box className={classes.right}>
						{canvasRef.current && currentSelectedElements && (
							<Panel
								artboardRef={artboardRef}
								canvas={canvasRef.current}
								currentSelectedElements={currentSelectedElements}
								saveArtboardChanges={saveArtboardChanges}
							/>
						)}
					</Box>
				) : null}
			</Flex>
			<Modal
				opened={opened}
				onClose={() => {
					newArtboardForm.reset();
					close();
				}}
				title="Create new artboard"
				classNames={{
					content: modalClasses.content,
					title: modalClasses.title,
				}}
			>
				<Stack spacing={'lg'}>
					<TextInput
						label="Artboard name"
						placeholder="Untitled artboard"
						required
						classNames={{ label: modalClasses.label }}
						{...newArtboardForm.getInputProps('name')}
						data-autofocus
					/>
					<Group grow>
						<NumberInput
							label="Width"
							placeholder="500"
							required
							classNames={{ label: modalClasses.label }}
							{...newArtboardForm.getInputProps('width')}
						/>
						<NumberInput
							label="Height"
							placeholder="500"
							required
							classNames={{ label: modalClasses.label }}
							{...newArtboardForm.getInputProps('height')}
						/>
					</Group>
					<NumberInput
						label="Number of artboards"
						placeholder="1"
						required
						classNames={{ label: modalClasses.label }}
						{...newArtboardForm.getInputProps('number')}
						min={1}
						max={1000}
					/>
					<Button
						variant="light"
						size="sm"
						fullWidth
						mt={'md'}
						loading={isCreatingArboards}
						onClick={() => {
							if (newArtboardForm.values.number > 1) {
								createMultipleArtboards(newArtboardForm.values, newArtboardForm.values.number);
								return;
							}

							addNewArtboard(newArtboardForm.values);
						}}
					>
						{newArtboardForm.values.number > 1
							? `Create ${newArtboardForm.values.number} artboards`
							: `Create artboard`}
					</Button>
				</Stack>
			</Modal>
		</Box>
	);
}

const useStyles = createStyles(theme => ({
	root: {
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[2],
		width: '100vw',
		height: '100vh',
		overflow: 'hidden',
	},
	header: {
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[0],
		borderBottom: `1px solid ${theme.colors.gray[3]}`,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	logo: {
		fontSize: theme.fontSizes.md,
		fontWeight: 700,
		color: theme.colors.violet[7],
	},
	// Create a system where the left and the right panels are on top of the center
	shell: {
		height: 'calc(100vh - 4rem)',
		position: 'relative',
	},
	left: {
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[0],
		borderRight: `1px solid ${theme.colors.gray[3]}`,
		width: 300,
		display: 'grid',
		gridTemplateRows: '50% 50%',
		height: '100%',
		zIndex: 1,
		position: 'absolute',
		left: 0,
		overflowY: 'auto',
		paddingBlockEnd: '1rem',
	},
	right: {
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[0],
		borderLeft: `1px solid ${theme.colors.gray[3]}`,
		zIndex: 1,
		position: 'absolute',
		right: 0,
		width: 300,
		height: '100%',
		padding: '1rem',
		overflowY: 'auto',
		paddingBottom: '2rem',
	},
	center: {
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[2],
		borderLeft: `1px solid ${theme.colors.gray[3]}`,
		borderRight: `1px solid ${theme.colors.gray[3]}`,
		flexGrow: 1,
		flexShrink: 1,
		zIndex: 0,
	},
	artboardButton: {
		cursor: 'pointer',
		backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[0],
		padding: '0.5rem 1rem',
		transition: 'background-color 100ms ease',
		height: 40,
		width: '100%',
		'&:hover': {
			backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2],
		},
	},
}));

export default App;
