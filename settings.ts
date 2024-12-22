export interface NavigableFileTreeSettings {
    showRootNav: boolean;
    hideAttachments: boolean;
    attachmentFolders: string[];
    openOnStartup: boolean;
    pinnedPaths: string[];
}

export const DEFAULT_SETTINGS: NavigableFileTreeSettings = {
    hideAttachments: false,
    openOnStartup: false,
    attachmentFolders: [],
    showRootNav: true,
    pinnedPaths: []
}; 