import type { Page, Request, Route } from "@playwright/test";

/**
 * An in-memory C2 for the end-to-end suite.
 *
 * The C2 plugin talks to Mission Control over REST only
 * (`plugins/ormi-c2-control/src/datasource/rest.ts`), on two base URLs: the
 * command service (`missionControlUrl`, `:5001`) and the map/mission database
 * (`dbUrl`, `:5000`). Both are routed here through `page.route`, so the browser
 * never opens a socket to a C2. The hosts are under `.invalid`, which never
 * resolves, so a request that somehow escaped the route still could not reach
 * a real C2 (or a robot linked to one).
 *
 * Every request is recorded. A request to a path this fake does not implement
 * is answered with a 501 AND recorded in {@link FakeC2.unhandled}; the specs
 * assert that list is empty, so an unmocked call fails the test by name
 * instead of degrading quietly.
 */

/** Base URL of the fake command service (`missionControlUrl`). */
export const FAKE_MISSION_CONTROL_URL = "http://c2-e2e.invalid:5001";
/** Base URL of the fake database service (`dbUrl`). */
export const FAKE_DB_URL = "http://c2-e2e.invalid:5000";
/** A token that is obviously not a credential. */
export const FAKE_C2_TOKEN = "e2e-fake-token-not-a-secret";

/** A GeoJSON position, `[lng, lat]`. */
export type Position = [number, number];

/** A stored MapDB feature, as the C2 returns it. */
export interface FakeFeature {
	type: "Feature";
	properties: {
		feature_id: string;
		name: string;
		feature_type: string;
		[key: string]: unknown;
	};
	geometry: { type: string; coordinates: unknown };
}

/** One recorded request. */
export interface RecordedRequest {
	method: string;
	/** Path relative to the service, query included. */
	path: string;
	/** `command` (`:5001`) or `db` (`:5000`). */
	service: "command" | "db";
	/** Parsed JSON body, or the raw text, or null. */
	body: unknown;
	headers: Record<string, string>;
}

/** A request the fake answers with an error instead of serving it. */
interface InjectedFailure {
	method: string;
	path: string | RegExp;
	status: number;
	message: string;
}

/** What the fake holds for one map. */
interface FakeMap {
	name: string;
	features: FakeFeature[];
}

const CORS_HEADERS = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	"access-control-allow-headers": "Content-Type, Authorization, X-C2-Token",
	"access-control-max-age": "600",
};

/** Bounds of a set of positions, in the C2's registry shape. */
function boundsOf(features: FakeFeature[]) {
	const positions: Position[] = [];
	const walk = (value: unknown) => {
		if (
			Array.isArray(value) &&
			typeof value[0] === "number" &&
			typeof value[1] === "number"
		) {
			positions.push([value[0], value[1]]);
			return;
		}
		if (Array.isArray(value)) value.forEach(walk);
	};
	for (const f of features) walk(f.geometry.coordinates);
	if (positions.length === 0) return undefined;
	return {
		minLon: Math.min(...positions.map((p) => p[0])),
		minLat: Math.min(...positions.map((p) => p[1])),
		maxLon: Math.max(...positions.map((p) => p[0])),
		maxLat: Math.max(...positions.map((p) => p[1])),
	};
}

/**
 * The fake C2: an in-memory map store plus a request log.
 */
export class FakeC2 {
	/** Every request the page sent to either C2 service, in order. */
	readonly requests: RecordedRequest[] = [];
	/** Requests to paths this fake does not implement. Must stay empty. */
	readonly unhandled: RecordedRequest[] = [];
	private readonly maps = new Map<string, FakeMap>();
	/**
	 * The `missions` collection: missions and their `:graph` / `:assets`
	 * sibling documents, keyed by `mission_id`, in insertion order.
	 */
	private readonly missions = new Map<string, Record<string, unknown>>();
	private readonly failures: InjectedFailure[] = [];

