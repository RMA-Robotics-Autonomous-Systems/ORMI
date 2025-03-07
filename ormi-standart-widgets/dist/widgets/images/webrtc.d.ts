import { SelectedTopic } from 'ormi-core/datasources';
import { VerticalLayout } from '@jsonforms/core';
interface WebrtcRos2VideoStreamProps {
    title: string;
    topic: SelectedTopic;
    iceServersUrls?: string[];
}
declare const WebrtcRos2VideoStream: (props: WebrtcRos2VideoStreamProps) => import("react/jsx-runtime").JSX.Element;
export default WebrtcRos2VideoStream;
export declare function WebRtcRos2Definition(): {
    id: string;
    name: string;
    description: string;
    titleProp: string;
    icon: import("react/jsx-runtime").JSX.Element;
    schema: {
        type: string;
        properties: {
            title: {
                type: string;
                title: string;
            };
            topic: {
                type: string;
                title: string;
            };
            iceServersUrls: {
                type: string;
                title: string;
                items: {
                    type: string;
                };
                default: string[];
            };
        };
        required: string[];
    };
    uischema: VerticalLayout;
    data: {
        title: string;
        iceServersUrls: string[];
    };
    Component: (data: WebrtcRos2VideoStreamProps) => import("react/jsx-runtime").JSX.Element;
};
