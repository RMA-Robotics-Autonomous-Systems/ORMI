"use client";

import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"
import { useEffect } from "react";


const HelloWorld = (elements: any) => {

    const { toast } = useToast();

    useEffect(() => {
        toast({
            title: "Hello World",
            description: "This is a test",
        });
    }, []);

    return (
        <>
            <Toaster />
            {elements}
        </>
    );

}


export { HelloWorld };