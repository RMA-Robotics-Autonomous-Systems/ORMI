export function hslToRgb(h, s, l) {
    // Convert HSL to RGB
    function hue2rgb(p, q, t) {
        if (t < 0)
            t += 1;
        if (t > 1)
            t -= 1;
        if (t < 1 / 6)
            return p + (q - p) * 6 * t;
        if (t < 1 / 2)
            return q;
        if (t < 2 / 3)
            return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }
    var r = 0, g = 0, b = 0;
    if (s === 0) {
        r = g = b = l; // Achromatic
    }
    else {
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
    ];
}
export function hsvToRgb(h, s, v) {
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    var r = 0, g = 0, b = 0;
    switch (i % 6) {
        case 0:
            r = v;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = v;
            b = p;
            break;
        case 2:
            r = p;
            g = v;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = v;
            break;
        case 4:
            r = t;
            g = p;
            b = v;
            break;
        case 5:
            r = v;
            g = p;
            b = q;
            break;
    }
    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
    ];
}
/*
    Hashes a string and returns a color,
        -> The color is in hexadecimal format
        -> vibrant colors are preferred


*/
export function getColorsFromString(input, alpha) {
    if (alpha === void 0) { alpha = 1; }
    // Generate a hash of the string using a simple hash function
    function hashString(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return hash;
    }
    // Hash the input string
    var hashInt = Math.abs(hashString(input));
    // Map the hash to a position in the HSV color space with increased separation
    var numDistinctColors = Math.floor(360 / 30); // Increase the separation, 20 degree steps
    var hueStep = hashInt % numDistinctColors;
    var hue = (hueStep * 20) / 360.0; // Step by 20 degrees
    var saturation = 0.8; // Keep saturation high for vibrant colors
    var value = 0.9; // Keep value high for bright colors
    // Convert HSV to RGB
    var _a = hsvToRgb(hue, saturation, value), r = _a[0], g = _a[1], b = _a[2];
    return "rgba(".concat(r, ",").concat(g, ",").concat(b, ",").concat(alpha, ")");
}
export function getTransparentColorFromText(text, alpha) {
    if (alpha === void 0) { alpha = 0.5; }
    return getColorsFromString(text, alpha);
}
export function getTransparentColorString(color, alpha) {
    if (alpha === void 0) { alpha = 0.5; }
    // check if the color is hex or rgba
    if (color.startsWith('rgba')) {
        return color;
    }
    // check if color is hsl
    if (color.startsWith('hsl')) {
        // convert to rgba
        var hsl = color.replace('hsl(', '').replace(')', '').split(',').map(Number);
        var _a = hslToRgb(hsl[0] / 360, hsl[1] / 100, hsl[2] / 100), r_1 = _a[0], g_1 = _a[1], b_1 = _a[2];
        return "rgba(".concat(r_1, ",").concat(g_1, ",").concat(b_1, ",").concat(alpha, ")");
    }
    // check if rbg
    if (color.startsWith('rgb')) {
        // convert to rgba
        var rgb = color.replace('rgb(', '').replace(')', '').split(',').map(Number);
        return "rgba(".concat(rgb[0], ",").concat(rgb[1], ",").concat(rgb[2], ",").concat(alpha, ")");
    }
    // convert hex to rgba
    var hex = color.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return "rgba(".concat(r, ",").concat(g, ",").concat(b, ",").concat(alpha, ")");
}
