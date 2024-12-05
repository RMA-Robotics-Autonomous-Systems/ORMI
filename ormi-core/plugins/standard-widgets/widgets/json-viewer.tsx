import { useLocalsourceProvider } from "@/core/datasources/components/local-datasource-provider";
import { useEffect, useState } from "react";

export function JsonViewer(props: any) {
    const { sources } = useLocalsourceProvider();
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {

        const interval = setInterval(() => {

            const arr = Array.from(sources.values());

            setData(arr);
        }, 16);

        return () => {
            clearInterval(interval);
        }

    }, []);

    return (
        <div style={{ height: "100%", overflow: "auto", display: "grid" }}>
            <pre className="shadow-inner-md rounded-md m-3 p-1" style={{ boxShadow: "5px 5px 16px 0px rgba(0,0,0,0.1) inset", backgroundColor: "darkslategrey", color: "white" }} >
                {JSON.stringify(data, null, 2)}
            </pre>
        </div>
    );
}