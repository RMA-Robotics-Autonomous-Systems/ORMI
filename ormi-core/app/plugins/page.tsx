import PluginsLoader from "@/core/plugins/plugins-loader";

import { Button } from "@/components/ui/button"
import Link from "next/link";



export default async function Page() {

    const pl = new PluginsLoader();
    await pl.Load();

    return (
        <div className="container mx-auto mt-8">
            <div className="flex items-center gap-3">
                <h1>Plugins</h1>
                <small>Here is a list of all the plugins that are currently loaded</small>
            </div>
            <div className="flex flex-col gap-1 mt-4">
                {Array.from(pl.getPlugins()).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-5 gap-4 w-full">
                        <Button asChild>
                            <Link href={value.getUrl()}>{value.getName()}</Link>
                        </Button>
                        <p>{value.getDescription()}</p>
                        <p>{value.getAuthor()}</p>
                        <p>{value.getEmail()}</p>
                        <p>{value.getVersion()}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}