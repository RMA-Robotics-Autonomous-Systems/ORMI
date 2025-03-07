import dayjs from 'dayjs';
import customParsing from 'dayjs/plugin/customParseFormat';
// required for the custom save formats in the date, time and date-time pickers
dayjs.extend(customParsing);
export var createOnChangeHandler = function (path, handleChange, saveFormat) {
    return function (value) {
        if (!value) {
            handleChange(path, undefined);
        }
        else if (value.toString() !== 'Invalid Date') {
            var formatedDate = formatDate(value, saveFormat);
            handleChange(path, formatedDate);
        }
    };
};
export var createOnBlurHandler = function (path, handleChange, format, saveFormat, rerenderChild, onBlur) {
    return function (e) {
        var date = dayjs(e.target.value, format);
        var formatedDate = formatDate(date, saveFormat);
        if (formatedDate.toString() === 'Invalid Date') {
            handleChange(path, undefined);
            rerenderChild();
        }
        else {
            handleChange(path, formatedDate);
        }
        onBlur();
    };
};
export var formatDate = function (date, saveFormat) {
    var formatedDate = date.format(saveFormat);
    // Workaround to address a bug in Dayjs, neglecting leading 0 (https://github.com/iamkun/dayjs/issues/1849)
    var indexOfYear = saveFormat.indexOf('YYYY');
    if (date.year() < 1000 && indexOfYear !== -1) {
        var stringUpToYear = formatedDate.slice(0, indexOfYear);
        var stringFromYear = formatedDate.slice(indexOfYear);
        if (date.year() >= 100) {
            formatedDate = [stringUpToYear, 0, stringFromYear].join('');
        }
        else if (date.year() >= 10) {
            formatedDate = [stringUpToYear, 0, 0, stringFromYear].join('');
        }
        else if (date.year() >= 1) {
            formatedDate = [stringUpToYear, 0, 0, 0, stringFromYear].join('');
        }
    }
    return formatedDate;
};
export var getData = function (data, saveFormat) {
    if (!data) {
        return null;
    }
    var dayjsData = dayjs(data, saveFormat);
    if (dayjsData.toString() === 'Invalid Date') {
        return null;
    }
    return dayjsData;
};
