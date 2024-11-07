import PluginsLoader from "@/core/plugins/plugins-loader";

import { Button } from "@/components/ui/button"
import Link from "next/link";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch";



export default async function Page() {

    const pl = new PluginsLoader();
    await pl.Load();

    return (
        <div className="container mx-auto mt-8">
            <div className="flex items-center gap-3">
                <h1>Plugins</h1>
                <small>List of all the plugins that are currently availables in the plugins directory</small>
            </div>
            <div className="flex flex-col gap-1 mt-4">
                {Array.from(pl.getPlugins()).map(([key, value]) => (
                    <Accordion key={key} type="single" collapsible>
                        <AccordionItem value="item-1">
                            <AccordionTrigger>
                                <div className="flex gap-3 items-center">
                                    <Button asChild>
                                        <Link href={value.getUrl()}>{value.getName()}</Link>
                                    </Button>
                                    <p>{value.getVersion()}</p>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <div className="flex justify-between">
                                    <p>{value.getDescription()}</p>
                                    <p>{value.getAuthor()}</p>
                                    <p>{value.getEmail()}</p>
                                    <Switch defaultChecked={true} id={"enable-" + value.getName()} />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                ))}
            </div>
        </div>
    );
}