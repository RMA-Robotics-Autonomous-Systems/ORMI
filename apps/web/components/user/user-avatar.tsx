import { User } from "@prisma/client";
import { AvatarProps } from "@radix-ui/react-avatar";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";

import { User as UserProfile } from "lucide-react";

interface UserAvatarProps extends AvatarProps {
	user: Pick<User, "image" | "name">;
}

function normalizeAvatarSrc(src: string): string {
	if (src.startsWith("https://api.dicebear.com/")) {
		return src.replace("https://api.dicebear.com/", "/api/dicebear/");
	}
	return src;
}

export function UserAvatar({ user, ...props }: UserAvatarProps) {
	return (
		<Avatar {...props}>
			{user.image ? (
				<AvatarImage
					alt="Picture"
					src={normalizeAvatarSrc(user.image)}
				/>
			) : (
				<AvatarFallback>
					<span className="sr-only">{user.name}</span>
					<UserProfile className="h-4 w-4" />
				</AvatarFallback>
			)}
		</Avatar>
	);
}
