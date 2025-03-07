export function generateUniqueID() {
    var timestamp = (new Date().getTime() / 1000 | 0).toString(16);
    var random = Math.random().toString(16).substring(2);
    return "".concat(timestamp, "-").concat(random);
}
