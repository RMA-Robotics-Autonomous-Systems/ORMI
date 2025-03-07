import { DatasourceDefinition, DatasourceProviderSettings } from "../datasource-interface";
interface DatasourceCardProps {
    definition: DatasourceDefinition<DatasourceProviderSettings>;
    data?: DatasourceProviderSettings;
    onValidate: (datasource: DatasourceDefinition<DatasourceProviderSettings>, settings: any) => void;
    onRemove: (source_id: string) => void;
}
declare const DatasourceCard: (props: DatasourceCardProps) => import("react/jsx-runtime").JSX.Element;
export default DatasourceCard;
