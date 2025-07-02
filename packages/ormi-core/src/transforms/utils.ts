import { TransformTree } from "../types";

export function getTransformTreeFromTreeId(tree: TransformTree, id: string): TransformTree | null {
    if (tree.id === id) {
        return tree;
    }

    let result: TransformTree | null = null;
    tree.children.forEach((child) => {
        if (!result) {
            const found = getTransformTreeFromTreeId(child, id);
            if (found) {
                result = found;
            }
        }
    });

    return result;
}

export function getTransfromTreeFromTreeIdInMaps(treeMap : Map<string, TransformTree>, id: string): TransformTree | null {
    let result: TransformTree | null = null;
    
    treeMap.forEach((tree, key) => {
        if (!result) { // Only continue searching if we haven't found a result yet
            const found = getTransformTreeFromTreeId(tree, id);
            if (found) {
                result = found;
            }
        }
    });
    
    return result;
}