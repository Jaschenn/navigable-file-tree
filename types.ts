import { Plugin } from 'obsidian';
import { NavigableFileTreeSettings } from './settings';
import { FileTreeView } from './FileTreeView';

export interface INavigableFileTreePlugin extends Plugin {
    settings: {
        showRootNav: boolean;
        hideAttachments: boolean;
        attachmentFolders: string[];
        openOnStartup: boolean;
    };
    getPinnedPaths(): string[];
    addToPinnedPaths(path: string): void;
    removeFromPinnedPaths(path: string): void;
    savePinnedPaths(paths: string[]): void;
} 