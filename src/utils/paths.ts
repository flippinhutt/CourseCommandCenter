// eslint-disable-next-line no-control-regex -- control chars 0x00-0x1f are invalid in Windows file names
const WINDOWS_INVALID_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i;
const TRAILING_DOTS_SPACES = /[. ]+$/;

/** Sanitizes a string for use as a Windows-safe file name, preserving
 * Unicode letters, em dashes, and normal spaces. */
export function sanitizeFileName(name: string): string {
	let result = name.replace(WINDOWS_INVALID_CHARS, " ").replace(/\s+/g, " ").trim();
	result = result.replace(TRAILING_DOTS_SPACES, "");
	if (!result) result = "Untitled";
	if (WINDOWS_RESERVED_NAMES.test(result)) result = `${result}_`;
	return result;
}

export function joinVaultPath(...parts: string[]): string {
	return parts
		.map((part) => part.replace(/^\/+|\/+$/g, ""))
		.filter((part) => part.length > 0)
		.join("/");
}

/** Builds the vault-relative markdown path a note title would create in a
 * folder. Does not check for collisions — callers must check existence
 * themselves and prompt the user for a different name rather than
 * overwriting (per the plugin's no-destructive-behavior rule). */
export function notePathFor(folder: string, title: string): string {
	return joinVaultPath(folder, `${sanitizeFileName(title)}.md`);
}
