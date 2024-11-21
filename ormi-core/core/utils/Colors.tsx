

/*
    Hashes a string and returns a color,
        -> The color is in hexadecimal format
        -> vibrant colors are preferred


*/
export function getColorsFromString(input: string): string {

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
    function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);

        let r: number, g: number, b: number;
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

    const [r, g, b] = hsvToRgb(hue, saturation, value);

    // Convert RGB to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
