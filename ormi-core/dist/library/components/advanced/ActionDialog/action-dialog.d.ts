import { JSX } from "react";
export type ActionDialogProps = {
    title: string;
    message: string;
    trigger: JSX.Element;
    actions: Array<{
        title: string | JSX.Element;
        action: () => void;
    }>;
};
export declare function ActionDialog(props: ActionDialogProps): import("react/jsx-runtime").JSX.Element;
