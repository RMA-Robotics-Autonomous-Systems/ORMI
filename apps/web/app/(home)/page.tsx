"use client";

import Image from "next/image";
import Link from "next/link";
import {
	ArrowRightIcon,
	BookOpenIcon,
	EarthIcon,
	GaugeIcon,
	GraduationCapIcon,
	type LucideIcon,
	MailIcon,
	MapPinIcon,
	PhoneIcon,
	PlugZapIcon,
	WorkflowIcon,
} from "lucide-react";

import { siteConfig } from "@/config/site";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from "@workspace/ui/components/card";

type Feature = {
	title: string;
	description: string;
	icon: LucideIcon;
};

const features: Feature[] = [
	{
		title: "Multiple data sources",
		description:
			"Supports ROS2 through ROSBridge Suite, Foxglove WebSocket protocol, Tello drones, and custom data providers.",
		icon: PlugZapIcon,
	},
	{
		title: "Real-time communication",
		description:
			"Uses WebSocket and WebRTC for low-latency data streaming.",
		icon: GaugeIcon,
	},
	{
		title: "Customizable dashboards",
		description:
			"Widgets and dashboards are customizable through a plugin-based system, including tailored monitoring layouts.",
		icon: WorkflowIcon,
	},
];

const socialLinks: Array<{
	label: string;
	href: string;
	icon: LucideIcon;
}> = [
	{
		label: "Official RMA Website",
		href: siteConfig.links.officialwebsite,
		icon: EarthIcon,
	},
	{
		label: "Google Scholar",
		href: siteConfig.links.googlescholar,
		icon: GraduationCapIcon,
	},
	{
		label: "Mastodon",
		href: siteConfig.links.mastodon,
		icon: EarthIcon,
	},
	{
		label: "YouTube",
		href: siteConfig.links.youtube,
		icon: EarthIcon,
	},
];

