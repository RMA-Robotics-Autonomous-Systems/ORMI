import { describe, expect, it } from "bun:test";

import {
	MAP_LAYERS_STORAGE_KEY,
	readStoredMapLayers,
	writeStoredMapLayers,
	type MapLayersStorage,
} from "./map-layers-storage";

/** In-memory storage. */
function memoryStorage(
	initial: Record<string, string> = {},
): MapLayersStorage & {
	data: Record<string, string>;
} {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => (key in data ? data[key]! : null),
		setItem: (key, value) => {
			data[key] = value;
		},
	};
}

/** Storage whose every access throws, as a blocked one does. */
const throwingStorage: MapLayersStorage = {
	getItem: () => {
		throw new Error("blocked");
	},
	setItem: () => {
		throw new Error("blocked");
	},
};

const REF = {
	serverKey: "https://maps.example.org/geoserver",
	layerId: "aidedex:site",
	enabled: true,
	opacity: 0.7,
};

describe("bag analyzer map-layer storage", () => {
	it("round-trips a selection under the versioned key", () => {
		const storage = memoryStorage();
		writeStoredMapLayers([REF], storage);
		expect(Object.keys(storage.data)).toEqual([MAP_LAYERS_STORAGE_KEY]);
		expect(readStoredMapLayers(storage)).toEqual([REF]);
	});

	it("reads empty when nothing is stored or no storage exists", () => {
		expect(readStoredMapLayers(memoryStorage())).toEqual([]);
		expect(readStoredMapLayers(undefined)).toEqual([]);
	});

	it("reads empty from a corrupt or non-array value", () => {
		expect(
			readStoredMapLayers(
				memoryStorage({ [MAP_LAYERS_STORAGE_KEY]: "{not json" }),
			),
		).toEqual([]);
		expect(
			readStoredMapLayers(
				memoryStorage({ [MAP_LAYERS_STORAGE_KEY]: '{"a":1}' }),
			),
		).toEqual([]);
	});

	it("keeps items it cannot read, so nothing is erased unseen", () => {
		const stored = [REF, { serverKey: 3 }];
		const storage = memoryStorage({
			[MAP_LAYERS_STORAGE_KEY]: JSON.stringify(stored),
		});
		expect(readStoredMapLayers(storage)).toEqual(stored);
	});

	it("tolerates a storage that throws", () => {
		expect(readStoredMapLayers(throwingStorage)).toEqual([]);
		expect(() =>
			writeStoredMapLayers([REF], throwingStorage),
		).not.toThrow();
	});
});
