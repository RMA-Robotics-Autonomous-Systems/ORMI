import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { withJsonFormsControlProps } from '@jsonforms/react';
import { rankWith, isControl, and, uiTypeIs } from '@jsonforms/core';
import { useEffect, useState } from 'react';
import style from './key.module.css';
import { Label } from '../../../../../library/components/ui/label';
import styles from "../../../../../library/core/jsonforms/utils/renderer.module.css";
var KeySelectorControl = function (props) {
    var data = props.data, handleChange = props.handleChange, path = props.path, label = props.label;
    var _a = useState(false), isSelecting = _a[0], setIsSelecting = _a[1];
    var _b = useState(false), isKeyDown = _b[0], setIsKeyDown = _b[1];
    useEffect(function () {
        var keyPressEvent = function (event) {
            if (data && event.key.toLowerCase() === data.toLowerCase()) {
                setIsKeyDown(true);
            }
            if (isSelecting) {
                handleChange(path, event.key);
                setIsSelecting(false);
            }
        };
        var KeyUpEvent = function (event) {
            if (data && event.key.toLowerCase() === data.toLowerCase()) {
                setIsKeyDown(false);
            }
        };
        document.addEventListener('keydown', keyPressEvent);
        document.addEventListener('keyup', KeyUpEvent);
        return function () {
            document.removeEventListener('keydown', keyPressEvent);
            document.removeEventListener('keyup', KeyUpEvent);
        };
    }, [isSelecting]);
    var handleSelecting = function () {
        console.log('selecting');
        setIsSelecting(true);
    };
    return (_jsxs("div", { className: styles.cell, children: [_jsxs(Label, { children: [" ", label] }), _jsx("div", { style: { width: '5rem' }, children: _jsx("span", { "data-active": isKeyDown, className: style.key, onClick: handleSelecting, children: (!isSelecting && data) || (isSelecting && 'press') || '<key>' }) })] }));
};
export default withJsonFormsControlProps(KeySelectorControl);
// Define a tester that checks for a specific option in uischema
var keySelectorTester = rankWith(10, // Increase rank to ensure this tester is selected when applicable
and(isControl, uiTypeIs('Key')));
export { keySelectorTester };
