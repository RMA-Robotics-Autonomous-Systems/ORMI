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
import isEmpty from 'lodash/isEmpty';
import union from 'lodash/union';
import {
    DispatchCell,
    JsonFormsStateContext,
    useJsonForms,
} from '@jsonforms/react';
import startCase from 'lodash/startCase';
import range from 'lodash/range';
import React, { Fragment, useMemo } from 'react';

import {
    ArrayLayoutProps,
    ControlElement,
    errorAt,
    formatErrorMessage,
    JsonSchema,
    Paths,
    Resolve,
    JsonFormsRendererRegistryEntry,
    JsonFormsCellRendererRegistryEntry,
    encode,
    ArrayTranslations,
} from '@jsonforms/core';

import { WithDeleteDialogSupport } from './DeleteDialog';
import NoBorderTableCell from './NoBorderTableCell';
import TableToolbar from './TableToolbar';
import merge from 'lodash/merge';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@/components/ui/table"
import { TrashIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { MoveDownIcon, MoveUpIcon } from 'lucide-react';

// we want a cell that doesn't automatically span
const styles = {
    fixedCell: {
        width: '150px',
        height: '50px',
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
    },
    fixedCellSmall: {
        width: '50px',
        height: '50px',
        paddingLeft: 0,
        paddingRight: 0,
        textAlign: 'center',
    },
};

interface TableCellProps {
    propName?: string;
    schema: JsonSchema;
    title?: string;
    rowPath: string;
    cellPath: string;
    enabled: boolean;
    cells?: JsonFormsCellRendererRegistryEntry[];
}

const CustomTableCell: React.FC<TableCellProps> = ({
    propName,
    schema,
    title,
    rowPath,
    cellPath,
    enabled,
    cells
}) => {
    return (
        <TableCell>
            <div className={`flex items-center justify-between`}>
                {/* Your cell content here */}
                {title || propName}
                <NonEmptyCell
                    rowPath={rowPath}
                    propName={propName}
                    schema={schema}
                    enabled={enabled}
                    cells={cells}
                />
            </div>

        </TableCell>
    );
};

const generateCells = (
    schema: JsonSchema,
    rowPath: string,
    enabled: boolean,
    cells?: JsonFormsCellRendererRegistryEntry[]
) => {
    if (schema.type === 'object') {
        return getValidColumnProps(schema).map((prop) => {
            const cellPath = Paths.compose(rowPath, prop);
            return (
                <CustomTableCell
                    key={cellPath}
                    propName={prop}
                    schema={schema}
                    title={schema.properties?.[prop]?.title ?? startCase(prop)}
                    rowPath={rowPath}
                    cellPath={cellPath}
                    enabled={enabled}
                    cells={cells}
                />
            );
        });
    }

    // For primitives
    return (
        <CustomTableCell
            key={rowPath}
            schema={schema}
            rowPath={rowPath}
            cellPath={rowPath}
            enabled={enabled}
        />
    );
};

const getValidColumnProps = (scopedSchema: JsonSchema) => {
    if (
        scopedSchema.type === 'object' &&
        typeof scopedSchema.properties === 'object'
    ) {
        return Object.keys(scopedSchema.properties).filter(
            (prop) => scopedSchema.properties?.[prop]?.type !== 'array'
        );
    }
    // primitives
    return [''];
};

export interface EmptyTableProps {
    numColumns: number;
    translations: ArrayTranslations;
}

const EmptyTable = ({ numColumns, translations }: EmptyTableProps) => (
    <TableRow>
        <NoBorderTableCell colSpan={numColumns}>
            <p>{translations.noDataMessage}</p>
        </NoBorderTableCell>
    </TableRow>
);


interface NonEmptyCellProps extends OwnPropsOfNonEmptyCell {
    rootSchema: JsonSchema;
    errors: string;
    path: string;
    enabled: boolean;
}
interface OwnPropsOfNonEmptyCell {
    rowPath: string;
    propName?: string;
    schema: JsonSchema;
    enabled: boolean;
    renderers?: JsonFormsRendererRegistryEntry[];
    cells?: JsonFormsCellRendererRegistryEntry[];
}
const ctxToNonEmptyCellProps = (
    ctx: JsonFormsStateContext,
    ownProps: OwnPropsOfNonEmptyCell
): NonEmptyCellProps => {
    const path =
        ownProps.rowPath +
        (ownProps.schema.type === 'object' ? '.' + ownProps.propName : '');
    const errors = formatErrorMessage(
        union(
            errorAt(
                path,
                ownProps.schema
            )(ctx.core!)?.map((error: any) => error.message ?? '') ?? []
        )
    );
    return {
        rowPath: ownProps.rowPath,
        propName: ownProps.propName,
        schema: ownProps.schema,
        rootSchema: ctx.core?.schema ?? {},
        errors,
        path,
        enabled: ownProps.enabled,
        cells: ownProps.cells || ctx.cells,
        renderers: ownProps.renderers || ctx.renderers,
    };
};

const controlWithoutLabel = (scope: string): ControlElement => ({
    type: 'Control',
    scope: scope,
    label: false,
});

interface NonEmptyCellComponentProps {
    path: string;
    propName?: string;
    schema: JsonSchema;
    rootSchema: JsonSchema;
    errors: string;
    enabled: boolean;
    renderers?: JsonFormsRendererRegistryEntry[];
    cells?: JsonFormsCellRendererRegistryEntry[];
    isValid: boolean;
}
const NonEmptyCellComponent = React.memo(function NonEmptyCellComponent({
    path,
    propName,
    schema,
    rootSchema,
    errors,
    enabled,
    renderers,
    cells,
    isValid,
}: NonEmptyCellComponentProps) {
    return (
        <div>
            {schema.properties ? (
                <DispatchCell
                    schema={Resolve.schema(
                        schema,
                        `#/properties/${encode(propName || '')}`,
                        rootSchema
                    )}
                    uischema={controlWithoutLabel(`#/properties/${encode(propName || '')}`)}
                    path={path}
                    enabled={enabled}
                    renderers={renderers}
                    cells={cells}
                />
            ) : (
                <DispatchCell
                    schema={schema}
                    uischema={controlWithoutLabel('#')}
                    path={path}
                    enabled={enabled}
                    renderers={renderers}
                    cells={cells}
                />
            )}
            {!isValid && <p className="text-sm text-destructive mt-1">{errors}</p>}
        </div>
    );
});

const NonEmptyCell = React.memo(function NonEmptyCell(ownProps: OwnPropsOfNonEmptyCell) {
    const ctx = useJsonForms();
    const emptyCellProps = ctxToNonEmptyCellProps(ctx, ownProps);

    const isValid = isEmpty(emptyCellProps.errors);
    return <NonEmptyCellComponent {...emptyCellProps} isValid={isValid} />;
});

interface NonEmptyRowProps {
    childPath: string;
    schema: JsonSchema;
    rowIndex: number;
    moveUpCreator: (path: string, position: number) => () => void;
    moveDownCreator: (path: string, position: number) => () => void;
    enableUp: boolean;
    enableDown: boolean;
    showSortButtons: boolean;
    enabled: boolean;
    cells?: JsonFormsCellRendererRegistryEntry[];
    path: string;
    translations: ArrayTranslations;
    disableRemove?: boolean;
}

const NonEmptyRowComponent = ({
    childPath,
    schema,
    rowIndex,
    openDeleteDialog,
    moveUpCreator,
    moveDownCreator,
    showSortButtons,
    enabled,
    cells,
    path,
    translations,
    disableRemove,
}: NonEmptyRowProps & WithDeleteDialogSupport) => {
    const moveUp = useMemo(
        () => moveUpCreator(path, rowIndex),
        [moveUpCreator, path, rowIndex]
    );
    const moveDown = useMemo(
        () => moveDownCreator(path, rowIndex),
        [moveDownCreator, path, rowIndex]
    );
    return (
        <TableRow key={childPath}>
            {generateCells(schema, childPath, enabled, cells)}
            {enabled ? (
                <NoBorderTableCell
                    style={showSortButtons ? styles.fixedCell : styles.fixedCellSmall}
                >
                    <div className="flex justify-end items-center"></div>
                    {showSortButtons ? (
                        <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button onClick={() => moveUp()} variant={'ghost'}>
                                        <MoveUpIcon />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {translations.up}
                                </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button onClick={() => moveDown()} variant={'ghost'}>
                                        <MoveDownIcon />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {translations.down}
                                </TooltipContent>
                            </Tooltip>
                        </>
                    ) : null}
                    {!disableRemove ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button onClick={() => openDeleteDialog(childPath, rowIndex)} variant={'ghost'}>
                                    <TrashIcon />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {translations.removeTooltip}
                            </TooltipContent>
                        </Tooltip>
                    ) : null}
                </NoBorderTableCell >
            ) : null
            }
        </TableRow >
    );
};
export const NonEmptyRow = React.memo(NonEmptyRowComponent);

