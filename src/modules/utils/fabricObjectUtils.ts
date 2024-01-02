import { RULER_ELEMENTS } from '../ruler';

const isSnappingExclude = (obj: fabric.Object) => !obj?.data?.isSnappingLine && !obj?.data?.ignoreSnapping;

const isRulerExclude = (obj: fabric.Object) => !Object.values(RULER_ELEMENTS).includes(obj?.data?.type);

const isSaveExclude = (obj: fabric.Object) => isSnappingExclude(obj) && isRulerExclude(obj);

export const filterSnappingExcludes = (arr: fabric.Object[] | undefined) => {
	if (!arr) return [];
	return arr.filter(isSnappingExclude);
};

export const filterRulerExcludes = (arr: fabric.Object[] | undefined) => {
	if (!arr) return [];
	return arr.filter(isRulerExclude);
};

export const filterSaveExcludes = (arr: fabric.Object[] | undefined) => {
	if (!arr) return [];
	const res = arr.filter(isSaveExclude);
	console.log('🚀 ~ file: fabricObjectUtils.ts:27 ~ filterSaveExcludes ~ res:', res);
	return res;
};
