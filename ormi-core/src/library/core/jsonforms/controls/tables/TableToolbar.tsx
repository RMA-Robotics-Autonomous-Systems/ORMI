/*
  The MIT License

  Copyright (c) 2017-2019 EclipseSource Munich
  https://github.com/eclipsesource/jsonforms

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/
import React from 'react';
import {
    ControlElement,
    createDefaultValue,
    JsonSchema,
    ArrayTranslations,
} from '@jsonforms/core';

import {
    TableRow,
    TableCell
} from "@/library/components/ui/table";

import { Button } from "@/library/components/ui/button";
import { PlusIcon } from "@radix-ui/react-icons";
import { AlertCircle } from "lucide-react";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/library/components/ui/tooltip";

export interface ShadcnTableToolbarProps {
    numColumns: number;
    errors: string;
    label: string;
    description: string;
    path: string;
    uischema: ControlElement;
    schema: JsonSchema;
    rootSchema: JsonSchema;
    enabled: boolean;
    translations: ArrayTranslations;
    addItem(path: string, value: any): () => void;
    disableAdd?: boolean;
}

export const TableToolbar = React.memo(function TableToolbar({
    numColumns,
    errors,
    label,
    path,
    addItem,
    schema,
    enabled,
    translations,
    rootSchema,
    disableAdd,
}: ShadcnTableToolbarProps) {
    const handleAddClick = React.useCallback(() => {
        const newValue = createDefaultValue(schema, rootSchema);
        addItem(path, newValue)();
    }, [addItem, path, schema]);

    return (
        <TableRow>
            <TableCell colSpan={numColumns + 1}>
                <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">{label}</h3>
                        {errors && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{errors}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    {enabled && !disableAdd && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        onClick={handleAddClick}
                                        size="sm"
                                        variant="outline"
                                    >
                                        <PlusIcon className="h-4 w-4 mr-2" />
                                        {translations.addTooltip}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {translations.addTooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
});

export default TableToolbar;
