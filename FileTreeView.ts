import { 
    ItemView, 
    WorkspaceLeaf, 
    TFile, 
    TFolder, 
    Menu, 
    Notice, 
    setIcon, 
    TAbstractFile,
    Component,
    View,
    FileView
} from 'obsidian';
import { INavigableFileTreePlugin } from './types';

interface FileTreeState {
    currentPath: string;
    collapsedFolders: Set<string>;
    selectedItems: Set<string>;
    lastSelectedItem: string | null;
    sortOrder: 'asc' | 'desc';
    sortBy: 'name' | 'modified';
}

export class FileTreeView extends ItemView {
    private state: FileTreeState = {
        currentPath: '/',
        collapsedFolders: new Set<string>(),
        selectedItems: new Set<string>(),
        lastSelectedItem: null,
        sortOrder: 'asc',
        sortBy: 'name'
    };

    constructor(leaf: WorkspaceLeaf, private plugin: INavigableFileTreePlugin) {
        super(leaf);
    }

    getViewType(): string {
        return 'navigable-file-tree';
    }

    getDisplayText(): string {
        return 'Navigable File Tree';
    }

    getIcon(): string {
        return 'list-tree';
    }

    async onOpen() {
        this.initializeEventListeners();
        this.refreshView();
        this.initializeScrollHandler();
    }

