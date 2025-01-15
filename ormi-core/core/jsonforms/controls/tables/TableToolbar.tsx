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
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import { PlusIcon } from "@radix-ui/react-icons";
import { AlertCircle } from "lucide-react";

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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

const TableToolbar = React.memo(function TableToolbar({
    numColumns,
    errors,
    label,
    description,
    path,
    addItem,
    schema,
    enabled,
    translations,
    rootSchema,
    disableAdd,
}: ShadcnTableToolbarProps) {
    return (
        <TableRow>
            <TableCell colSpan={numColumns}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-semibold">{label}</h2>
                            {errors.length > 0 && (
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
                                            variant="ghost"
                                            size="icon"
                                            onClick={addItem(path, createDefaultValue(schema, rootSchema))}
                                            aria-label={translations.addTooltip}
                                        >
                                            <PlusIcon className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{translations.addTooltip}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    {description && (
                        <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
});

export default TableToolbar;
