// the filter works by using regexes on the name and type of the topic
var DatasourceTopicFilter = /** @class */ (function () {
    function DatasourceTopicFilter(props) {
        this.name = props.name;
        this.type = props.type;
        this.source_id = props.source_id;
    }
    DatasourceTopicFilter.prototype.filter = function (topic) {
        if (this.name && !this.name.test(topic.topic)) {
            return false;
        }
        if (this.type && !this.type.test(topic.type)) {
            return false;
        }
        if (this.source_id && !this.source_id.test(topic.datasource_id)) {
            return false;
        }
        return true;
    };
    return DatasourceTopicFilter;
}());
export { DatasourceTopicFilter };
