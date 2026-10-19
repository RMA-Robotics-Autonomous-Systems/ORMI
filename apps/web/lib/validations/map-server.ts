import { z } from "zod";
import {
	parseServerUrl,
	type ServerUrlProblem,
} from "@workspace/ormi-core/map-layers/model";

/**
 * Zod envelopes for the `/api/map-servers` routes.
 *
 * These cover only what the server can judge without a plugin registry: an
 * `http(s)` address with no userinfo, no settings URL whose query names a
 * credential, a known `auth.kind` shape (asserted equal to core's
 * `MAP_SERVER_AUTH_FIELDS` by `__tests__/api/map-server-validation.test.ts`), and
 * bounded settings and catalogue sizes. Adapter-specific validation is AJV in the
 * client form, because the server has no `MAP_LAYER_PROVIDERS` registry.
 */

/** Upper bounds. Generous for real servers, small enough to keep rows sane. */
export const MAP_SERVER_LIMITS = {
	urlLength: 2048,
	titleLength: 200,
	settingsKeys: 32,
	settingsValueLength: 2048,
	settingsArrayItems: 64,
	/** Serialized size of the whole settings object, auth included. */
	settingsBytes: 16 * 1024,
	secretLength: 4096,
	catalogEntries: 2000,
	entryIdLength: 512,
	entryTitleLength: 512,
	paramsKeys: 16,
	paramKeyLength: 64,
	paramValueLength: 512,
	/** Serialized size of a whole catalogue snapshot. */
	catalogBytes: 1024 * 1024,
	/**
	 * Size of any request body, checked before it is parsed: the catalogue
	 * cap plus room for its envelope.
	 */
	bodyBytes: 1024 * 1024 + 16 * 1024,
	/** Servers one user may register. */
	serversPerUser: 100,
} as const;

/**
 * A query parameter or `params` key that names a credential.
 *
 * Catalogue params are adapter-private tile parameters (matrix set, format,
 * style, an XYZ template, a COG URL) and never carry auth, which core applies
 * itself from the stored settings; a key like this means a secret sits where
 * every map and template can read it. The same holds for a query parameter
 * in any settings URL: the server URL feeds the `serverKey`, a template or COG
 * URL is copied into the catalogue. The operator is pointed at the
 * Authentication field instead.
 *
 * `plugins/ormi-map-servers/src/shared/url-safety.ts` holds the same pattern
 * for discovery (the plugin cannot import the app). Change both together.
 */
export const CREDENTIAL_QUERY_KEY =
	/pass(word)?|secret|token|authkey|api[-_]?key|key|signature|credential|x-amz-/i;

function safeDecode(text: string): string {
	try {
		return decodeURIComponent(text.replace(/\+/g, " "));
	} catch {
		return text;
	}
}

/**
 * Query parameter names of `url` that look like a credential. String-based,
 * so it reads tile templates and relative URLs.
 *
 * @param url - Any string; one without a `?` has no query.
 * @returns The offending names, in order.
 */
export function credentialQueryKeys(url: string): string[] {
	const beforeHash = url.split("#", 1)[0] ?? "";
	const queryAt = beforeHash.indexOf("?");
	if (queryAt < 0) return [];
	return beforeHash
		.slice(queryAt + 1)
		.split("&")
		.filter((pair) => pair !== "")
		.map((pair) => {
			const eq = pair.indexOf("=");
			return safeDecode(eq >= 0 ? pair.slice(0, eq) : pair);
		})
		.filter((name) => CREDENTIAL_QUERY_KEY.test(name));
}

/**
 * Credential-like query keys in every string of a settings object outside
 * `auth` (the server URL, XYZ templates, COG URLs, …), de-duplicated.
 *
 * @param settings - Settings as sent or as in the form.
 * @returns The offending names, empty when there are none.
 */
export function findCredentialQueryKeys(settings: unknown): string[] {
	const found = new Set<string>();
	const walk = (value: unknown, depth: number) => {
		if (depth > 8) return;
		if (typeof value === "string") {
			for (const key of credentialQueryKeys(value)) found.add(key);
		} else if (Array.isArray(value)) {
			for (const item of value) walk(item, depth + 1);
		} else if (value && typeof value === "object") {
			for (const item of Object.values(value)) walk(item, depth + 1);
		}
	};
	if (settings && typeof settings === "object") {
		for (const [key, value] of Object.entries(settings)) {
			if (key !== "auth") walk(value, 0);
		}
	}
	return [...found];
}

/** Refusal for a URL whose query names a credential. */
function credentialQueryMessage(keys: readonly string[]): string {
	return `URL query carries a credential (${keys.join(", ")}). Put it in the auth settings`;
}

