/**
 * The `/api/map-servers` Zod envelope against core's map-server model: the
 * auth unions carry exactly the kinds and fields `MAP_SERVER_AUTH_FIELDS`
 * declares, and the credential-query refusal reads what operators type.
 */

import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import { MAP_SERVER_AUTH_FIELDS } from "@workspace/ormi-core/map-layers/model";

import {
	credentialQueryKeys,
	findCredentialQueryKeys,
	mapServerAuthSchema,
	mapServerAuthUpdateSchema,
} from "@/lib/validations/map-server";

function branches(
	schema: typeof mapServerAuthSchema | typeof mapServerAuthUpdateSchema,
) {
	return Object.fromEntries(
		(schema.options as readonly z.ZodObject<z.ZodRawShape>[]).map(
			(option) => {
				const shape = option.shape as Record<string, unknown> & {
					kind: { value: string };
				};
				return [
					shape.kind.value,
					Object.keys(shape)
						.filter((key) => key !== "kind")
						.sort(),
				];
			},
		),
	);
}

describe("auth unions", () => {
	const expected = Object.fromEntries(
		Object.entries(MAP_SERVER_AUTH_FIELDS).map(([kind, shape]) => [
			kind,
			[...shape.fields].sort(),
		]),
	);

	test.each([
		["create", mapServerAuthSchema],
		["update", mapServerAuthUpdateSchema],
	] as const)(
		"the %s union matches MAP_SERVER_AUTH_FIELDS",
		(_label, schema) => {
			expect(branches(schema)).toEqual(expected);
		},
	);

	test("a create requires every kind's secret, an update does not", () => {
		for (const [kind, shape] of Object.entries(MAP_SERVER_AUTH_FIELDS)) {
			const secret = (shape as { secret?: string }).secret;
			if (!secret) continue;
			const full = Object.fromEntries(
				shape.fields.map((field) => [
					field,
					field === "param" ? "p" : field === "name" ? "X-Key" : "v",
				]),
			);
			const without = { kind, ...full, [secret]: undefined };
			expect(
				mapServerAuthSchema.safeParse({ kind, ...full }).success,
			).toBe(true);
			expect(mapServerAuthSchema.safeParse(without).success).toBe(false);
			expect(mapServerAuthUpdateSchema.safeParse(without).success).toBe(
				true,
			);
		}
	});
});

describe("credential query keys", () => {
	test("names credential-like keys in templates and URLs", () => {
		expect(
			credentialQueryKeys(
				"https://h/{z}/{x}/{y}.png?style=a&api_key=1&X-Amz-Signature=2&Password=3",
			),
		).toEqual(["api_key", "X-Amz-Signature", "Password"]);
		expect(
			credentialQueryKeys("https://h/wms?map=/a.map&layers=b"),
		).toEqual([]);
		expect(credentialQueryKeys("https://h/a#?token=1")).toEqual([]);
	});

	test("walks every setting but auth", () => {
		expect(
			findCredentialQueryKeys({
				url: "https://h?access_token=1",
				auth: {
					kind: "query-token",
					token: "?token=x",
					param: "token",
				},
				layers: [{ template: "t/{z}/{x}/{y}?key=2" }],
			}),
		).toEqual(["access_token", "key"]);
	});
});
