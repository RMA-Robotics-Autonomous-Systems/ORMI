import { TreeView, TreeDataItem } from "@/components/tree-view";
import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";

export function TreeViewer() {
    const { sources } = useLocalDataSource();
    // const animationFrameId = useRef<number>();

    function generateTreeView(obj: any, parentId: string = ''): TreeDataItem[] {
        if (!obj) return [];

        const treeViewItems: TreeDataItem[] = [];
        for (const key in obj) {
            const prop = obj[key];
            const uniqueId = parentId ? `${parentId}-${key}` : key;

            const item: TreeDataItem = {
                id: uniqueId,
                name: isPrimitive(prop) ? `${key}: ${prop}` : key,
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

    return (
        <div style={{ height: "100%", overflow: "auto" }}>
            {treeData && treeData.length > 0 ? (
                <TreeView data={treeData} />
            ) : (
                <div>Loading...</div>
            )}
        </div>
    );
}