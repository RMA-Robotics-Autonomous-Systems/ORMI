/*
  The MIT License

  Copyright (c) 2018-2019 EclipseSource Munich
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
import {
    and,
    ControlProps,
    JsonSchema,
    RankedTester,
    rankWith,
    schemaMatches,
    uiTypeIs,
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import React, { useState } from 'react';

const ShadcnAutocompleteInputText = (props: ControlProps) => {
    const {
        id,
        label,
        enabled,
        path,
        handleChange,
        schema,
        data,
    } = props;

    const [inputText, setInputText] = useState(data || '');
    const enumItems = schema.anyOf?.find(s => s.enum)?.enum || [];

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        setInputText(newValue);
        handleChange(path, newValue);
    };

    const onSelect = (value: string) => {
        setInputText(value);
        handleChange(path, value);
    };

    return enumItems.length > 0 ? (
        <Select
            value={inputText}
            onValueChange={onSelect}
            disabled={!enabled}
        >
            <SelectTrigger className="w-full">
                <SelectValue placeholder={label} />
            </SelectTrigger>
            <SelectContent>
                {enumItems.map((item: string) => (
                    <SelectItem key={item} value={item}>
                        {item}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    ) : (
        <Input
            type="text"
            value={inputText}
            onChange={onChange}
            id={id}
            placeholder={label}
            disabled={!enabled}
        />
    );
};

const ShadcnAnyOfStringOrEnumControl = (props: ControlProps) => {
    return <ShadcnAutocompleteInputText {...props} />;
};

const hasEnumAndText = (schemas: JsonSchema[]) => {
    const enumSchema = schemas.find(
        (s) => s.enum !== undefined && (s.type === 'string' || s.type === undefined)
    );
    const stringSchema = schemas.find((s) => s.type === 'string' && s.enum === undefined);
    const remainingSchemas = schemas.filter(
        (s) => s !== enumSchema || s !== stringSchema
    );
    const wrongType = remainingSchemas.find((s) => s.type && s.type !== 'string');
    return enumSchema && stringSchema && !wrongType;
};

const simpleAnyOf = and(
    uiTypeIs('Control'),
    schemaMatches(
        (schema) =>
            Object.prototype.hasOwnProperty.call(schema, 'anyOf') &&
            hasEnumAndText(schema.anyOf!)!
    )
);

export const shadcnAnyOfStringOrEnumControlTester: RankedTester = rankWith(
    6,
    simpleAnyOf
);

export default withJsonFormsControlProps(ShadcnAnyOfStringOrEnumControl);
