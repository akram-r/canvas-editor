import { createReducer } from '@reduxjs/toolkit';
import { Artboard } from '../../types';
import { initState, updateActiveArtboardLayers, updateArtboards, updateSelectedArtboard } from './actions';

export interface ApplicationState {
	artboards: Array<Artboard>;
	selectedArtboard: Artboard | null;
	activeArtboardLayers: Array<any>;
}

export const initialState: ApplicationState = {
	selectedArtboard: null,
	artboards: [],
	activeArtboardLayers: [],
};

const appReducer = createReducer(initialState, builder => {
	return builder
		.addCase(initState, (state, action) => {
			// Set the initial state of the application for all the keys in the payload
			Object.keys(action.payload).forEach((key: string) => {
				(state as any)[key] = action.payload[key as keyof ApplicationState];
			});
		})
		.addCase(updateArtboards, (state, action) => {
			state.artboards = action.payload;
		})
		.addCase(updateSelectedArtboard, (state, action) => {
			state.selectedArtboard = action.payload;
		})
		.addCase(updateActiveArtboardLayers, (state, action) => {
			state.activeArtboardLayers = action.payload;
		});
});

export default appReducer;
