export function hslToRgb(h: number, s: number, l: number): [number, number, number] {

    // Convert HSL to RGB
    function hue2rgb(p: number, q: number, t: number): number {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }

    let r: number = 0, g: number = 0, b: number = 0;

    if (s === 0) {
        r = g = b = l; // Achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
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

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r: number = 0, g: number = 0, b: number = 0;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
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
export function getColorsFromString(input: string, alpha: number = 1): string {

    // Generate a hash of the string using a simple hash function
    function hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return hash;
    }

    // Hash the input string
    const hashInt = Math.abs(hashString(input));

    // Map the hash to a position in the HSV color space with increased separation
    const numDistinctColors = Math.floor(360 / 30); // Increase the separation, 20 degree steps
    const hueStep = hashInt % numDistinctColors;
    const hue = (hueStep * 20) / 360.0; // Step by 20 degrees

    const saturation = 0.8; // Keep saturation high for vibrant colors
    const value = 0.9; // Keep value high for bright colors

    // Convert HSV to RGB
    const [r, g, b] = hsvToRgb(hue, saturation, value);

    return `rgba(${r},${g},${b},${alpha})`;

}

export function getTransparentColorFromText(text: string, alpha: number = 0.5): string {
    return getColorsFromString(text, alpha);
}

export function getTransparentColorString(color: string, alpha: number = 0.5): string {

    // check if the color is hex or rgba
    if (color.startsWith('rgba')) {
        return color;
    }

    // check if color is hsl
    if (color.startsWith('hsl')) {

        // convert to rgba
        const hsl = color.replace('hsl(', '').replace(')', '').split(',').map(Number);
        const [r, g, b] = hslToRgb(hsl[0] / 360, hsl[1] / 100, hsl[2] / 100);

        return `rgba(${r},${g},${b},${alpha})`;
    }

    // check if rbg
    if (color.startsWith('rgb')) {

        // convert to rgba
        const rgb = color.replace('rgb(', '').replace(')', '').split(',').map(Number);

        return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    }

    // convert hex to rgba
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r},${g},${b},${alpha})`;
}