/** Refusal wording per `parseServerUrl` problem. */
const URL_PROBLEM: Record<ServerUrlProblem, string> = {
	invalid: "Not a valid URL",
	protocol: "Only http and https addresses are supported",
	userinfo: "Put credentials in the auth settings, not in the URL",
};

/**
 * The server address: `http:` or `https:`, never with userinfo and never
 * with a credential-like query key, so a credential can never reach a
 * `serverKey` or a widget's settings.
 */
export const mapServerUrlSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAP_SERVER_LIMITS.urlLength)
	.superRefine((value, ctx) => {
		const parsed = parseServerUrl(value);
		if (!parsed.ok) {
			ctx.addIssue({
				code: "custom",
				message: URL_PROBLEM[parsed.problem],
			});
			return;
		}
		const keys = credentialQueryKeys(value);
		if (keys.length > 0) {
			ctx.addIssue({
				code: "custom",
				message: credentialQueryMessage(keys),
			});
		}
	});

const secret = z.string().min(1).max(MAP_SERVER_LIMITS.secretLength);
const shortText = z.string().min(1).max(256);
/** Query parameter name for `query-token` when the adapter does not fix one. */
const queryParamName = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9._~-]+$/, "Not a valid query parameter name");

/**
 * Stored auth, as a create carries it: every secret present.
 *
 * Secret leaves are `basic.password`, `bearer.token`, `query-token.token` and
 * `header.value`.
 */
export const mapServerAuthSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("none") }).strict(),
	z
		.object({
			kind: z.literal("basic"),
			username: shortText,
			password: secret,
		})
		.strict(),
	z.object({ kind: z.literal("bearer"), token: secret }).strict(),
	z
		.object({
			kind: z.literal("query-token"),
			token: secret,
			param: queryParamName.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("header"),
			name: z
				.string()
				.min(1)
				.max(128)
				.regex(
					/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/,
					"Not a valid header name",
				),
			value: secret,
		})
		.strict(),
]);

/** An empty secret on an update means "unchanged", like an omitted one. */
const keptSecret = z
	.union([secret, z.literal("")])
	.optional()
	.transform((value) => (value === "" ? undefined : value));

/**
 * Auth as an update carries it: a secret may be omitted (or blank), which
 * keeps the stored one. The merge is `mergeMapServerSettings`.
 */
export const mapServerAuthUpdateSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("none") }).strict(),
	z
		.object({
			kind: z.literal("basic"),
			username: shortText,
			password: keptSecret,
		})
		.strict(),
	z.object({ kind: z.literal("bearer"), token: keptSecret }).strict(),
	z
		.object({
			kind: z.literal("query-token"),
			token: keptSecret,
			param: queryParamName.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal("header"),
			name: z
				.string()
				.min(1)
				.max(128)
				.regex(
					/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/,
					"Not a valid header name",
				),
			value: keptSecret,
		})
		.strict(),
]);

const settingsScalar = z.union([
	z.string().max(MAP_SERVER_LIMITS.settingsValueLength),
	z.number().finite(),
	z.boolean(),
	z.null(),
]);

/**
 * One item of a list of flat records, such as an XYZ layer
 * (`{ title, template, maxzoom, bounds }`): scalar or scalar-array values.
 */
const settingsRecord = z
	.record(
		z.string().min(1).max(64),
		z.union([
			settingsScalar,
			z.array(settingsScalar).max(MAP_SERVER_LIMITS.settingsArrayItems),
		]),
	)
	.refine(
		(record) =>
			Object.keys(record).length <= MAP_SERVER_LIMITS.settingsKeys,
		{ message: "Too many fields" },
	);

/**
 * An adapter-specific settings value (workspace filter, param name, a list
 * of XYZ layers, ...).
 */
const settingsValue = z.union([
	settingsScalar,
	z
		.array(z.union([settingsScalar, settingsRecord]))
		.max(MAP_SERVER_LIMITS.settingsArrayItems),
]);

/**
 * Build the settings envelope around one auth schema: `url`, optional `auth`,
 * and a bounded set of flat adapter-specific keys.
 */
function settingsSchema<A extends z.ZodTypeAny>(auth: A) {
	return z
		.object({ url: mapServerUrlSchema, auth: auth.optional() })
		.catchall(settingsValue)
		.superRefine((value, ctx) => {
			if (Object.keys(value).length > MAP_SERVER_LIMITS.settingsKeys) {
				ctx.addIssue({ code: "custom", message: "Too many settings" });
			}
			if (
				JSON.stringify(value).length > MAP_SERVER_LIMITS.settingsBytes
			) {
				ctx.addIssue({ code: "custom", message: "Settings too large" });
			}
			const keys = findCredentialQueryKeys(value);
			if (keys.length > 0) {
				ctx.addIssue({
					code: "custom",
					message: credentialQueryMessage(keys),
				});
			}
		});
}

