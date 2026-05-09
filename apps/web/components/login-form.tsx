import Link from "next/link";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { userAuthSchema } from "@/lib/validations/auth";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";

import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@workspace/ui/components/alert";
import { Terminal } from "lucide-react";

type FormData = z.infer<typeof userAuthSchema>;

export function LoginForm({
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

		const signInResult = await signIn("login", {
			username: data.user.toLowerCase(),
			redirect: false,
			callbackUrl,
		});

		setIsLoading(false);

		if (!signInResult?.ok) {
			return toast(
				<Alert variant="destructive">
					<Terminal />
					<AlertTitle>Sign in failed</AlertTitle>
					<AlertDescription>
						We could not sign you in with that username. Please try
						again.
					</AlertDescription>
				</Alert>,
			);
		}

		router.push(callbackUrl);

		return toast("Logged in successfully");
	}

	return (
		<Card className="bg-card/95 shadow-lg backdrop-blur-sm">
			<CardHeader className="gap-2 text-center">
				<p className="text-sm font-medium text-muted-foreground">
					Sign in
				</p>
				<CardTitle className="text-2xl">
					Access your workspace
				</CardTitle>
				<CardDescription className="text-balance">
					Use your ORMI username to open the dashboard.
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
							{isLoading ? <Spinner /> : "Sign in"}
						</Button>
					</div>
				</form>
			</CardContent>
			<CardFooter className="justify-center border-t text-sm text-muted-foreground">
				Don&apos;t have an account?{" "}
				<Link
					href="/signup"
					className="font-medium text-foreground underline underline-offset-4"
				>
					Create one
				</Link>
			</CardFooter>
		</Card>
	);
}
