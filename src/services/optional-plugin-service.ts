import type { App } from "obsidian";
import { OPTIONAL_PLUGIN_IDS, type OptionalPluginKey, type OptionalPluginStatus } from "../types";

interface AppWithPlugins extends App {
	plugins: {
		enabledPlugins: Set<string>;
		plugins: Record<string, unknown>;
	};
}

/** Detects optional community plugins by ID without requiring any of them.
 * Never throws or errors if a plugin is absent. */
export function detectOptionalPlugins(app: App): OptionalPluginStatus {
	const pluginsApi = (app as AppWithPlugins).plugins;
	const status = {} as OptionalPluginStatus;
	for (const key of Object.keys(OPTIONAL_PLUGIN_IDS) as OptionalPluginKey[]) {
		const id = OPTIONAL_PLUGIN_IDS[key];
		status[key] = Boolean(pluginsApi?.enabledPlugins?.has(id));
	}
	return status;
}
