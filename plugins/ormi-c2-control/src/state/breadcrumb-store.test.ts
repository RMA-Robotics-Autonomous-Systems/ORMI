import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
	__flushBreadcrumbs,
	__resetBreadcrumbStore,
	getBreadcrumbs,
	recordBreadcrumb,
	subscribe,
} from "./breadcrumb-store";

/** ~1.1 m north of `lat` per step — past the 0.5 m spacing. */
const at = (step: number): [number, number] => [4.39, 50.84 + step * 0.00001];

describe("breadcrumb store — throttled publishing", () => {
	beforeEach(() => {
		__resetBreadcrumbStore();
	});
	afterEach(() => {
		__resetBreadcrumbStore();
	});

	it("publishes the first fix at once, then batches until the interval", () => {
		let notified = 0;
		subscribe(() => {
			notified += 1;
		});
		recordBreadcrumb("a", at(0));
		expect(notified).toBe(1);
		expect(getBreadcrumbs().a).toHaveLength(1);

		recordBreadcrumb("a", at(1));
		recordBreadcrumb("a", at(2));
		// Still inside the interval: nothing published yet.
		expect(notified).toBe(1);
		expect(getBreadcrumbs().a).toHaveLength(1);

		__flushBreadcrumbs();
		expect(notified).toBe(2);
		expect(getBreadcrumbs().a).toHaveLength(3);
	});

	it("keeps an unchanged robot's trail identity across a publish", () => {
		recordBreadcrumb("a", at(0));
		recordBreadcrumb("b", at(0));
		__flushBreadcrumbs();
		const before = getBreadcrumbs();

		recordBreadcrumb("a", at(1));
		__flushBreadcrumbs();
		const after = getBreadcrumbs();

		expect(after).not.toBe(before);
		expect(after.a).not.toBe(before.a);
		expect(after.b).toBe(before.b);
	});

	it("never mutates a published trail", () => {
		recordBreadcrumb("a", at(0));
		const published = getBreadcrumbs().a;
		recordBreadcrumb("a", at(1));
		expect(published).toHaveLength(1);
	});

	it("a fix inside the spacing schedules nothing", () => {
		recordBreadcrumb("a", at(0));
		const before = getBreadcrumbs();
		recordBreadcrumb("a", at(0));
		__flushBreadcrumbs();
		expect(getBreadcrumbs()).toBe(before);
	});
});
