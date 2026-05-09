import * as React from "react";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { useForm } from "react-hook-form";

import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { userAuthSchema } from "@/lib/validations/auth";

import { toast } from "sonner";

import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";

type FormData = z.infer<typeof userAuthSchema>;

export function RegisterForm({
	className,
	...props
}: React.ComponentPropsWithoutRef<"form">) {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormData>({
		resolver: zodResolver(userAuthSchema),
	});
	const [isLoading, setIsLoading] = React.useState<boolean>(false);
	const searchParams = useSearchParams();
	const router = useRouter();

	async function onSubmit(data: FormData) {
		setIsLoading(true);

		const callbackUrl = searchParams?.get("from") || "/dashboard";

		const signInResult = await signIn("register", {
			username: data.user.toLowerCase(),
			redirect: false,
			callbackUrl,
		});

		setIsLoading(false);

		if (!signInResult?.ok) {
			return toast("Your registration request failed. Please try again.");
		}

		router.push(callbackUrl);

		return toast("Account created successfully");
	}

	return (
		<Card className="bg-card/95 shadow-lg backdrop-blur-sm">
			<CardHeader className="gap-2 text-center">
				<p className="text-sm font-medium text-muted-foreground">
					Create account
				</p>
				<CardTitle className="text-2xl">Register for ORMI</CardTitle>
				<CardDescription className="text-balance">
					Choose a username to create your ORMI account.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={handleSubmit(onSubmit)}
					className={cn("flex flex-col gap-6", className)}
					{...props}
				>
					<div className="grid gap-2">
						{errors?.user && (
							<div className="text-sm text-destructive">
								{errors.user.message}
							</div>
						)}
					</div>
					<div className="grid gap-6">
						<div className="grid gap-2">
							<Label htmlFor="user">Username</Label>
							<Input
								id="user"
								type="text"
								placeholder="john.doe"
								required
								autoComplete="username"
								{...register("user")}
							/>
						</div>
						<Button type="submit" className="w-full">
							{isLoading ? <Spinner /> : "Create account"}
						</Button>
					</div>
				</form>
			</CardContent>
			<CardFooter className="justify-center border-t text-sm text-muted-foreground">
				Already have an account?{" "}
				<Link
					href="/signin"
					className="font-medium text-foreground underline underline-offset-4"
				>
					Sign in
				</Link>
			</CardFooter>
		</Card>
	);
}
