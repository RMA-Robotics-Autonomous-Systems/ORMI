"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { cn } from "@/lib/utils"
import { userSignUpSchema } from "@/lib/validations/auth"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import { Loader2, Slack, Gitlab } from "lucide-react"

type UserSignUpFormProps = React.HTMLAttributes<HTMLDivElement>

type FormData = z.infer<typeof userSignUpSchema>


export function UserSignUpForm({ className, ...props }: UserSignUpFormProps) {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(userSignUpSchema),
    })
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const [isSlackLoading, setIsSlackLoading] = React.useState<boolean>(false)
    const [isGitLabLoading, setIsGitLabLoading] = React.useState<boolean>(false)
    const searchParams = useSearchParams()



    async function onSubmit(data: FormData) {
        setIsLoading(true)

        const signInResult = await signIn("email", {
            email: data.email.toLowerCase(),
            redirect: false,
            callbackUrl: searchParams?.get("from") || "/dashboard",
        })

        setIsLoading(false)


        if (!signInResult?.ok) {
            return toast({
                title: "Something went wrong.",
                description: "Your sign in request failed. Please try again.",
                variant: "destructive",
            })
        }

        return toast({
            title: "Check your email",
            description: "We sent you a login link. Be sure to check your spam too.",
        })
    }

    return (
        <div className={cn("grid gap-6", className)} {...props}>
            <form onSubmit={handleSubmit(onSubmit)}>
                <div className="grid gap-2">
                    <div className="grid gap-2">
                        <Label className="sr-only" htmlFor="email">
                            Email
                        </Label>
                        <Input
                            id="email"
                            placeholder="name@example.com"
                            type="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect="off"
                            disabled={isLoading || isSlackLoading || isGitLabLoading}
                            {...register("email")}
                        />
                        {errors?.email && (
                            <p className="px-1 text-xs text-red-600">
                                {errors.email.message}
                            </p>
                        )}
                    </div>
                    <button className={cn(buttonVariants())} disabled={isLoading}>
                        {isLoading && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Sign In with Email
                    </button>
                </div>
            </form>
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                    </span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline" }))}
                    onClick={() => {
                        setIsSlackLoading(true)
                        signIn("slack")
                    }}
                    disabled={isLoading || isSlackLoading}
                >
                    {isSlackLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Slack className="mr-2 h-4 w-4" />
                    )}{" "}
                    RMA Slack
                </button>
                <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline" }))}
                    onClick={() => {
                        setIsGitLabLoading(true)
                        signIn("gitlab.cylab.be")
                    }}
                    disabled={isLoading || isGitLabLoading}
                >
                    {isGitLabLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Gitlab className="mr-2 h-4 w-4" />
                    )}{" "}
                    RMA GitLab
                </button>
            </div>
        </div>
    )
}