interface TableRowsProp {
    data: number;
    path: string;
    schema: JsonSchema;
    uischema: ControlElement;
    config?: any;
    enabled: boolean;
    cells?: JsonFormsCellRendererRegistryEntry[];
    moveUp?(path: string, toMove: number): () => void;
    moveDown?(path: string, toMove: number): () => void;
    translations: ArrayTranslations;
    disableRemove?: boolean;
}
const TableRows = ({
    data,
    path,
    schema,
    openDeleteDialog,
    moveUp,
    moveDown,
    uischema,
    config,
    enabled,
    cells,
    translations,
    disableRemove,
}: TableRowsProp & WithDeleteDialogSupport) => {
    const isEmptyTable = data === 0;

    if (isEmptyTable) {
        return (
            <EmptyTable
                numColumns={getValidColumnProps(schema).length + 1}
                translations={translations}
            />
        );
    }

    const appliedUiSchemaOptions = merge({}, config, uischema.options);

    return (
        <React.Fragment>
            {range(data).map((index: number) => {
                const childPath = Paths.compose(path, `${index}`);

                return (
                    <NonEmptyRow
                        key={childPath}
                        childPath={childPath}
                        rowIndex={index}
                        schema={schema}
                        openDeleteDialog={openDeleteDialog}
                        moveUpCreator={moveUp!}
                        moveDownCreator={moveDown!}
                        enableUp={index !== 0}
                        enableDown={index !== data - 1}
                        showSortButtons={
                            appliedUiSchemaOptions.showSortButtons ||
                            appliedUiSchemaOptions.showArrayTableSortButtons
                        }
                        enabled={enabled}
                        cells={cells}
                        path={path}
                        translations={translations}
                        disableRemove={disableRemove}
                    />
                );
            })}
        </React.Fragment>
    );
};

