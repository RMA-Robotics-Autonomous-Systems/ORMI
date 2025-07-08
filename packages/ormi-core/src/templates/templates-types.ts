import { Widget } from "../widgets";
import { Datasource } from "../datasources";

export type TemplateType = 'widget' | 'datasource';

export interface BaseTemplate {
    name: string;
    public: boolean;
    tags: string[];
    yours: boolean;
    type: TemplateType;
}

export interface WidgetTemplate extends BaseTemplate {
    type: 'widget';
    widget: Widget;
}

export interface DatasourceTemplate extends BaseTemplate {
    type: 'datasource';
    datasource: Datasource;
}

export type Template = WidgetTemplate | DatasourceTemplate;

// Legacy interface for backward compatibility
export interface LegacyTemplate {
    name: string;
    widget: Widget;
    public: boolean;
    tags: string[];
    yours: boolean;
}

/*

model TemplateWidget {
    id        Int      @id @default(autoincrement())
    name      String
    content   Json?
    createdAT DateTime @default(now())
    updatedAT DateTime @default(now())

    createdBy   User   @relation(fields: [createdById], references: [id])
    createdById String

    public Boolean  @default(false)
    tags   String[]
}
    
*/