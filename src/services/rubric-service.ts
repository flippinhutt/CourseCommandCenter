import type { App, TFile } from "obsidian";
import type { RubricTable } from "../types";
import { parseRubricTable, summarizeRubric } from "../utils/markdown";

export async function readRubricTable(app: App, file: TFile): Promise<RubricTable | null> {
	const content = await app.vault.cachedRead(file);
	return parseRubricTable(content);
}

export { summarizeRubric };
