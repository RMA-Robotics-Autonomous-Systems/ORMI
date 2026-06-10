import { User } from "@prisma/client";
import { AvatarProps } from "@radix-ui/react-avatar";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { createAvatarDataUri } from "@workspace/utils";

import { User as UserProfile } from "lucide-react";

interface UserAvatarProps extends AvatarProps {
	user: Pick<User, "image" | "name">;
}

/**
 * Returns true when `image` is a legacy DiceBear avatar reference (either the
 * remote API URL or the old local proxy path). These can no longer be fetched
 * offline, so they are regenerated locally instead.
 */
function isLegacyDicebearImage(image: string): boolean {
	return (
		image.startsWith("https://api.dicebear.com/") ||
		image.startsWith("/api/dicebear/")
	);
}

/**
 * Extracts the `seed` query parameter from a legacy DiceBear URL so existing
 * users keep the exact same avatar after migrating to local generation.
 * Falls back to `undefined` when no seed is present.
 */
function parseLegacySeed(image: string): string | undefined {
	const queryIndex = image.indexOf("?");
	if (queryIndex === -1) return undefined;
	const params = new URLSearchParams(image.slice(queryIndex + 1));
	const seed = params.get("seed");
	return seed ? decodeURIComponent(seed) : undefined;
}

export function UserAvatar({ user, ...props }: UserAvatarProps) {
	// A real uploaded/OAuth image is used as-is. When the image is absent or is
	// a legacy DiceBear reference, generate an identicon locally so it renders
	// offline. The seed prefers the legacy URL's seed (for visual stability),
	// then falls back to the user's name.
	let src: string | undefined;
	if (user.image && !isLegacyDicebearImage(user.image)) {
		src = user.image;
	} else {
		const seed =
			(user.image ? parseLegacySeed(user.image) : undefined) ??
			user.name ??
			"";
		src = createAvatarDataUri("identicon", seed);
	}

	return (
		<Avatar {...props}>
			{src ? (
				<AvatarImage alt="Picture" src={src} />
			) : (
				<AvatarFallback>
					<span className="sr-only">{user.name}</span>
					<UserProfile className="h-4 w-4" />
				</AvatarFallback>
			)}
		</Avatar>
	);
}
