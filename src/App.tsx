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
import AddMenu from './modules/menu/AddMenu';
import LayerList from './modules/layers/List';
import MiscMenu from './modules/menu/MiscMenu';
import Panel from './components/Panel';
import SettingsMenu from './modules/settings';
import ZoomMenu from './modules/zoom';
import { useQueryParam } from './hooks';
import { appStart, setArtboards, setSelectedArtboard, updateActiveArtboardLayers } from './modules/app/actions';
import { redo, undo } from './modules/history/actions';
import store from './store';
import { RootState } from './store/rootReducer';
import { Artboard, colorSpaceType, guidesRefType, snappingObjectType } from './types';
import { generateId } from './utils';
import { SmartObject } from './modules/reflection/helpers';
import { useModalStyles } from './styles/modal';
import SectionTitle from './components/SectionTitle';
import { FABRIC_JSON_ALLOWED_KEYS } from './constants';
import { createSnappingLines, filterSnappingExcludes, snapToObject } from './modules/snapping';

store.dispatch(appStart());

function App() {
	const dispatch = useDispatch();
	const artboards = useSelector((state: RootState) => state.app.artboards);
	const selectedArtboard = useSelector((state: RootState) => state.app.selectedArtboard);
	const [snapDistance, setSnapDistance] = useLocalStorage<string>({
		key: 'snapDistance',
		defaultValue: '2',
	});
	const xaxisRef = useRef<fabric.Rect | null>(null);
	const yaxisRef = useRef<fabric.Rect | null>(null);
	const theme = useMantineTheme();
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
		canvasRef.current = new fabric.Canvas('canvas', {
			// create a canvas with clientWidth and clientHeight
			width: window.innerWidth - 600,
			height: window.innerHeight - 60,
			backgroundColor: '#e9ecef',
			colorSpace: colorSpace as colorSpaceType,
		});
		// Handle element selection TODO: add more element type and handle it
		canvasRef.current?.on('selection:created', function (event) {
			setCurrentSelectedElements(event.selected as fabric.Object[]);
		});
		canvasRef.current?.on('selection:updated', function (event) {
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
		canvasRef.current?.on('selection:cleared', function () {
			setCurrentSelectedElements(null);
		});
		// Add a click event listener to the canvas
		canvasRef.current.on('mouse:down', function (options) {
			if (
				options?.target?.data?.type === 'xruler' ||
				options?.target?.data?.type === 'xrulermarker' ||
				options?.target?.data?.type === 'xrulermarkertext'
			) {
				const zoom = canvasRef.current?.getZoom() as number;
				const pointer = canvasRef.current?.getPointer(options.e) as { x: number; y: number };
				const canvasHeight = canvasRef.current?.height as number;
				const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
				const line = new fabric.Line([pointer.x, (-pan[5] + 20) / zoom, pointer.x, canvasHeight], {
					stroke: '#000',
					strokeWidth: 2 / zoom,
					hoverCursor: 'default',
					hasControls: false,
					lockRotation: true,
					lockMovementY: true,
					lockScalingX: true,
					lockScalingY: true,
					lockUniScaling: true,
					lockSkewingX: true,
					lockSkewingY: true,
					lockScalingFlip: true,
					data: {
						type: 'xRulerLine',
						id: generateId(),
					},
				});
				canvasRef.current?.add(line);
				canvasRef.current?.requestRenderAll();
			} else if (
				options?.target?.data?.type === 'yruler' ||
				options?.target?.data?.type === 'yrulermarker' ||
				options?.target?.data?.type === 'yrulermarkertext'
			) {
				const zoom = canvasRef.current?.getZoom() as number;
				const pointer = canvasRef.current?.getPointer(options.e) as { x: number; y: number };
				const canvasWidth = (canvasRef.current?.width as number) / zoom;
				const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
				const line = new fabric.Line([(-pan[4] + 20) / zoom, pointer.y, canvasWidth, pointer.y], {
					stroke: '#000',
					strokeWidth: 2 / canvasRef.current?.getZoom(),
					hoverCursor: 'default',
					lockMovementX: true,
					hasControls: false,
					lockRotation: true,
					lockMovementY: true,
					lockScalingX: true,
					lockScalingY: true,
					lockUniScaling: true,
					lockSkewingX: true,
					lockSkewingY: true,
					lockScalingFlip: true,
					data: {
						type: 'yRulerLine',
						id: generateId(),
					},
				});
				canvasRef.current?.add(line);
				canvasRef.current?.requestRenderAll();
			}
		});
		return () => {
			canvasRef.current?.dispose();
		};
	}, []);

	const onMoveHandler = (options: fabric.IEvent) => {
		const target = options.target as fabric.Object;
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
		handleZoomRuler(canvasRef, 1, [0, 0, 0, 0, 0, 0], canvasRef.current as fabric.Canvas);
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
		const updatedArtboards = [
			...artboards,
			{
				...newArtboard,
				state: {
					...json,
					objects: filterSnappingExcludes(json?.objects),
				},
			},
		];
		console.log(updatedArtboards);
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

	const getMultiplierFor4K = (width?: number, height?: number): number => {
		// Assuming the canvas is not already 4K, calculate the multiplier needed
		// to scale the current canvas size up to 4K resolution
		const maxWidth = 3840; // for UHD 4K width
		const maxHeight = 2160; // for UHD 4K height
		const widthMultiplier = maxWidth / (width || 1);
		const heightMultiplier = maxHeight / (height || 1);

		// Use the smaller multiplier to ensure the entire canvas fits into the 4K resolution
		return Math.min(widthMultiplier, heightMultiplier);
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
						objects: filterSnappingExcludes(json?.objects),
					},
				};
			}
			return item;
		});
		dispatch(setArtboards(updatedArtboards));
	};

	const getMaxMinZoomLevel = (dimensions: { width: number; height: number }) => {
		const { width, height } = dimensions;

		if (width >= 10000 || height >= 10000) {
			return {
				minZoom: 0.01,
				maxZoom: 5,
			};
		}

		if (width >= 5000 || height >= 5000) {
			return {
				minZoom: 0.025,
				maxZoom: 10,
			};
		}

		if (width >= 2000 || height >= 2000) {
			return {
				minZoom: 0.1,
				maxZoom: 20,
			};
		}

		return {
			minZoom: 0.1,
			maxZoom: 10,
		};
	};

	const zoomFromCenter = (zoom: number) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const { minZoom, maxZoom } = getMaxMinZoomLevel({
			width: selectedArtboard?.width || 1,
			height: selectedArtboard?.height || 1,
		});

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
		zoomFromCenter(zoom);
		centerBoardToCanvas(artboardRef);
		setZoomLevel(canvasRef.current?.getZoom() || zoom);
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
			const artboard = canvasRef.current?.getObjects().find(item => item.data?.type === 'artboard');
			if (artboard) {
				artboardRef.current = artboard as fabric.Rect;
			}
			zoomToFit();

			// create a style sheet
			const artboardTexts = canvasRef.current?.getObjects().filter(item => item.type === 'textbox');
			// take all texts and then loop over. Read data property inside and get font from it
			const fontPromises = artboardTexts?.map(item => {
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
			(canvasRef.current?.getObjects() as SmartObject[]).forEach((obj: SmartObject) => {
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
			renderAxis(canvasRef, xaxisRef, yaxisRef);
			// renderGrid(canvasRef, 40, 40);
			canvas.requestRenderAll();
		});
	}, [selectedArtboard, artboards]);

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
				const { minZoom, maxZoom } = getMaxMinZoomLevel({
					width: selectedArtboard?.width || 1,
					height: selectedArtboard?.height || 1,
				});
				if (zoom > maxZoom) zoom = maxZoom;
				if (zoom < minZoom) zoom = minZoom;
				if (!zoom || isNaN(zoom)) {
					zoom = minZoom;
				}
				canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
				const pan = canvasRef?.current?.viewportTransform as unknown as fabric.IPoint[];
				const canvasWidth = canvasRef?.current?.width as number;
				const canvasHeight = canvasRef?.current?.height as number;
				xaxisRef?.current?.set({
					left: -pan[4] / zoom,
					top: -pan[5] / zoom,
					strokeWidth: 1 / zoom,
					width: canvasWidth / zoom,
					height: 20 / zoom,
				});
				yaxisRef?.current?.set({
					left: -pan[4] / zoom,
					top: -pan[5] / zoom,
					strokeWidth: 1 / zoom,
					width: 20 / zoom,
					height: canvasHeight / zoom,
				});
				rulerMarkerAdjust(canvasRef);

				handleZoomRuler(canvasRef, zoom, pan, canvas);
				xaxisRef.current?.setCoords();
				yaxisRef.current?.setCoords();
				setZoomLevel(zoom);
				canvas.renderAll();
			} else {
				const vpt = canvas.viewportTransform;
				if (!vpt) {
					return;
				}
				const pan = canvasRef?.current?.viewportTransform;

				vpt[4] -= e.deltaX;
				vpt[5] -= e.deltaY;
				xaxisRef?.current?.set({
					left: -pan[4] / canvasRef.current?.getZoom(),
					top: -pan[5] / canvasRef.current?.getZoom(),
					width: canvasRef.current?.width / canvasRef.current?.getZoom(),
					height: 20 / canvasRef.current?.getZoom(),
				});
				xaxisRef.current?.setCoords();
				yaxisRef?.current?.set({
					left: -pan[4] / canvasRef.current?.getZoom(),
					top: -pan[5] / canvasRef.current?.getZoom(),
					width: 20 / canvasRef.current?.getZoom(),
					height: canvasRef.current?.height / canvasRef.current?.getZoom(),
				});
				yaxisRef.current?.setCoords();
				canvasRef.current
					?.getObjects()
					.filter(
						item =>
							item.data?.type === 'xrulermarker' ||
							item.data?.type === 'xrulermarkertext' ||
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
				rulerMarkerAdjust(canvasRef);
				const { left } = getVisibleTopLeft(canvasRef);
				// find value nearest to 10
				const nearest = Math.round(left / 50) * 50;
				const zoom = canvasRef.current?.getZoom();

				handleZoomRuler(canvasRef, zoom, pan, canvas);
				setCanvasScrollPoints(vpt[4] + vpt[5]);
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
			renderAxis(canvasRef, xaxisRef, yaxisRef);
			handleZoomRuler(canvasRef, zoomLevel, [0, 0, 0, 0, 0, 0], canvasRef.current as fabric.Canvas);
			rulerMarkerAdjust(canvasRef);
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

function handleZoomRuler(
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	zoom: number,
	pan: number[] | undefined,
	canvas: fabric.Canvas,
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
		const digits = Math.floor(Math.log10(Math.abs(num))) + 1;
		return 3 + digits;
	};
	const nearest = Math.round(left / interval()) * interval();
	for (let i = nearest; i < (canvasRef.current?.width + -pan[4]) / canvas.getZoom(); i += interval()) {
		const rect = new fabric.Rect({
			left: i,
			top: (-pan[5] + 16) / zoom,
			fill: 'gray',
			width: 2 / zoom,
			height: 5 / zoom,
			selectable: false,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: 'xrulermarker',
				id: generateId(),
			},
		});

		const text = new fabric.Text(`${i}`, {
			left: i - Math.abs(diff(i)) / zoom,
			top: (-pan[5] + 1) / zoom,
			fontSize: 10 / zoom,
			fontFamily: 'Inter',
			fill: '#000',
			selectable: false,
			hoverCursor: 'default',
			data: {
				ignoreSnapping: true,
				type: 'xrulermarkertext',
				id: generateId(),
			},
		});
		text.bringForward();
		canvasRef.current?.add(rect, text);
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
			left: (-pan[4] + 1) / zoom,
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
		canvasRef.current?.add(line, text);
	}
	canvasRef.current?.requestRenderAll();
}

