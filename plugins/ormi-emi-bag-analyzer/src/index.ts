"use client";

import { Plugin, PluginsHooks, PageDefinition } from "@workspace/ormi-plugins";
import { EmiAnalyzerPage } from "./components/emi-analyzer-page";

class EmiBagAnalyzerPlugin extends Plugin {
	constructor() {
		super();

		this.name = "EMI Bag Analyzer";
		this.description =
			"Client-side ROS2 bag analyzer for EMI data. Load a .db3 bag file locally, visualize signals, apply filters, and inspect GPS heatlines — no server required.";
		this.version = "1.0.0";
		this.author = "Florian Lebecque";
		this.email = "florian.lebecque@mil.be";

		this.addFilter(PluginsHooks.PAGES_LIST, {
			id: "emi-bag-analyzer-page",
			priority: 10,
			filter: (pages: PageDefinition[]) => {
				pages.push({
					slug: "emi-bag",
					title: "EMI Bag Analyzer",
					component: EmiAnalyzerPage,
					navItem: {
						position: "left",
						priority: 5,
						description:
							"Load a ROS2 .db3 bag file, visualize EMI signals, apply filters, and label confidence.",
					},
				});
				return pages;
			},
		});
	}
}

export default EmiBagAnalyzerPlugin;
