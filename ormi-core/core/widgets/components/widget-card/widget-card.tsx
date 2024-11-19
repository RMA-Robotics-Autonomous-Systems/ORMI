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

import AsyncSelectControl, { asyncSelectTester } from '@/core/jsonforms/async-select/async-select-control';


import React, { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { GearIcon, CheckIcon } from "@radix-ui/react-icons";

interface WidgetCardProps {
    displayType?: "card" | "list" | "gear";
    definition: WidgetDefinition;
    data?: any;
    onValidate: (widget: WidgetDefinition, settings: object) => void;
}


const WidgetCard = (props: WidgetCardProps) => {

    const handleAdd = () => {
        props.onValidate(props.definition, data);
    }


    const [data, setData] = useState(props.definition.data);

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
        { tester: asyncSelectTester, renderer: AsyncSelectControl },
    ];

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
                        cells={materialCells}
                        onChange={({ data, errors }) => setData(data)}
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