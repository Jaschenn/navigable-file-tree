import { Plugin, TFolder, TFile, WorkspaceLeaf } from 'obsidian';
import { FileTreeView } from './FileTreeView';
import { INavigableFileTreePlugin } from './types';
import { NavigableFileTreeSettings, DEFAULT_SETTINGS } from './settings';
import { NavigableFileTreeSettingTab } from './settings-tab';

export default class NavigableFileTreePlugin extends Plugin implements INavigableFileTreePlugin {
    view: FileTreeView;
    private pinnedPaths: string[] = [];
    settings: NavigableFileTreeSettings;

    async onload() {
        // 加载设置
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.pinnedPaths = this.settings.pinnedPaths || [];

        // 注册视图类型
        this.registerView(
            'navigable-file-tree',
            (leaf) => (this.view = new FileTreeView(leaf, this))
        );

        // 添加ribbon图标
        const ribbonIconEl = this.addRibbonIcon('list-tree', 'Navigable File Tree', () => {
            this.activateView();
        });
        
        // 添加拖动功能
        ribbonIconEl.draggable = true;
        ribbonIconEl.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', 'navigable-file-tree');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        // 添加设置页面
        this.addSettingTab(new NavigableFileTreeSettingTab(this.app, this));

        // 如果设置为启动时打开，则打开视图
        if (this.settings.openOnStartup) {
            this.activateView();
        }
    }

    async onunload() {
        // 保存导航路径
        await this.saveData(this.settings);
    }

    async activateView() {
        const leaves = this.app.workspace.getLeavesOfType('navigable-file-tree');
        if (leaves.length === 0) {
            const leaf = this.app.workspace.getLeftLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: 'navigable-file-tree',
                    active: true,
                });
                this.app.workspace.revealLeaf(leaf);
            }
        } else {
            // 如果已经打开则关闭
            leaves.forEach(leaf => leaf.detach());
        }
    }

    async addToPinnedPaths(path: string) {
        console.log('Adding path to pinned paths:', path);
        if (!this.pinnedPaths.includes(path)) {
            this.pinnedPaths.push(path);
            this.settings.pinnedPaths = this.pinnedPaths;
            await this.saveSettings();
            if (this.view) {
                console.log('Refreshing view with new pinned paths:', this.pinnedPaths);
                this.view.refreshView();
            }
        }
    }

    removeFromPinnedPaths(path: string) {
        this.pinnedPaths = this.pinnedPaths.filter(p => p !== path);
        this.settings.pinnedPaths = this.pinnedPaths;
        this.saveSettings();
        this.view?.refreshView();
    }

    getPinnedPaths() {
        return this.pinnedPaths;
    }

    public savePinnedPaths(paths: string[]): void {
        this.pinnedPaths = paths;
        this.settings.pinnedPaths = paths;
        this.saveSettings();
    }

    private async saveSettings() {
        await this.saveData(this.settings);
    }
} 