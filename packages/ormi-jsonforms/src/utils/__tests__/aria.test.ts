import { describe, expect, it } from "bun:test";

import { controlAriaProps, descriptionId, errorId } from "../aria";

describe("descriptionId / errorId", () => {
	it("derives stable ids from the control id", () => {
		expect(descriptionId("#/properties/topic")).toBe(
			"#/properties/topic-description",
		);
		expect(errorId("#/properties/topic")).toBe("#/properties/topic-error");
	});

	it("returns undefined when the control has no id", () => {
		expect(descriptionId(undefined)).toBeUndefined();
		expect(errorId("")).toBeUndefined();
	});
});

describe("controlAriaProps", () => {
	it("emits nothing for a valid, optional control without description", () => {
		expect(controlAriaProps({ id: "f", isValid: true })).toEqual({});
	});

	it("marks invalid controls and points at the error paragraph", () => {
		expect(controlAriaProps({ id: "f", isValid: false })).toEqual({
			"aria-invalid": true,
			"aria-describedby": "f-error",
		});
	});

	it("marks required controls", () => {
		expect(
			controlAriaProps({ id: "f", isValid: true, required: true }),
		).toEqual({ "aria-required": true });
	});

	it("references the description only when it is rendered", () => {
		expect(
			controlAriaProps({ id: "f", isValid: true, showDescription: true }),
		).toEqual({ "aria-describedby": "f-description" });

		expect(
			controlAriaProps({
				id: "f",
				isValid: true,
				showDescription: false,
			}),
		).toEqual({});
	});

	it("references description and error together, in reading order", () => {
		expect(
			controlAriaProps({
				id: "f",
				isValid: false,
				required: true,
				showDescription: true,
			}),
		).toEqual({
			"aria-invalid": true,
			"aria-required": true,
			"aria-describedby": "f-description f-error",
		});
	});

	it("omits aria-describedby when there is no id to reference", () => {
		expect(
			controlAriaProps({
				isValid: false,
				showDescription: true,
			}),
		).toEqual({ "aria-invalid": true });
	});
});
