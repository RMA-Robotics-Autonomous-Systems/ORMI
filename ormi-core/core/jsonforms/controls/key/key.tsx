import { withJsonFormsControlProps } from '@jsonforms/react';
import { ControlProps, rankWith, isControl, and, uiTypeIs, ControlElement } from '@jsonforms/core';

import React, { useEffect, useState } from 'react';

import style from './key.module.css';

import { Label } from '@/components/ui/label';

import styles from "@/core/jsonforms/utils/renderer.module.css";



const KeySelectorControl = (props: ControlProps) => {
    const { data, handleChange, path, label } = props;

    const [isSelecting, setIsSelecting] = useState(false);
    const [isKeyDown, setIsKeyDown] = useState(false);

    useEffect(() => {
        const keyPressEvent = (event: KeyboardEvent) => {

            if (data && event.key.toLowerCase() === data.toLowerCase()) {
                setIsKeyDown(true);
            }

            if (isSelecting) {
                handleChange(path, event.key);
                setIsSelecting(false);
            }
        };

        const KeyUpEvent = (event: KeyboardEvent) => {
            if (data && event.key.toLowerCase() === data.toLowerCase()) {
                setIsKeyDown(false);
            }
        }

        document.addEventListener('keydown', keyPressEvent);
        document.addEventListener('keyup', KeyUpEvent);

        return () => {
            document.removeEventListener('keydown', keyPressEvent);
            document.removeEventListener('keyup', KeyUpEvent);
        }

    }, [isSelecting])

    const handleSelecting = () => {
        console.log('selecting');
        setIsSelecting(true);
    }

    return (
        <div className={styles.cell}>
            <Label> {label}</Label>
            <div style={{ width: '5rem' }}>
                <span data-active={isKeyDown} className={style.key} onClick={handleSelecting}>
                    {(!isSelecting && data) || (isSelecting && 'press') || '<key>'}
                </span>
            </div>
        </div >
    );
};

export default withJsonFormsControlProps(KeySelectorControl);

// Define a tester that checks for a specific option in uischema
const keySelectorTester = rankWith(
    10, // Increase rank to ensure this tester is selected when applicable
    and(
        isControl,
        uiTypeIs('Key'), // Check if uischema is of type 'Control'
    )
);

export { keySelectorTester };

export interface KeyControlType extends Omit<ControlElement, 'type'> {
    type: 'Key';
}