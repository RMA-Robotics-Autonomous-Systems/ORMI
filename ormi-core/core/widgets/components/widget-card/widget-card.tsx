import styles from "./widget-card.module.css";
import { WidgetDefinition } from "../../widget-interface";

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

import { Button } from "@/components/ui/button";


import {
    materialRenderers,
    materialCells,
} from '@jsonforms/material-renderers';


import React, { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { GearIcon, CheckIcon } from "@radix-ui/react-icons";
import { toast } from "@/hooks/use-toast";
import shadcnRenderer, { shadcnCells } from "@/core/jsonforms/ShadcnRender";

// Import the custom renderers


interface WidgetCardProps {
    displayType?: "card" | "list" | "gear";
    definition: WidgetDefinition;
    data?: any;
    onValidate: (widget: WidgetDefinition, settings: object) => void;
}


const WidgetCard = (props: WidgetCardProps) => {

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

    const getButton = () => {
        if (props.displayType === "gear") {
            return (
                <Button variant={"ghost"}>
                    <GearIcon />
                </Button>
            );
        }

        if (props.displayType === "list") {
            return (
                <Button variant={"ghost"}>
                    <GearIcon />
                    <p>{props.definition.name}</p>
                </Button>
            );
        }

        if (!props.definition.image) {

            return (
                <button className={styles.card}>
                    <div className="flex justify-center items-center">
                        <h2 className={styles.title}>{props.definition.name}</h2>
                        <GearIcon className={styles.image} />
                    </div>

                    <div className={styles.overlay}>
                        <p className={styles.description}>{props.definition.description}</p>
                    </div>
                </button>
            );


        }

        return (
            <button className={styles.card}>
                <div
                    className={styles.image}
                    style={{ backgroundImage: `url(${props.definition.image})` }}
                >
                    <div className={styles.overlay}>
                        <p className={styles.description}>{props.definition.description}</p>
                    </div>
                    <h2 className={styles.title}>{props.definition.name}</h2>
                </div>
            </button>
        );
    }

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
                {getButton()}
            </DialogTrigger>
            <DialogContent className="">
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

export default WidgetCard;