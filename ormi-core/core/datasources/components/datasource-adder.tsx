import {
    Dialog,

    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { Button } from "@/components/ui/button";



import React, { useState } from 'react';

import { PlusIcon } from "lucide-react";
import { PluginsHooks } from "@/core/plugins/plugins-types";
import { usePluginsManager } from "@/core/plugins/components/plugins-provider";
import PluginsManager from "@/core/plugins/plugins-manager";
import { DatasourceDefinition } from "../datasource-interface";

const DatasourceAdder = (props: { handleAdd: (datasource_id: string) => void }) => {

    const pluginsManager = usePluginsManager() as PluginsManager;
    const datasources_definitions = pluginsManager.applyFilter<DatasourceDefinition[]>(PluginsHooks.DATASOURCES_LIST, []);


    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusIcon />
                </Button>
            </DialogTrigger>
            <DialogContent className="">
                <DialogHeader>
                    <DialogTitle>Add new datasource</DialogTitle>
                    <DialogDescription>
                        Datasource configuration
                    </DialogDescription>
                </DialogHeader>
                <div>
                    <div className="flex gap-3" >
                        {datasources_definitions.map((datasource_def) => (
                            <Button key={datasource_def.id} variant={"ghost"} onClick={() => {
                                props.handleAdd(datasource_def.id);
                                setOpen(false);
                            }}>
                                <PlusIcon />
                                <p>{datasource_def.name}</p>
                            </Button>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
};

export default DatasourceAdder;