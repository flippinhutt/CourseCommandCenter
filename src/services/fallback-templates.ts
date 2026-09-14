import type { ArtifactType } from "../types";

type TemplateBuilder = (title: string) => string;

function section(...headings: string[]): string {
	return headings.map((h) => `## ${h}\n\n`).join("");
}

function checklist(...items: string[]): string {
	return items.map((i) => `- [ ] ${i}\n`).join("") + "\n";
}

const rubricBlock = `## Rubric checklist\n\n| Criterion | Requirement | Evidence in my work | Complete |\n|---|---|---|---:|\n|  |  |  | ⬜ |\n\n`;

/** Built-in fallback Markdown templates, used when no matching template file
 * exists under the configured templates folder. Frontmatter is generated
 * separately by the template service; these produce body content only.
 * Placeholder sections only — no fabricated content, no empty [[ ]] links.
 * Covers the curated ArtifactType suggestions; a custom type name not
 * listed here gets GENERIC_FALLBACK_TEMPLATE instead. */
export const FALLBACK_TEMPLATES: Partial<Record<ArtifactType, TemplateBuilder>> = {
	"course-hub": (title) => `# ${title}\n\n${section("Course access", "This week", "Key dates", "Grading breakdown", "Policies to remember", "Current topics")}`,
	module: (title) =>
		`# Module ${title}\n\n## Module checklist\n\n${checklist(
			"Read module overview",
			"Complete assigned readings",
			"Watch lecture or video material",
			"Submit required work"
		)}${section("Required materials", "Deadlines", "Notes")}`,
	announcement: (title) => `# ${title}\n\n${section("Summary", "Action items")}`,
	assignment: (title) =>
		`# ${title}\n\n${section("Assignment objective", "Instructor requirements")}${rubricBlock}${section(
			"Work plan",
			"Work log",
			"Related work"
		)}`,
	discussion: (title) =>
		`# ${title}\n\n${section("Prompt")}${checklist("Initial post submitted", "Replies to classmates submitted")}${section(
			"Notes"
		)}`,
	lecture: (title) => `# ${title}\n\n${section("Topics covered", "Key concepts", "Questions to resolve", "Related")}`,
	reading: (title) => `# ${title}\n\n${section("Summary", "Key takeaways", "Questions to resolve")}`,
	"study-guide": (title) => `# ${title}\n\n${section("Topics to review", "Practice questions", "Weak areas")}`,
	feedback: (title) => `# ${title}\n\n${section("Instructor feedback", "My response / action items")}`,
	wireframe: (title) => `# ${title}\n\n${section("Screen purpose", "Layout notes", "Open questions")}`,
	"interface-spec": (title) => `# ${title}\n\n${section("Screen purpose", "Components", "States", "Accessibility notes")}`,
	critique: (title) => `# ${title}\n\n${section("What's being critiqued", "Strengths", "Issues found", "Recommendations")}`,
	erd: (title) => `# ${title}\n\n${section("Entities", "Relationships", "Open questions")}`,
	"database-design": (title) => `# ${title}\n\n${section("Scope", "Entities and relationships", "Business rules", "Deliverables checklist")}`,
	"data-dictionary": (title) => `# ${title}\n\n${section("Tables and columns", "Data types and constraints")}`,
	normalization: (title) => `# ${title}\n\n${section("Starting schema", "Anomalies identified", "Normal form target", "Resulting schema")}`,
	requirement: (title) => `# ${title}\n\n${section("Requirement statement", "Functional / non-functional", "Acceptance criteria", "Source")}`,
	"use-case": (title) => `# ${title}\n\n${section("Actor", "Preconditions", "Main flow", "Alternate flows", "Postconditions")}`,
	stakeholder: (title) => `# ${title}\n\n${section("Role", "Interests / concerns", "Influence", "Notes")}`,
	"process-model": (title) => `# ${title}\n\n${section("Process scope", "Inputs and outputs", "Steps", "Notes")}`,
	diagram: (title) => `# ${title}\n\n${section("Diagram purpose", "Notes")}`,
	"project-deliverable": (title) =>
		`# ${title}\n\n${section("Deliverable objective", "Instructor requirements")}${rubricBlock}${section(
			"Work plan",
			"Work log"
		)}`,
	quiz: (title) => `# ${title}\n\n${section("Topics covered", "Score", "Missed questions to review")}`,
	"sql-lab": (title) => `# ${title}\n\n${section("Lab objective", "Schema / setup")}\n\`\`\`sql\n\n\`\`\`\n\n${section("Notes")}`,
	"sql-pattern": (title) => `# ${title}\n\n${section("When to use it")}\n\`\`\`sql\n\n\`\`\`\n\n${section("Gotchas")}`,
	ddl: (title) => `# ${title}\n\n\`\`\`sql\n\n\`\`\`\n\n${section("Notes")}`,
	"query-error": (title) => `# ${title}\n\n${section("Question / error")}\n\`\`\`sql\n\n\`\`\`\n\n${section("Cause", "Resolution")}`,
	reference: (title) => `# ${title}\n\n${section("Summary", "Details")}`,
	"weekly-review": (title) => `# ${title}\n\n${section("Wins", "In progress", "Blocked", "Next week")}`,
	"daily-note": (title) => `# ${title}\n\n${section("Today's top three")}`,
};

/** Used for any type name not in FALLBACK_TEMPLATES — i.e. a custom type a
 * user typed into a course's folder map. Keeps the "no fabricated content"
 * rule: one placeholder section, nothing type-specific to guess at. */
export const GENERIC_FALLBACK_TEMPLATE: TemplateBuilder = (title) => `# ${title}\n\n${section("Notes")}`;
