export function generateTreeView(schema, handlePropertyChange) {
    var resolveRef = function (ref) {
        if (!schema.definitions) {
            return schema;
        }
        return schema.definitions[ref.replaceAll('#/definitions/', '')];
    };
    var processProperty = function (propertyName, propertySchema, parentId) {
        if (parentId === void 0) { parentId = ''; }
        var id = parentId ? "".concat(parentId, "-").concat(propertyName) : propertyName;
        // Handle $ref
        if (propertySchema.$ref) {
            var refSchema = resolveRef(propertySchema.$ref);
            var refType = propertySchema.$ref.split('/').pop();
            if (!refSchema) {
                return {
                    id: id,
                    name: "".concat(propertyName, ": ").concat(refType),
                    children: [],
                    onClick: function () { return handlePropertyChange(id); }
                };
            }
            return {
                id: id,
                name: "".concat(propertyName, ": ").concat(refType),
                children: Object.entries(refSchema.properties || {}).map(function (_a) {
                    var childName = _a[0], childSchema = _a[1];
                    return processProperty(childName, childSchema, id);
                }),
                onClick: function () { return handlePropertyChange(id); }
            };
        }
        // Handle regular properties
        return {
            id: id,
            name: "".concat(propertyName, ": ").concat(propertySchema.type),
            children: [],
            onClick: function () { return handlePropertyChange(id); }
        };
    };
    // Process root properties
    return Object.entries(schema.properties || {}).map(function (_a) {
        var propName = _a[0], propSchema = _a[1];
        return processProperty(propName, propSchema);
    });
}
