/**
 * Tests for which widgets a topic click can reach.
 *
 * The count a topic list shows and the decision a topic click takes are
 * rendered by different components and must never disagree, so the predicate
 * they share is pinned here rather than beside either surface.
 *
 * Reachability is now the same statement routing is made of: a widget is
 * reachable when a plugin **claims** it. That is deliberately not re-derivable
 * from the widget alone, which is why every case below builds the claim index
 * the dashboard builds.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { countTopicReachable, isTopicReachable } from "../topic-reachability";
import { buildTopicClaimIndex, type TopicClaim } from "../topic-claims";
import {
	getTopicRoutingIndex,
	resetTopicRoutingIndexCache,
} from "../topic-routing";
import type { WidgetDefinition } from "../widget-interface";

const noopComponent = (() => null) as unknown as WidgetDefinition["Component"];

const defineWidget = (
	id: string,
	uischema: UISchemaElement,
	schema: JsonSchema = { type: "object", properties: {} },
): WidgetDefinition => ({
	id,
	name: id,
	description: id,
	schema,
	uischema,
	data: {},
	Component: noopComponent,
});

/** A plain viewer: one `TopicSelect`, defaults for direction and role. */
const subscriberWidget = defineWidget("gauge", {
	type: "VerticalLayout",
	elements: [
		{ type: "Control", scope: "#/properties/title" },
		{
			type: "TopicSelect",
			scope: "#/properties/topic",
			options: { dataRequirements: { accepts: ["number"] } },
		},
	],
} as unknown as UISchemaElement);

/** A control: its only slot publishes a declared type, so it can be claimed. */
const publisherWidget = defineWidget("teleop", {
	type: "VerticalLayout",
	elements: [
		{
			type: "TopicSelect",
			scope: "#/properties/cmdVel",
			options: {
				direction: "publish",
				dataRequirements: { accepts: ["twist"] },
			},
		},
	],
} as unknown as UISchemaElement);

/** A widget whose only subscribing slot is secondary, never an entry point. */
const secondaryOnlyWidget = defineWidget("overlay", {
	type: "VerticalLayout",
	elements: [
		{
			type: "TopicSelect",
			scope: "#/properties/mask",
			options: { role: "secondary" },
		},
	],
} as unknown as UISchemaElement);

/** An iframe panel: no topic slot at all. */
const noSlotWidget = defineWidget("iframe", {
	type: "VerticalLayout",
	elements: [{ type: "Control", scope: "#/properties/url" }],
} as unknown as UISchemaElement);

/** A publisher that also subscribes for feedback. */
const mixedWidget = defineWidget("joystick-with-echo", {
	type: "VerticalLayout",
	elements: [
		{
			type: "TopicSelect",
			scope: "#/properties/cmdVel",
			options: { direction: "publish" },
		},
		{
			type: "TopicSelect",
			scope: "#/properties/odometry",
			options: { dataRequirements: { accepts: ["odometry"] } },
		},
	],
} as unknown as UISchemaElement);

const REGISTRY = [
	subscriberWidget,
	publisherWidget,
	secondaryOnlyWidget,
	noSlotWidget,
	mixedWidget,
];

/** Resolve claims against the whole fixture registry, as the dashboard does. */
const indexFor = (claims: TopicClaim[]) =>
	buildTopicClaimIndex(claims, getTopicRoutingIndex(REGISTRY));

beforeEach(() => {
	resetTopicRoutingIndexCache();
});

describe("isTopicReachable — the Topics/Widgets invariant", () => {
	test("a claimed widget is reachable from Topics", () => {
		const claims = indexFor([
			{
				type: "number",
				widgetId: "gauge",
				slot: "topic",
				role: "default",
			},
		]);
		expect(isTopicReachable(subscriberWidget, claims)).toBe(true);
	});

	test("a control claimed as a command is reachable, as a control", () => {
		// Clicking a Movement topic offers to command a robot with it — an
		// option the operator picks, never one routing takes. `isTopicReachable`
		// answers "can a topic click open this?", and for a claimed control it
		// can.
		const claims = indexFor([
			{
				type: "twist",
				widgetId: "teleop",
				slot: "cmdVel",
				role: "command",
			},
		]);
		expect(isTopicReachable(publisherWidget, claims)).toBe(true);
	});

	test("an unclaimed widget is not reachable, however routable its slots look", () => {
		// The whole point of the change: the gauge has a perfectly good typed
		// subscribing slot, and is still not an answer to a topic click until
		// its plugin says so.
		expect(isTopicReachable(subscriberWidget, indexFor([]))).toBe(false);
	});

	test("a claim naming a slot the widget does not have is not reachability", () => {
		const claims = indexFor([
			{
				type: "number",
				widgetId: "gauge",
				slot: "notATopic",
				role: "default",
			},
		]);
		expect(isTopicReachable(subscriberWidget, claims)).toBe(false);
	});

	test("a claim on a secondary slot is not an entry point", () => {
		const claims = indexFor([
			{
				type: "mask",
				widgetId: "overlay",
				slot: "mask",
				role: "default",
			},
		]);
		expect(isTopicReachable(secondaryOnlyWidget, claims)).toBe(false);
	});

	test("a widget with no topic slot can never be claimed", () => {
		const claims = indexFor([
			{
				type: "anything",
				widgetId: "iframe",
				slot: "url",
				role: "default",
			},
		]);
		expect(isTopicReachable(noSlotWidget, claims)).toBe(false);
	});

	test("one claimed slot is enough, whatever else the widget publishes", () => {
		const claims = indexFor([
			{
				type: "odometry",
				widgetId: "joystick-with-echo",
				slot: "odometry",
				role: "default",
			},
		]);
		expect(isTopicReachable(mixedWidget, claims)).toBe(true);
	});

	test("every widget the Topics tab can reach is in the Widgets tab", () => {
		// The Widgets tab renders the registry verbatim, so the invariant is
		// the subset relation: Topics ⊆ Widgets, never the other way round.
		const claims = indexFor([
			{
				type: "number",
				widgetId: "gauge",
				slot: "topic",
				role: "default",
			},
			{
				type: "twist",
				widgetId: "teleop",
				slot: "cmdVel",
				role: "command",
			},
		]);
		const reachable = REGISTRY.filter((definition) =>
			isTopicReachable(definition, claims),
		);

		expect(reachable.length).toBeLessThan(REGISTRY.length);
		expect(reachable.every((widget) => REGISTRY.includes(widget))).toBe(
			true,
		);
		expect(countTopicReachable(REGISTRY, claims)).toBe(reachable.length);
	});

	test("an empty registry reaches nothing", () => {
		expect(countTopicReachable([], indexFor([]))).toBe(0);
	});
});
