"use client";

import React, { ReactNode } from "react";
import * as ROSLIB from "roslib";
import { createSafeContext } from "@workspace/utils";

interface RosbridgeDataContextValue {
	/** The live, connected ROSLIB.Ros instance. Non-null by construction: this
	 *  context is only rendered once the connection is established. */
	ros: ROSLIB.Ros;
}

const [RosbridgeDataContextProvider, useRosbridgeData] =
	createSafeContext<RosbridgeDataContextValue>("RosbridgeData");

interface RosbridgeDataHandlerProps {
	children: ReactNode;
	ros: ROSLIB.Ros;
}

/**
 * RosbridgeDataHandler provides the live ROSLIB.Ros instance to all child
 * managers via the RosbridgeData context.  It is only rendered while the
 * connection is active; when the connection drops every manager unmounts and
 * cleans up its plugin hooks automatically.
 */
const RosbridgeDataHandler: React.FC<RosbridgeDataHandlerProps> = ({
	children,
	ros,
}) => {
	return (
		<RosbridgeDataContextProvider value={{ ros }}>
			{children}
		</RosbridgeDataContextProvider>
	);
};

export { RosbridgeDataHandler, useRosbridgeData };
