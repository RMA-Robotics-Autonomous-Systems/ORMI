import { useLocalsourceProvider } from "@/core/datasources/components/local-datasource-provider";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useEffect, useState } from "react";

export function TreeViewer(props: any) {
    const { sources } = useLocalsourceProvider();
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {

        const isPrimitive = (val: any) => {

            if (val === null) {
                return true;
            }

            const primitiveTypes = ['string', 'number', 'boolean'];

            if (primitiveTypes.includes(typeof val)) {
                return true;
            }

            return false;
        }

        const generateTreeView = (obj: any, parentId: string = '') => {

            const treeViewItems: any[] = [];

            for (const key in obj) {
                const prop = obj[key];
                const uniqueId = parentId ? `${parentId}-${key}` : key;

                const item: any = {
                    id: uniqueId,
                    label: isPrimitive(prop) ? `${key}: ${prop}` : key,
                    children: []
                }

                if (typeof prop === 'object') {
                    item.children = generateTreeView(prop, uniqueId);
                }

                treeViewItems.push(item);
            }

            return treeViewItems;
        }

        const interval = setInterval(() => {

            const arr = Array.from(sources.values())[0].data[0];

            setData(generateTreeView(arr));
        }, 32);

        return () => {
            clearInterval(interval);
        }

    }, []);

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {(data) && (data.length > 0) && (<RichTreeView items={data} />)}
        </div>
    );
}