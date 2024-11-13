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

import React, { use, useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { GearIcon, CheckIcon } from "@radix-ui/react-icons";

interface WidgetCardProps {
    displayGear?: boolean;
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
        if (props.displayGear) {
            return (
                <Button variant={"ghost"}>
                    <GearIcon />
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
                        renderers={materialRenderers}
                        cells={materialCells}
                        onChange={({ data, errors }) => setData(data)}
                    />
                    <div className="flex justify-end" style={{ justifyContent: "flex-end" }} >
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