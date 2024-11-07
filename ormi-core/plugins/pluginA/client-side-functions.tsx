"use client";

import { toast } from "sonner"


const HelloWorld = (elements: any) => {
    toast("Hello World");

    return (
        <>
            {elements}
            <h1>Hello</h1>
        </>
    );

}


export { Export, HelloWorld };