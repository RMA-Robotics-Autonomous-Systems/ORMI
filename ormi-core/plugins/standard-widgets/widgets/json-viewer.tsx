import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";

export function JsonViewer(props: any) {
    const { sources } = useLocalDataSource();

    return (
        <div style={{ height: "100%", overflow: "auto", display: "grid" }}>
            <pre className="shadow-inner-md rounded-md m-3 p-1" style={{ boxShadow: "5px 5px 16px 0px rgba(0,0,0,0.1) inset", backgroundColor: "darkslategrey", color: "white" }} >
                {JSON.stringify(Array.from(sources.values()), null, 2)}
            </pre>
        </div>
    );
}