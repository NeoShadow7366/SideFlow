import React from 'react';
import {
  Terminal,
  Globe,
  Music,
  MessageSquare,
  Figma,
  Database,
  Cpu,
  GitBranch,
  Share2,
  FileText,
  AppWindow,
  Folder,
  FolderOpen,
  Rocket,
  Check,
  FolderPlus,
  Mic,
  Code,
  Layers,
  Zap,
  LucideProps,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  terminal: Terminal,
  globe: Globe,
  music: Music,
  'message-square': MessageSquare,
  figma: Figma,
  database: Database,
  cpu: Cpu,
  'git-branch': GitBranch,
  'share-2': Share2,
  'file-text': FileText,
  'app-window': AppWindow,
  folder: Folder,
  'folder-open': FolderOpen,
  rocket: Rocket,
  check: Check,
  'folder-plus': FolderPlus,
  mic: Mic,
  code: Code,
  layers: Layers,
  zap: Zap,
};

interface DynamicIconProps extends LucideProps {
  name: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  const IconComponent = iconMap[name] || AppWindow;
  return <IconComponent {...props} />;
};
