"use client"

import { WidgetDefinition } from "../../widget-interface";



import {
    materialRenderers,
    materialCells,
} from '@jsonforms/material-renderers';
import {
    shadcnRenderer,
    shadcnCells
} from '@workspace/ormi-jsonforms';


import React, { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@workspace/ui/components/dialog";
import { SettingsIcon, CheckIcon } from "lucide-react";
import { AddToTemplatesBtn } from "../../../templates/components/add-to-templates";
import { coreRenderer } from "../../../renderers";

import styles from "./widget-card.module.css";

// Import the custom renderers

interface WidgetCardProps {
    displayType?: "card" | "list" | "gear";
    definition: WidgetDefinition;
    data?: any;
    onValidate: (widget: WidgetDefinition, settings: object) => void;
    fromLoaded?: boolean;
}


export function WidgetCard(props: WidgetCardProps) {

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

    const getButton = () => {
        if (props.displayType === "gear") {
            return (
                <Button variant={"ghost"}>
                    <SettingsIcon />
                </Button>
            );
        }

        if (props.displayType === "list") {
            return (
                <Button variant={"ghost"}>
                    {props.definition.icon || <SettingsIcon />}
                    <p>{props.definition.name}</p>
                </Button>
            );
        }


        return (
            <button className={styles.card}>
                <div className={styles.overlay}>
                    <p className={styles.description}>{props.definition.description}</p>
                </div>
                <div className={styles.content}>
                    <div style={{ scale: 3 }}>
                        {props.definition.icon || <SettingsIcon />}
                    </div>
                    <h2 className={styles.title}>{props.definition.name}</h2>
                </div>
            </button>
        );
    }

    const renderers = [
        ...materialRenderers,
        ...shadcnRenderer,
        ...coreRenderer
    ];

    const cellsRenderers = [
        ...materialCells,
        ...shadcnCells
    ]

    return (
        <Dialog>
            <DialogTrigger asChild>
                {getButton()}
            </DialogTrigger>
            <DialogContent size="medium">
                <DialogHeader>
                    <DialogTitle>{props.definition.name}</DialogTitle>
                    <DialogDescription>
                        Widget configuration
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
                    <div className="flex justify-end mt-1.5 gap-3" style={{ justifyContent: "flex-end" }} >
                        {props.fromLoaded && props.fromLoaded === true && <AddToTemplatesBtn widget={props.definition} data={data} />}
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