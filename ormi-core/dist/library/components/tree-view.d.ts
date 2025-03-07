import React from 'react';
interface TreeDataItem {
    id: string;
    name: string;
    icon?: any;
    selectedIcon?: any;
    openIcon?: any;
    children?: TreeDataItem[];
    actions?: React.ReactNode;
    onClick?: () => void;
}
declare const TreeView: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & {
    data: TreeDataItem[] | TreeDataItem;
    initialSelectedItemId?: string;
    onSelectChange?: (item: TreeDataItem | undefined) => void;
    expandAll?: boolean;
    defaultNodeIcon?: any;
    defaultLeafIcon?: any;
} & React.RefAttributes<HTMLDivElement>>;
export { TreeView, type TreeDataItem };
