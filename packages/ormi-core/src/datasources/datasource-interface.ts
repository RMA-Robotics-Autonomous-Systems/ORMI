import { JsonSchema, UISchemaElement } from "@jsonforms/core";

import { FC } from "react";

/** Datasource definition describing UI and provider settings. */
interface DatasourceDefinition<T = DatasourceProviderSettings> {
	id: string;
	name: string;
	description: string;

	titleProp?: string;

	schema: JsonSchema;
	uischema?: UISchemaElement;
	data: T;

	/** Provider component for this datasource (lifecycle component, no children). */
	Provider: FC<T>;
}

/** Datasource instance configured in a dashboard. */
interface Datasource {
	/** Points to the datasource definition id. */
	datasource_id: string;
	/** Display title of the datasource. */
	title: string;
	/** Provider settings for the datasource. */
	settings: DatasourceProviderSettings;
}

/** Topic published by a datasource. */
interface DatasourceTopic {
	topic: string;
	datasource_id: string;
	source: DatasourceProviderSettings;
	/** Type of the data inside the webapp. */
	type: string;
	/** Type of the data inside the datasource. */
	rawType: string;
	bufferSize?: number;
}

/** Topic selected for widget configuration. */
interface SelectedTopic extends DatasourceTopic {
	property: string;
}

/** Filter criteria for datasource topics. */
interface DatasourceTopicFilterProps {
	name?: RegExp;
	type?: RegExp;
	rawType?: RegExp;
	source_id?: RegExp;
	/** If true, the filter returns true only if all properties match. */
	strict?: boolean;
}

/** Regex-based filter for datasource topics. */
class DatasourceTopicFilter {
	name?: RegExp;
	type?: RegExp;
	source_id?: RegExp;
	rawType?: RegExp;
	strict?: boolean;

	constructor(props: DatasourceTopicFilterProps) {
		this.name = props.name;
		this.type = props.type;
		this.source_id = props.source_id;
		this.rawType = props.rawType;
		this.strict = props.strict || false;
	}

	/** Check if a topic matches this filter. */
	filter(topic: DatasourceTopic): boolean {
		const matches = [];

		if (this.name && !this.name.test(topic.topic)) {
			matches.push(false);
		}

		if (this.type && !this.type.test(topic.type)) {
			matches.push(false);
		}

		if (this.source_id && !this.source_id.test(topic.datasource_id)) {
			matches.push(false);
		}

		if (this.rawType && !this.rawType.test(topic.rawType)) {
			matches.push(false);
		}

		if (this.strict && matches.length > 0) {
			return false;
		}

		return true;
	}
}

/** Settings required to configure a datasource provider. */
interface DatasourceProviderSettings {
	id: string;
	title: string;
	enable: boolean;
}

export { DatasourceTopicFilter };
export type {
	DatasourceDefinition,
	Datasource,
	DatasourceTopic,
	DatasourceProviderSettings,
	SelectedTopic,
};
