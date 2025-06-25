"use client"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "ormi-components"

import { Button } from "ormi-components";


import {
    materialRenderers,

    materialCells,
} from '@jsonforms/material-renderers';


import React, { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { CheckIcon } from "@radix-ui/react-icons";
import { toast } from "ormi-components";

// Import the custom renderers
import { DatasourceDefinition, DatasourceProviderSettings } from "../datasource-interface";
import { CloudCogIcon, XIcon } from "lucide-react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "ormi-components"
import { shadcnRenderer, shadcnCells } from "ormi-components";



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
                toast("Error: " + error.message);
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