function renderAxis(
	canvasRef: React.MutableRefObject<fabric.Canvas | null>,
	xaxisRef: React.MutableRefObject<fabric.Rect | null>,
	yaxisRef: React.MutableRefObject<fabric.Rect | null>,
) {
	const zoom = canvasRef.current?.getZoom() as number;
	const xaxis = new fabric.Rect({
		left: 0,
		top: 0,
		fill: '#fff	',
		width: canvasRef.current?.width,
		height: 20,
		selectable: false,
		stroke: '#000',
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
		fill: '#fff',
		width: 20,
		selectable: false,
		height: canvasRef.current?.height,
		stroke: '#000',
		strokeWidth: 1 / zoom,
		data: {
			displayText: 'Shape',
			id: generateId(),
			type: 'yruler',
			ignoreSnapping: true,
		},
	});
	canvasRef.current?.remove(xaxisRef.current, yaxisRef.current);
	xaxisRef.current = xaxis;
	yaxisRef.current = yaxis;
	canvasRef.current?.add(xaxis, yaxis);
	handleZoomRuler(canvasRef, 1, [0, 0, 0, 0, 0, 0], canvasRef.current as fabric.Canvas);
	canvasRef.current?.requestRenderAll();
}

function rulerMarkerAdjust(canvasRef: React.MutableRefObject<fabric.Canvas | null>) {
	const allObjects = canvasRef?.current?.getObjects() as fabric.Object[];
	const zoom = canvasRef.current?.getZoom() as number;
	const canvasHeight = canvasRef.current?.height as number;
	const canvasWidth = canvasRef.current?.width as number;
	allObjects
		.filter(x => x.data.type === 'xRulerLine')
		.forEach(x => {
			const pan = canvasRef.current?.viewportTransform as unknown as fabric.IPoint[];
			x?.set({
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
				strokeWidth: 2 / zoom,
				left: (-pan[4] + 20) / zoom,
				width: canvasWidth / zoom,
			});
		});
}