    private initializeEventListeners() {
        // 监听文件创建事件
        this.registerEvent(
            this.app.vault.on('create', () => {
                this.refreshView();
            })
        );

        // 监听文件删除事件
        this.registerEvent(
            this.app.vault.on('delete', () => {
                this.refreshView();
            })
        );

        // 监听文件重命名事件
        this.registerEvent(
            this.app.vault.on('rename', () => {
                this.refreshView();
            })
        );

        // 监听活动文件变化事件
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateActiveState();
            })
        );
    }

    public refreshView() {
        const container = this.contentEl;
        if (!container) return;

        container.empty();
        this.renderView();
    }

    private renderView() {
        const container = this.contentEl;
        
        // 渲染导航栏
        this.renderNavigationBar(container);
        
        // 渲染工具栏
        this.renderToolbar(container);
        
        // 渲染文件树
        this.renderFileTree(container);
    }

    private renderNavigationBar(container: HTMLElement) {
        const pinnedPaths = this.plugin.getPinnedPaths();
        
        // 如果没有固定项，不显示导航栏
        if (pinnedPaths.length === 0 && !this.plugin.settings.showRootNav) {
            return;
        }

        const navBar = container.createEl('div', { cls: 'nav-bar has-pinned' });
        const navItems = navBar.createEl('div', { cls: 'nav-items' });
        
        // 如果启用了显示根目录选项，添加根目录按钮
        if (this.plugin.settings.showRootNav) {
            this.createNavButton(navItems, {
                icon: 'list-tree',
                text: 'Root',
                onClick: () => this.navigateTo('/'),
                draggable: false
            });

            // 添加分隔符
            if (pinnedPaths.length > 0) {
                navItems.createEl('div', { cls: 'nav-separator' });
            }
        }
        
        // 渲染固定的文件和文件夹
        pinnedPaths.forEach((path, index) => {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file) {
                this.createNavButton(navItems, {
                    icon: file instanceof TFile ? 'document' : 'folder',
                    text: file.name,
                    onClick: () => file instanceof TFile ? this.openFile(file) : this.navigateTo(file.path),
                    onContextMenu: (e) => this.showPinnedItemMenu(e, path),
                    draggable: true,
                    dragData: { type: 'pinned-item', path, index }
                });
            }
        });

        // 设置拖拽排序功能
        this.setupPinnedItemsDragAndDrop(navItems);
    }

    private setupPinnedItemsDragAndDrop(container: HTMLElement) {
        let draggedItem: HTMLElement | null = null;
        let dragIndicator: HTMLElement | null = null;
        let lastDropTarget: { element: HTMLElement, isAfter: boolean } | null = null;

        const createDragIndicator = () => {
            if (dragIndicator) return dragIndicator;
            dragIndicator = container.createEl('div', { cls: 'nav-drag-indicator' });
            return dragIndicator;
        };

        const removeDragIndicator = () => {
            dragIndicator?.remove();
            dragIndicator = null;
            lastDropTarget = null;
        };

        const updateDragIndicator = (target: HTMLElement, e: DragEvent) => {
            const indicator = createDragIndicator();
            const rect = target.getBoundingClientRect();
            const isAfter = e.clientX > rect.left + rect.width / 2;

            // 如果目标和位置没有变化，不更新指示器
            if (lastDropTarget?.element === target && lastDropTarget?.isAfter === isAfter) {
                return isAfter;
            }

            lastDropTarget = { element: target, isAfter };
            
            indicator.style.height = '24px';
            indicator.style.top = `${rect.top - container.getBoundingClientRect().top}px`;
            
            if (isAfter) {
                indicator.style.left = `${rect.right - container.getBoundingClientRect().left}px`;
                indicator.classList.add('after');
                indicator.classList.remove('before');
            } else {
                indicator.style.left = `${rect.left - container.getBoundingClientRect().left}px`;
                indicator.classList.add('before');
                indicator.classList.remove('after');
            }

            return isAfter;
        };

        container.addEventListener('dragstart', (e) => {
            draggedItem = e.target as HTMLElement;
            if (draggedItem?.classList.contains('nav-item')) {
                draggedItem.classList.add('dragging');
                e.dataTransfer?.setData('text/plain', draggedItem.getAttribute('data-path') || '');
            }
        });

        container.addEventListener('dragend', () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
            removeDragIndicator();
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedItem) return;

            const target = e.target as HTMLElement;
            const navItem = target.closest('.nav-item') as HTMLElement;
            
            if (navItem && navItem !== draggedItem) {
                updateDragIndicator(navItem, e);
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!draggedItem) return;

            const target = e.target as HTMLElement;
            const navItem = target.closest('.nav-item') as HTMLElement;
            
            if (navItem && navItem !== draggedItem) {
                const pinnedPaths = this.plugin.getPinnedPaths();
                const fromPath = draggedItem.getAttribute('data-path');
                const toPath = navItem.getAttribute('data-path');
                
                if (fromPath && toPath) {
                    const fromIndex = pinnedPaths.indexOf(fromPath);
                    const toIndex = pinnedPaths.indexOf(toPath);
                    
                    if (fromIndex !== -1 && toIndex !== -1) {
                        pinnedPaths.splice(fromIndex, 1);
                        const isAfter = updateDragIndicator(navItem, e);
                        const newIndex = isAfter ? toIndex + 1 : toIndex;
                        pinnedPaths.splice(newIndex, 0, fromPath);
                        this.plugin.savePinnedPaths(pinnedPaths);
                        this.refreshView();
                    }
                }
            }
            
            removeDragIndicator();
        });

        container.addEventListener('dragleave', (e) => {
            const target = e.target as HTMLElement;
            if (!container.contains(target)) {
                removeDragIndicator();
            }
        });
    }

    private createNavButton(container: HTMLElement, options: {
        icon: string,
        text: string,
        onClick: () => void,
        onContextMenu?: (e: MouseEvent) => void,
        draggable: boolean,
        dragData?: { type: string, path: string, index: number }
    }) {
        const btn = container.createEl('button', { 
            cls: 'nav-item',
            attr: { 
                draggable: options.draggable,
                'data-path': options.dragData?.path || ''
            }
        });
        
        const iconEl = btn.createEl('div', { cls: 'nav-icon' });
        setIcon(iconEl, options.icon);
        btn.createEl('span', { text: options.text });
        
        btn.onclick = options.onClick;
        if (options.onContextMenu) {
            btn.oncontextmenu = options.onContextMenu;
        }

        if (options.draggable && options.dragData) {
            this.setupDraggableItem(btn, options.dragData);
        }

        return btn;
    }

    private setupDraggableItem(element: HTMLElement, dragData: { type: string, path: string, index: number }) {
        element.addEventListener('dragstart', (e) => {
            e.dataTransfer?.setData('text/plain', JSON.stringify(dragData));
            element.classList.add('dragging');
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
        });
    }

    private async navigateTo(path: string) {
        const target = this.app.vault.getAbstractFileByPath(path);
        if (target instanceof TFile) {
            const leaf = this.app.workspace.getMostRecentLeaf();
            if (leaf) await leaf.openFile(target);
        } else {
            this.state.currentPath = path;
            this.refreshView();
        }
    }

    private handleFileClick = async (file: TFile, e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.ctrlKey || e.metaKey) {
            this.toggleFileSelection(file);
        } else if (e.shiftKey && this.state.lastSelectedItem) {
            this.selectFileRange(file);
        } else {
            await this.openFile(file);
        }
    }

    private async openFile(file: TFile) {
        this.state.selectedItems.clear();
        
        // 检查文件是否已经某个标签页中打开
        const viewType = file.extension === 'canvas' ? 'canvas' : 'markdown';
        const existingLeaf = this.app.workspace.getLeavesOfType(viewType)
            .find(leaf => {
                const view = leaf.view;
                if (view.getViewType() === viewType && view instanceof FileView) {
                    return view.file?.path === file.path;
                }
                return false;
            });

        if (existingLeaf) {
            // 如果文件已经打开，直接切换到对应标签页
            this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
        } else {
            // 获取当前活动的标签页
            const activeLeaf = this.app.workspace.activeLeaf;
            
            if (activeLeaf) {
                // 如果当前标签页是空的或者是启动页，则在当前标签页打开
                if (!activeLeaf.view || activeLeaf.getViewState().type === 'empty') {
                    await activeLeaf.openFile(file);
                } else {
                    // 否则在新标签页打开
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);
                }
            } else {
                // 如果没有活动标签页，创建新的
                const newLeaf = this.app.workspace.getLeaf(true);
                await newLeaf.openFile(file);
            }
        }
        
        // 只更新选择状态，不刷新整个视图
        this.updateSelection();
    }

    private toggleFileSelection(file: TFile) {
        const path = file.path;
        if (this.state.selectedItems.has(path)) {
            this.state.selectedItems.delete(path);
        } else {
            this.state.selectedItems.add(path);
        }
        this.state.lastSelectedItem = path;
        this.updateSelection();
    }

    private selectFileRange(file: TFile) {
        const allFiles = this.getAllFiles();
        const currentIndex = allFiles.findIndex(f => f.path === file.path);
        const lastIndex = allFiles.findIndex(f => f.path === this.state.lastSelectedItem);
        const [start, end] = [Math.min(currentIndex, lastIndex), Math.max(currentIndex, lastIndex)];
        
        allFiles.slice(start, end + 1).forEach(f => {
            this.state.selectedItems.add(f.path);
        });
        this.updateSelection();
    }

    private updateSelection() {
        this.containerEl.querySelectorAll('.tree-item.file').forEach((el: HTMLElement) => {
            const path = el.getAttribute('data-path');
            if (path) {
                el.classList.toggle('selected', this.state.selectedItems.has(path));
            }
        });
    }

    private renderToolbar(container: HTMLElement) {
        const toolbar = container.createEl('div', { cls: 'tree-toolbar' });
        
        // 添加搜索框
        const searchContainer = toolbar.createEl('div', { cls: 'tree-search' });
        const searchInput = searchContainer.createEl('input', {
            cls: 'tree-search-input',
            attr: { 
                type: 'text',
                placeholder: 'Search files...'
            }
        });

        // 添加搜索功能
        searchInput.addEventListener('input', () => {
            this.filterFiles(searchInput.value);
        });

        // 添加展开/折叠按钮
        this.createToolbarButton(toolbar, {
            icon: 'chevron-down-square',
            tooltip: 'Expand/Collapse All',
            onClick: () => this.toggleAllFolders()
        });
        
        // 添加新建按钮
        this.createToolbarButton(toolbar, {
            icon: 'plus-square',
            tooltip: 'Create New',
            onClick: (e) => this.showCreateMenu(e)
        });

        // 添加排序按钮
        this.createToolbarButton(toolbar, {
            icon: 'list-ordered',
            tooltip: 'Sort',
            onClick: (e) => this.showSortMenu(e)
        });
    }

    private createToolbarButton(container: HTMLElement, options: {
        icon: string,
        tooltip: string,
        onClick: (e: MouseEvent) => void
    }) {
        const button = container.createEl('button', { 
            cls: 'tree-tool-button',
            attr: { 'aria-label': options.tooltip }
        });
        const iconEl = button.createEl('div', { cls: 'nav-icon' });
        setIcon(iconEl, options.icon);
        button.onclick = options.onClick;
        return button;
    }

    private toggleAllFolders() {
        const allFolders = Array.from(this.containerEl.querySelectorAll('.folder')) as HTMLElement[];
        const hasCollapsed = allFolders.some(folder => {
            const path = folder.getAttribute('data-path');
            return path && this.state.collapsedFolders.has(path);
        });

        if (hasCollapsed) {
            // 如果有折叠的文件夹，则全部展开
            this.state.collapsedFolders.clear();
        } else {
            // 否则全部折叠
            allFolders.forEach(folder => {
                const path = folder.getAttribute('data-path');
                if (path) this.state.collapsedFolders.add(path);
            });
        }
        this.refreshView();
    }

    private filterFiles(searchTerm: string) {
        const treeItems = this.containerEl.querySelectorAll('.tree-item');
        const searchText = searchTerm.toLowerCase().trim();

        if (!searchText) {
            // 如果搜索词为空，显示所有内容
            treeItems.forEach((item: HTMLElement) => {
                item.classList.remove('hidden');
                if (item.classList.contains('folder')) {
                    const children = item.querySelector('.folder-children') as HTMLElement;
                    if (children) {
                        children.classList.toggle('collapsed', 
                            this.state.collapsedFolders.has(item.getAttribute('data-path') || '')
                        );
                    }
                }
            });
            return;
        }

        // 搜索所有文件和文件夹
        treeItems.forEach((item: HTMLElement) => {
            let isMatch = false;
            
            if (item.classList.contains('file')) {
                // 匹配文件名
                const fileName = item.querySelector('.file-name')?.textContent || '';
                const fileExt = item.querySelector('.file-ext')?.textContent || '';
                const fullName = (fileName + fileExt).toLowerCase();
                isMatch = fullName.includes(searchText);
            } else if (item.classList.contains('folder')) {
                // 匹配文件夹名
                const folderName = (item.querySelector('.folder-title span')?.textContent || '').toLowerCase();
                isMatch = folderName.includes(searchText);
                
                // 检查子项是否有匹配
                const children = item.querySelector('.folder-children');
                if (children) {
                    const hasMatchingChild = Array.from(children.querySelectorAll('.tree-item'))
                        .some((child: HTMLElement) => {
                            const childName = (child.querySelector('.file-name, .folder-title span')?.textContent || '').toLowerCase();
                            return childName.includes(searchText);
                        });
                    
                    if (hasMatchingChild) {
                        isMatch = true;
                        // 展开包含匹配项的文件夹
                        this.state.collapsedFolders.delete(item.getAttribute('data-path') || '');
                        const collapseIcon = item.querySelector('.collapse-icon');
                        if (collapseIcon) {
                            collapseIcon.classList.remove('collapsed');
                        }
                        (children as HTMLElement).classList.remove('collapsed');
                    }
                }
            }
            
            item.classList.toggle('hidden', !isMatch);
        });
    }

    private showCreateMenu(e: MouseEvent) {
        const menu = new Menu();
        const currentFolder = this.app.vault.getAbstractFileByPath(this.state.currentPath);
        
        if (!(currentFolder instanceof TFolder)) return;

        menu.addItem((item) => {
            item.setTitle('New Note')
                .setIcon('document')
                .onClick(() => this.createNewFile('md', currentFolder));
        });

        menu.addItem((item) => {
            item.setTitle('New Canvas')
                .setIcon('layout-dashboard')
                .onClick(() => this.createNewFile('canvas', currentFolder));
        });

        menu.addItem((item) => {
            item.setTitle('New Folder')
                .setIcon('folder')
                .onClick(() => this.createNewFolder(currentFolder));
        });

        menu.showAtMouseEvent(e);
    }

    private showSortMenu(e: MouseEvent) {
        const menu = new Menu();
        menu.addItem((item) => {
            item.setTitle('Sort by Name')
                .setIcon(this.state.sortBy === 'name' ? 'checkmark' : '')
                .onClick(() => {
                    this.state.sortBy = 'name';
                    this.refreshView();
                });
        });
        menu.addItem((item) => {
            item.setTitle('Sort by Modified')
                .setIcon(this.state.sortBy === 'modified' ? 'checkmark' : '')
                .onClick(() => {
                    this.state.sortBy = 'modified';
                    this.refreshView();
                });
        });
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle('Ascending')
                .setIcon(this.state.sortOrder === 'asc' ? 'checkmark' : '')
                .onClick(() => {
                    this.state.sortOrder = 'asc';
                    this.refreshView();
                });
        });
        menu.addItem((item) => {
            item.setTitle('Descending')
                .setIcon(this.state.sortOrder === 'desc' ? 'checkmark' : '')
                .onClick(() => {
                    this.state.sortOrder = 'desc';
                    this.refreshView();
                });
        });
        menu.showAtMouseEvent(e);
    }

    private showPinnedItemMenu(e: MouseEvent, path: string) {
        const menu = new Menu();
        const file = this.app.vault.getAbstractFileByPath(path);
        
        if (file) {
            if (file instanceof TFile) {
                menu.addItem((item) => {
                    item.setTitle('Open in New Tab')
                        .setIcon('lucide-split')
                        .onClick(async () => {
                            const leaf = this.app.workspace.splitActiveLeaf();
                            await leaf.openFile(file);
                        });
                });
            }

            menu.addItem((item) => {
                item.setTitle('Remove from Navigation')
                    .setIcon('trash')
                    .onClick(() => {
                        this.plugin.removeFromPinnedPaths(path);
                        this.refreshView();
                    });
            });
        }
        
        menu.showAtMouseEvent(e);
    }

    private async createNewFile(extension: 'md' | 'canvas', targetFolder?: TFolder) {
        const parentFile = targetFolder || this.app.vault.getAbstractFileByPath(this.state.currentPath);
        if (!parentFile || !(parentFile instanceof TFolder)) return;

        let baseName = 'Untitled';
        let counter = 0;
        let fileName = baseName;
        let filePath = '';

        // 检查文件名是否存在，如存在则添加序号
        do {
            fileName = counter === 0 ? baseName : `${baseName} ${counter}`;
            filePath = `${parentFile.path}/${fileName}.${extension}`;
            counter++;
        } while (this.app.vault.getAbstractFileByPath(filePath));

        try {
            const content = extension === 'canvas' ? '{"nodes":[],"edges":[]}' : '';
            const file = await this.app.vault.create(filePath, content);
            
            // 刷新视图以显示新文件
            this.refreshView();

            // 打开文件
            const leaf = this.app.workspace.getMostRecentLeaf();
            if (leaf) {
                await leaf.openFile(file);
            }

            // 等待DOM更新后开始重命名
            setTimeout(() => {
                const fileEl = this.containerEl.querySelector(`[data-path="${file.path}"]`);
                if (fileEl) {
                    this.startRename(file);
                }
            }, 50);

        } catch (error) {
            console.error(`Failed to create new ${extension} file:`, error);
            new Notice(`Failed to create new ${extension} file: ${error.message}`);
        }
    }

    private async createNewFolder(targetFolder?: TFolder) {
        const parentFile = targetFolder || this.app.vault.getAbstractFileByPath(this.state.currentPath);
        if (!parentFile || !(parentFile instanceof TFolder)) return;

        let baseName = 'New Folder';
        let counter = 0;
        let folderName = baseName;
        let folderPath = '';

        // 检查文件夹名是否存在，果存在则添加序号
        do {
            folderName = counter === 0 ? baseName : `${baseName} ${counter}`;
            folderPath = `${parentFile.path}/${folderName}`;
            counter++;
        } while (this.app.vault.getAbstractFileByPath(folderPath));

        try {
            const folder = await this.app.vault.createFolder(folderPath);
            
            // 刷新视图以显示新文件夹
            this.refreshView();

            // 等待DOM更新
            setTimeout(() => {
                // 找到新创建的文件夹元素并开始重命名
                const folderEl = this.containerEl.querySelector(`[data-path="${folder.path}"]`);
                if (folderEl) {
                    this.startRename(folder);
                }
            }, 50);

        } catch (error) {
            console.error('Failed to create new folder:', error);
            new Notice(`Failed to create new folder: ${error.message}`);
        }
    }

    private getAllFiles(): TFile[] {
        const files: TFile[] = [];
        const processFolder = (folder: TFolder) => {
            folder.children.forEach(child => {
                if (child instanceof TFile) {
                    files.push(child);
                } else if (child instanceof TFolder) {
                    processFolder(child);
                }
            });
        };
        processFolder(this.app.vault.getRoot());
        return files;
    }

    private renderFileTree(container: HTMLElement) {
        const treeContainer = container.createEl('div', { cls: 'tree-container' });
        const vault = this.app.vault;
        const root = vault.getRoot();
        
        const targetFile = this.state.currentPath === '/' 
            ? root 
            : vault.getAbstractFileByPath(this.state.currentPath);

        if (targetFile instanceof TFolder) {
            this.renderFolderContents(treeContainer, targetFile);
        }
    }

    private renderFolderContents(container: HTMLElement, folder: TFolder) {
        const items = folder.children.sort((a, b) => this.sortItems(a, b));
        
        for (const item of items) {
            if (item instanceof TFolder) {
                if (!this.shouldHideFolder(item)) {
                    this.renderFolderItem(container, item);
                }
            } else if (item instanceof TFile) {
                this.renderFileItem(container, item);
            }
        }
    }

    private shouldHideFolder(folder: TFolder): boolean {
        return this.plugin.settings.hideAttachments && 
               this.plugin.settings.attachmentFolders.includes(folder.name);
    }

    private sortItems(a: TAbstractFile, b: TAbstractFile): number {
        // 文件夹始终在前
        if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
        if (!(a instanceof TFolder) && b instanceof TFolder) return 1;

        let comparison = 0;
        if (this.state.sortBy === 'name') {
            comparison = a.name.localeCompare(b.name);
        } else {
            const aTime = a instanceof TFile ? a.stat.mtime : 0;
            const bTime = b instanceof TFile ? b.stat.mtime : 0;
            comparison = aTime - bTime;
        }

        return this.state.sortOrder === 'asc' ? comparison : -comparison;
    }

    private renderFileItem(container: HTMLElement, file: TFile) {
        const fileEl = container.createEl('div', {
            cls: `tree-item file ${this.app.workspace.getActiveFile()?.path === file.path ? 'active' : ''} ${this.state.selectedItems.has(file.path) ? 'selected' : ''}`,
            attr: { 
                'data-path': file.path,
                'draggable': 'true'
            }
        });

        const fileTitle = fileEl.createEl('div', { cls: 'file-title' });

        // 添加文件图标
        const fileIcon = fileTitle.createEl('span', { cls: 'file-icon' });
        this.setFileIcon(fileIcon, file);

        // 添加文件名（不含扩展名）
        fileTitle.createEl('span', { 
            cls: 'file-name',
            text: file.basename
        });

        // 添加扩展名
        fileTitle.createEl('span', { 
            cls: 'file-ext',
            text: '.' + file.extension
        });

        // 绑定事件
        fileTitle.onclick = (e) => this.handleFileClick(file, e);
        fileTitle.oncontextmenu = (e) => this.showFileContextMenu(e, file);

        // 设置拖拽
        this.setupDraggableFile(fileEl, file);
    }

    private renderFolderItem(container: HTMLElement, folder: TFolder) {
        const folderEl = container.createEl('div', {
            cls: 'tree-item folder',
            attr: { 
                'data-path': folder.path,
                'draggable': 'true'
            }
        });

        const folderHeader = folderEl.createEl('div', { cls: 'folder-header' });
        
        // 添加折叠图标
        const collapseIcon = folderHeader.createEl('div', { 
            cls: `collapse-icon ${this.state.collapsedFolders.has(folder.path) ? 'collapsed' : ''}` 
        });
        setIcon(collapseIcon, 'chevron-down');

        const folderTitle = folderHeader.createEl('div', { cls: 'folder-title' });

        // 添加文件夹图标
        const folderIcon = folderTitle.createEl('span', { cls: 'folder-icon' });
        setIcon(folderIcon, 'folder');

        // 添加文件夹名称
        folderTitle.createEl('span', { text: folder.name });

        // 设置文件夹标题作为放置区域
        this.setupFolderDropZone(folderTitle, folder);

        // 绑定拖拽事件
        this.setupDraggableFolder(folderEl, folder);

        // 绑定事件
        collapseIcon.onclick = (e) => {
            e.stopPropagation();
            this.toggleFolder(folder);
        };

        folderTitle.onclick = (e) => {
            e.stopPropagation();
            this.toggleFolder(folder);
        };

        folderTitle.oncontextmenu = (e) => this.showFolderContextMenu(e, folder);

        // 如果文件夹未折叠，渲染内容
        if (!this.state.collapsedFolders.has(folder.path)) {
            const childrenContainer = folderEl.createEl('div', { cls: 'folder-children' });
            this.setupDropZone(childrenContainer, folder);
            this.renderFolderContents(childrenContainer, folder);
        } else {
            const childrenContainer = folderEl.createEl('div', { cls: 'folder-children collapsed' });
            this.setupDropZone(childrenContainer, folder);
        }
    }

    private setupFolderDropZone(element: HTMLElement, folder: TFolder) {
        let dragEnterCount = 0;
        let dropTimeout: NodeJS.Timeout;

        element.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount++;
            
            // 清除之前的超时
            if (dropTimeout) {
                clearTimeout(dropTimeout);
            }

            element.classList.add('drop-target');
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount--;
            
            if (dragEnterCount === 0) {
                // 设置一个短暂的延迟，避免闪烁
                dropTimeout = setTimeout(() => {
                    element.classList.remove('drop-target');
                }, 50);
            }
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 设置放置效果
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount = 0;
            element.classList.remove('drop-target');

            try {
                const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '');
                
                if (data.type === 'file') {
                    // 处理文件拖拽
                    const paths = data.paths as string[];
                    for (const path of paths) {
                        const file = this.app.vault.getAbstractFileByPath(path);
                        if (file instanceof TFile && file.parent !== folder) {
                            const newPath = `${folder.path}/${file.name}`;
                            await this.app.vault.rename(file, newPath);
                        }
                    }
                } else if (data.type === 'folder') {
                    // 处理文件夹拖拽
                    const sourceFile = this.app.vault.getAbstractFileByPath(data.path);
                    if (sourceFile instanceof TFolder && sourceFile !== folder && !folder.path.startsWith(sourceFile.path)) {
                        const newPath = `${folder.path}/${sourceFile.name}`;
                        await this.app.vault.rename(sourceFile, newPath);
                    }
                }
                
                this.refreshView();
            } catch (error) {
                console.error('Failed to process drop:', error);
                new Notice('Failed to move item(s)');
            }
        });
    }

    private setupDropZone(element: HTMLElement, folder: TFolder) {
        let dragEnterCount = 0;
        let dropTimeout: NodeJS.Timeout;

        element.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount++;
            
            if (dropTimeout) {
                clearTimeout(dropTimeout);
            }

            element.classList.add('drop-target');
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount--;
            
            if (dragEnterCount === 0) {
                dropTimeout = setTimeout(() => {
                    element.classList.remove('drop-target');
                }, 50);
            }
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragEnterCount = 0;
            element.classList.remove('drop-target');

            try {
                const data = JSON.parse(e.dataTransfer?.getData('text/plain') || '');
                
                if (data.type === 'file') {
                    // 处理文件拖拽
                    const paths = data.paths as string[];
                    for (const path of paths) {
                        const file = this.app.vault.getAbstractFileByPath(path);
                        if (file instanceof TFile && file.parent !== folder) {
                            const newPath = `${folder.path}/${file.name}`;
                            await this.app.vault.rename(file, newPath);
                        }
                    }
                } else if (data.type === 'folder') {
                    // 处理文件夹拖拽
                    const sourceFile = this.app.vault.getAbstractFileByPath(data.path);
                    if (sourceFile instanceof TFolder && sourceFile !== folder && !folder.path.startsWith(sourceFile.path)) {
                        const newPath = `${folder.path}/${sourceFile.name}`;
                        await this.app.vault.rename(sourceFile, newPath);
                    }
                }
                
                this.refreshView();
            } catch (error) {
                console.error('Failed to process drop:', error);
                new Notice('Failed to move item(s)');
            }
        });
    }

    private setupDraggableFile(element: HTMLElement, file: TFile) {
        element.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            element.classList.add('dragging');
            
            const dragData = {
                type: 'file',
                paths: this.state.selectedItems.has(file.path) 
                    ? Array.from(this.state.selectedItems)
                    : [file.path]
            };
            e.dataTransfer?.setData('text/plain', JSON.stringify(dragData));
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
        });
    }

    private setupDraggableFolder(element: HTMLElement, folder: TFolder) {
        element.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            element.classList.add('dragging');
            
            const dragData = {
                type: 'folder',
                path: folder.path
            };
            e.dataTransfer?.setData('text/plain', JSON.stringify(dragData));
        });

        element.addEventListener('dragend', () => {
            element.classList.remove('dragging');
        });
    }

    private toggleFolder(folder: TFolder) {
        if (this.state.collapsedFolders.has(folder.path)) {
            this.state.collapsedFolders.delete(folder.path);
        } else {
            this.state.collapsedFolders.add(folder.path);
        }
        this.refreshView();
    }

    private showFileContextMenu(e: MouseEvent, file: TFile) {
        const menu = new Menu();
        
        if (this.state.selectedItems.size > 1) {
            this.showMultipleSelectionMenu(menu);
        } else {
            this.showSingleFileMenu(menu, file);
        }
        
        menu.showAtMouseEvent(e);
    }

    private showMultipleSelectionMenu(menu: Menu) {
        const selectedFiles = Array.from(this.state.selectedItems)
            .map(path => this.app.vault.getAbstractFileByPath(path))
            .filter((file): file is TFile => file instanceof TFile);

        menu.addItem((item) => {
            item.setTitle(`Delete ${selectedFiles.length} items`)
                .setIcon('trash')
                .onClick(async () => {
                    for (const file of selectedFiles) {
                        await this.app.fileManager.trashFile(file);
                    }
                    this.state.selectedItems.clear();
                    this.refreshView();
                });
        });

        menu.addItem((item) => {
            item.setTitle('Move to...')
                .setIcon('folder')
                .onClick(() => {
                    const folderMenu = new Menu();
                    this.buildFolderSubmenu(folderMenu, this.app.vault.getRoot(), selectedFiles);
                    folderMenu.showAtMouseEvent(new MouseEvent('click'));
                });
        });

        menu.addItem((item) => {
            item.setTitle('Pin to Navigation')
                .setIcon('pin')
                .onClick(() => {
                    for (const file of selectedFiles) {
                        this.plugin.addToPinnedPaths(file.path);
                    }
                    this.refreshView();
                });
        });
    }

    private buildFolderSubmenu(menu: Menu, folder: TFolder, files: TFile[]) {
        for (const child of folder.children) {
            if (child instanceof TFolder && !this.shouldHideFolder(child)) {
                menu.addItem((item) => {
                    item.setTitle(child.name);
                    
                    // 如果有子文件夹，添加箭头图标表示可以展开
                    const hasSubfolders = child.children.some(c => c instanceof TFolder);
                    if (hasSubfolders) {
                        item.setIcon('chevron-right');
                    }

                    item.onClick((e) => {
                        if (hasSubfolders && e instanceof MouseEvent) {
                            // 如果有子文件夹，点击时显示子菜单
                            const subMenu = new Menu();
                            this.buildFolderSubmenu(subMenu, child, files);
                            subMenu.showAtPosition({
                                x: e.clientX,
                                y: e.clientY
                            });
                        } else {
                            // 如果没有子文件夹，直接移动文件
                            this.moveFilesToFolder(files, child);
                        }
                    });
                });
            }
        }
    }

    private async moveFilesToFolder(files: TFile[], targetFolder: TFolder) {
        for (const file of files) {
            if (file.parent !== targetFolder) {
                const newPath = `${targetFolder.path}/${file.name}`;
                await this.app.vault.rename(file, newPath);
            }
        }
        this.state.selectedItems.clear();
        this.refreshView();
    }

    private showSingleFileMenu(menu: Menu, file: TFile) {
        menu.addItem((item) => {
            item.setTitle('Open in New Tab')
                .setIcon('lucide-split')
                .onClick(async () => {
                    const leaf = this.app.workspace.splitActiveLeaf();
                    await leaf.openFile(file);
                });
        });

        menu.addItem((item) => {
            item.setTitle('Pin to Navigation')
                .setIcon('pin')
                .onClick(async () => {
                    await this.plugin.addToPinnedPaths(file.path);
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Rename')
                .setIcon('pencil')
                .onClick(() => this.startRename(file));
        });

        menu.addItem((item) => {
            item.setTitle('Delete')
                .setIcon('trash')
                .onClick(async () => {
                    await this.app.fileManager.trashFile(file);
                    this.refreshView();
                });
        });
    }

    private showFolderContextMenu(e: MouseEvent, folder: TFolder) {
        const menu = new Menu();
        
        menu.addItem((item) => {
            item.setTitle('New Note')
                .setIcon('document')
                .onClick(() => this.createNewFile('md', folder));
        });

        menu.addItem((item) => {
            item.setTitle('New Canvas')
                .setIcon('layout-dashboard')
                .onClick(() => this.createNewFile('canvas', folder));
        });

        menu.addItem((item) => {
            item.setTitle('New Folder')
                .setIcon('folder')
                .onClick(() => this.createNewFolder(folder));
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Pin to Navigation')
                .setIcon('pin')
                .onClick(async () => {
                    await this.plugin.addToPinnedPaths(folder.path);
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle('Rename')
                .setIcon('pencil')
                .onClick(() => this.startRename(folder));
        });

        menu.addItem((item) => {
            item.setTitle('Delete')
                .setIcon('trash')
                .onClick(async () => {
                    await this.app.fileManager.trashFile(folder);
                    this.refreshView();
                });
        });

        menu.showAtMouseEvent(e);
    }

    private setFileIcon(element: HTMLElement, file: TFile): void {
        const extension = file.extension.toLowerCase();
        switch (extension) {
            case 'md':
                setIcon(element, 'document');
                break;
            case 'canvas':
                setIcon(element, 'layout-dashboard');
                break;
            default:
                setIcon(element, 'document');
                break;
        }
    }

    private async startRename(item: TFile | TFolder) {
        const itemEl = this.containerEl.querySelector(`[data-path="${item.path}"]`);
        if (!itemEl) return;

        const titleEl = itemEl.querySelector('.file-title, .folder-title');
        if (!titleEl || !(titleEl instanceof HTMLElement)) return;

        const oldName = item.name;
        const baseName = item instanceof TFile ? item.basename : oldName;
        titleEl.empty();

        const input = titleEl.createEl('input', {
            cls: 'rename-input',
            attr: { 
                value: baseName,
                type: 'text'
            }
        });

        input.focus();
        input.select();

        const finishRename = async () => {
            const newName = input.value.trim();
            if (newName && newName !== baseName) {
                const extension = item instanceof TFile ? `.${item.extension}` : '';
                const newPath = `${item.parent?.path ?? ''}/${newName}${extension}`;
                try {
                    await this.app.vault.rename(item, newPath);
                    
                    // 如果是文件，重命名后重新打开它
                    if (item instanceof TFile) {
                        const newFile = this.app.vault.getAbstractFileByPath(newPath);
                        if (newFile instanceof TFile) {
                            const leaf = this.app.workspace.getMostRecentLeaf();
                            if (leaf) {
                                await leaf.openFile(newFile);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to rename:', error);
                    new Notice(`Failed to rename: ${error.message}`);
                }
            }
            this.refreshView();
        };

        input.onblur = finishRename;
        input.onkeydown = async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await finishRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.refreshView();
            }
        };
    }

    private updateFileState(file: TFile) {
        const fileEl = this.containerEl.querySelector(`[data-path="${file.path}"]`);
        if (fileEl) {
            const titleEl = fileEl.querySelector('.file-title');
            if (titleEl) {
                const nameEl = titleEl.querySelector('.file-name');
                const extEl = titleEl.querySelector('.file-ext');
                
                if (nameEl && extEl) {
                    nameEl.textContent = file.basename;
                    extEl.textContent = '.' + file.extension;
                }
            }
        }
    }

    private updateActiveState() {
        const activeFile = this.app.workspace.getActiveFile();
        this.containerEl.querySelectorAll('.tree-item.file').forEach((el: HTMLElement) => {
            const path = el.getAttribute('data-path');
            if (path) {
                el.classList.toggle('active', activeFile?.path === path);
            }
        });
    }

    private initializeScrollHandler() {
        const container = this.containerEl.querySelector('.tree-container');
        const toolbar = this.containerEl.querySelector('.tree-toolbar');
        
        if (!container || !toolbar) return;

        const observer = new IntersectionObserver(
            ([e]) => {
                toolbar.classList.toggle('sticky', e.intersectionRatio < 1);
            },
            {
                threshold: [1],
                rootMargin: '-1px 0px 0px 0px'
            }
        );

        observer.observe(toolbar);
    }
} 