export default function HomePage() {
	return (
		<div className="relative overflow-hidden">
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					maskImage:
						"linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.18) 18%, rgba(0, 0, 0, 0.72) 58%, rgba(0, 0, 0, 1) 100%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.18) 18%, rgba(0, 0, 0, 0.72) 58%, rgba(0, 0, 0, 1) 100%)",
				}}
			>
				<Image
					src="/wallpaper/robots-field.jpeg"
					alt="Robotic systems in the field"
					fill
					priority
					className="object-cover object-center opacity-20"
				/>
				<div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background))_0%,hsl(var(--background)/0.94)_22%,hsl(var(--background)/0.88)_48%,hsl(var(--background)/0.78)_72%,hsl(var(--background)/0.64)_100%)]" />
			</div>

			<div className="container relative z-10 mx-auto flex max-w-6xl flex-col gap-16 px-4 py-10 md:px-6 md:py-16">
				<section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-4">
							<h1 className="max-w-4xl font-heading text-4xl tracking-tight sm:text-5xl lg:text-6xl">
								Open Robotic Management Interface
							</h1>
							<p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
								Unified monitoring and control for heterogeneous
								robotics systems. ORMI is a modern, modular web
								platform for monitoring and controlling
								heterogeneous robotics and autonomous systems in
								real time.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<Button size="lg" asChild>
								<Link href="/signup">
									Get Started
									<ArrowRightIcon data-icon="inline-end" />
								</Link>
							</Button>
							<Button variant="outline" size="lg" asChild>
								<Link href="/docs">
									Read the Docs
									<BookOpenIcon data-icon="inline-end" />
								</Link>
							</Button>
						</div>
					</div>

					<div className="flex items-center justify-center rounded-xl p-6">
						<Image
							src="/icon/ormi.svg"
							width={400}
							height={400}
							priority
							alt="ORMI logo"
							className="h-auto w-40 dark:invert sm:w-48 lg:w-56"
						/>
					</div>
				</section>

				<section id="about" className="flex flex-col gap-6">
					<div className="flex flex-col gap-3">
						<h2 className="max-w-3xl font-heading text-3xl tracking-tight sm:text-4xl">
							Core capabilities
						</h2>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{features.map(({ title, description, icon: Icon }) => (
							<Card key={title}>
								<CardContent className="flex items-start gap-4 pt-0">
									<div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
										<Icon className="size-4" />
									</div>
									<div className="flex min-w-0 flex-col gap-1">
										<CardTitle>{title}</CardTitle>
										<CardDescription>
											{description}
										</CardDescription>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</section>

				<section
					id="contact"
					className="grid gap-6 lg:grid-cols-2 lg:items-stretch"
				>
					<Card className="h-full">
						<CardContent className="grid gap-4 md:grid-cols-2">
							<div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
								<div className="flex items-center gap-2 text-sm font-medium">
									<MapPinIcon className="size-4 text-muted-foreground" />
									Address
								</div>
								<div className="flex flex-col gap-1 text-sm leading-6 text-muted-foreground">
									<p>Unit of Robotics & Autonomous Systems</p>
									<p>Department of Mechanics</p>
									<p>Royal Military Academy</p>
									<p>Avenue De La Renaissance 30</p>
									<p>1000 Brussels, Belgium</p>
								</div>
							</div>
							<div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
								<div className="flex items-center gap-2 text-sm font-medium">
									<PhoneIcon className="size-4 text-muted-foreground" />
									Direct contact
								</div>
								<div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
									<Link
										href={`tel:${siteConfig.contacts.telephone}`}
										className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 hover:bg-accent hover:text-accent-foreground"
									>
										<PhoneIcon className="size-4 text-muted-foreground" />
										{siteConfig.contacts.telephone}
									</Link>
									<Link
										href={`mailto:${siteConfig.contacts.email}`}
										className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 hover:bg-accent hover:text-accent-foreground"
									>
										<MailIcon className="size-4 text-muted-foreground" />
										{siteConfig.contacts.email}
									</Link>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="h-full">
						<CardContent className="grid gap-4">
							<div className="grid gap-3 sm:grid-cols-2">
								<Button
									variant="outline"
									className="justify-start"
									asChild
								>
									<Link href="/docs">
										<BookOpenIcon data-icon="inline-start" />
										Read documentation
									</Link>
								</Button>
								<Button
									variant="outline"
									className="justify-start"
									asChild
								>
									<Link href="/plugins">
										<PlugZapIcon data-icon="inline-start" />
										Explore plugins
									</Link>
								</Button>
								<Button
									variant="outline"
									className="justify-start"
									asChild
								>
									<Link
										href={siteConfig.links.officialwebsite}
										target="_blank"
										rel="noreferrer"
									>
										<EarthIcon data-icon="inline-start" />
										Visit official website
									</Link>
								</Button>
								<Button
									variant="outline"
									className="justify-start"
									asChild
								>
									<Link
										href={siteConfig.links.googlescholar}
										target="_blank"
										rel="noreferrer"
									>
										<GraduationCapIcon data-icon="inline-start" />
										View publications
									</Link>
								</Button>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								{socialLinks.map(
									({ label, href, icon: Icon }) => (
										<Button
											key={label}
											variant="outline"
											className="justify-start"
											asChild
										>
											<Link
												href={href}
												target="_blank"
												rel="noreferrer"
												className="flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
											>
												<Icon className="size-4 text-muted-foreground" />
												<span>{label}</span>
											</Link>
										</Button>
									),
								)}
							</div>
							<div className="grid gap-4 sm:grid-cols-3">
								<div className="flex items-center justify-center rounded-md border bg-muted/30 p-4">
									<Image
										src="/logo/belgian-defense-logo.svg"
										width={220}
										height={140}
										priority
										alt="Belgian Defense Logo"
										className="h-auto w-full max-w-[160px]"
									/>
								</div>
								<div className="flex items-center justify-center rounded-md border bg-muted/30 p-4">
									<Image
										src="/logo/rma-logo-light.svg"
										width={220}
										height={140}
										priority
										alt="RMA Logo Light"
										className="h-auto w-full max-w-[160px] dark:hidden"
									/>
									<Image
										src="/logo/rma-logo-dark.svg"
										width={220}
										height={140}
										priority
										alt="RMA Logo Dark"
										className="hidden h-auto w-full max-w-[160px] dark:block"
									/>
								</div>
								<div className="flex items-center justify-center rounded-md border bg-muted/30 p-4">
									<Image
										src="/logo/ras-lab-logo-light.svg"
										width={220}
										height={140}
										priority
										alt="RAS-Lab Logo Light"
										className="h-auto w-full max-w-[160px] dark:hidden"
									/>
									<Image
										src="/logo/ras-lab-logo-dark.svg"
										width={220}
										height={140}
										priority
										alt="RAS-Lab Logo Dark"
										className="hidden h-auto w-full max-w-[160px] dark:block"
									/>
								</div>
							</div>
						</CardContent>
					</Card>
				</section>
			</div>
		</div>
	);
}
