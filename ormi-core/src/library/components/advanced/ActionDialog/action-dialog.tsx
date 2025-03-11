"use client"
// shadcn dialog that takes an array of actions and displays them in a dialog
import React from "react";
import { Button } from "../../ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../ui/dialog";
import { JSX, useState } from "react";

export type ActionDialogProps = {

    title: string
    message: string

    trigger: JSX.Element

    actions: Array<{ title: string | JSX.Element, action: () => void }>
};

export function ActionDialog(props: ActionDialogProps) {

    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {props.trigger}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{props.title}</DialogTitle>
                    <DialogDescription>
                        {props.message}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    {props.actions.map((action, index) => (
                        <Button key={index} onClick={() => {
                            action.action();
                            setOpen(false);
                        }}>
                            {action.title}
                        </Button>
                    ))}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
