import { App, Modal, Setting } from "obsidian";

class ConfirmModal extends Modal {
	constructor(app: App, private message: string, private onResult: (confirmed: boolean) => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.onResult(false);
						this.close();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Confirm")
					.setDestructive()
					.onClick(() => {
						this.onResult(true);
						this.close();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function confirmDialog(app: App, message: string): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, message, resolve).open();
	});
}
