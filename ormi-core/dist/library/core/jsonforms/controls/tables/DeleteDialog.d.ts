import React from 'react';
export interface DeleteDialogProps {
    open: boolean;
    onClose(): void;
    onConfirm(): void;
    onCancel(): void;
    title: string;
    message: string;
    acceptText: string;
    declineText: string;
}
export interface WithDeleteDialogSupport {
    openDeleteDialog(path: string, data: number): void;
}
export declare const DeleteDialog: React.NamedExoticComponent<DeleteDialogProps>;
