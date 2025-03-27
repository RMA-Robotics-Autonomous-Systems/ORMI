import Link from "next/link"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { UserAuthForm } from "@/components/advanced/user/user-auth-form"
//import { UserSignUpForm } from "@/components/advanced/user/user-signup-form"
import Image from "next/image"
import { Suspense } from "react"

export const metadata = {
    title: "Sign up your account",
    description: "Sign up your account to get started.",
}

export default function signUpPage() {
    return (
        <div className="container grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
            <div className="hidden h-full bg-black lg:block">
                <div className="flex h-full justify-center items-center">
                    <Image
                        src="/wallpaper/ras-app-wallpaper-art.svg"
                        width={1000}
                        height={1000}
                        priority
                        alt="RAS-APP Wallpaper Art"
                        className=""
                    />
                </div>
            </div>

            <div className="">
                <div className="w-full h-[calc(100vh-100px)] mx-auto flex  flex-col justify-center space-y-6 lg:w-[400px]">
                    <div className="flex flex-col space-y-3 text-center">
                        <Image
                            src="/icon/ras-app-icon-light.svg"
                            width={64}
                            height={64}
                            alt="RAS-APP Icon Light"
                            className="dark:hidden mx-auto"
                        />
                        <Image
                            src="/icon/ras-app-icon-dark.svg"
                            width={64}
                            height={64}
                            alt="RAS-APP Icon Dark"
                            className="hidden dark:block mx-auto"
                        />
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Create an account
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Enter your email below to create your account
                        </p>
                    </div>
                    <Suspense>
                        <UserAuthForm />
                    </Suspense>
                    <p className="px-8 text-center text-sm text-muted-foreground">
                        By clicking continue, you agree to our{" "}

                        &quot;Terms and Conditions&quot;

                        and{" "}

                        &quot;Privacy Policy&quot;

                        .
                    </p>
                </div>
            </div>
        </div>
    )
}
