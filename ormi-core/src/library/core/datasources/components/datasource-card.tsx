"use client"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/library/components/ui/dialog"

import { Button } from "@/library/components/ui/button";


import {
    materialRenderers,

    materialCells,
} from '@jsonforms/material-renderers';


import React, { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { CheckIcon } from "@radix-ui/react-icons";
import { toast } from "@/library/hooks/use-toast";

// Import the custom renderers
import { DatasourceDefinition, DatasourceProviderSettings } from "../datasource-interface";
import { CloudCogIcon, XIcon } from "lucide-react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/library/components/ui/context-menu"
import { shadcnRenderer, shadcnCells } from "@/library/core/jsonforms/ShadcnRender";



interface DatasourceCardProps {
    definition: DatasourceDefinition<DatasourceProviderSettings>;
    data?: DatasourceProviderSettings;
    onValidate: (datasource: DatasourceDefinition<DatasourceProviderSettings>, settings: any) => void;
    onRemove: (source_id: string) => void;
}


const DatasourceCard = (props: DatasourceCardProps) => {

    const [data, setData] = useState(props.definition.data);
    const [errors, setErrors] = useState<any>(null);

    const handleAdd = () => {

        if (errors && errors.length > 0) {

            for (const error of errors) {
                toast({
                    title: "Error",
                    description: error.message,
                    variant: "destructive"
                });

            }

            return;
        }

        props.onValidate(props.definition, data);
    }

    useEffect(() => {

        if (props.data) {
            setData(props.data);
        } else {
            setData(props.definition.data);
        }

    }, []);

    const renderers = [
        ...materialRenderers,
        ...shadcnRenderer,
    ];

    const cellsRenderers = [
        ...materialCells,
        ...shadcnCells
    ]

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant={"ghost"}>
                    <ContextMenu>
                        <ContextMenuTrigger>
                            <div className="flex gap-1 content-center ">
                                <CloudCogIcon />
                                <p>{props.data!.title!}</p>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                            <ContextMenuItem>
                                <Button variant={"destructive"} onClick={() => {
                                    props.onRemove(data.id);
                                }}>
                                    Remove
                                    <XIcon />
                                </Button>
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                </Button>

            </DialogTrigger>
            <DialogContent className="">
                <DialogHeader>
                    <DialogTitle>{props.definition.name}</DialogTitle>
                    <DialogDescription>
                        Datasource configuration
                    </DialogDescription>
                </DialogHeader>
                <div>
                    <JsonForms
                        schema={props.definition.schema}
                        uischema={props.definition.uischema}
                        data={data}
                        renderers={renderers}
                        cells={cellsRenderers}
                        onChange={({ data, errors }) => { setData(data); setErrors(errors) }}
                    />
                    <div className="flex justify-end mt-1.5" style={{ justifyContent: "flex-end" }} >
                        <DialogClose className="float-end" asChild>
                            <Button onClick={() => { handleAdd() }}>
                                <CheckIcon />
                            </Button>
                        </DialogClose>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
};

export default DatasourceCard;