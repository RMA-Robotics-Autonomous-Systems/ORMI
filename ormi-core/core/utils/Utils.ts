
export function generateUniqueID(): string {
    const timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    const random = Math.random().toString(16).substring(2);

    return `${timestamp}-${random}`;
}