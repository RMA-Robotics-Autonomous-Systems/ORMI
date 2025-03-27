"use client"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { UserAuthForm } from "@/components/advanced/user/user-auth-form"
import Image from "next/image"
import { Suspense } from "react"

// export const metadata = {
//     title: "Sign in with your account",
//     description: "Sign in with your account to get started",
// }

// export function signInPageOld() {
//     return (
//         <div className="container grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
//             <div className="hidden h-full bg-black lg:block">
//                 <div className="flex h-full justify-center items-center">
//                     <Image
//                         src="/wallpaper/ras-lab-wallpaper-animated.gif"
//                         width={1000}
//                         height={1000}
//                         priority
//                         alt="RAS Lab Wallpaper Animated"
//                         className=""
//                         unoptimized
//                     />
//                 </div>
//             </div>

//             <div className="">
//                 <div className="flex justify-between pt-10 lg:pr-5 lg:pl-5">
//                     <Link
//                         href="/"
//                         className={cn(
//                             buttonVariants({ size: "lg" })
//                         )}
//                     >
//                         &#60; Home
//                     </Link>
//                     <Link
//                         href="/signup"
//                         className={cn(
//                             buttonVariants({ size: "lg", className: "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground" })
//                         )}
//                     >
//                         Sign Up &#62;
//                     </Link>
//                 </div>

//                 <div className="w-full h-[calc(100vh-100px)] mx-auto flex  flex-col justify-center space-y-6 lg:w-[400px]">
//                     <div className="flex flex-col space-y-3 text-center">
//                         <Image
//                             src="/icon/ras-app-icon-light.svg"
//                             width={64}
//                             height={64}
//                             alt="RAS-APP Icon Light"
//                             className="dark:hidden mx-auto"
//                         />
//                         <Image
//                             src="/icon/ras-app-icon-dark.svg"
//                             width={64}
//                             height={64}
//                             alt="RAS-APP Icon Dark"
//                             className="hidden dark:block mx-auto"
//                         />
//                         <h1 className="text-2xl font-semibold tracking-tight">
//                             Welcome Back!
//                         </h1>
//                         <p className="text-sm text-muted-foreground">
//                             Enter your email to sign in to your account
//                         </p>
//                     </div>
//                     <Suspense>
//                         <UserAuthForm />
//                     </Suspense>
//                     <p className="px-8 text-center text-sm text-muted-foreground">
//                         By clicking continue, you agree to our{" "}

//                         &quot;Terms and Conditions&quot;

//                         and{" "}

//                         &quot;Privacy Policy&quot;

//                         .
//                     </p>
//                 </div>
//             </div>
//         </div>
//     )
// }

import { LoginForm } from "@/components/login-form"
import { useState, useEffect } from "react"

export default function SignInPage() {
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Calculate mouse position as percentage of window size
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            setMousePosition({ x, y });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);

    // Calculate parallax effect (subtle movement in opposite direction of mouse)
    const parallaxX = -(mousePosition.x - 0.5) * 20; // 20px max movement
    const parallaxY = -(mousePosition.y - 0.5) * 20;

    return (
        <div className="grid h-[calc(100vh-3rem)] overflow-hidden lg:grid-cols-2">
            <div className="flex flex-col p-4 md:p-8">
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <LoginForm />
                    </div>
                </div>
            </div>
            <div className="relative hidden overflow-hidden bg-muted lg:block">
                <div
                    className="absolute inset-0"
                    style={{
                        transform: `translate(${parallaxX}px, ${parallaxY}px)`,
                        transition: 'transform 0.2s ease-out',
                    }}
                >
                    <Image
                        src="/wallpaper/robots-field.jpeg"
                        fill
                        priority
                        alt="RAS Lab Wallpaper"
                        className="object-cover object-center scale-110"
                        sizes="50vw"
                    />
                </div>
            </div>
        </div>
    )
}
