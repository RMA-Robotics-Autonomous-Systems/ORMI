/**
 * Pure map-layers model: types, identity, auth and the layer resolver.
 *
 * Exposed as `@workspace/ormi-core/map-layers/model`. React-free and
 * maplibre-runtime-free (type-only imports), so API routes and workers may
 * import it. Never re-export anything here that reaches React.
 */
export * from "./model";
export * from "./server-key";
export * from "./auth";
export * from "./provider-definition";
export * from "./resolve-layer-refs";
export * from "./attribution";
export * from "./fetch-failure";
export * from "./catalogue-age";
