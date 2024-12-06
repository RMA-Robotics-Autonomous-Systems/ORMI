import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { TreeViewBaseItem } from "@mui/x-tree-view/models";
import { RichTreeView } from "@mui/x-tree-view/RichTreeView";
import { useEffect, useRef } from "react";

export function TreeViewer(props: any) {
    const { sources } = useLocalDataSource();
    // const animationFrameId = useRef<number>();

    function generateTreeView(obj: any, parentId: string = ''): TreeViewBaseItem[] {
        if (!obj) return [];

        const treeViewItems: TreeViewBaseItem[] = [];
        for (const key in obj) {
            const prop = obj[key];
            const uniqueId = parentId ? `${parentId}-${key}` : key;

            const item: TreeViewBaseItem = {
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

    function isPrimitive(val: any) {
        if (val === null) return true;
        const primitiveTypes = ['string', 'number', 'boolean'];
        return primitiveTypes.includes(typeof val);
    }

    // Get data directly from sources
    const treeData = generateTreeView(Array.from(sources.values())[0]?.data[0]);

    // useEffect(() => {
    //     // Force re-render on animation frame
    //     animationFrameId.current = requestAnimationFrame(() => {
    //         if (sources.size > 0) {
    //             // Force a re-render
    //             props.forceUpdate?.();
    //         }
    //     });

    //     return () => {
    //         if (animationFrameId.current) {
    //             cancelAnimationFrame(animationFrameId.current);
    //         }
    //     };
    // }, [props, sources]);

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {treeData && treeData.length > 0 ? (
                <RichTreeView items={treeData} />
            ) : (
                <div>Loading...</div>
            )}
        </div>
    );
}