"use client";

import TestComponent from "./components/test";
import { toast } from "sonner"


const Export = () => {
    return [TestComponent];
}

const HelloWorld = (elements: any) => {
    toast("Hello World");

    return (
        <>
            {elements}
            <h1> World</h1>
        </>
    );

}


export { Export, HelloWorld };