/** Settings as a create carries them. */
export const mapServerSettingsSchema = settingsSchema(mapServerAuthSchema);

/** Settings as an update carries them (secrets may be omitted). */
export const mapServerSettingsUpdateSchema = settingsSchema(
	mapServerAuthUpdateSchema,
);

const lng = z.number().finite().min(-180).max(180);
const lat = z.number().finite().min(-90).max(90);
const zoom = z.number().finite().min(0).max(32);

/** One discovered layer, as `MapLayerEntry` in the core model. */
export const mapLayerEntrySchema = z
	.object({
		id: z.string().min(1).max(MAP_SERVER_LIMITS.entryIdLength),
		title: z.string().max(MAP_SERVER_LIMITS.entryTitleLength),
		bounds: z.tuple([lng, lat, lng, lat]).optional(),
		minzoom: zoom.optional(),
		maxzoom: zoom.optional(),
		tileSize: z.union([z.literal(256), z.literal(512)]),
		webMercator: z.boolean(),
		params: z
			.record(
				z.string().min(1).max(MAP_SERVER_LIMITS.paramKeyLength),
				z.string().max(MAP_SERVER_LIMITS.paramValueLength),
			)
			.superRefine((params, ctx) => {
				const keys = Object.keys(params);
				if (keys.length > MAP_SERVER_LIMITS.paramsKeys) {
					ctx.addIssue({
						code: "custom",
						message: "Too many params",
					});
				}
				for (const key of keys) {
					if (CREDENTIAL_QUERY_KEY.test(key)) {
						ctx.addIssue({
							code: "custom",
							message: `Param "${key}" looks like a credential`,
							path: [key],
						});
					}
					const queryKeys = credentialQueryKeys(params[key] ?? "");
					if (queryKeys.length > 0) {
						ctx.addIssue({
							code: "custom",
							message: credentialQueryMessage(queryKeys),
							path: [key],
						});
					}
				}
				// MapLibre writes an attribution with `innerHTML`. Adapters
				// store text; markup is refused rather than sanitised here.
				if (params.attribution?.includes("<")) {
					ctx.addIssue({
						code: "custom",
						message: "Attribution must be plain text",
						path: ["attribution"],
					});
				}
			}),
	})
	.strict();

/** A whole catalogue snapshot, bounded in entries and in serialized size. */
export const mapLayerCatalogSchema = z
	.array(mapLayerEntrySchema)
	.max(MAP_SERVER_LIMITS.catalogEntries)
	.superRefine((catalog, ctx) => {
		if (JSON.stringify(catalog).length > MAP_SERVER_LIMITS.catalogBytes) {
			ctx.addIssue({ code: "custom", message: "Catalogue too large" });
		}
	});

const titleSchema = z.string().trim().min(1).max(MAP_SERVER_LIMITS.titleLength);

/** `POST /api/map-servers`. The owner comes from the session, never the body. */
export const mapServerCreateSchema = z
	.object({
		adapterId: z
			.string()
			.regex(/^[a-z0-9][a-z0-9._-]{0,63}$/, "Not a valid adapter id"),
		title: titleSchema,
		settings: mapServerSettingsSchema,
		/** The snapshot "Test connection" already discovered, if any. */
		catalog: mapLayerCatalogSchema.nullable().optional(),
	})
	.strict();

/**
 * `PUT /api/map-servers/:id`. The adapter is fixed for the life of a record
 * (another type is another server); a changed `url` re-keys it.
 */
export const mapServerUpdateSchema = z
	.object({
		title: titleSchema.optional(),
		settings: mapServerSettingsUpdateSchema.optional(),
	})
	.strict()
	.refine((data) => data.title !== undefined || data.settings !== undefined, {
		message: "No update fields provided",
	});

/** `PUT /api/map-servers/:id/catalog`. */
export const mapServerCatalogPutSchema = z
	.object({ catalog: mapLayerCatalogSchema })
	.strict();

/** The `[id]` route segment: a cuid. */
export const mapServerIdSchema = z.object({
	id: z
		.string()
		.min(1)
		.max(64)
		.regex(/^[a-z0-9]+$/i),
});

/** A DELETE carries no body; anything in one is refused. */
export const mapServerDeleteBodySchema = z.object({}).strict();

/** Create payload, as the client sends it. */
export type MapServerCreateInput = z.input<typeof mapServerCreateSchema>;
/** Update payload, as the client sends it (secrets may be omitted). */
export type MapServerUpdateInput = z.input<typeof mapServerUpdateSchema>;
/** Update auth after parsing: a secret that is `undefined` is kept. */
export type MapServerAuthUpdate = z.output<typeof mapServerAuthUpdateSchema>;
/** Update settings after parsing. */
export type MapServerSettingsUpdate = z.output<
	typeof mapServerSettingsUpdateSchema
>;
