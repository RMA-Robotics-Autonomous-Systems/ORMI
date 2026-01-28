import { redirect } from "next/navigation";
import { getLatestVersion } from "@/lib/mdx";

export default function DocsHomePage() {
	const latestVersion = getLatestVersion();
	redirect(`/docs/${latestVersion}`);
}
