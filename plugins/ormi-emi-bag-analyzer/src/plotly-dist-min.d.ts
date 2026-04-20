/**
 * Type shim for plotly.js-dist-min.
 * The package ships only a minified JS bundle without bundled types,
 * but its API is identical to plotly.js, so we re-export those types.
 */
declare module "plotly.js-dist-min" {
	export * from "plotly.js";
}
