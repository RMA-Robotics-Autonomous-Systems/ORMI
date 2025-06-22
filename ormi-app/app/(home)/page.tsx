"use client"
import Link from "next/link"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { buttonVariants } from "ormi-core/components";
import Image from "next/image"
import { FaGlobe, FaGoogleScholar, FaMastodon, FaYoutube } from "react-icons/fa6";


export default function HomePage() {

    return (
        <>

            <section className="space-y-6 dark:bg-transparent px-8 py-8 md:py-12 lg:py-24">
                <div className="flex flex-col items-center gap-4 text-center">

                    <Image
                        src="/icon/ormi.svg"
                        width={500}
                        height={500}
                        priority
                        alt="RAS-APP Logo Light"
                        className="dark:invert"
                    />
                    <p className="max-w-5xl leading-normal sm:text-xl sm:leading-8">
                        {siteConfig.description}
                    </p>
                    <div className="flex flex-wrap justify-center items-center gap-3">
                        <Link href="/signup" className={cn(buttonVariants({ size: "lg", className: "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground" }))}>
                            Get Started
                        </Link>
                        <Link
                            href={siteConfig.links.officialwebsite}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ size: "lg" }))}
                        >
                            Official RAS Website
                        </Link>
                    </div>
                    <div />
                </div>
            </section>

            <section id="about">
                <div className="bg-background dark:bg-background px-8 py-8 md:py-12 lg:py-24 border-y-2 border-dashed">
                    <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
                        <h2 className="font-heading text-3xl sm:text-3xl md:text-6xl">
                            About
                        </h2>
                        <p className="pt-10 text-center leading-normal">
                            The need of human-machine interface (HMI) motivates us to develop an app that can monitor and control our devices in real-time manner.
                            In order to achieve that, the app must be modular, scalable, modern, dynamic and responsive, which bring us here, the {" "}
                            <br />
                            <a className="underline font-bold" >ORMI</a>
                            .
                        </p>
                    </div>
                    <div className="pt-10 mx-auto grid justify-center gap-4 sm:grid-cols-2 md:max-w-5xl md:grid-cols-3">

                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                {/* <RiNextjsFill className="h-12 w-12 fill-current shrink-0"/> */}
                                <svg viewBox="0 0 24 24" className="h-12 w-12 fill-current shrink-0">
                                    <path d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 0 0-2.499-.523A33.119 33.119 0 0 0 11.573 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 0 1 .237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 0 1 .233-.296c.096-.05.13-.054.5-.054z" />
                                </svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">Next.js</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Full-stack React framework. Development using App Directory, Routing, Layouts, and API.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                <svg viewBox="0 0 24 24" className="h-12 w-12 fill-current shrink-0">
                                    <path d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38a2.167 2.167 0 0 0-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44a23.476 23.476 0 0 0-3.107-.534A23.892 23.892 0 0 0 12.769 4.7c1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442a22.73 22.73 0 0 0-3.113.538 15.02 15.02 0 0 1-.254-1.42c-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87a25.64 25.64 0 0 1-4.412.005 26.64 26.64 0 0 1-1.183-1.86c-.372-.64-.71-1.29-1.018-1.946a25.17 25.17 0 0 1 1.013-1.954c.38-.66.773-1.286 1.18-1.868A25.245 25.245 0 0 1 12 8.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933a25.952 25.952 0 0 0-1.345-2.32zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493a23.966 23.966 0 0 0-1.1-2.98c.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98a23.142 23.142 0 0 0-1.086 2.964c-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39a25.819 25.819 0 0 0 1.341-2.338zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143a22.005 22.005 0 0 1-2.006-.386c.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295a1.185 1.185 0 0 1-.553-.132c-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z" />
                                </svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">React</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Latest React with Server and Client Components. Fetching data using TanStack Query and tRPC.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                <svg className="h-12 w-12 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 15 21.84" /><path d="M21 5V8" /><path d="M21 12L18 17H22L19 22" /><path d="M3 12A9 3 0 0 0 14.59 14.87" /></svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">Database</h3>
                                    <p className="text-sm text-muted-foreground">
                                        PostgreSQL and MongoDB databases. Object relational mapping using Prisma schema coupled with Zod validation.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                <svg viewBox="0 0 24 24" className="h-12 w-12 fill-current shrink-0">
                                    <path d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z" />
                                </svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">Component</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Customizable and accessible UI components. Design using ShadcnUI and styled with TailwindCSS.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    className="h-12 w-12 fill-current shrink-0"
                                >
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                </svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">Authentication</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Secure and flexible. Authentication using NextAuth.js with GitLab and Slack as passwordless Oauth providers.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-lg border p-2 bg-accent dark:bg-accent">
                            <div className="flex flex-col justify-between rounded-md p-6">
                                <svg className="h-12 w-12 fill-current shrink-0" viewBox="0 0 256 193" fill="none">
                                    <path d="m192.440223 144.644612h31.779888v-76.3052736l-35.804782-35.8047822-22.472322 22.4723223 26.497216 26.4972158zm31.86374 15.93187h-46.286275-64.566001l-26.497216-26.497216 11.2361612-11.236161 21.8853588 21.885359h45.028496l-44.357681-44.441533 11.320014-11.3200132 44.35768 44.3576812v-45.0284968l-21.801506-21.8015067 11.152309-11.1523092-55.09073-55.3422863h-54.3360633-56.3485097l31.6960367 31.6960367v.0838519h.1677039 65.572224l23.2269894 23.2269899-33.9600388 33.9600393-23.2269899-23.2269899v-18.028169h-31.7798886v31.192925l55.0068785 55.0068781-22.3884704 22.388471 35.8047822 35.804782h54.336063 101.54471z" />
                                </svg>
                                <div className="space-y-2">
                                    <h3 className="font-bold">Communication</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Snappy and reliable. Standardized real-time communication using WebSocket and WebRTC.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="contact">
                <div className="bg-background dark:bg-background px-8 py-8 md:py-12 lg:py-24">
                    <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
                        <h2 className="font-heading text-3xl sm:text-3xl md:text-6xl">
                            Contact
                        </h2>
                        <div className="pt-10 text-justify leading-normal space-y-3">
                            <p>
                                The Robotics & Autonomous Systems lab is a research unit of the department of Mechanics of the Belgian Royal Military Academy.
                            </p>
                            <p>
                                As a university  laboratory, we conduct research in all matters related to unmanned systems: on one hand trying to develop novel &quot;good&quot; applications for these systems and on the other hand trying to find solutions to counter the potential malicious use of these systems.
                            </p>
                            <p>
                                As a military research institute and part of Belgian Defence, we focus on niche fundamental research axes and apply those to practical applications that provide a direct added value for our end users, mostly in the safety, security and defence sectors.
                            </p>
                        </div>
                    </div>
                    <div className="pt-10 mx-auto grid md:justify-center gap-y-6 gap-x-3 md:max-w-5xl md:grid-cols-3 sm:grid-cols-1">
                        <div className="leading-normal">
                            <p className="text-xl font-bold">Address</p>
                            <br />
                            <div className="space-y-2">
                                <p>Unit of Robotics & Autonomous Systems</p>
                                <p>Department of Mechanics</p>
                                <p>Royal Military Academy</p>
                                <p>Avenue De La Renaissance 30</p>
                                <p>1000 Brussels, Belgium</p>
                            </div>
                        </div>
                        <div className="leading-normal md:pl-[60px]">
                            <p className="text-xl font-bold">Contact Information</p>
                            <br />
                            <div className="space-y-2">
                                <p>Telephone: <Link href={"tel:" + siteConfig.contacts.telephone}>{siteConfig.contacts.telephone}</Link></p>
                                <p>Email: <Link href={"mailto:" + siteConfig.contacts.email}>{siteConfig.contacts.email}</Link></p>
                                <p>
                                    Terms and Conditions
                                </p>
                                <p>
                                    Privacy Policy
                                </p>
                            </div>
                        </div>
                        <div className="leading-normal md:pl-[60px]">
                            <p className="text-xl font-bold">Social Media</p>
                            <br />
                            <div className="space-y-2">
                                <Link className="flex gap-3" href={siteConfig.links.officialwebsite} target="_blank">
                                    <FaGlobe className="size-6" />
                                    <p>Official RMA Website</p>
                                </Link>
                                <Link className="flex gap-3" href={siteConfig.links.googlescholar} target="_blank">
                                    <FaGoogleScholar className="size-6" />
                                    <p>Google Scholar</p>
                                </Link>
                                <Link className="flex gap-3" href={siteConfig.links.mastodon} target="_blank">
                                    <FaMastodon className="size-6" />
                                    <p>Mastodon</p>
                                </Link>
                                <Link className="flex gap-3" href={siteConfig.links.youtube} target="_blank">
                                    <FaYoutube className="size-6" />
                                    <p>Youtube</p>
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="pt-10 mx-auto grid sm:grid-cols-2 md:max-w-5xl md:grid-cols-3 justify-items-center gap-3">
                        <div>
                            <Image
                                src="/logo/belgian-defense-logo.svg"
                                width={250}
                                height={250}
                                priority
                                alt="Belgian Defense Logo"
                            />
                        </div>
                        <div>

                            <Image
                                src="/logo/rma-logo-light.svg"
                                width={250}
                                height={250}
                                priority
                                alt="RMA Logo Light"
                                className="dark:hidden"
                            />
                            <Image
                                src="/logo/rma-logo-dark.svg"
                                width={250}
                                height={250}
                                priority
                                alt="RMA Logo Dark"
                                className="hidden dark:block"
                            />
                        </div>
                        <div>
                            <Image
                                src="/logo/ras-lab-logo-light.svg"
                                width={250}
                                height={250}
                                priority
                                alt="RAS-Lab Logo Light"
                                className="dark:hidden"
                            />
                            <Image
                                src="/logo/ras-lab-logo-dark.svg"
                                width={250}
                                height={250}
                                priority
                                alt="RAS-Lab Logo Dark"
                                className="hidden dark:block"
                            />
                        </div>
                    </div>

                </div>
            </section>


        </>
    )
}
