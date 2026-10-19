import type { JsonSchema7 } from "@jsonforms/core";
import {
	mapServerAuthProperty,
	type MapServerAuthCapability,
} from "@workspace/ormi-core/map-layers/model";

/**
 * Core's `auth` schema fragment, typed for embedding in a draft-7 settings
 * schema. `mapServerAuthProperty` returns the `JsonSchema` union (draft 4 or
 * 7); a literal settings schema is inferred as draft 7, which the union does
 * not narrow to on its own. The fragment is draft 7 (`const`, `writeOnly`).
 */
export function authSchema(cap: MapServerAuthCapability): JsonSchema7 {
	return mapServerAuthProperty(cap) as JsonSchema7;
}
