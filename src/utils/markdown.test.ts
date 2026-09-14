import { describe, expect, it } from "vitest";
import { extractWikilinks, hasFencedCodeBlock, parseRubricTable, summarizeRubric } from "./markdown";

const RUBRIC_FIXTURE = `# Some Assignment

## Instructor requirements

- [ ] Do the thing

## Rubric checklist

| Criterion | Requirement | Evidence in my work | Complete |
|---|---|---|---:|
| Identify entities | List all required entities | [[ERD - Project]] | ⬜ |
| Normalize tables | Normalize schema to 3NF | [[Normalization - Project]] | ✅ |
| Missing evidence row | Something | | ⬜ |

## Work plan

- [ ] Read instructions
`;

describe("parseRubricTable", () => {
	it("returns null when there is no rubric heading", () => {
		expect(parseRubricTable("# Note\n\nNo rubric here.")).toBeNull();
	});

	it("parses rows under a '## Rubric checklist' heading", () => {
		const table = parseRubricTable(RUBRIC_FIXTURE);
		expect(table).not.toBeNull();
		expect(table?.rows).toHaveLength(3);
	});

	it("extracts evidence wikilinks and complete/missing-evidence flags per row", () => {
		const table = parseRubricTable(RUBRIC_FIXTURE)!;
		expect(table.rows[0].evidenceLinks).toEqual(["ERD - Project"]);
		expect(table.rows[0].complete).toBe(false);
		expect(table.rows[0].missingEvidence).toBe(false);

		expect(table.rows[1].complete).toBe(true);

		expect(table.rows[2].missingEvidence).toBe(true);
		expect(table.rows[2].evidenceLinks).toEqual([]);
	});

	it("stops at the next heading and does not swallow later sections", () => {
		const table = parseRubricTable(RUBRIC_FIXTURE)!;
		expect(table.rows.some((r) => r.criterion.includes("Read instructions"))).toBe(false);
	});
});

describe("summarizeRubric", () => {
	it("summarizes complete count and missing-evidence count", () => {
		const table = parseRubricTable(RUBRIC_FIXTURE)!;
		expect(summarizeRubric(table)).toBe("1/3 rubric criteria marked complete; 1 criteria missing evidence");
	});
});

describe("extractWikilinks", () => {
	it("extracts plain and piped/aliased wikilinks", () => {
		expect(extractWikilinks("See [[Normalization]] and [[ERD - Project|the ERD]].")).toEqual([
			"Normalization",
			"ERD - Project",
		]);
	});
});

describe("hasFencedCodeBlock", () => {
	it("detects a fenced sql block", () => {
		expect(hasFencedCodeBlock("```sql\nSELECT 1;\n```", "sql")).toBe(true);
	});

	it("returns false when there is no matching fence", () => {
		expect(hasFencedCodeBlock("```js\nconsole.log(1);\n```", "sql")).toBe(false);
	});
});
