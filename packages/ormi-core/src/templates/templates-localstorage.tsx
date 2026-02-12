"use client";
import { Template } from "./templates-types";

/**
 * Load templates from localStorage.
 * @returns Templates map.
 */
export const temphandleLoad = (): Map<string, Template> => {
	const templates = localStorage.getItem("ormi_templates");

	if (!templates) {
		return new Map<string, Template>();
	}

	// templates is an object, convert it to Map
	return new Map(Object.entries(JSON.parse(templates)));
};

/**
 * Save templates to localStorage.
 * @param templates - Templates map.
 */
export const temphandleSave = (templates: Map<string, Template>) => {
	// convert to object to save to local storage

	const obj = Object.fromEntries(templates);

	localStorage.setItem("ormi_templates", JSON.stringify(obj));
};