	/**
	 * Add a map and its features.
	 * @param name - Map name.
	 * @param features - Features stored on it (deep-copied).
	 */
	seedMap(name: string, features: FakeFeature[]): void {
		this.maps.set(name, {
			name,
			features: structuredClone(features),
		});
	}

	/**
	 * Store a document in the `missions` collection (a mission, or its
	 * `:graph` / `:assets` sibling), as `POST /missions` would.
	 * @param doc - The document (deep-copied); `mission_id` is its key.
	 */
	seedMissionDocument(doc: Record<string, unknown>): void {
		this.missions.set(String(doc.mission_id), structuredClone(doc));
	}

	/**
	 * A document of the `missions` collection, as the fake holds it now.
	 * @param missionId - Its `mission_id` (`"<id>:graph"` for a graph).
	 * @returns The document, or undefined.
	 */
	missionDocument(missionId: string): Record<string, unknown> | undefined {
		return this.missions.get(missionId);
	}

	/**
	 * A stored feature, as the fake holds it now.
	 * @param mapName - Map name.
	 * @param featureId - The feature's `feature_id`.
	 * @returns The feature, or undefined.
	 */
	feature(mapName: string, featureId: string): FakeFeature | undefined {
		return this.maps
			.get(mapName)
			?.features.find((f) => f.properties.feature_id === featureId);
	}

	/**
	 * The recorded requests whose method and path match.
	 * @param method - HTTP method.
	 * @param path - A path prefix or a regular expression.
	 * @returns Matching requests, in order.
	 */
	requestsTo(method: string, path: string | RegExp): RecordedRequest[] {
		return this.requests.filter(
			(r) =>
				r.method === method &&
				(typeof path === "string"
					? r.path.startsWith(path)
					: path.test(r.path)),
		);
	}

	/**
	 * Make the next request that matches fail once: it is recorded, answered
	 * with an error, and changes nothing in the store. Later matching
	 * requests are served normally.
	 *
	 * @param method - HTTP method.
	 * @param path - A path prefix or a regular expression.
	 * @param options - The status (500) and the error message to answer with.
	 */
	failNext(
		method: string,
		path: string | RegExp,
		options: { status?: number; message?: string } = {},
	): void {
		this.failures.push({
			method,
			path,
			status: options.status ?? 500,
			message: options.message ?? "Injected failure",
		});
	}

	/**
	 * Route both C2 services of a page to this fake.
	 * @param page - The page under test.
	 */
	async install(page: Page): Promise<void> {
		await page.route(`${FAKE_DB_URL}/**`, (route, request) =>
			this.handle(route, request, "db"),
		);
		await page.route(`${FAKE_MISSION_CONTROL_URL}/**`, (route, request) =>
			this.handle(route, request, "command"),
		);
	}

	private async handle(
		route: Route,
		request: Request,
		service: "command" | "db",
	): Promise<void> {
		const method = request.method();
		if (method === "OPTIONS") {
			await route.fulfill({ status: 204, headers: CORS_HEADERS });
			return;
		}
		const url = new URL(request.url());
		const path = `${url.pathname}${url.search}`;
		const text = request.postData();
		let body: unknown = text ?? null;
		if (text) {
			try {
				body = JSON.parse(text);
			} catch {
				/* keep the raw text */
			}
		}
		const recorded: RecordedRequest = {
			method,
			path,
			service,
			body,
			headers: request.headers(),
		};
		this.requests.push(recorded);

		const failure = this.failures.findIndex(
			(f) =>
				f.method === method &&
				(typeof f.path === "string"
					? path.startsWith(f.path)
					: f.path.test(path)),
		);
		if (failure !== -1) {
			const [injected] = this.failures.splice(failure, 1);
			await route.fulfill({
				status: injected!.status,
				headers: {
					...CORS_HEADERS,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					error: { code: "E2E_INJECTED", message: injected!.message },
				}),
			});
			return;
		}

