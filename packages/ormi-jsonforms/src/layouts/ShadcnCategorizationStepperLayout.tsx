"use client"
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
import React, { useState, useMemo } from 'react';
import merge from 'lodash/merge';
import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';
import {
    and,
    Categorization,
    categorizationHasCategory,
    Category,
    deriveLabelForUISchemaElement,
    isVisible,
    optionIs,
    RankedTester,
    rankWith,
    StatePropsOfLayout,
    uiTypeIs,
} from '@jsonforms/core';
import {
    TranslateProps,
    withJsonFormsLayoutProps,
    withTranslateProps,
} from '@jsonforms/react';
import {
    AjvProps,
    ShadcnLayoutRenderer,
    shadcnLayoutRendererProps,
    withAjvProps,
} from '../utils/layouts';

export const shadcnCategorizationStepperTester: RankedTester = rankWith(
    3,
    and(
        uiTypeIs('Categorization'),
        categorizationHasCategory,
        optionIs('variant', 'stepper')
    )
);

export interface CategorizationStepperState {
    activeCategory: number;
}

export interface ShadcnCategorizationStepperLayoutRendererProps
    extends StatePropsOfLayout,
    AjvProps,
    TranslateProps {
    data: any;
}

export const ShadcnCategorizationStepperLayoutRenderer = (
    props: ShadcnCategorizationStepperLayoutRendererProps
) => {
    const [activeCategory, setActiveCategory] = useState<number>(0);

    const handleStep = (step: number) => {
        setActiveCategory(step);
    };

    const {
        data,
        path,
        renderers,
        schema,
        uischema,
        visible,
        cells,
        config,
        ajv,
        t,
    } = props;
    const categorization = uischema as Categorization;
    const appliedUiSchemaOptions = merge({}, config, uischema.options);
    const buttonWrapperStyle = {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '1rem',
        width: '100%',
        marginTop: '1rem',
    };
    const categories = useMemo(
        () =>
            categorization.elements.filter((category: Categorization | Category) =>
                isVisible(category, data, '', ajv)
            ),
        [categorization, data, ajv]
    );
    const childProps: shadcnLayoutRendererProps = {
        elements: categories[activeCategory]!.elements,
        schema,
        path,
        direction: 'column',
        visible,
        renderers,
        cells,
    };
    const tabLabels = useMemo(() => {
        return categories.map((e) => e.type === 'Category' ? deriveLabelForUISchemaElement(e as Category, t) : undefined);
    }, [categories, t]);

    if (!visible) {
        return null;
    }

    return (
        <>
            {/* Custom Stepper */}
            <div className="flex flex-wrap gap-2 mb-6">
                {categories.map((_: Categorization | Category, idx: number) => (
                    <Button
                        key={tabLabels[idx]}
                        variant={activeCategory === idx ? "default" : "outline"}
                        onClick={() => handleStep(idx)}
                        className={cn(
                            "flex items-center gap-2",
                            activeCategory === idx && "bg-primary text-primary-foreground"
                        )}
                    >
                        <span className={cn(
                            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                            activeCategory === idx
                                ? "bg-primary-foreground text-primary"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {idx + 1}
                        </span>
                        {tabLabels[idx]}
                    </Button>
                ))}
            </div>

            <div className="mb-4">
                <ShadcnLayoutRenderer {...childProps} />
            </div>

            {appliedUiSchemaOptions.showNavButtons && (
                <div style={buttonWrapperStyle}>
                    <Button
                        variant='secondary'
                        disabled={activeCategory <= 0}
                        onClick={() => handleStep(activeCategory - 1)}
                    >
                        Previous
                    </Button>
                    <Button
                        disabled={activeCategory >= categories.length - 1}
                        onClick={() => handleStep(activeCategory + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}
        </>
    );
};

export default withAjvProps(
    withTranslateProps(
        withJsonFormsLayoutProps(ShadcnCategorizationStepperLayoutRenderer)
    )
);