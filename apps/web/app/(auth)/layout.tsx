import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { Button } from "@workspace/ui/components/button";

interface AuthLayoutProps {
	children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
	return (
		<div className="relative min-h-[calc(100vh-3rem)] overflow-hidden bg-background">
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.14) 16%, rgba(0, 0, 0, 0.52) 52%, rgba(0, 0, 0, 0.9) 100%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.14) 16%, rgba(0, 0, 0, 0.52) 52%, rgba(0, 0, 0, 0.9) 100%)",
				}}
			>
				<Image
					src="/wallpaper/robots-field.jpeg"
					alt="Robotic systems in the field"
					fill
					priority
					className="object-cover object-center opacity-18"
					sizes="100vw"
				/>
				<div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background))_0%,hsl(var(--background)/0.96)_20%,hsl(var(--background)/0.88)_48%,hsl(var(--background)/0.76)_72%,hsl(var(--background)/0.64)_100%)]" />
			</div>

			<div className="container relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center px-4 py-10 md:px-6 md:py-16">
				<div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:gap-14">
					<section className="hidden lg:flex lg:flex-col lg:gap-8">
						<div className="flex items-center gap-4">
							<div className="rounded-2xl border bg-background/80 p-4 backdrop-blur-sm">
								<Image
									src="/icon/ormi.svg"
									width={96}
									height={96}
									priority
									className="h-auto w-16 dark:invert"
									alt="ORMI logo"
								/>
							</div>
							<div className="flex max-w-xl flex-col gap-3">
								<p className="text-sm font-medium text-muted-foreground">
									Open Robotic Management Interface
								</p>
								<h1 className="font-heading text-4xl tracking-tight text-foreground xl:text-5xl">
									Access your ORMI workspace
								</h1>
								<p className="text-base leading-7 text-muted-foreground">
									{siteConfig.description}
								</p>
							</div>
						</div>

						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
								<p className="text-sm font-medium text-foreground">
									Unified interface
								</p>
								<p className="mt-1 text-sm leading-6 text-muted-foreground">
									One place to monitor and control
									heterogeneous robotics systems.
								</p>
							</div>
							<div className="rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
								<p className="text-sm font-medium text-foreground">
									Real-time streams
								</p>
								<p className="mt-1 text-sm leading-6 text-muted-foreground">
									Low-latency data flows with WebSocket and
									WebRTC support.
								</p>
							</div>
							<div className="rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
								<p className="text-sm font-medium text-foreground">
									Configurable dashboards
								</p>
								<p className="mt-1 text-sm leading-6 text-muted-foreground">
									Adapt widgets and layouts to the mission
									context.
								</p>
							</div>
						</div>

						<div className="flex flex-wrap gap-3">
							<Button variant="outline" asChild>
								<Link href="/docs">Read the docs</Link>
							</Button>
							<Button variant="ghost" asChild>
								<Link
									href={siteConfig.links.officialwebsite}
									target="_blank"
									rel="noreferrer"
								>
									Official website
								</Link>
							</Button>
						</div>
					</section>

					<div className="w-full max-w-md justify-self-center lg:justify-self-end">
						{children}
					</div>
				</div>
			</div>
		</div>
	);
}
