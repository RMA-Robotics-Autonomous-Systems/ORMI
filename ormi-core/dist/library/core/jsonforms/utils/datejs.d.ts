import dayjs from 'dayjs';
export declare const createOnChangeHandler: (path: string, handleChange: (path: string, value: any) => void, saveFormat: string) => (value: dayjs.Dayjs) => void;
export declare const createOnBlurHandler: (path: string, handleChange: (path: string, value: any) => void, format: string, saveFormat: string, rerenderChild: () => void, onBlur: () => void) => (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement, Element>) => void;
export declare const formatDate: (date: dayjs.Dayjs, saveFormat: string) => string;
export declare const getData: (data: any, saveFormat: string | undefined) => dayjs.Dayjs | null;
