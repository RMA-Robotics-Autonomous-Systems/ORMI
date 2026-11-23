import { describe, expect, it } from "bun:test";

import {
	EDIT_CARD_HANDLE_PAD_PX,
	EDIT_CARD_MARGIN_PX,
	coveredHandles,
	editCardSide,
	handlePositions,
} from "./map-edit-card";

const card = { width: 256, height: 230 };
const panelWidth = 900;

describe("handlePositions", () => {
	it("lists each corner once and each edge's midpoint", () => {
		const handles = handlePositions({
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[2, 0],
					[2, 2],
					[0, 0],
				],
			],
		});
		expect(handles).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[1, 0],
			[2, 1],
			[1, 1],
		]);
	});

	it("has no closing midpoint on a line", () => {
		expect(
			handlePositions({
				type: "LineString",
				coordinates: [
					[0, 0],
					[2, 0],
				],
			}),
		).toEqual([
			[0, 0],
			[2, 0],
			[1, 0],
		]);
	});

	it("is the point itself for a point, and nothing for anything else", () => {
		expect(handlePositions({ type: "Point", coordinates: [1, 2] })).toEqual(
			[[1, 2]],
		);
		expect(
			handlePositions({ type: "MultiPoint", coordinates: [] }),
		).toEqual([]);
		expect(handlePositions(null)).toEqual([]);
	});
});

describe("where the edit card sits", () => {
	const underLeftCard = { x: 100, y: 100 };
	const underRightCard = { x: panelWidth - 100, y: 100 };
	const inTheMiddle = { x: panelWidth / 2, y: 400 };

	it("counts a handle just outside the card as covered, within its radius", () => {
		const edge = EDIT_CARD_MARGIN_PX + card.width;
		expect(
			coveredHandles(
				"left",
				[{ x: edge + EDIT_CARD_HANDLE_PAD_PX, y: 50 }],
				panelWidth,
				card,
			),
		).toBe(1);
		expect(
			coveredHandles(
				"left",
				[{ x: edge + EDIT_CARD_HANDLE_PAD_PX + 1, y: 50 }],
				panelWidth,
				card,
			),
		).toBe(0);
	});

	it("stays top-left while it covers nothing", () => {
		expect(editCardSide("left", [inTheMiddle], panelWidth, card)).toBe(
			"left",
		);
	});

	it("moves right when a handle is under it on the left and not on the right", () => {
		expect(
			editCardSide(
				"left",
				[underLeftCard, inTheMiddle],
				panelWidth,
				card,
			),
		).toBe("right");
	});

	it("moves back left when the right covers more", () => {
		expect(editCardSide("right", [underRightCard], panelWidth, card)).toBe(
			"left",
		);
	});

	it("stays put on a tie, so it never moves for nothing", () => {
		const both = [underLeftCard, underRightCard];
		expect(editCardSide("left", both, panelWidth, card)).toBe("left");
		expect(editCardSide("right", both, panelWidth, card)).toBe("right");
	});
});