		const answer =
			service === "db"
				? this.answerDb(method, url.pathname, body)
				: undefined;
		if (!answer) {
			this.unhandled.push(recorded);
			await route.fulfill({
				status: 501,
				headers: {
					...CORS_HEADERS,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					error: {
						code: "E2E_UNMOCKED",
						message: `The e2e fake C2 does not implement ${method} ${path}`,
					},
				}),
			});
			return;
		}
		await route.fulfill({
			status: answer.status,
			headers: { ...CORS_HEADERS, "content-type": "application/json" },
			body: JSON.stringify(answer.body),
		});
	}

	/**
	 * The `:5000` routes the map and its neighbours call.
	 * @returns The response, or undefined for an unimplemented route.
	 */
	private answerDb(
		method: string,
		pathname: string,
		body: unknown,
	): { status: number; body: unknown } | undefined {
		const parts = pathname
			.split("/")
			.filter(Boolean)
			.map(decodeURIComponent);

		if (method === "GET" && pathname === "/maps") {
			return {
				status: 200,
				body: [...this.maps.values()].map((m) => ({
					name: m.name,
					collection: m.name,
					crs: "EPSG:4326",
					bounds: boundsOf(m.features),
					feature_count: m.features.length,
				})),
			};
		}
		if (
			parts[0] === "maps" &&
			parts.length >= 3 &&
			parts[2] === "features"
		) {
			const map = this.maps.get(parts[1] ?? "");
			if (!map)
				return {
					status: 404,
					body: {
						error: { code: "MAP_NOT_FOUND", message: "no map" },
					},
				};
			if (method === "GET" && parts.length === 3) {
				return {
					status: 200,
					body: {
						type: "FeatureCollection",
						features: structuredClone(map.features),
					},
				};
			}
			if (method === "POST" && parts.length === 3) {
				const feature = structuredClone(body) as FakeFeature;
				map.features.push(feature);
				return { status: 201, body: feature };
			}
			const featureId = parts[3];
			if (method === "PUT" && parts.length === 4 && featureId) {
				const feature = structuredClone(body) as FakeFeature;
				const at = map.features.findIndex(
					(f) => f.properties.feature_id === featureId,
				);
				if (at >= 0) map.features[at] = feature;
				else map.features.push(feature);
				return { status: 200, body: feature };
			}
			if (method === "DELETE" && parts.length === 4 && featureId) {
				map.features = map.features.filter(
					(f) => f.properties.feature_id !== featureId,
				);
				return { status: 200, body: { deleted: featureId } };
			}
		}
		if (parts[0] === "missions") {
			if (method === "GET" && parts.length === 1) {
				return {
					status: 200,
					body: [...this.missions.values()].map((doc) =>
						structuredClone(doc),
					),
				};
			}
			if (method === "POST" && parts.length === 1) {
				const doc = structuredClone(body) as Record<string, unknown>;
				const id = doc?.mission_id;
				if (typeof id !== "string" || id.length === 0)
					return {
						status: 400,
						body: {
							error: {
								code: "VALIDATION",
								message: "mission_id is required",
							},
						},
					};
				this.missions.set(id, doc);
				return { status: 200, body: doc };
			}
			if (method === "DELETE" && parts.length === 2 && parts[1]) {
				if (!this.missions.delete(parts[1]))
					return {
						status: 404,
						body: {
							error: {
								code: "MISSION_NOT_FOUND",
								message: "no mission",
							},
						},
					};
				return { status: 200, body: { deleted: parts[1] } };
			}
			if (
				method === "GET" &&
				parts.length === 3 &&
				parts[2] === "contacts"
			) {
				return { status: 200, body: [] };
			}
		}
		if (method === "GET" && pathname === "/Vehicles") {
			return { status: 200, body: [] };
		}
		if (method === "GET" && pathname === "/planner/status") {
			return {
				status: 200,
				body: { loaded_map: null, mode: "idle", has_graph: false },
			};
		}
		if (method === "GET" && pathname === "/planner/graph") {
			return {
				status: 200,
				body: { type: "FeatureCollection", features: [] },
			};
		}
		return undefined;
	}
}
