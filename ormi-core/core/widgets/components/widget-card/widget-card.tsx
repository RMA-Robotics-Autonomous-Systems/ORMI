import styles from "./widget-card.module.css";
import WidgetDefinition from "../../widget-interface";

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

import React, { useState } from 'react';
import { JsonForms } from '@jsonforms/react';

const WidgetCard = (props: { definition: WidgetDefinition, onValidate: (settings: object) => void }) => {

    const handleAdd = () => {
        props.onValidate(data);
    }

    const [data, setData] = useState(props.definition.data);

    return (
        <Dialog>
            <DialogTrigger asChild>
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
                    <DialogClose asChild>
                        <Button onClick={() => { handleAdd() }}>Add</Button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog >
    );
};

export default WidgetCard;