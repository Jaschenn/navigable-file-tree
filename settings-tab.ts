import { App, PluginSettingTab, Setting } from 'obsidian';
import NavigableFileTreePlugin from './main';

export class NavigableFileTreeSettingTab extends PluginSettingTab {
    plugin: NavigableFileTreePlugin;

    constructor(app: App, plugin: NavigableFileTreePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Hide attachments folders')
            .setDesc('Hide folders that typically contain attachments')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideAttachments)
                .onChange(async (value) => {
                    this.plugin.settings.hideAttachments = value;
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.view?.refreshView();
                }));

        new Setting(containerEl)
            .setName('Open on startup')
            .setDesc('Automatically open the file tree when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.openOnStartup = value;
                    await this.plugin.saveData(this.plugin.settings);
                }));

        new Setting(containerEl)
            .setName('Attachment folders')
            .setDesc('Folders to hide when "Hide attachments folders" is enabled (one per line)')
            .addTextArea(text => text
                .setValue(this.plugin.settings.attachmentFolders.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.attachmentFolders = value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.view?.refreshView();
                }));

        new Setting(containerEl)
            .setName('Show Root navigation')
            .setDesc('Show Root button in navigation bar')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showRootNav)
                .onChange(async (value) => {
                    this.plugin.settings.showRootNav = value;
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.view?.refreshView();
                }));
    }
} 