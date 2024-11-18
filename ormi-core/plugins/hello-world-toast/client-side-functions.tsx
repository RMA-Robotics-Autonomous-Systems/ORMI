"use client";

import { Toaster } from "@/components/ui/toaster"

const HelloWorld = (elements: any) => {

    return (
        <>
            <Toaster />
            {elements}
        </>
    );

}


export { HelloWorld };