import { SiteConfig } from "@/types/index"
import { env } from "./env.js"

export const siteConfig: SiteConfig = {
  name: "ORMI",
  description: "Open Robotic Management Interface. A central platform that supports heterogenous and scalable robotics and autonomous systems.",
  //name: "Open Robotics Management Interface",
  //description: "Web interface for managing multi robots systems",
  keywords: ["Royal Military Academy Belgium",
    "RMA",
    "Robotics and Autonomous Systems",
    "RAS",
    "Robotics and Autonomous Systems Application",
    "RAS-APP",
    "Robotics and Autonomous Systems Laboratory",
    "RAS Lab",
    "Department of Mechanics of Belgian Royal Military Academy"],
  url: env.NEXT_PUBLIC_APP_URL,
  icon: "/icon/ormi.svg",
  ogImage: "opengraph-image.png",
  manifest: "/manifest.webmanifest",
  address: "Robotics & Autonomous Systems Department of Mechanics, Royal Military Academy, Avenue De La Renaissance 30, 1000 Brussels, Belgium",
  contacts: {
    telephone: "+32(0)244-14108",
    email: "ras@rma.ac.be",
  },
  links: {
    officialwebsite: "https://mecatron.rma.ac.be",
    googlescholar: "https://scholar.google.be/citations?user=WOdds4wAAAAJ&hl=nl&authuser=1",
    mastodon: "https://social.rma.ac.be/@ras",
    youtube: "https://www.youtube.com/channel/UCU2zXgXYLk9b9tGTvKk7GnA",
  },
}



