/**
 * The noun an array's rows are called by, derived from the array's own label.
 *
 * An array labelled "Series" holds a series, "Point Cloud Layers" holds a point
 * cloud layer. The list renderer uses the singular for the row fallback
 * ("Series 2"), the Add button ("Add series") and the plural for the empty
 * state ("No series."). Only the last word is inflected; words written in
 * capitals (IMU, GPS) keep their case when the phrase is lowercased.
 */

/** Nouns whose singular and plural are the same, or that end in `s` anyway. */
const INVARIANT = new Set(["series", "species", "data", "status", "news"]);

/** Plurals no suffix rule gets right. */
const IRREGULAR: Record<string, string> = {
	axes: "axis",
	vertices: "vertex",
	indices: "index",
	matrices: "matrix",
	children: "child",
	people: "person",
};

/** Wording for an array's rows. */
export interface ItemNoun {
	/** Singular in title case for a row heading: "Series", "Point Cloud Layer". */
	singularTitle: string;
	/** Singular in running text: "series", "point cloud layer". */
	singular: string;
	/** Plural in running text: "series", "point cloud layers". */
	plural: string;
}

/** Fallback when the array carries no label at all. */
const DEFAULT_NOUN: ItemNoun = {
	singularTitle: "Item",
	singular: "item",
	plural: "items",
};

/**
 * Singular of one English word, keeping the word's case.
 *
 * Deliberately conservative: a word it does not recognise as a plural is
 * returned untouched, because "Add status" reads better than "Add statu".
 *
 * @param word - A single word, any case.
 * @returns The singular form.
 */
export function singularizeWord(word: string): string {
	const lower = word.toLowerCase();
	if (lower.length < 3 || INVARIANT.has(lower)) return word;

	const irregular = IRREGULAR[lower];
	if (irregular) {
		if (word === word.toUpperCase()) return irregular.toUpperCase();
		return /^[A-Z]/.test(word) ? capitalize(irregular) : irregular;
	}

	if (lower.endsWith("ies")) return word.slice(0, -3) + matchCase(word, "y");
	if (/(sses|xes|zzes|ches|shes)$/.test(lower)) return word.slice(0, -2);
	if (lower.endsWith("s") && !/(ss|us|is)$/.test(lower)) {
		return word.slice(0, -1);
	}
	return word;
}

/**
 * Give a replacement suffix the case of the word it replaces into.
 *
 * @param word - The original word.
 * @param suffix - Lowercase replacement.
 * @returns The suffix, uppercased when the word is all capitals.
 */
function matchCase(word: string, suffix: string): string {
	return word === word.toUpperCase() && /[A-Z]/.test(word)
		? suffix.toUpperCase()
		: suffix;
}

/**
 * Lowercase a phrase for running text, leaving acronyms alone.
 *
 * @param phrase - A label such as "IMU Topics".
 * @returns "IMU topics".
 */
export function toRunningText(phrase: string): string {
	return phrase
		.split(" ")
		.map((word) => (/^[A-Z][a-z]/.test(word) ? word.toLowerCase() : word))
		.join(" ");
}

/**
 * Uppercase the first letter of a phrase, leaving the rest alone.
 *
 * @param phrase - Any phrase.
 * @returns The phrase with a capital first letter.
 */
function capitalize(phrase: string): string {
	return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Derive the wording for an array's rows from the array's label.
 *
 * @param label - The array's label as JSON Forms computed it (schema `title`,
 *   uischema `label`, or the start-cased property name). A trailing required
 *   asterisk is ignored.
 * @returns Singular and plural wording; "item"/"items" when there is no label.
 */
export function deriveItemNoun(label: string | undefined): ItemNoun {
	const clean = (label ?? "").replace(/\*+\s*$/, "").trim();
	if (!clean) return DEFAULT_NOUN;

	const words = clean.split(/\s+/);
	const last = words[words.length - 1]!;
	const singularWords = [...words.slice(0, -1), singularizeWord(last)];
	const singularPhrase = singularWords.join(" ");

	return {
		singularTitle: capitalize(singularPhrase),
		singular: toRunningText(singularPhrase),
		plural: toRunningText(words.join(" ")),
	};
}