// Update the table structure in ShadcnTableControl
export const ShadcnTableControl: React.FC<ArrayLayoutProps & WithDeleteDialogSupport & { translations: ArrayTranslations }> = (props) => {
    const {
        label,
        description,
        path,
        schema,
        rootSchema,
        uischema,
        errors,
        visible,
        enabled,
        cells,
        translations,
        disableAdd,
        disableRemove,
        config,
    } = props;

    const appliedUiSchemaOptions = merge({}, config, uischema.options);
    const doDisableAdd = disableAdd || appliedUiSchemaOptions.disableAdd;
    const doDisableRemove =
        disableRemove || appliedUiSchemaOptions.disableRemove;

    const controlElement = uischema as ControlElement;
    const isObjectSchema = schema.type === 'object';
    const headerCells: any = isObjectSchema
        ? generateCells(schema, path, enabled, cells)
        : undefined;

    if (!visible) {
        return null;
    }

    return (
        <TooltipProvider>
            <Table>
                <TableBody>
                    <TableToolbar
                        errors={errors}
                        label={label}
                        description={description!}
                        addItem={props.addItem}
                        numColumns={isObjectSchema ? headerCells.length : 1}
                        path={path}
                        uischema={controlElement}
                        schema={schema}
                        rootSchema={rootSchema}
                        enabled={enabled}
                        translations={translations}
                        disableAdd={doDisableAdd}
                    />
                    <TableRows
                        {...props}
                        enabled={enabled}
                        disableRemove={doDisableRemove}
                    />
                </TableBody>
            </Table>
        </TooltipProvider>
    );
};
