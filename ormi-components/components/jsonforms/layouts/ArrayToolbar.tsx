'use client';
import React from 'react';
import { ArrayTranslations } from '@jsonforms/core';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"


import { PlusIcon } from '@radix-ui/react-icons';
export interface ArrayLayoutToolbarProps {
    label: string;
    description: string;
    errors: string;
    path: string;
    enabled: boolean;
    addItem(path: string, data: any): () => void;
    createDefault(): any;
    translations: ArrayTranslations;
    disableAdd?: boolean;
}
export const ArrayLayoutToolbar = React.memo(function ArrayLayoutToolbar({
    label,
    description,
    errors,
    addItem,
    path,
    enabled,
    createDefault,
    translations,
    disableAdd,
}: ArrayLayoutToolbarProps) {

    return (
        <div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold">{label}</h2>
                        {errors.length > 0 && (
                            <span className="text-destructive">{errors}</span>
                        )}
                    </div>
                    {enabled && !disableAdd && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={addItem(path, createDefault())}
                                        aria-label={translations.addTooltip}
                                    >
                                        <PlusIcon />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {translations.addTooltip}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
            </div>
        </div>
    );
});

/*
<Toolbar disableGutters={true}>
            <Stack>
                <Grid container alignItems='center' justifyContent='space-between'>
                    <Grid item>
                        <Grid
                            container
                            justifyContent={'flex-start'}
                            alignItems={'center'}
                            spacing={2}
                        >
                            <Grid item>
                                <Typography variant={'h6'}>{label}</Typography>
                            </Grid>
                            <Grid item>
                                {errors.length !== 0 && (
                                    <Grid item>
                                        <Typography color='error'>{errors}</Typography>
                                    </Grid>
                                )}
                            </Grid>
                        </Grid>
                    </Grid>
                    {enabled && !disableAdd && (
                        <Grid item>
                            <Grid container>
                                <Grid item>
                                    <Tooltip
                                        id='tooltip-add'
                                        title={translations.addTooltip}
                                        placement='bottom'
                                    >
                                        <IconButton
                                            aria-label={translations.addTooltip}
                                            onClick={addItem(path, createDefault())}
                                            size='large'
                                        >
                                            <AddIcon />
                                        </IconButton>
                                    </Tooltip>
                                </Grid>
                            </Grid>
                        </Grid>
                    )}
                </Grid>
                {description && <FormHelperText>{description}</FormHelperText>}
            </Stack>
        </Toolbar>
*/