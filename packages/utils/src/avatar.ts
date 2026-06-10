import { createAvatar } from "@dicebear/core";
import { bottts, identicon } from "@dicebear/collection";

/**
 * Supported DiceBear avatar styles, generated locally so the app works
 * fully offline (no calls to the remote DiceBear HTTP API).
 */
export type AvatarStyle = "bottts" | "identicon";

const STYLES = {
	bottts,
	identicon,
} as const;

/**
 * Generates a DiceBear avatar locally and returns it as an SVG data URI.
 *
 * The result is deterministic: the same `style` + `seed` always produce the
 * same avatar, matching the behaviour of the previous remote DiceBear API
 * (`https://api.dicebear.com/9.x/<style>/svg?seed=<seed>`).
 *
 * The returned string can be used directly as an `<img src>` or as a Radix
 * `AvatarImage` `src`.
 *
 * @param style - Avatar style (`"bottts"` for robots, `"identicon"` for users/workspaces).
 * @param seed - Stable seed string; identical seeds yield identical avatars.
 * @returns An `data:image/svg+xml;...` URI string.
 */
export function createAvatarDataUri(style: AvatarStyle, seed: string): string {
	return createAvatar(STYLES[style], { seed }).toDataUri();
}
