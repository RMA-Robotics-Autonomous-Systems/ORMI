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
          <AlertTitle>Heads up!</AlertTitle>
          <AlertDescription>
            You can add components and dependencies to your app using the cli.
          </AlertDescription>
        </Alert>,
      );
    }

    router.push(callbackUrl);

    return toast("Logged in successfully");
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <div className="grid gap-2">
        {errors?.user && (
          <div className="text-sm text-destructive">{errors.user.message}</div>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your username below to login to your account
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="user">User</Label>
          <Input
            id="user"
            type="text"
            placeholder="Username"
            required
            {...register("user")}
          />
        </div>
        <Button type="submit" className="w-full">
          {isLoading ? <Spinner /> : "Login"}
        </Button>
      </div>
      <div className="text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline underline-offset-4">
          Sign up
        </Link>
      </div>
    </form>
  );
}
